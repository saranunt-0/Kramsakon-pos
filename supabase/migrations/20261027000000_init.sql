-- =============================================================================
-- Kramsakon POS — initial database schema
--
-- Run this whole file once in Supabase: Dashboard → SQL Editor → New query →
-- paste → Run. (Or `supabase db push` if you use the Supabase CLI.)
--
-- Design notes
--  * All money is THB with 2 decimals. Selling prices INCLUDE VAT (Thai retail).
--  * Stock is a ledger: every change is a row in stock_movements, and a trigger
--    keeps variants.stock_qty in sync. Never update stock_qty directly.
--  * Anything that touches stock or money goes through a SECURITY DEFINER
--    function (RPC) so it runs in one transaction with server-side checks.
--    The browser can only read tables (with row level security) and write
--    a few admin-only tables directly (settings, categories, expenses, profiles).
--  * Refund receipts are stored as negative amounts / quantities so that
--    SUM(total) over completed sales is always the net sales figure.
--  * User-facing error messages are Thai because the app shows them as-is.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- Users / roles
-- -----------------------------------------------------------------------------

create table public.profiles (
  id           uuid primary key references auth.users (id) on delete cascade,
  username     text not null unique,
  display_name text not null default '',
  role         text not null default 'staff' check (role in ('admin', 'staff')),
  active       boolean not null default false,
  created_at   timestamptz not null default now()
);

comment on table public.profiles is 'One row per login. role=admin sees everything; staff can sell, receive stock and run shifts.';

create function public.is_active_user() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active);
$$;

create function public.is_admin() returns boolean
language sql stable security definer set search_path = ''
as $$
  select exists (select 1 from public.profiles where id = auth.uid() and active and role = 'admin');
$$;

-- Creates a profile for every new auth user. The very first user becomes the
-- admin. Everyone else starts inactive; the app's "users" page (which uses the
-- service role key) activates staff it creates. This means a stranger who
-- somehow signs up gets no access.
create function public.handle_new_user() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_first    boolean;
  v_username text;
begin
  select not exists (select 1 from public.profiles) into v_first;

  v_username := lower(coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'username'), ''),
    nullif(split_part(new.email, '@', 1), ''),
    new.id::text
  ));
  if exists (select 1 from public.profiles where username = v_username) then
    v_username := v_username || '-' || substr(new.id::text, 1, 4);
  end if;

  insert into public.profiles (id, username, display_name, role, active)
  values (
    new.id,
    v_username,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'display_name'), ''), v_username),
    case when v_first then 'admin' else 'staff' end,
    v_first
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- Never allow the shop to end up without an active admin.
create function public.protect_last_admin() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  if old.role = 'admin' and old.active and (new.role <> 'admin' or not new.active) then
    if not exists (
      select 1 from public.profiles where role = 'admin' and active and id <> old.id
    ) then
      raise exception 'ต้องมีผู้ดูแลระบบที่ใช้งานอยู่อย่างน้อย 1 คน';
    end if;
  end if;
  new.id := old.id;
  new.username := old.username;
  return new;
end;
$$;

create trigger profiles_protect_last_admin
  before update on public.profiles
  for each row execute function public.protect_last_admin();

-- -----------------------------------------------------------------------------
-- Shop settings (single row)
-- -----------------------------------------------------------------------------

create table public.settings (
  id               boolean primary key default true check (id),
  shop_name        text not null default 'Kramsakon',
  branch_name      text not null default 'สำนักงานใหญ่',
  address          text not null default '',
  phone            text not null default '',
  tax_id           text not null default '',
  vat_registered   boolean not null default true,
  vat_rate         numeric(5, 2) not null default 7 check (vat_rate >= 0 and vat_rate < 100),
  pos_reg_no       text not null default '',          -- POS approval no. from the Revenue Department (ภ.พ.06)
  receipt_footer   text not null default 'ขอบคุณที่อุดหนุนค่ะ',
  receipt_width_mm integer not null default 80 check (receipt_width_mm between 48 and 210),
  promptpay_id     text not null default '',          -- phone number or tax ID for PromptPay QR
  sku_prefix       text not null default 'KS' check (sku_prefix ~ '^[A-Z0-9]{0,6}$'),
  staff_can_refund boolean not null default true,
  label_width_mm   numeric(6, 1) not null default 40 check (label_width_mm > 0),
  label_height_mm  numeric(6, 1) not null default 30 check (label_height_mm > 0),
  label_columns    integer not null default 1 check (label_columns between 1 and 6),
  label_gap_mm     numeric(6, 1) not null default 2 check (label_gap_mm >= 0),
  label_show_price boolean not null default true,
  updated_at       timestamptz not null default now()
);

insert into public.settings default values;

-- -----------------------------------------------------------------------------
-- Catalogue
-- -----------------------------------------------------------------------------

create table public.categories (
  id         bigint generated always as identity primary key,
  name       text not null unique check (trim(name) <> ''),
  sort_order integer not null default 0,
  created_at timestamptz not null default now()
);

insert into public.categories (name, sort_order) values
  ('เสื้อ', 1), ('กางเกง', 2), ('กระโปรง', 3), ('ชุดเดรส', 4),
  ('ผ้าพันคอ / ผ้าคลุมไหล่', 5), ('ผ้าผืน', 6), ('กระเป๋า', 7), ('อื่นๆ', 99);

create table public.products (
  id          bigint generated always as identity primary key,
  name        text not null check (trim(name) <> ''),
  category_id bigint references public.categories (id) on delete set null,
  description text not null default '',
  is_unique   boolean not null default false,   -- one-of-a-kind piece (one barcode = one physical item)
  active      boolean not null default true,
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

-- A variant is the sellable thing: product × size × colour. It owns the barcode.
create table public.variants (
  id           bigint generated always as identity primary key,
  product_id   bigint not null references public.products (id) on delete cascade,
  sku          text not null unique check (sku ~ '^[A-Z0-9-]+$'),
  size         text not null default '',
  color        text not null default '',
  price        numeric(12, 2) not null check (price >= 0),
  stock_qty    integer not null default 0,
  low_stock_at integer not null default 0 check (low_stock_at >= 0),
  active       boolean not null default true,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now()
);

create index variants_product_id_idx on public.variants (product_id);

-- Cost is kept in its own table so staff (who can read variants) never see it.
create table public.variant_costs (
  variant_id bigint primary key references public.variants (id) on delete cascade,
  cost       numeric(12, 2) not null default 0 check (cost >= 0),
  updated_at timestamptz not null default now()
);

-- -----------------------------------------------------------------------------
-- Shifts (cash drawer sessions)
-- -----------------------------------------------------------------------------

create table public.shifts (
  id            bigint generated always as identity primary key,
  opened_by     uuid not null references public.profiles (id),
  opened_at     timestamptz not null default now(),
  opening_cash  numeric(12, 2) not null default 0 check (opening_cash >= 0),
  closed_by     uuid references public.profiles (id),
  closed_at     timestamptz,
  expected_cash numeric(12, 2),
  counted_cash  numeric(12, 2),
  note          text not null default ''
);

-- Only one shop-wide shift may be open at a time.
create unique index shifts_one_open_idx on public.shifts ((true)) where closed_at is null;

create table public.cash_movements (
  id         bigint generated always as identity primary key,
  shift_id   bigint not null references public.shifts (id),
  kind       text not null check (kind in ('pay_in', 'pay_out')),
  amount     numeric(12, 2) not null check (amount > 0),
  note       text not null default '',
  created_by uuid not null references public.profiles (id),
  created_at timestamptz not null default now()
);

create index cash_movements_shift_id_idx on public.cash_movements (shift_id);

-- -----------------------------------------------------------------------------
-- Sales and refunds
-- -----------------------------------------------------------------------------

create table public.sales (
  id               uuid primary key default gen_random_uuid(),
  receipt_no       text not null unique,
  kind             text not null check (kind in ('sale', 'refund')),
  refund_of        uuid references public.sales (id),
  status           text not null default 'completed' check (status in ('completed', 'voided')),
  shift_id         bigint references public.shifts (id),
  cashier_id       uuid not null references public.profiles (id),
  subtotal         numeric(12, 2) not null,   -- after line discounts, before bill discount
  bill_discount    numeric(12, 2) not null default 0,
  total            numeric(12, 2) not null,   -- what the customer paid (VAT included); negative for refunds
  vat_amount       numeric(12, 2) not null default 0,
  payment_method   text not null check (payment_method in ('cash', 'promptpay', 'transfer', 'card', 'other')),
  cash_received    numeric(12, 2),
  change_amount    numeric(12, 2),
  customer_name    text not null default '',  -- filled in only for a full tax invoice
  customer_tax_id  text not null default '',
  customer_address text not null default '',
  customer_branch  text not null default '',
  note             text not null default '',
  voided_at        timestamptz,
  voided_by        uuid references public.profiles (id),
  void_reason      text,
  created_at       timestamptz not null default now(),
  check ((kind = 'refund') = (refund_of is not null))
);

create index sales_created_at_idx on public.sales (created_at);
create index sales_shift_id_idx on public.sales (shift_id);
create index sales_refund_of_idx on public.sales (refund_of);

create table public.sale_items (
  id                  bigint generated always as identity primary key,
  sale_id             uuid not null references public.sales (id) on delete cascade,
  variant_id          bigint references public.variants (id) on delete set null,
  refund_of_item      bigint references public.sale_items (id),
  product_name        text not null,   -- snapshots, so old receipts never change
  variant_label       text not null default '',
  sku                 text not null,
  qty                 integer not null check (qty <> 0),
  unit_price          numeric(12, 2) not null,
  line_discount       numeric(12, 2) not null default 0,
  bill_discount_share numeric(12, 2) not null default 0,
  line_total          numeric(12, 2) not null,  -- qty * unit_price - line_discount - bill_discount_share
  unit_cost           numeric(12, 2) not null default 0
);

create index sale_items_sale_id_idx on public.sale_items (sale_id);
create index sale_items_variant_id_idx on public.sale_items (variant_id);
create index sale_items_refund_of_item_idx on public.sale_items (refund_of_item);

-- -----------------------------------------------------------------------------
-- Stock ledger
-- -----------------------------------------------------------------------------

create table public.stock_movements (
  id         bigint generated always as identity primary key,
  variant_id bigint not null references public.variants (id) on delete cascade,
  qty_change integer not null check (qty_change <> 0),
  reason     text not null check (reason in ('receive', 'sale', 'refund', 'void', 'adjust', 'count')),
  unit_cost  numeric(12, 2),
  sale_id    uuid references public.sales (id),
  note       text not null default '',
  created_by uuid references public.profiles (id),
  created_at timestamptz not null default now()
);

create index stock_movements_variant_id_idx on public.stock_movements (variant_id);
create index stock_movements_created_at_idx on public.stock_movements (created_at);
create index stock_movements_sale_id_idx on public.stock_movements (sale_id);

create function public.apply_stock_movement() returns trigger
language plpgsql security definer set search_path = ''
as $$
begin
  update public.variants set stock_qty = stock_qty + new.qty_change where id = new.variant_id;
  return new;
end;
$$;

create trigger stock_movements_apply
  after insert on public.stock_movements
  for each row execute function public.apply_stock_movement();

-- -----------------------------------------------------------------------------
-- Expenses
-- -----------------------------------------------------------------------------

create table public.expenses (
  id             bigint generated always as identity primary key,
  expense_date   date not null default ((now() at time zone 'Asia/Bangkok')::date),
  -- 'inventory' = buying goods for resale: counted in cash flow and input VAT,
  -- but NOT in profit (that cost is counted when the item sells, as COGS).
  category       text not null check (category in (
                   'inventory', 'rent', 'salary', 'utilities', 'marketing',
                   'supplies', 'transport', 'fees', 'other')),
  description    text not null default '',
  vendor         text not null default '',
  vendor_tax_id  text not null default '',
  tax_invoice_no text not null default '',
  amount         numeric(12, 2) not null check (amount > 0),      -- total paid, VAT included
  vat_amount     numeric(12, 2) not null default 0 check (vat_amount >= 0),
  payment_method text not null default 'cash' check (payment_method in ('cash', 'promptpay', 'transfer', 'card', 'other')),
  created_by     uuid references public.profiles (id) default auth.uid(),
  created_at     timestamptz not null default now(),
  check (vat_amount <= amount)
);

create index expenses_expense_date_idx on public.expenses (expense_date);

-- -----------------------------------------------------------------------------
-- Counters (gap-free document numbers) and audit log
-- -----------------------------------------------------------------------------

create table public.counters (
  key   text primary key,
  value bigint not null
);

create table public.audit_log (
  id         bigint generated always as identity primary key,
  table_name text not null,
  row_id     text,
  action     text not null,
  old_data   jsonb,
  new_data   jsonb,
  user_id    uuid default auth.uid(),
  created_at timestamptz not null default now()
);

create index audit_log_created_at_idx on public.audit_log (created_at);

create function public.audit_trigger() returns trigger
language plpgsql security definer set search_path = ''
as $$
declare
  v_row jsonb := case when tg_op = 'DELETE' then to_jsonb(old) else to_jsonb(new) end;
begin
  insert into public.audit_log (table_name, row_id, action, old_data, new_data, user_id)
  values (
    tg_table_name,
    coalesce(v_row ->> 'id', v_row ->> 'variant_id'),
    tg_op,
    case when tg_op <> 'INSERT' then to_jsonb(old) end,
    case when tg_op <> 'DELETE' then to_jsonb(new) end,
    auth.uid()
  );
  return coalesce(new, old);
end;
$$;

create trigger audit_products after update or delete on public.products
  for each row execute function public.audit_trigger();
create trigger audit_variants after update of sku, size, color, price, low_stock_at, active or delete on public.variants
  for each row execute function public.audit_trigger();
create trigger audit_variant_costs after insert or update on public.variant_costs
  for each row execute function public.audit_trigger();
create trigger audit_settings after update on public.settings
  for each row execute function public.audit_trigger();
create trigger audit_profiles after update on public.profiles
  for each row execute function public.audit_trigger();
create trigger audit_expenses after update or delete on public.expenses
  for each row execute function public.audit_trigger();
create trigger audit_sales after update on public.sales
  for each row execute function public.audit_trigger();

-- -----------------------------------------------------------------------------
-- Internal helpers (not callable from the browser)
-- -----------------------------------------------------------------------------

create function public.next_counter(p_key text) returns bigint
language sql volatile security definer set search_path = ''
as $$
  insert into public.counters as c (key, value) values (p_key, 1)
  on conflict (key) do update set value = c.value + 1
  returning c.value;
$$;

-- e.g. S2610-0001 (sale, Oct 2026, #1). Numbers restart every month and have
-- no gaps, because the counter row is locked until the transaction commits.
create function public.next_doc_no(p_prefix text) returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_period text := to_char(now() at time zone 'Asia/Bangkok', 'YYMM');
begin
  return p_prefix || v_period || '-' || lpad(public.next_counter(p_prefix || v_period)::text, 4, '0');
end;
$$;

create function public.generate_sku() returns text
language plpgsql volatile security definer set search_path = ''
as $$
declare
  v_prefix text;
  v_sku    text;
begin
  select sku_prefix into v_prefix from public.settings;
  loop
    v_sku := coalesce(v_prefix, '') || lpad(public.next_counter('SKU')::text, 6, '0');
    exit when not exists (select 1 from public.variants where sku = v_sku);
  end loop;
  return v_sku;
end;
$$;

create function public.bkk_start(p_date date) returns timestamptz
language sql stable set search_path = ''
as $$
  select p_date::timestamp at time zone 'Asia/Bangkok';
$$;

create function public.open_shift_id() returns bigint
language sql stable security definer set search_path = ''
as $$
  select id from public.shifts where closed_at is null limit 1;
$$;

create function public.vat_of(p_total numeric) returns numeric
language sql stable security definer set search_path = ''
as $$
  select case when s.vat_registered then round(p_total * s.vat_rate / (100 + s.vat_rate), 2) else 0 end
  from public.settings s;
$$;

-- -----------------------------------------------------------------------------
-- RPC: products
-- -----------------------------------------------------------------------------

-- Create or update a product together with its variants in one go.
--   p_product:  {id?, name, category_id?, description?, is_unique?, active?}
--   p_variants: [{id?, sku?, size?, color?, price, low_stock_at?, active?, cost?, initial_qty?}]
-- Blank sku → a new barcode is generated. Variants missing from p_variants
-- are deleted (or archived if they already have history).
-- Staff may create new products; only admins may edit or set cost.
create function public.save_product(p_product jsonb, p_variants jsonb)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_admin      boolean := public.is_admin();
  v_product_id bigint := nullif(p_product ->> 'id', '')::bigint;
  v_is_new     boolean := v_product_id is null;
  v_v          jsonb;
  v_variant_id bigint;
  v_sku        text;
  v_keep       bigint[] := '{}';
  v_initial    integer;
  v_price      numeric;
begin
  if not public.is_active_user() then
    raise exception 'ไม่มีสิทธิ์ใช้งาน';
  end if;
  if not v_is_new and not v_admin then
    raise exception 'เฉพาะผู้ดูแลระบบเท่านั้นที่แก้ไขสินค้าได้';
  end if;
  if coalesce(trim(p_product ->> 'name'), '') = '' then
    raise exception 'กรุณาระบุชื่อสินค้า';
  end if;
  if p_variants is null or jsonb_typeof(p_variants) <> 'array' or jsonb_array_length(p_variants) = 0 then
    raise exception 'สินค้าต้องมีอย่างน้อย 1 รายการ (ไซซ์/สี)';
  end if;

  if v_is_new then
    insert into public.products (name, category_id, description, is_unique)
    values (
      trim(p_product ->> 'name'),
      nullif(p_product ->> 'category_id', '')::bigint,
      coalesce(p_product ->> 'description', ''),
      coalesce((p_product ->> 'is_unique')::boolean, false)
    )
    returning id into v_product_id;
  else
    update public.products set
      name        = trim(p_product ->> 'name'),
      category_id = nullif(p_product ->> 'category_id', '')::bigint,
      description = coalesce(p_product ->> 'description', ''),
      is_unique   = coalesce((p_product ->> 'is_unique')::boolean, is_unique),
      active      = coalesce((p_product ->> 'active')::boolean, active),
      updated_at  = now()
    where id = v_product_id;
    if not found then
      raise exception 'ไม่พบสินค้า';
    end if;
  end if;

  for v_v in select value from jsonb_array_elements(p_variants) loop
    v_sku := upper(trim(coalesce(v_v ->> 'sku', '')));
    if v_sku = '' then
      v_sku := public.generate_sku();
    elsif v_sku !~ '^[A-Z0-9-]+$' then
      raise exception 'บาร์โค้ด "%" ใช้ได้เฉพาะตัวอักษร A-Z ตัวเลข 0-9 และขีด -', v_sku;
    end if;

    v_price := nullif(v_v ->> 'price', '')::numeric;
    if v_price is null or v_price < 0 then
      raise exception 'กรุณาระบุราคาขายให้ถูกต้อง';
    end if;

    v_variant_id := nullif(v_v ->> 'id', '')::bigint;
    begin
      if v_variant_id is null then
        insert into public.variants (product_id, sku, size, color, price, low_stock_at, active)
        values (
          v_product_id, v_sku,
          trim(coalesce(v_v ->> 'size', '')),
          trim(coalesce(v_v ->> 'color', '')),
          v_price,
          coalesce(nullif(v_v ->> 'low_stock_at', '')::integer, 0),
          coalesce((v_v ->> 'active')::boolean, true)
        )
        returning id into v_variant_id;
      else
        update public.variants set
          sku          = v_sku,
          size         = trim(coalesce(v_v ->> 'size', '')),
          color        = trim(coalesce(v_v ->> 'color', '')),
          price        = v_price,
          low_stock_at = coalesce(nullif(v_v ->> 'low_stock_at', '')::integer, 0),
          active       = coalesce((v_v ->> 'active')::boolean, active),
          updated_at   = now()
        where id = v_variant_id and product_id = v_product_id;
        if not found then
          raise exception 'ไม่พบรายการสินค้า (ไซซ์/สี) ที่ต้องการแก้ไข';
        end if;
      end if;
    exception when unique_violation then
      raise exception 'บาร์โค้ด "%" ซ้ำกับสินค้าอื่น', v_sku;
    end;
    v_keep := v_keep || v_variant_id;

    if v_admin and nullif(v_v ->> 'cost', '') is not null then
      insert into public.variant_costs (variant_id, cost)
      values (v_variant_id, (v_v ->> 'cost')::numeric)
      on conflict (variant_id) do update
        set cost = excluded.cost, updated_at = now()
        where variant_costs.cost is distinct from excluded.cost;
    end if;

    v_initial := coalesce(nullif(v_v ->> 'initial_qty', '')::integer, 0);
    if v_initial < 0 then
      raise exception 'จำนวนเริ่มต้นต้องไม่ติดลบ';
    elsif v_initial > 0 then
      insert into public.stock_movements (variant_id, qty_change, reason, unit_cost, note, created_by)
      values (
        v_variant_id, v_initial, 'receive',
        (select cost from public.variant_costs where variant_id = v_variant_id),
        'สต็อกเริ่มต้น', auth.uid()
      );
    end if;
  end loop;

  if not v_is_new then
    -- Variants removed in the form: delete if unused, otherwise archive.
    for v_variant_id in
      select id from public.variants where product_id = v_product_id and id <> all (v_keep)
    loop
      if exists (select 1 from public.stock_movements where variant_id = v_variant_id)
         or exists (select 1 from public.sale_items where variant_id = v_variant_id) then
        update public.variants set active = false, updated_at = now() where id = v_variant_id;
      else
        delete from public.variants where id = v_variant_id;
      end if;
    end loop;
  end if;

  return jsonb_build_object(
    'id', v_product_id,
    'variants', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', v.id, 'sku', v.sku, 'size', v.size, 'color', v.color,
        'price', v.price, 'stock_qty', v.stock_qty, 'active', v.active
      ) order by v.id), '[]'::jsonb)
      from public.variants v where v.product_id = v_product_id
    )
  );
end;
$$;

-- Delete a product that was never used; otherwise archive it.
create function public.delete_product(p_product_id bigint)
returns text
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'เฉพาะผู้ดูแลระบบเท่านั้น';
  end if;
  if exists (
    select 1 from public.variants v
    where v.product_id = p_product_id
      and (exists (select 1 from public.stock_movements m where m.variant_id = v.id)
           or exists (select 1 from public.sale_items i where i.variant_id = v.id))
  ) then
    update public.products set active = false, updated_at = now() where id = p_product_id;
    update public.variants set active = false, updated_at = now() where product_id = p_product_id;
    return 'archived';
  end if;
  delete from public.products where id = p_product_id;
  return 'deleted';
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: stock
-- -----------------------------------------------------------------------------

-- Receive goods. p_items: [{variant_id, qty, unit_cost?}]
-- unit_cost (excluding VAT if the supplier charged VAT) is only used when an
-- admin calls this; it updates the weighted-average cost of the variant.
create function public.receive_stock(p_items jsonb, p_note text default '')
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_admin   boolean := public.is_admin();
  v_item    jsonb;
  v_vid     bigint;
  v_qty     integer;
  v_cost    numeric;
  v_old_qty integer;
  v_old_cst numeric;
  v_count   integer := 0;
begin
  if not public.is_active_user() then
    raise exception 'ไม่มีสิทธิ์ใช้งาน';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'ไม่มีรายการรับสินค้า';
  end if;

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_vid := (v_item ->> 'variant_id')::bigint;
    v_qty := (v_item ->> 'qty')::integer;
    if v_qty is null or v_qty <= 0 then
      raise exception 'จำนวนรับเข้าต้องมากกว่า 0';
    end if;

    select v.stock_qty, coalesce(c.cost, 0) into v_old_qty, v_old_cst
    from public.variants v left join public.variant_costs c on c.variant_id = v.id
    where v.id = v_vid
    for update of v;
    if not found then
      raise exception 'ไม่พบสินค้า (รหัส %)', v_vid;
    end if;

    v_cost := case when v_admin then nullif(v_item ->> 'unit_cost', '')::numeric end;
    if v_cost is not null then
      if v_cost < 0 then
        raise exception 'ต้นทุนต้องไม่ติดลบ';
      end if;
      insert into public.variant_costs (variant_id, cost)
      values (
        v_vid,
        round((greatest(v_old_qty, 0) * v_old_cst + v_qty * v_cost) / (greatest(v_old_qty, 0) + v_qty), 2)
      )
      on conflict (variant_id) do update set cost = excluded.cost, updated_at = now();
    end if;

    insert into public.stock_movements (variant_id, qty_change, reason, unit_cost, note, created_by)
    values (v_vid, v_qty, 'receive', coalesce(v_cost, v_old_cst), coalesce(p_note, ''), auth.uid());
    v_count := v_count + 1;
  end loop;
  return v_count;
end;
$$;

-- Stock count: set each variant to the counted quantity. p_items: [{variant_id, counted}]
create function public.count_stock(p_items jsonb, p_note text default '')
returns integer
language plpgsql security definer set search_path = ''
as $$
declare
  v_item    jsonb;
  v_vid     bigint;
  v_counted integer;
  v_current integer;
  v_changed integer := 0;
begin
  if not public.is_admin() then
    raise exception 'เฉพาะผู้ดูแลระบบเท่านั้น';
  end if;
  for v_item in select value from jsonb_array_elements(coalesce(p_items, '[]'::jsonb)) loop
    v_vid := (v_item ->> 'variant_id')::bigint;
    v_counted := (v_item ->> 'counted')::integer;
    if v_counted is null or v_counted < 0 then
      raise exception 'จำนวนที่นับได้ต้องไม่ติดลบ';
    end if;
    select stock_qty into v_current from public.variants where id = v_vid for update;
    if not found then
      raise exception 'ไม่พบสินค้า (รหัส %)', v_vid;
    end if;
    if v_counted <> v_current then
      insert into public.stock_movements (variant_id, qty_change, reason, unit_cost, note, created_by)
      values (
        v_vid, v_counted - v_current, 'count',
        (select cost from public.variant_costs where variant_id = v_vid),
        coalesce(p_note, ''), auth.uid()
      );
      v_changed := v_changed + 1;
    end if;
  end loop;
  return v_changed;
end;
$$;

-- Manual adjustment (damaged, lost, found, gift...). qty_change may be +/-.
create function public.adjust_stock(p_variant_id bigint, p_qty_change integer, p_note text)
returns void
language plpgsql security definer set search_path = ''
as $$
begin
  if not public.is_admin() then
    raise exception 'เฉพาะผู้ดูแลระบบเท่านั้น';
  end if;
  if p_qty_change is null or p_qty_change = 0 then
    raise exception 'จำนวนที่ปรับต้องไม่เป็น 0';
  end if;
  if coalesce(trim(p_note), '') = '' then
    raise exception 'กรุณาระบุเหตุผลการปรับสต็อก';
  end if;
  if not exists (select 1 from public.variants where id = p_variant_id) then
    raise exception 'ไม่พบสินค้า';
  end if;
  insert into public.stock_movements (variant_id, qty_change, reason, unit_cost, note, created_by)
  values (
    p_variant_id, p_qty_change, 'adjust',
    (select cost from public.variant_costs where variant_id = p_variant_id),
    trim(p_note), auth.uid()
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: shifts
-- -----------------------------------------------------------------------------

create function public.open_shift(p_opening_cash numeric default 0)
returns bigint
language plpgsql security definer set search_path = ''
as $$
declare
  v_id bigint;
begin
  if not public.is_active_user() then
    raise exception 'ไม่มีสิทธิ์ใช้งาน';
  end if;
  if coalesce(p_opening_cash, 0) < 0 then
    raise exception 'เงินทอนตั้งต้นต้องไม่ติดลบ';
  end if;
  if public.open_shift_id() is not null then
    raise exception 'มีกะที่เปิดอยู่แล้ว';
  end if;
  insert into public.shifts (opened_by, opening_cash)
  values (auth.uid(), coalesce(p_opening_cash, 0))
  returning id into v_id;
  return v_id;
exception when unique_violation then
  raise exception 'มีกะที่เปิดอยู่แล้ว';
end;
$$;

create function public.shift_summary(p_shift_id bigint default null)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_id     bigint := coalesce(p_shift_id, public.open_shift_id());
  v_shift  public.shifts;
  v_result jsonb;
begin
  if not public.is_active_user() then
    raise exception 'ไม่มีสิทธิ์ใช้งาน';
  end if;
  select * into v_shift from public.shifts where id = v_id;
  if not found then
    return null;
  end if;

  with s as (
    select * from public.sales where shift_id = v_id and status = 'completed'
  ), cm as (
    select
      coalesce(sum(amount) filter (where kind = 'pay_in'), 0)  as pay_in,
      coalesce(sum(amount) filter (where kind = 'pay_out'), 0) as pay_out
    from public.cash_movements where shift_id = v_id
  ), agg as (
    select
      coalesce(sum(total) filter (where payment_method = 'cash' and kind = 'sale'), 0)   as cash_sales,
      coalesce(sum(total) filter (where payment_method = 'cash' and kind = 'refund'), 0) as cash_refunds,
      coalesce(sum(total), 0)                                                             as net_sales,
      count(*) filter (where kind = 'sale')                                               as receipts,
      count(*) filter (where kind = 'refund')                                             as refunds
    from s
  )
  select jsonb_build_object(
    'id', v_shift.id,
    'opened_at', v_shift.opened_at,
    'opened_by', (select display_name from public.profiles where id = v_shift.opened_by),
    'closed_at', v_shift.closed_at,
    'closed_by', (select display_name from public.profiles where id = v_shift.closed_by),
    'opening_cash', v_shift.opening_cash,
    'cash_sales', agg.cash_sales,
    'cash_refunds', agg.cash_refunds,
    'pay_in', cm.pay_in,
    'pay_out', cm.pay_out,
    'expected_cash', coalesce(v_shift.expected_cash,
                              v_shift.opening_cash + agg.cash_sales + agg.cash_refunds + cm.pay_in - cm.pay_out),
    'counted_cash', v_shift.counted_cash,
    'net_sales', agg.net_sales,
    'receipts', agg.receipts,
    'refunds', agg.refunds,
    'note', v_shift.note,
    'by_method', (
      select coalesce(jsonb_agg(jsonb_build_object('method', payment_method, 'total', t, 'count', n) order by payment_method), '[]'::jsonb)
      from (select payment_method, sum(total) as t, count(*) as n from s group by payment_method) x
    ),
    'cash_movements', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', m.id, 'kind', m.kind, 'amount', m.amount, 'note', m.note, 'created_at', m.created_at,
        'created_by', (select display_name from public.profiles where id = m.created_by)
      ) order by m.created_at), '[]'::jsonb)
      from public.cash_movements m where m.shift_id = v_id
    )
  ) into v_result
  from agg, cm;

  return v_result;
end;
$$;

create function public.add_cash_movement(p_kind text, p_amount numeric, p_note text default '')
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_shift bigint := public.open_shift_id();
begin
  if not public.is_active_user() then
    raise exception 'ไม่มีสิทธิ์ใช้งาน';
  end if;
  if v_shift is null then
    raise exception 'ยังไม่ได้เปิดกะ';
  end if;
  if p_kind not in ('pay_in', 'pay_out') then
    raise exception 'ประเภทรายการไม่ถูกต้อง';
  end if;
  if p_amount is null or p_amount <= 0 then
    raise exception 'จำนวนเงินต้องมากกว่า 0';
  end if;
  if p_kind = 'pay_out' and coalesce(trim(p_note), '') = '' then
    raise exception 'กรุณาระบุเหตุผลการนำเงินออก';
  end if;
  insert into public.cash_movements (shift_id, kind, amount, note, created_by)
  values (v_shift, p_kind, p_amount, coalesce(trim(p_note), ''), auth.uid());
end;
$$;

create function public.close_shift(p_counted_cash numeric, p_note text default '')
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_shift   bigint := public.open_shift_id();
  v_summary jsonb;
begin
  if not public.is_active_user() then
    raise exception 'ไม่มีสิทธิ์ใช้งาน';
  end if;
  if v_shift is null then
    raise exception 'ไม่มีกะที่เปิดอยู่';
  end if;
  if p_counted_cash is null or p_counted_cash < 0 then
    raise exception 'กรุณาระบุจำนวนเงินสดที่นับได้';
  end if;
  perform 1 from public.shifts where id = v_shift for update;
  v_summary := public.shift_summary(v_shift);
  update public.shifts set
    closed_at     = now(),
    closed_by     = auth.uid(),
    expected_cash = (v_summary ->> 'expected_cash')::numeric,
    counted_cash  = p_counted_cash,
    note          = coalesce(trim(p_note), '')
  where id = v_shift;
  return public.shift_summary(v_shift);
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: sales
-- -----------------------------------------------------------------------------

-- Record a sale. Prices come from the database, never from the browser.
--   p_items: [{variant_id, qty, discount?}]   discount = baht off that line
--   p_expected_total: what the cashier saw; if prices changed meanwhile the
--                     sale is rejected so the cashier can re-check.
--   p_customer: {name, tax_id, address, branch} for a full tax invoice (optional)
create function public.create_sale(
  p_items          jsonb,
  p_payment_method text,
  p_bill_discount  numeric default 0,
  p_cash_received  numeric default null,
  p_expected_total numeric default null,
  p_customer       jsonb default '{}'::jsonb,
  p_note           text default ''
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_shift     bigint := public.open_shift_id();
  v_sale_id   uuid := gen_random_uuid();
  v_receipt   text;
  v_item      jsonb;
  v_qty       integer;
  v_disc      numeric;
  v_price     numeric;
  v_subtotal  numeric := 0;
  v_bill      numeric := round(coalesce(p_bill_discount, 0), 2);
  v_total     numeric;
  v_change    numeric;
  v_n         integer;
  v_i         integer := 0;
  v_net       numeric;
  v_share     numeric;
  v_allocated numeric := 0;
  r           record;
begin
  if not public.is_active_user() then
    raise exception 'ไม่มีสิทธิ์ใช้งาน';
  end if;
  if v_shift is null then
    raise exception 'ยังไม่ได้เปิดกะ กรุณาเปิดกะก่อนขาย';
  end if;
  if p_payment_method is null or p_payment_method not in ('cash', 'promptpay', 'transfer', 'card', 'other') then
    raise exception 'วิธีชำระเงินไม่ถูกต้อง';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'ยังไม่มีสินค้าในบิล';
  end if;
  v_n := jsonb_array_length(p_items);

  -- Pass 1: validate lines and compute the subtotal.
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := (v_item ->> 'qty')::integer;
    v_disc := round(coalesce(nullif(v_item ->> 'discount', '')::numeric, 0), 2);
    select v.price into v_price
    from public.variants v join public.products p on p.id = v.product_id
    where v.id = (v_item ->> 'variant_id')::bigint and v.active and p.active
    for share of v;
    if not found then
      raise exception 'ไม่พบสินค้าหรือสินค้าถูกปิดการขาย (รหัส %)', v_item ->> 'variant_id';
    end if;
    if v_qty is null or v_qty <= 0 then
      raise exception 'จำนวนสินค้าต้องมากกว่า 0';
    end if;
    if v_disc < 0 or v_disc > v_qty * v_price then
      raise exception 'ส่วนลดรายการไม่ถูกต้อง';
    end if;
    v_subtotal := v_subtotal + v_qty * v_price - v_disc;
  end loop;

  if v_bill < 0 or v_bill > v_subtotal then
    raise exception 'ส่วนลดท้ายบิลไม่ถูกต้อง';
  end if;
  v_total := v_subtotal - v_bill;

  if p_expected_total is not null and abs(p_expected_total - v_total) >= 0.005 then
    raise exception 'ราคาสินค้ามีการเปลี่ยนแปลง (ยอดที่ถูกต้องคือ % บาท) กรุณาตรวจสอบบิลอีกครั้ง', v_total;
  end if;

  if p_payment_method = 'cash' then
    if p_cash_received is null or p_cash_received < v_total then
      raise exception 'รับเงินสดไม่พอ';
    end if;
    v_change := p_cash_received - v_total;
  end if;

  v_receipt := public.next_doc_no('S');

  insert into public.sales (
    id, receipt_no, kind, shift_id, cashier_id, subtotal, bill_discount, total, vat_amount,
    payment_method, cash_received, change_amount,
    customer_name, customer_tax_id, customer_address, customer_branch, note
  ) values (
    v_sale_id, v_receipt, 'sale', v_shift, auth.uid(), v_subtotal, v_bill, v_total, public.vat_of(v_total),
    p_payment_method,
    case when p_payment_method = 'cash' then p_cash_received end,
    v_change,
    coalesce(trim(p_customer ->> 'name'), ''),
    coalesce(trim(p_customer ->> 'tax_id'), ''),
    coalesce(trim(p_customer ->> 'address'), ''),
    coalesce(trim(p_customer ->> 'branch'), ''),
    coalesce(trim(p_note), '')
  );

  -- Pass 2: write lines, share the bill discount across lines by value
  -- (the last line takes the rounding remainder), and move stock.
  for v_item in select value from jsonb_array_elements(p_items) loop
    v_i := v_i + 1;
    v_qty := (v_item ->> 'qty')::integer;
    v_disc := round(coalesce(nullif(v_item ->> 'discount', '')::numeric, 0), 2);

    select v.id, v.sku, v.size, v.color, v.price, p.name, coalesce(c.cost, 0) as cost
    into r
    from public.variants v
    join public.products p on p.id = v.product_id
    left join public.variant_costs c on c.variant_id = v.id
    where v.id = (v_item ->> 'variant_id')::bigint;

    v_net := v_qty * r.price - v_disc;
    if v_i = v_n then
      v_share := v_bill - v_allocated;
    elsif v_subtotal = 0 then
      v_share := 0;
    else
      v_share := round(v_bill * v_net / v_subtotal, 2);
    end if;
    v_allocated := v_allocated + v_share;

    insert into public.sale_items (
      sale_id, variant_id, product_name, variant_label, sku, qty, unit_price,
      line_discount, bill_discount_share, line_total, unit_cost
    ) values (
      v_sale_id, r.id, r.name, concat_ws(' / ', nullif(r.size, ''), nullif(r.color, '')), r.sku, v_qty, r.price,
      v_disc, v_share, v_net - v_share, r.cost
    );

    insert into public.stock_movements (variant_id, qty_change, reason, unit_cost, sale_id, created_by)
    values (r.id, -v_qty, 'sale', r.cost, v_sale_id, auth.uid());
  end loop;

  return jsonb_build_object('id', v_sale_id, 'receipt_no', v_receipt, 'total', v_total, 'change', v_change);
end;
$$;

-- Refund some or all items of a sale. Returned items go back into stock.
--   p_items: [{sale_item_id, qty}]
create function public.refund_sale(
  p_sale_id        uuid,
  p_items          jsonb,
  p_payment_method text default null,
  p_reason         text default ''
)
returns jsonb
language plpgsql security definer set search_path = ''
as $$
declare
  v_shift      bigint := public.open_shift_id();
  v_orig       public.sales;
  v_refund_id  uuid := gen_random_uuid();
  v_receipt    text;
  v_item       jsonb;
  v_qty        integer;
  v_line       public.sale_items;
  v_done_qty   integer;
  v_done_disc  numeric;
  v_done_share numeric;
  v_done_total numeric;
  v_disc       numeric;
  v_share      numeric;
  v_total      numeric := 0;
  v_subtotal   numeric := 0;
  v_bill       numeric := 0;
begin
  if not public.is_active_user() then
    raise exception 'ไม่มีสิทธิ์ใช้งาน';
  end if;
  if not public.is_admin() and not (select staff_can_refund from public.settings) then
    raise exception 'เฉพาะผู้ดูแลระบบเท่านั้นที่คืนสินค้าได้';
  end if;
  if v_shift is null then
    raise exception 'ยังไม่ได้เปิดกะ กรุณาเปิดกะก่อน';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'กรุณาระบุเหตุผลการคืนสินค้า';
  end if;

  select * into v_orig from public.sales where id = p_sale_id for update;
  if not found or v_orig.kind <> 'sale' then
    raise exception 'ไม่พบใบเสร็จขาย';
  end if;
  if v_orig.status <> 'completed' then
    raise exception 'ใบเสร็จนี้ถูกยกเลิกแล้ว';
  end if;
  if p_items is null or jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then
    raise exception 'กรุณาเลือกสินค้าที่จะคืน';
  end if;

  v_receipt := public.next_doc_no('CN');

  insert into public.sales (
    id, receipt_no, kind, refund_of, shift_id, cashier_id, subtotal, bill_discount, total, vat_amount,
    payment_method, customer_name, customer_tax_id, customer_address, customer_branch, note
  ) values (
    v_refund_id, v_receipt, 'refund', v_orig.id, v_shift, auth.uid(), 0, 0, 0, 0,
    coalesce(p_payment_method, v_orig.payment_method),
    v_orig.customer_name, v_orig.customer_tax_id, v_orig.customer_address, v_orig.customer_branch,
    trim(p_reason)
  );

  for v_item in select value from jsonb_array_elements(p_items) loop
    v_qty := (v_item ->> 'qty')::integer;
    if v_qty is null or v_qty <= 0 then
      continue;
    end if;

    select * into v_line from public.sale_items
    where id = (v_item ->> 'sale_item_id')::bigint and sale_id = v_orig.id;
    if not found then
      raise exception 'ไม่พบรายการสินค้าในใบเสร็จ';
    end if;

    -- What has already been refunded on this line (refund rows are negative).
    select
      coalesce(-sum(i.qty), 0),
      coalesce(-sum(i.line_discount), 0),
      coalesce(-sum(i.bill_discount_share), 0),
      coalesce(-sum(i.line_total), 0)
    into v_done_qty, v_done_disc, v_done_share, v_done_total
    from public.sale_items i join public.sales s on s.id = i.sale_id
    where i.refund_of_item = v_line.id and s.status = 'completed';

    if v_qty > v_line.qty - v_done_qty then
      raise exception 'คืน "%" ได้อีกไม่เกิน % ชิ้น', v_line.product_name, v_line.qty - v_done_qty;
    end if;

    if v_qty = v_line.qty - v_done_qty then
      -- Last units on this line: refund exactly what is left (no rounding drift).
      v_disc  := v_line.line_discount - v_done_disc;
      v_share := v_line.bill_discount_share - v_done_share;
    else
      v_disc  := round(v_line.line_discount * v_qty / v_line.qty, 2);
      v_share := round(v_line.bill_discount_share * v_qty / v_line.qty, 2);
    end if;

    insert into public.sale_items (
      sale_id, variant_id, refund_of_item, product_name, variant_label, sku, qty, unit_price,
      line_discount, bill_discount_share, line_total, unit_cost
    ) values (
      v_refund_id, v_line.variant_id, v_line.id, v_line.product_name, v_line.variant_label, v_line.sku,
      -v_qty, v_line.unit_price, -v_disc, -v_share,
      -(v_qty * v_line.unit_price - v_disc - v_share), v_line.unit_cost
    );

    v_subtotal := v_subtotal - (v_qty * v_line.unit_price - v_disc);
    v_bill := v_bill - v_share;
    v_total := v_total - (v_qty * v_line.unit_price - v_disc - v_share);

    if v_line.variant_id is not null then
      insert into public.stock_movements (variant_id, qty_change, reason, unit_cost, sale_id, note, created_by)
      values (v_line.variant_id, v_qty, 'refund', v_line.unit_cost, v_refund_id, trim(p_reason), auth.uid());
    end if;
  end loop;

  if not exists (select 1 from public.sale_items where sale_id = v_refund_id) then
    raise exception 'กรุณาเลือกสินค้าที่จะคืน';
  end if;

  update public.sales set
    subtotal = v_subtotal,
    bill_discount = v_bill,
    total = v_total,
    vat_amount = -public.vat_of(-v_total)
  where id = v_refund_id;

  return jsonb_build_object('id', v_refund_id, 'receipt_no', v_receipt, 'total', v_total);
end;
$$;

-- Cancel a receipt entered by mistake (admin only). The receipt is kept but
-- marked voided, and its stock effect is reversed.
create function public.void_sale(p_sale_id uuid, p_reason text)
returns void
language plpgsql security definer set search_path = ''
as $$
declare
  v_sale public.sales;
  m      record;
begin
  if not public.is_admin() then
    raise exception 'เฉพาะผู้ดูแลระบบเท่านั้นที่ยกเลิกใบเสร็จได้';
  end if;
  if coalesce(trim(p_reason), '') = '' then
    raise exception 'กรุณาระบุเหตุผลการยกเลิก';
  end if;
  select * into v_sale from public.sales where id = p_sale_id for update;
  if not found then
    raise exception 'ไม่พบใบเสร็จ';
  end if;
  if v_sale.status = 'voided' then
    raise exception 'ใบเสร็จนี้ถูกยกเลิกไปแล้ว';
  end if;
  if exists (select 1 from public.sales where refund_of = p_sale_id and status = 'completed') then
    raise exception 'ใบเสร็จนี้มีการคืนสินค้าแล้ว กรุณายกเลิกใบคืนสินค้าก่อน';
  end if;

  update public.sales set
    status = 'voided', voided_at = now(), voided_by = auth.uid(), void_reason = trim(p_reason)
  where id = p_sale_id;

  for m in
    select variant_id, sum(qty_change) as q, max(unit_cost) as unit_cost
    from public.stock_movements
    where sale_id = p_sale_id
    group by variant_id
  loop
    if m.q <> 0 then
      insert into public.stock_movements (variant_id, qty_change, reason, unit_cost, sale_id, note, created_by)
      values (m.variant_id, -m.q, 'void', m.unit_cost, p_sale_id, trim(p_reason), auth.uid());
    end if;
  end loop;
end;
$$;

-- Full receipt for display / printing (without cost, so staff can use it).
create function public.get_receipt(p_sale_id uuid)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_result jsonb;
begin
  if not public.is_active_user() then
    raise exception 'ไม่มีสิทธิ์ใช้งาน';
  end if;

  select to_jsonb(s) || jsonb_build_object(
    'cashier_name', (select display_name from public.profiles where id = s.cashier_id),
    'voided_by_name', (select display_name from public.profiles where id = s.voided_by),
    'original_receipt_no', (select receipt_no from public.sales where id = s.refund_of),
    'items', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', i.id,
        'variant_id', i.variant_id,
        'product_name', i.product_name,
        'variant_label', i.variant_label,
        'sku', i.sku,
        'qty', i.qty,
        'unit_price', i.unit_price,
        'line_discount', i.line_discount,
        'bill_discount_share', i.bill_discount_share,
        'line_total', i.line_total,
        'refundable_qty', i.qty + coalesce((
          select sum(r.qty) from public.sale_items r join public.sales rs on rs.id = r.sale_id
          where r.refund_of_item = i.id and rs.status = 'completed'
        ), 0)
      ) order by i.id), '[]'::jsonb)
      from public.sale_items i where i.sale_id = s.id
    ),
    'refunds', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'id', r.id, 'receipt_no', r.receipt_no, 'total', r.total, 'status', r.status, 'created_at', r.created_at
      ) order by r.created_at), '[]'::jsonb)
      from public.sales r where r.refund_of = s.id
    )
  )
  into v_result
  from public.sales s
  where s.id = p_sale_id;

  return v_result;
end;
$$;

-- -----------------------------------------------------------------------------
-- RPC: reports (admin only). Dates are Bangkok calendar days, inclusive.
-- -----------------------------------------------------------------------------

create function public.report_summary(p_from date, p_to date)
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_from   timestamptz := public.bkk_start(p_from);
  v_to     timestamptz := public.bkk_start(p_to + 1);
  v_result jsonb;
begin
  if not public.is_admin() then
    raise exception 'เฉพาะผู้ดูแลระบบเท่านั้น';
  end if;

  with s as (
    select * from public.sales
    where status = 'completed' and created_at >= v_from and created_at < v_to
  ), i as (
    select i.*, s.kind from public.sale_items i join s on s.id = i.sale_id
  ), totals as (
    select
      coalesce(sum(total), 0)                                 as net_sales,
      coalesce(sum(vat_amount), 0)                            as vat,
      coalesce(-sum(total) filter (where kind = 'refund'), 0) as refunds,
      count(*) filter (where kind = 'sale')                   as receipts,
      count(*) filter (where kind = 'refund')                 as refund_receipts
    from s
  ), lines as (
    select
      coalesce(sum(qty * unit_price) filter (where kind = 'sale'), 0)                          as gross_sales,
      coalesce(sum(line_discount + bill_discount_share) filter (where kind = 'sale'), 0)       as discounts,
      coalesce(sum(qty * unit_cost), 0)                                                       as cogs,
      coalesce(sum(qty), 0)                                                                   as items_sold
    from i
  ), exp as (
    select
      coalesce(sum(amount - vat_amount) filter (where category <> 'inventory'), 0) as expenses,
      coalesce(sum(amount) filter (where category = 'inventory'), 0)              as inventory_purchases,
      coalesce(sum(vat_amount), 0)                                                as input_vat
    from public.expenses
    where expense_date between p_from and p_to
  )
  select jsonb_build_object(
    'from', p_from,
    'to', p_to,
    'gross_sales', lines.gross_sales,
    'discounts', lines.discounts,
    'refunds', totals.refunds,
    'net_sales', totals.net_sales,
    'vat', totals.vat,
    'net_sales_ex_vat', totals.net_sales - totals.vat,
    'cogs', lines.cogs,
    'gross_profit', totals.net_sales - totals.vat - lines.cogs,
    'expenses', exp.expenses,
    'net_profit', totals.net_sales - totals.vat - lines.cogs - exp.expenses,
    'inventory_purchases', exp.inventory_purchases,
    'input_vat', exp.input_vat,
    'receipts', totals.receipts,
    'refund_receipts', totals.refund_receipts,
    'items_sold', lines.items_sold,
    'by_payment', (
      select coalesce(jsonb_agg(jsonb_build_object('method', payment_method, 'total', t, 'count', n) order by t desc), '[]'::jsonb)
      from (select payment_method, sum(total) as t, count(*) as n from s group by payment_method) x
    ),
    'daily', (
      select coalesce(jsonb_agg(jsonb_build_object('date', d, 'net_sales', t, 'receipts', n) order by d), '[]'::jsonb)
      from (
        select (created_at at time zone 'Asia/Bangkok')::date as d, sum(total) as t, count(*) filter (where kind = 'sale') as n
        from s group by 1
      ) x
    ),
    'by_category', (
      select coalesce(jsonb_agg(jsonb_build_object('category', coalesce(c.name, 'ไม่ระบุหมวดหมู่'), 'qty', x.q, 'net_sales', x.t) order by x.t desc), '[]'::jsonb)
      from (
        select p.category_id, sum(i.qty) as q, sum(i.line_total) as t
        from i
        left join public.variants v on v.id = i.variant_id
        left join public.products p on p.id = v.product_id
        group by p.category_id
      ) x
      left join public.categories c on c.id = x.category_id
    ),
    'by_cashier', (
      select coalesce(jsonb_agg(jsonb_build_object('cashier', pr.display_name, 'net_sales', x.t, 'receipts', x.n, 'refunds', x.r) order by x.t desc), '[]'::jsonb)
      from (
        select cashier_id, sum(total) as t, count(*) filter (where kind = 'sale') as n,
               coalesce(-sum(total) filter (where kind = 'refund'), 0) as r
        from s group by cashier_id
      ) x
      join public.profiles pr on pr.id = x.cashier_id
    )
  ) into v_result
  from totals, lines, exp;

  return v_result;
end;
$$;

create function public.report_items(p_from date, p_to date)
returns table (
  variant_id    bigint,
  sku           text,
  product_name  text,
  variant_label text,
  category      text,
  qty           bigint,
  net_sales     numeric,
  cogs          numeric,
  gross_profit  numeric,
  stock_qty     integer
)
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_rate numeric := (select case when vat_registered then vat_rate else 0 end from public.settings);
begin
  if not public.is_admin() then
    raise exception 'เฉพาะผู้ดูแลระบบเท่านั้น';
  end if;
  return query
  select
    i.variant_id,
    max(i.sku),
    max(i.product_name),
    max(i.variant_label),
    max(c.name),
    sum(i.qty)::bigint,
    sum(i.line_total),
    sum(i.qty * i.unit_cost),
    round(sum(i.line_total) * 100 / (100 + v_rate) - sum(i.qty * i.unit_cost), 2),
    max(v.stock_qty)
  from public.sale_items i
  join public.sales s on s.id = i.sale_id
  left join public.variants v on v.id = i.variant_id
  left join public.products p on p.id = v.product_id
  left join public.categories c on c.id = p.category_id
  where s.status = 'completed'
    and s.created_at >= public.bkk_start(p_from)
    and s.created_at < public.bkk_start(p_to + 1)
  group by i.variant_id
  order by sum(i.line_total) desc;
end;
$$;

create function public.dashboard()
returns jsonb
language plpgsql stable security definer set search_path = ''
as $$
declare
  v_today date := (now() at time zone 'Asia/Bangkok')::date;
begin
  if not public.is_admin() then
    raise exception 'เฉพาะผู้ดูแลระบบเท่านั้น';
  end if;

  return jsonb_build_object(
    'today', public.report_summary(v_today, v_today),
    'month', public.report_summary(date_trunc('month', v_today)::date, v_today),
    'last30', public.report_summary(v_today - 29, v_today) -> 'daily',
    'shift', public.shift_summary(null),
    'top_items', (
      select coalesce(jsonb_agg(to_jsonb(t)), '[]'::jsonb)
      from (select * from public.report_items(v_today - 29, v_today) limit 10) t
    ),
    'low_stock', (
      select coalesce(jsonb_agg(jsonb_build_object(
        'variant_id', v.id, 'sku', v.sku, 'product_name', p.name,
        'variant_label', concat_ws(' / ', nullif(v.size, ''), nullif(v.color, '')),
        'stock_qty', v.stock_qty, 'low_stock_at', v.low_stock_at
      ) order by v.stock_qty), '[]'::jsonb)
      from public.variants v join public.products p on p.id = v.product_id
      where v.active and p.active and not p.is_unique
        and (v.stock_qty < 0 or (v.low_stock_at > 0 and v.stock_qty <= v.low_stock_at))
    ),
    'inventory', (
      select jsonb_build_object(
        'units', coalesce(sum(greatest(v.stock_qty, 0)), 0),
        'cost_value', coalesce(sum(greatest(v.stock_qty, 0) * coalesce(c.cost, 0)), 0),
        'retail_value', coalesce(sum(greatest(v.stock_qty, 0) * v.price), 0),
        'variants_without_cost', count(*) filter (where v.stock_qty > 0 and coalesce(c.cost, 0) = 0)
      )
      from public.variants v
      join public.products p on p.id = v.product_id
      left join public.variant_costs c on c.variant_id = v.id
      where v.active and p.active
    )
  );
end;
$$;

-- -----------------------------------------------------------------------------
-- Row level security
-- -----------------------------------------------------------------------------

alter table public.profiles        enable row level security;
alter table public.settings        enable row level security;
alter table public.categories      enable row level security;
alter table public.products        enable row level security;
alter table public.variants        enable row level security;
alter table public.variant_costs   enable row level security;
alter table public.shifts          enable row level security;
alter table public.cash_movements  enable row level security;
alter table public.sales           enable row level security;
alter table public.sale_items      enable row level security;
alter table public.stock_movements enable row level security;
alter table public.expenses        enable row level security;
alter table public.counters        enable row level security;
alter table public.audit_log       enable row level security;

-- Everyone logged in (and active) can read the shared data they need to work.
create policy "active users read" on public.profiles       for select to authenticated using (public.is_active_user() or id = auth.uid());
create policy "active users read" on public.settings       for select to authenticated using (public.is_active_user());
create policy "active users read" on public.categories     for select to authenticated using (public.is_active_user());
create policy "active users read" on public.products       for select to authenticated using (public.is_active_user());
create policy "active users read" on public.variants       for select to authenticated using (public.is_active_user());
create policy "active users read" on public.shifts         for select to authenticated using (public.is_active_user());
create policy "active users read" on public.cash_movements for select to authenticated using (public.is_active_user());
create policy "active users read" on public.sales          for select to authenticated using (public.is_active_user());

-- Admin-only data (costs, profit, history).
create policy "admin read" on public.variant_costs   for select to authenticated using (public.is_admin());
create policy "admin read" on public.sale_items      for select to authenticated using (public.is_admin());
create policy "admin read" on public.stock_movements for select to authenticated using (public.is_admin());
create policy "admin read" on public.audit_log       for select to authenticated using (public.is_admin());

-- Admin can edit these tables directly from the app.
create policy "admin update" on public.profiles   for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin update" on public.settings   for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin write"  on public.categories for all    to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "admin write"  on public.expenses   for all    to authenticated using (public.is_admin()) with check (public.is_admin());

-- -----------------------------------------------------------------------------
-- Privileges. Everything that changes stock or money is RPC-only.
-- -----------------------------------------------------------------------------

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
revoke execute on all functions in schema public from public, anon, authenticated;

grant select on all tables in schema public to authenticated;
revoke select on public.counters from authenticated;
grant update (display_name, role, active) on public.profiles to authenticated;
grant update on public.settings to authenticated;
grant insert, update, delete on public.categories to authenticated;
grant insert, update, delete on public.expenses to authenticated;

grant all on all tables in schema public to service_role;
grant all on all sequences in schema public to service_role;

grant execute on function
  public.is_active_user(),
  public.is_admin(),
  public.save_product(jsonb, jsonb),
  public.delete_product(bigint),
  public.receive_stock(jsonb, text),
  public.count_stock(jsonb, text),
  public.adjust_stock(bigint, integer, text),
  public.open_shift(numeric),
  public.shift_summary(bigint),
  public.add_cash_movement(text, numeric, text),
  public.close_shift(numeric, text),
  public.create_sale(jsonb, text, numeric, numeric, numeric, jsonb, text),
  public.refund_sale(uuid, jsonb, text, text),
  public.void_sale(uuid, text),
  public.get_receipt(uuid),
  public.report_summary(date, date),
  public.report_items(date, date),
  public.dashboard()
to authenticated;

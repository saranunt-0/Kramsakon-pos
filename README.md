# Kramsakon POS

Point-of-sale, stock and simple bookkeeping for **Kramsakon (ครามสกล)**, a clothing shop in Sakon Nakhon.
The app's screens are in Thai; code and database are in English.

- **Web app:** Next.js 16 (React 19, Tailwind CSS 4), hosted on Vercel or Netlify
- **Database + logins:** Supabase (Postgres, Auth, row-level security)
- **Monthly cost to start:** ฿0 on free tiers. Check [docs/DEPLOY.md](docs/DEPLOY.md) first: Vercel's free plan does not allow commercial use.

## What it does

| Area | Features |
|---|---|
| Selling (ขายสินค้า) | Scan with a USB/Bluetooth scanner or a phone camera, tap to add, line and bill discounts (baht or %), cash with change, PromptPay QR with the amount filled in, transfer and card. Receipts print on 80/58 mm paper. |
| Receipts (ใบเสร็จ) | Search or scan a receipt barcode, reprint, refund or exchange (stock goes back), void a mistaken bill (admin only, kept for audit). |
| Shifts (กะ) | Open with a cash float; record pay in and pay out. At close, the app shows the expected cash next to the counted cash, so a shortfall or overage is visible. |
| Products (สินค้า) | Variants (size × colour), each with its own barcode. One-of-a-kind items. Barcodes are generated automatically or the existing ones are scanned. Costs are hidden from staff. |
| Stock (สต็อก) | Receive goods by scanning (keeps a weighted-average cost), stock counts, adjustments with a reason, and a full movement history with CSV export. |
| Labels (บาร์โค้ด) | Code 128 stickers printed on a thermal label printer. Label size and labels per row are configurable. |
| Accounting (บัญชี) | Dashboard, profit and loss, sales by item, category, staff and payment method. Expense entries record input VAT. CSV exports for the sales VAT and purchase VAT reports. |
| Users (พนักงาน) | One or more admins, plus staff accounts with a username and password (no email needed). Every sale, refund and stock change records who did it. |

**Admin vs staff:** staff can sell, refund (a setting can turn this off), open and close shifts, receive stock, add new products and print labels. Only admins can edit or delete products, see costs, profit and reports, count or adjust stock, void bills, record expenses, and manage users and settings. The database enforces these rules, so they hold even if someone bypasses the UI.

## How it is built

```
src/app/(app)/…        screens behind login (POS, receipts, products, stock, reports …)
src/app/print/…        receipt and label print pages (open in a new window)
src/app/api/…          server routes that need the Supabase secret key (first-run setup, staff accounts)
src/components/…       shared UI: scanner, camera scanner, barcode, receipt, checkout …
src/lib/…              helpers: money/date formatting, PromptPay QR, Thai keyboard fix for scanners, cart maths
supabase/migrations/   the whole database: tables, security rules, and all money/stock logic
tests/integration/     tests for the database rules (run against a throwaway Supabase)
```

Design rules worth knowing before you change things:

1. **Anything that moves money or stock is a Postgres function** (`create_sale`, `refund_sale`, `void_sale`, `receive_stock`, `count_stock`, `adjust_stock`, the shift functions and `save_product`). The browser cannot write those tables directly. Each function runs in one transaction and checks permissions. Prices are always read from the database, never trusted from the browser.
2. **Stock is a ledger.** Every change is a row in `stock_movements`, and a trigger keeps `variants.stock_qty` in sync. Never update `stock_qty` by hand; use a stock count or adjustment.
3. **Refunds are stored as negative receipts** (`kind = 'refund'`), so `SUM(total)` over completed sales is always net sales. Voided receipts stay in the table with `status = 'voided'`.
4. **Receipt numbers** (`S2610-0001`, credit notes `CN2610-0001`) restart every month and have no gaps.
5. **Selling prices include VAT** (Thai retail). VAT is calculated as `total × 7 / 107`.

To change the database later, add a new file in `supabase/migrations/` and run it in the Supabase SQL editor. Never edit a migration that has already been run.

## Developing

```bash
npm install
cp .env.example .env.local     # fill in your Supabase URL and keys
npm run dev                    # http://localhost:3000
```

Checks (CI runs the first four on every pull request):

```bash
npm run lint
npm run typecheck
npm test            # unit tests: PromptPay QR, scanner keyboard fix, cart maths
npm run build
npm run test:db     # database rule tests. They need an EMPTY Supabase (no users):
                    # SUPABASE_TEST_URL=… SUPABASE_TEST_ANON_KEY=… SUPABASE_TEST_SERVICE_ROLE_KEY=… npm run test:db
```

Use a separate, throwaway Supabase project for `test:db` (or `supabase start` with the Supabase CLI and Docker). **Never run it against the shop's real database.**

## Deploying and shop setup

- [docs/DEPLOY.md](docs/DEPLOY.md): step-by-step setup of Supabase and hosting (about 30 minutes)
- [docs/USER-GUIDE.th.md](docs/USER-GUIDE.th.md): Thai guide for the shop. Covers daily use, scanner and printer setup, and VAT notes.

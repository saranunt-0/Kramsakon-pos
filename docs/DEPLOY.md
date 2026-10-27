# Deploying Kramsakon POS

You need: a GitHub account (this repo), a **Supabase** account (database and logins), and a hosting account (**Vercel** or **Netlify**). Plan on about 30 minutes.

```
Phones / Windows PCs ──► Web app (Vercel or Netlify) ──► Supabase (Singapore)
       browser              pages + 2 small API routes      Postgres + Auth
```

---

## ⚠️ Decide on hosting first: Vercel Hobby is for non-commercial use only

Vercel's free **Hobby** plan may only be used for personal, non-commercial projects ([Vercel fair use guidelines](https://vercel.com/docs/limits/fair-use-guidelines), [Hobby plan](https://vercel.com/docs/plans/hobby-plan)). A shop's POS is commercial use, so on Vercel the correct plan is **Pro (US$20/month)**.

| Option | Cost | Notes |
|---|---|---|
| **Vercel Pro** | US$20/month | The setup I tested locally against a production build. Easiest, with the best Next.js support. |
| **Netlify free (Starter)** | ฿0 | Netlify says the free plan can be used commercially, and it supports Next.js 16 ([Netlify forum](https://answers.netlify.com/t/can-we-use-netlify-free-plan-for-commercial-purposes/41545/2)). Same steps and same environment variables. Not yet tested with this app, so test before opening the shop. |

Both run the same code; no code changes are needed to switch. Re-check each provider's current terms yourself; they change.

---

## Step 1: Create the Supabase project

1. Go to <https://supabase.com> → **New project**.
   - **Region: Southeast Asia (Singapore)**, the closest to Thailand.
   - Choose a strong database password and save it in a password manager.
2. Wait about 2 minutes for the project to start.

## Step 2: Create the database

1. In Supabase, open **SQL Editor** → **New query**.
2. Open [`supabase/migrations/20261027000000_init.sql`](../supabase/migrations/20261027000000_init.sql) from this repo, copy **all** of it, paste it, and click **Run**.
3. You should see "Success. No rows returned". Under **Table Editor** there should now be tables such as `products`, `sales` and `settings`.

> Future database changes come as new files in `supabase/migrations/`. Run each new file once, in date order. Never re-run an old one.

## Step 3: Lock down sign-ups

Staff accounts are created inside the app, so nobody should be able to sign up on their own.

1. Supabase → **Authentication** → **Sign In / Providers** (the name may differ slightly).
2. Turn **off** "Allow new users to sign up". Leave the **Email** provider enabled.

Accounts created in the app still work with this switch off. As a second safety net, the database gives any self-signed-up account no access until an admin activates it.

## Step 4: Copy the keys

Supabase → **Project Settings** → **API Keys** (and **Data API** for the URL):

| Value | Where it goes |
|---|---|
| Project URL, e.g. `https://abcd1234.supabase.co` | `NEXT_PUBLIC_SUPABASE_URL` |
| **Publishable** key (`sb_publishable_…`). Older projects call it the `anon` key. | `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` |
| **Secret** key (`sb_secret_…`). Older projects call it `service_role`. | `SUPABASE_SECRET_KEY` |

🔒 The **secret** key can do anything to your database. Only paste it into the hosting provider's environment variables. Never put it in code, chat, or a variable starting with `NEXT_PUBLIC_`.

## Step 5: Deploy the web app

### Vercel

1. <https://vercel.com> → **Add New… → Project** → import the `Kramsakon-pos` GitHub repo.
2. Framework preset: **Next.js** (detected automatically). Keep the default build settings.
3. Under **Environment Variables**, add the three variables from Step 4.
4. Click **Deploy**. You get a URL like `https://kramsakon-pos.vercel.app`.
5. Recommended: **Settings → Functions → Function Region → Singapore (sin1)** so the two API routes run next to the database.

### Netlify (alternative)

1. <https://app.netlify.com> → **Add new project → Import an existing project** → pick the repo.
2. Netlify detects Next.js. Keep the defaults.
3. **Site configuration → Environment variables**: add the same three variables.
4. Deploy.

Either way, every push to the `main` branch redeploys automatically.

## Step 6: First login

1. Open your app URL. The login page shows **"สร้างบัญชีเจ้าของร้าน"** (create owner account) because no users exist yet.
2. Create the owner account: a username (or your email) and a password of at least 8 characters. **The first account automatically becomes the admin.** Do this right after deploying; once an account exists, this page refuses to create another.
3. You land on **ตั้งค่าร้าน (Settings)**. Fill in:
   - shop name, branch, address, phone (these print on receipts)
   - VAT: tick "registered", enter the 13-digit tax ID, rate 7%
   - PromptPay ID (mobile number or tax ID), used for the QR at checkout
   - label size (match your sticker roll) and receipt width (80 or 58 mm)
4. **พนักงาน (Users)** → add a login for each of the 5 staff (username + password, no email needed).
5. **รายการสินค้า (Products)** → add products. Blank barcodes are generated (`KS000001`…). Print the labels and stick them on.
6. **กะและเงินสด (Shift)** → open a shift with the cash float, then start selling.

## Step 7: Phones

- Open the app URL in **Chrome (Android)** or **Safari (iPhone)** and log in.
- Use **Add to Home Screen** so it opens like an app.
- The camera button (📷) scans barcodes. The first time, allow camera access. The app runs over HTTPS on Vercel/Netlify, which browsers require for camera access.

---

## Running costs and limits (free tiers, check current pricing)

- **Supabase Free**: 500 MB database (years of sales for one shop). **A project with no database activity for 7 days is paused.** A shop open daily never hits this. After a long holiday, open the Supabase dashboard and click **Restore**; no data is lost.
- **Backups**: the free plan has no automatic backups you can restore yourself. Until you upgrade to Supabase Pro (US$25/month, daily backups), at least export the CSV reports (sales VAT, purchase VAT, stock history) every month and keep them in Google Drive.

## Troubleshooting

| Problem | Fix |
|---|---|
| "ยังไม่ได้ตั้งค่า NEXT_PUBLIC_SUPABASE_URL…" | An environment variable is missing or misspelled. Fix it in Vercel/Netlify, then **redeploy** (variables are read at build time). |
| Setup page says "เชื่อมต่อฐานข้อมูลไม่ได้" | `SUPABASE_SECRET_KEY` is wrong, or Step 2 was not run. |
| Login works but every page is empty or shows permission errors | The account is inactive. An admin must turn it on in **พนักงาน**. |
| Camera does not open | The page must be opened over `https://`. Check the browser's camera permission for the site. |
| Scanner types Thai letters | The app converts these automatically. If a code still fails, set the scanner to "US keyboard". See the user guide. |
| Supabase project paused | Supabase dashboard → project → **Restore project**. |

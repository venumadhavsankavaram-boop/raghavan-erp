# 💳 Online fee payments (Razorpay) — setup in plain steps

Parents pay fees from their own login; the money goes to the school's Razorpay account. The ERP never sees card or bank details.

## 🟢 What is already safe (built in)
- The amount, student and fee are fixed by the **server** when a payment starts — the browser cannot change them.
- After paying, the ERP asks **Razorpay itself**: "was this really paid, for this exact amount?"
- One payment = **one receipt**, even if the page is reloaded or confirmed twice.
- The receipt uses the **school's own receipt number** (same series as the office).
- If a parent pays and closes the page, the ERP finds the payment by itself within ~5 minutes.
- Admin Tools → **Online payments** shows every online payment (Paid / Not completed / Failed) and a **Check now** button.

## 🧪 Step 1 — Try it with fake money first (Test mode)
1. Create a free Razorpay account → in the dashboard switch to **Test Mode**.
2. Settings → API Keys → **Generate Test Key**. You get a *Key Id* (`rzp_test_…`) and a *Key Secret*.
3. In GoDaddy → your Node app → **Environment variables**, add:
   - `RAZORPAY_KEY_ID` = the Key Id
   - `RAZORPAY_KEY_SECRET` = the Key Secret
4. Restart / Publish the app. Log in as a parent and press **Pay Online** — use Razorpay's test card `4111 1111 1111 1111` (any future date, any CVV).
5. ✅ Check: a receipt appears for the parent, and the payment shows as **Paid** in Admin Tools → Online payments.

## 🚀 Step 2 — Go live
1. Finish Razorpay KYC → switch to **Live Mode** → generate **Live Keys**.
2. Replace the two environment variables with the live Key Id / Secret. Restart.
3. Do one real ₹1–₹10 payment yourself and check the receipt.

## 🛟 Step 3 (optional, recommended) — Webhook safety net
Razorpay Dashboard → Settings → **Webhooks** → Add:
- URL: `https://YOUR-SITE/api/payments/webhook`
- Secret: make one up, and add it in GoDaddy as `RAZORPAY_WEBHOOK_SECRET`
- Events: `payment.captured`, `order.paid`

(Without the webhook the ERP still finds missed payments by itself every ~5 minutes.)

## ❓ If something looks wrong
- Parent says "paid but no receipt" → Admin Tools → Online payments → **Check now**. Still missing? Give the Razorpay payment ID (pay_…) to the developer.
- "Not completed" rows are normal (parent closed the window); they are re-checked automatically for 3 days.

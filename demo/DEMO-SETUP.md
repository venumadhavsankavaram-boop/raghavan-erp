# Demo school — setup

The demo is a **separate** GoDaddy Node project with its **own empty MySQL database**, deployed from the
`demo` branch. It must never share a database with a real school.

## Environment variables (project settings)
| Name | Value |
|---|---|
| `DB_HOST`, `DB_PORT`, `DB_USER`, `DB_PASSWORD`, `DB_NAME` | the demo project's own database |
| `DB_SSL`, `DB_SSL_REJECT_UNAUTHORIZED` | same style as the real project, if it needs them |
| `DEMO_MODE` | `true` |
| `DEMO_PASSWORD` | optional, default `Demo@123` |
| `WEBSITE_ORIGIN` | the demo website's address (only if the website is on another domain) |

Leave **unset**: `RAZORPAY_*`, `WHATSAPP_*`, `VAPID_*`, `VENDOR_*`, `BIOMETRIC_API_KEY`, `NEON_IMPORT_SECRET`.
(With DEMO_MODE on, WhatsApp / push / online payment are switched off in the code anyway.)

## What happens
1. First start: the server creates the tables, waits ~90 s, sees no students, and loads the sample school
   (`demo/seed-demo.mjs`). Watch the project logs for "Demo seed finished with code 0".
2. Every night at 02:00 IST the sample school is wiped and loaded again.
3. The sign-in page shows a "Try the demo" box with the demo logins, and a purple ribbon says DEMO.

## Run the seed by hand
`DEMO_MODE=true node demo/seed-demo.mjs --base=https://<demo-address>` (the server must be running).
The script refuses to run unless the database is empty or already holds "Sunrise Public School".

## Demo logins (password above)
demo.admin · demo.principal · demo.accountant · demo.office · demo.teacher · demo.parent · demo.student

# 💾 How to restore a school's backup (easy guide)

**When do you need this?** Only if a school's database is lost or damaged. Hopefully never — but a backup is only useful if you know how to use it. 🙂

## 🟢 Step 0 — Take backups regularly
Admin signs in → **Admin Tools** (left menu) → **Download Backup**.
You will see a green line: *"✅ Last backup: today …"*. Keep the file in two places (e.g. your PC + Google Drive).
The ERP reminds the Admin once a day if the last backup is older than 7 days.

## 🔎 Step 1 — Check the backup file is good (touches nothing)
Open **PowerShell** in the ERP folder (the one that contains `server.js`) and run:

```
node tools/restore-backup.mjs "C:\path\to\school-erp-backup-2026-10-23.json" --check
```
✅ You should see: *"file is complete and its record counts add up"*.
❌ If you see a red message, do **not** use that file — use an older backup.

## 🛠️ Step 2 — Prepare an EMPTY database
1. In GoDaddy, create a new empty MySQL database (or use a new one) and note: host, user, password, name.
2. Start the ERP once against it (set the DB_HOST / DB_USER / DB_PASSWORD / DB_NAME settings) so it creates its tables, then stop it.

## ▶️ Step 3 — Restore
```
$env:DB_HOST="..."; $env:DB_USER="..."; $env:DB_PASSWORD="..."; $env:DB_NAME="..."
node tools/restore-backup.mjs "C:\path\to\school-erp-backup-2026-10-23.json"
```
It prints every table as it restores, then: **"✔ Restore complete … every table's row count matches the backup."**

🛡️ Safety built in: it refuses to touch a database that already has records, it works as all-or-nothing (if anything fails nothing is changed), and it counts every table at the end.
To overwrite a database that already has data you must add `--replace --confirm-db=<database name>` — only do this on purpose.

## ✅ Step 4 — Check it
Start the ERP against the restored database, sign in, and look at Students, Fees and Attendance. Everything up to the backup date will be there. Anything entered after the backup date must be entered again.

## ❓ If something goes wrong
- *"Missing setting DB_…"* → one of the four DB settings was not set in that PowerShell window.
- *"already holds records"* → you pointed at a database that is not empty; use a new one.
- Any other red message → take a screenshot and send it to support. Nothing was changed (restore is all-or-nothing).

_Private — for SVM EdTech use only._

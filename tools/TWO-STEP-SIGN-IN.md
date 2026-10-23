# Two-step sign-in — plain-language guide

**What it is:** a second check at sign-in for **Admin** and **Principal** accounts. Even if someone learns the password, they cannot get in without the 6-digit code from the owner's phone.

**It is optional and per person.** Each Admin/Principal switches it ON or OFF in **My Account → 🛡️ Two-step sign-in**. Nobody else (teachers, parents, students) sees it.

## Turn it ON (authenticator app — works today, free, no internet needed at sign-in)
1. Install **Google Authenticator**, **Microsoft Authenticator** or **Authy** on your phone.
2. Sign in → open **My Account** → find **Two-step sign-in** → flip the switch → type your password.
3. Press **📱 Authenticator app**. Scan the picture with the app (or choose "enter a setup key" and type the key shown).
4. Type the 6-digit code the app shows → **Turn ON**.
5. **Save the 8 recovery codes** shown (photo / write them down). Each works once if you lose your phone. They are never shown again.

From now on: sign in with username + password, then type the code from the app.

## If a phone is lost
- Use one of the saved **recovery codes** in the code box instead of the 6 digits.
- No codes either? Another **Admin** opens **Admin Tools → 🛡️ Two-step sign-in → Reset** next to that name. The person then signs in with just the password and sets it up again.
- If the only Admin is locked out: use the vendor's **Support Login** link (Vendor Dashboard → Schools → Support Login), then Reset from Admin Tools.

## Turn it OFF
My Account → flip the switch → enter your password and a current code (or a recovery code).

## Code by email (optional — needs the school's email account)
The email option only appears once these settings are added in the hosting panel (GoDaddy → Environment variables), then the app is restarted:

| Name | Example |
|---|---|
| `SMTP_HOST` | `smtp.gmail.com` |
| `SMTP_PORT` | `465` (or `587`) |
| `SMTP_USER` | `noreply@yourschool.in` |
| `SMTP_PASS` | an **app password** (not the normal email password) |
| `SMTP_FROM` | `Your School <noreply@yourschool.in>` (optional) |

Tip: the authenticator app is more reliable (it does not depend on email arriving or on mobile signal).

## Safety rules built in
- 5 wrong codes end the attempt; repeated failures lock sign-in for 15 minutes.
- A code can be used only once; recovery codes work only once.
- Every recovery-code sign-in, turn-on, turn-off and reset is written to the audit log.
- Secret keys are stored on the server only and are never sent to any browser.

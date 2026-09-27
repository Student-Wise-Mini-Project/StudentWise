# Connecting Gmail in development

The Gmail bill import needs a Google Cloud OAuth client. Without one, the app
still runs: the Settings screen says "Gmail isn't set up on this server" and
the Gmail endpoints return 503. About fifteen minutes, once per team; every
teammate can share the same client.

## 1. Create the Google Cloud project

1. Go to <https://console.cloud.google.com/> and sign in with any Google account.
2. Project picker (top bar) → **New project** → name it `StudentWise` → Create.
3. **APIs & Services → Library** → search **Gmail API** → **Enable**.

## 2. The consent screen

**APIs & Services → OAuth consent screen** (in newer consoles: **Google Auth
Platform → Branding / Audience / Data access**).

1. User type: **External**.
2. App name `StudentWise`, your email as support and developer contact.
3. **Scopes / Data access → Add scope** →
   `https://www.googleapis.com/auth/gmail.readonly`. It is listed as
   *restricted*; that is expected.
4. **Audience → Test users → Add users**: every Gmail address that will connect
   (yours, your teammates'). Up to 100.
5. Leave the publishing status on **Testing**.

**What Testing mode means for us.** Only listed test users can connect, and
Google shows an "unverified app" warning (click *Continue*). Refresh tokens
**expire after 7 days**, so a week later the app shows "Gmail needs connecting
again" and you press *Connect again*. Leaving Testing for `gmail.readonly`
requires Google's verification plus a paid security assessment -- not
something a student project needs.

## 3. The OAuth client

**APIs & Services → Credentials → Create credentials → OAuth client ID**.

1. Application type: **Web application**, name `StudentWise dev`.
2. **Authorized redirect URIs → Add URI**, exactly:

   ```
   http://localhost:5173/api/integrations/gmail/callback
   ```

   Port 5173, not 8000: the browser comes back through the Vite dev server,
   which proxies `/api` to the backend. It must match character for character,
   or Google answers `redirect_uri_mismatch`.
3. Create, then copy the **Client ID** and **Client secret**.

## 4. Configure the backend

In `backend/.env` (git-ignored -- never put these in `.env.example`):

```
GOOGLE_CLIENT_ID=1234567890-abc.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=GOCSPX-...
TOKEN_ENCRYPTION_KEY=<generate below>
ANTHROPIC_API_KEY=sk-ant-...        # the bill reader uses Claude
```

Generate the encryption key once and keep it -- changing it makes every stored
Gmail token unreadable, and everyone has to connect again:

```powershell
python -c "from cryptography.fernet import Fernet; print(Fernet.generate_key().decode())"
```

Restart uvicorn; settings are read at startup.

## 5. Use it

1. **Members** tab of your flat → **Address**: type it the way your bills print
   it, in Hebrew (`דיזנגוף 5, תל אביב`). This is what picks the flat when you
   live in more than one.
2. **You → Bills from email → Connect Gmail** → choose the account → *Continue*
   past the unverified-app warning → allow read access. You land back on
   Settings with "Gmail is connected".
3. Open the app (Home) or press **Check for bills now**. Each check reads up to
   ten new emails from the last 45 days.

Bills from a known utility (`BILL_TRUSTED_SENDER_DOMAINS` in `app/config.py`)
for a flat that is certain are split straight away. Everything else waits under
**Bills to review**, with the reason.

## When something goes wrong

| Symptom | Cause |
|---|---|
| `redirect_uri_mismatch` from Google | The URI in step 3.2 differs from `GOOGLE_REDIRECT_URI` |
| `Error 403: access_denied` | The account is not in the test users list (step 2.4) |
| Settings says "Gmail isn't set up" | `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` or `TOKEN_ENCRYPTION_KEY` missing, or uvicorn not restarted |
| Back on Settings with "couldn't be connected" | The sign-in code was rejected; try again. Check the uvicorn log |
| "Gmail needs connecting again" | The 7-day Testing-mode expiry, or access was removed in the Google account. Press *Connect again* |
| A real bill waits as "sender isn't a known utility" | Its domain is not in `BILL_TRUSTED_SENDER_DOMAINS`. Add it if it is a real utility |

## When bills are fetched, and how far back

**When.** The first time the Home screen shows after the app is opened (once per
session), when someone presses **Check for bills now**, or when
`fetch_new_bills.py` runs. Never on its own, and not at sign-in as such.

**How far back.** Each check asks Gmail for bill-like emails from the last
`GMAIL_LOOKBACK_DAYS` (45), newest first, up to 50; drops every email already
looked at -- each is recorded by its Gmail message id, so nothing is read or
charged twice; and reads at most `GMAIL_MAX_MESSAGES_PER_SYNC` (10) of the rest.
The others wait for the next check. It remembers *which* emails it read, not
*when* it last looked: `last_synced_at` is only displayed.

**Known limits:** someone away for more than 45 days misses bills older than
that, and an inbox with more than 50 bill-like emails in 45 days can leave older
ones outside the window. Paging through all matches, and looking back to the
last check after a long absence, would close both.

## Running it on a schedule

Nothing runs on a scheduler; opening the app is what checks. For a server that
should import bills while nobody is looking, run `python fetch_new_bills.py`
from `backend/` from cron or Task Scheduler. It is safe to run as often as you
like -- an email is only ever read once.

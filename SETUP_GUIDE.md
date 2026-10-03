# Chief — Setup Guide

Every outside setup step, in order, so another PM can repeat it. You never need to edit code.
Status markers: ✅ done · ⏳ to do.

---

## Part A — Create the Supabase project (database + sign-in) ✅

Done. Project URL: `https://ngutmgiodmwjpesmsgkc.supabase.co`. Public (anon) key saved in `.env.local`.

Supabase stores Chief's data and handles "Sign in with Google". Free plan is enough.

1. Go to <https://supabase.com> and click **Start your project**. Sign in with your work Google account.
2. If asked, create an **organization** (name: your company, plan: **Free**).
3. Click **New project**.
   - Name: `chief`
   - Database password: click **Generate a password**, then save it in your password manager.
   - Region: the one closest to your team.
   - Click **Create new project** and wait ~2 minutes.
4. Find your two public settings (safe to share in chat):
   - Click **Connect** at the top of the project page (or **Project Settings → Data API**) and copy the
     **Project URL** (looks like `https://abcdxyz.supabase.co`).
   - Go to **Project Settings → API Keys** and copy the **Publishable key**
     (if you only see "Legacy API keys", copy the **anon public** key).
5. Do **not** copy the secret / service_role key yet — we'll put it straight into Netlify in Phase 2,
   never in chat.

These go into `.env.local` lines `SUPABASE_URL` and `SUPABASE_ANON_KEY`
(and later into Netlify's environment variables).

## Part B — Create Chief's database tables ✅

1. Open this file on GitHub:
   `supabase/migrations/0001_init.sql` (in the `chief` repository, branch `claude/youthful-ptolemy-d5k800`):
   <https://github.com/kritika49/chief/blob/claude/youthful-ptolemy-d5k800/supabase/migrations/0001_init.sql>
2. Click the **Copy raw file** button (two overlapping squares, top-right of the file).
3. In Supabase, click **SQL Editor** in the left sidebar → **New query**.
4. Paste, then click **Run** (bottom-right).
5. If Supabase shows "Potential issue detected … without enabling Row Level Security", click
   **Run and enable RLS** (safe — the file already turns it on; the checker just doesn't spot it).
6. You should see **Success. No rows returned**. (If it says something already exists, the tables
   were created before — that's fine.)

## Part C — Turn on "Sign in with Google" ✅

### C1. Google Cloud: create the sign-in credentials
Your Google project is set to **Internal**, which means only people in your company's Google
Workspace can use it, and Google doesn't need to review the app.

1. Go to <https://console.cloud.google.com> signed in with your work account.
2. Top bar → project picker → **New project** → Name: `Chief` → **Create**. Make sure `Chief` is
   selected in the project picker afterwards.
3. Search bar → type **Google Auth Platform** → open it → click **Get started**.
   - App name: `Chief`; User support email: your email → **Next**
   - Audience: **Internal** → **Next**
   - Contact email: your email → **Next** → tick the agreement → **Create**
4. In the left menu click **Clients** → **Create client**.
   - Application type: **Web application**; Name: `Chief`
   - Leave **Authorized JavaScript origins** empty.
   - Under **Authorized redirect URIs** (the second section) click **Add URI** and paste:
     `https://<your-project-id>.supabase.co/auth/v1/callback`
     (your Project URL from Part A + `/auth/v1/callback`)
   - Leave "This client will be used by an AI-powered agent" **unticked**.
   - Click **Create**.
5. A box shows **Client ID** and **Client secret**. Keep this tab open for the next step.

### C2. Supabase: switch on Google
1. Supabase → **Authentication** → **Sign In / Providers** → **Google**.
2. Turn on **Enable Sign in with Google**.
3. Paste the **Client ID** and **Client secret** from C1 → **Save**.
4. Supabase → **Authentication** → **URL Configuration**:
   - Site URL: `http://localhost:3000` (already the default; changed to the Netlify address in Phase 2)
   - Redirect URLs → **Add URL**: `http://localhost:3000/**` → **Save**

## Part D — Put Chief online with Netlify ✅

Done. Live at <https://chief-pm.netlify.app> (Netlify project `chief-pm`).

Netlify hosts Chief so you get a web address (and so Slack/Fathom can reach it later).

1. Go to <https://app.netlify.com> and sign up / log in **with GitHub**.
2. Click **Add new project** → **Import an existing project** → **GitHub**. Authorize Netlify if asked,
   and allow it to see the `chief` repository.
3. Pick **chief**. On the settings screen:
   - **Branch to deploy**: `claude/youthful-ptolemy-d5k800`
   - **Project name**: e.g. `chief-pm` (your address becomes `https://chief-pm.netlify.app`)
   - Leave build settings as they are (they come from the repository).
4. Click **Add environment variables** → **Import from a .env file**, and paste the block of
   settings Claude gives you in chat (Supabase URL + anon key, the two generated secrets,
   allowed domain and admin email). Never put these in GitHub.
5. Add one more variable by hand: key `SUPABASE_SERVICE_ROLE_KEY`, value copied from
   Supabase → **Project Settings → API Keys** → **Legacy API keys** → **service_role** → Reveal → Copy.
   (Add it under **Add another** on the import screen, or later in **Project configuration →
   Environment variables → Add a variable**.)
   Mark it **secret** if Netlify offers the option.
6. Click **Deploy**. The first build takes 2–4 minutes.
7. Check **Project configuration → Environment variables** lists all 8 names. If a value was copied while
   hidden behind dots (•), edit it and paste again using Supabase's **Copy** button. Secret values on the
   free plan have one box per deploy context — paste the same value in each (Production matters most).

To save free-plan credits, Netlify only rebuilds when Claude marks a change with `[deploy]`.

## Part E — Point sign-in at the live address ⏳

1. Supabase → **Authentication** → **URL Configuration**:
   - Site URL: `https://chief-pm.netlify.app` → **Save**
   - Redirect URLs → **Add URL**: `https://chief-pm.netlify.app/**` → **Save**
     (keep the localhost one too)
2. Netlify → project **chief-pm** → **Project configuration** → **Environment variables** →
   **Add a variable** → key `APP_URL`, value `https://chief-pm.netlify.app` → **Create variable**.
3. Open <https://chief-pm.netlify.app> → **Sign in with Google** → pick your work account.

## Part F — Google Calendar + Gmail drafts (company, once) ✅

Reuses the Google Cloud project and client from Part C.

1. <https://console.cloud.google.com> → make sure project **Chief** is selected.
2. Search bar → **Google Calendar API** → **Enable**.
3. Search bar → **Gmail API** → **Enable**.
4. Search bar → **Google Auth Platform** → **Clients** → click **Chief** →
   under **Authorized redirect URIs** click **Add URI** and paste
   `https://chief-pm.netlify.app/api/connect/google/callback` → **Save**.
   (Keep the Supabase one that's already there.)
5. On the same client page, copy the **Client ID**, and the **Client secret** (if you can't see it,
   click **Add secret** to make a new one).
6. Netlify → **chief-pm** → **Project configuration → Environment variables** → **Add a variable** →
   add `GOOGLE_CLIENT_ID` and `GOOGLE_CLIENT_SECRET`.

Each PM then clicks **Connectors → Google → Connect Google** and ticks both boxes.

## Part G — Slack app (company, once) ✅

Done. Note: Slack's free plan allows 10 apps; Byldd was full, so an unused app (Mixpanel) was removed first.
After install, Slack shows "run your app locally" CLI steps — ignore them.

1. Go to <https://api.slack.com/apps> → **Create New App** → **From a manifest**.
2. Pick your company workspace → **Next**.
3. Choose the **YAML** tab, delete what's there, and paste the contents of
   `slack-app-manifest.yml` from the repository → **Next** → **Create**.
4. Left menu **Install App** → **Install to <workspace>** → **Allow**.
   (If it says it needs approval, a Slack admin approves it.)
5. Left menu **OAuth & Permissions** → copy the **Bot User OAuth Token** (starts with `xoxb-`) → Netlify variable
   `SLACK_BOT_TOKEN` (tick **Contains secret values**; paste the same value in each deploy-context box).
6. Left menu **Basic Information** → **App Credentials** → **Signing Secret** → **Show** → copy →
   Netlify variable `SLACK_SIGNING_SECRET`.
7. In each project channel in Slack, type `/invite @Chief`.

Each PM then opens **Connectors → Slack**: Chief finds their Slack account by email automatically.

## Part H — Fathom (each PM) ⏳

1. In Fathom: profile picture → **Settings** → **API Access** → **Generate API key** → copy.
2. Chief → **Connectors → Fathom** → paste the key → **Connect Fathom**.
3. Chief sets up the webhook automatically. If it can't, the page shows 5 short steps to add it in
   Fathom by hand and a box to paste Fathom's webhook secret.

## Settings file (`.env.local`)

Chief keeps private settings in a file called `.env.local` that is never uploaded to GitHub.
Already filled in for you: `ENCRYPTION_KEY`, `CRON_SECRET` (random secrets),
`ALLOWED_EMAIL_DOMAINS=byldd.com`, `ADMIN_EMAILS`.
For new PMs at the same company nothing changes here — they just sign in.

---

*(Phase 2 — Netlify deploy, Phase 3 — Slack, Google Calendar/Gmail and Fathom connectors —
will be added below as we reach them.)*

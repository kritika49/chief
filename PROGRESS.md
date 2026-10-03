# Chief — Progress

## Phase 1 — Project setup, sign-in, app shell ✅

What works:
- App skeleton (Next.js + TypeScript + Tailwind + shadcn-style components, lucide icons).
- Sign in with Google (through Supabase). Only emails from `ALLOWED_EMAIL_DOMAINS` get in;
  anyone else sees a friendly "This account can't use Chief" page.
- Admins (`ADMIN_EMAILS`) see an extra **Admin** item in the menu.
- Every page requires sign-in except the sign-in page, webhooks and scheduled jobs.
- Full database structure for the whole app (all tables from the spec) with
  **Row Level Security**: each PM can only see and change their own data.
  Tested: a second user cannot read or write the first user's projects, and nobody can read
  stored secrets from the browser.
- New users automatically get a profile and default preferences
  (weekdays, 7:30 morning draft, evening reminders 7pm Mon/Tue/Fri and 10pm Wed/Thu, etc.).
- Timezone is picked up from your browser on first visit.
- App shell: left sidebar on desktop (Today, Draft, To-dos, Meetings, Tracker, Decisions,
  History; Connectors and Settings at the bottom), bottom tabs on mobile
  (Today, Draft, To-dos, Meetings, More). Light / dark / match-device theme.
- **Today** shows the 5-step setup checklist (Connect Google → Connect Slack → Connect Fathom →
  Create first project → Generate first draft). It ticks itself off as you go.
- Every other screen has a plain-language placeholder explaining what it will do.

Checked: typecheck, lint, production build, database script + security tests, screenshots on
desktop/mobile in light and dark mode.

## Phase 2 — Deploy to Netlify ✅ (waiting on first sign-in test)
- Live at https://chief-pm.netlify.app (Netlify project `chief-pm`, deploys branch `claude/youthful-ptolemy-d5k800`).
- Supabase, Google sign-in and all environment variables set up (SETUP_GUIDE.md Parts A–E).
- To save free credits, Netlify only rebuilds when a commit message contains `[deploy]`.

## Next
- Phase 3: connectors — Slack (manifest + linking), Google Calendar + Gmail, Fathom (key + webhook).

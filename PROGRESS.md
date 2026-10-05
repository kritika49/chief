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

## Phase 2 — Deploy to Netlify ✅ (sign-in tested live on 3 Oct)
- Live at https://chief-pm.netlify.app (Netlify project `chief-pm`, deploys branch `claude/youthful-ptolemy-d5k800`).
- Supabase, Google sign-in and all environment variables set up (SETUP_GUIDE.md Parts A–E).
- To save free credits, Netlify only rebuilds when a commit message contains `[deploy]`.

## Phase 3 — Connectors 🔧 (code done; waiting on Slack app + Google settings)
- **Connectors hub** with status (Connected / Needs attention / Not connected), account, last sync.
- **Google**: separate "Connect Google" (Calendar read-only + Gmail drafts), refresh token stored
  encrypted, Test (calendars, next-24h events, Gmail), Reconnect, Disconnect, choose calendars.
- **Slack**: `slack-app-manifest.yml` (app + bot name Chief); company app status; your Slack account
  auto-matched by email (picker fallback); Test sends you a DM; channel list showing where Chief is
  invited, with `/invite @Chief` instructions.
- **Fathom**: paste API key → checked with Fathom → webhook created automatically (manual fallback
  with steps + secret box). Webhook address per user; signatures verified; meetings saved with
  summary, action items, transcript. Last meeting received shown. Test + Disconnect.
- **Admin**: Slack app status, Google keys status, everyone's connector status.
- Secrets (Google token, Fathom key and webhook secret) encrypted with AES-GCM; never sent to the browser.
- Automated tests: encryption, Fathom signature check, Fathom payload parsing.

Waiting on: Slack app install (Byldd is at Slack's free 10-app limit — an unused app must be removed),
Google keys (Part F), then Fathom (Part H).

## Fast-tracked while Slack is blocked (parts of Phases 4, 5, 7, 8) ✅
- **Projects** (Settings → Projects): create, edit name/type/status line, reorder (up/down), archive/restore.
  Channels (picker when Slack works, else name + ID), team members with tracking mode + reminder toggle,
  pinned lines. Header changes are logged.
- **People** (Settings → People): name, role, email, Slack member ID, Fathom name variations.
- **Starter data**: one-click "Load starter projects" (Bles, Dontbelated, Italica, #product_management).
- **EOD parser** tested on the real styles used in #bles-internal and #dontbelated (bullets, dashes,
  numbers, sub-bullets, plain lines, two days in one message).
- **Draft & Post**: start today's draft → status lines, pinned lines, "X's update is awaited" for each
  Slack-tracked member. **Paste an EOD** per person (manual option) or type a manual-entry person's
  update → bullets appear with "Name:" prefix. Edit, reorder, delete, pin, add bullets; edit status line
  inline; date-reached warnings; live Slack preview; **Copy update**; **copy-ready gentle reminders** for
  missing EODs; "I posted it myself" saves to History. "Approve & Post" appears once the Slack app works.
- **History**: every posted update, searchable.
- **Preferences** (basic): timezone, target channel, email greeting/sign-off.
- Tested end to end against a local copy of the database: starter data → draft → paste EOD → typed
  update → preview → copy (matches exactly) → reload (saved) → mark posted → History.

## Phase 7 — Slack EOD reading ✅ (code done; goes live with the next rebuild)
- Starting a draft reads each development project's active channels since the last posted update
  (max 4 days back; 48 hours if nothing posted yet), including EODs posted inside threads.
- Messages with the channel's EOD keyword from Slack-tracked team members become "Name:" bullets with
  a link back to the Slack message; raw messages and parsed bullets are saved; blocker words flagged.
- **Refresh from Slack** fills in late EODs for anyone still awaited (a pasted EOD always wins).
- Someone not on the team posts an EOD → **Add to roster?** prompt; one click adds them and their EOD.
- **Approve & Post** sends the update to your target channel (#product_management).
- Tested end to end with a fake Slack loaded with messages shaped like the real channels.

## Netlify credits setup ✅
- Live site `chief-pm.netlify.app` builds from `main` only — updated when the PM says "release" (15 credits).
- Test site `claude-youthful-ptolemy-d5k800--chief-pm.netlify.app` builds free on every save.

## Release 2 (5 Oct) — all screens complete ✅
- **To-dos**: per project Later / Today / Done; tick → Done (feeds the next update as plain bullets, archived
  after posting); move between lists; edit; blocker flag; client-call/standup source tags.
- **Meetings**: list with filters (Needs review, Client calls, Standups, Unassigned); Fathom calls are matched
  to the calendar and sorted by **meeting rules** (title keyword, attendee domain, recurring event);
  unassigned queue with "save as rule"; typed notes for unrecorded calls; transcript view.
- **Client-call review**: tick summary lines for the update, tag Decisions, route action items to To-do
  (tagged with call date) / Follow-up / both / dismiss, owners prefilled from People + aliases.
- **Minutes**: copy as text, **Gmail draft** (To = external attendees, CC = project list, subject
  "Meeting Minutes — Project — D Mon", next call date from the calendar), auto-created after review,
  re-create replaces it, "Open in Gmail"; optional post to a Slack channel after confirming.
- **Standup review**: tasks with owner, due date, destination; unmatched owners flagged; **one Slack message**
  per standup in the project's primary channel with @mentions; optional per-project auto-post (default off).
- **Task ↔ EOD matching**: auto-match (with Undo), suggested (Confirm / Not a match — never re-suggested),
  stale flag after N working days. Never changes the daily update.
- **Tracker**: Follow-ups (overdue highlighted, status, promised vs delivered per call) and Standup tasks.
- **Decision log**: search by project, dates, keyword; link to the call; manual entry.
- **Pre-call brief** (platform only): last call, updates since, who's working on what (latest EOD + open
  standup tasks per person, your open to-dos), open follow-ups, open client to-dos, headers, blockers.
- **Nightly EOD check** (once a night, 11:00 pm IST, Mon–Fri, live site only — near-zero Netlify credits):
  reads the day's EODs, matches standup tasks, gently reminds developers whose EOD is missing, and DMs the PM
  one summary with a to-do cross-check link. No other messages: drafts, briefs and follow-ups stay on the
  platform (Today shows follow-ups due/overdue).
- **Today** dashboard: draft status, missing EODs, dates reached, today's meetings, meetings to review,
  unassigned meetings, overdue follow-ups, stale tasks, suggested matches.
- **Preferences**: target channel, working days, nightly check switches (remind developers / summary to me),
  email wording, auto Gmail draft, blocker words, matching thresholds. **Account**: disconnect all, delete my data.
- **Project settings**: meeting rules, auto-post standups, minutes CC, schedule overrides.
- Daily updates post as "<PM>'s Chief"; EOD bullets as sentences ("Shlok worked on …").
- Tested: 51 unit tests; 92 end-to-end checks against a stand-in database, fake Slack, fake Google and
  signed Fathom deliveries.

## Not built / differences from the spec
- New-project "wizard" is a single page with skippable sections (create → fill sections).
- Projects and to-dos move with arrows/buttons rather than drag-and-drop.
- "Delete my data" could not be tested locally (needs the real Supabase sign-in service).

## Release 1 (5 Oct) ✅
- Live: Slack, Google and Fathom connected; automatic EOD reading; Draft & Post; History.
- Header dates shown as "12 Oct 2026" (the PM's format).
- First draft of the day with nothing posted from Chief yet looks back to the previous working day
  (Monday → Friday).
- Fixed: a just-added bullet could be lost if Refresh / Add to roster was clicked within a second.

## Next
- Polish from real use. Optional: one-bullet-per-person mode, long-dash divider, post as the PM's own Slack account.
- Then: automatic Slack EOD reading (Phase 7), to-dos (Phase 6), meeting rules + new-project wizard
  (rest of Phase 4), scheduler (Phase 9).

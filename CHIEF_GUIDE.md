# Chief: complete guide

**Chief is your project chief of staff.** Each morning it helps you put together one daily update for all your projects. It reads what developers post in Slack, adds your completed to-dos and the key points from client calls, and lets you review everything before anything is posted.

This guide covers what Chief does, how the daily flow works, and what is on every screen.

---

## Contents
1. [The big picture](#1-the-big-picture)
2. [Your day with Chief](#2-your-day-with-chief)
3. [Where things live (live site, test site, services)](#3-where-things-live)
4. [Navigation](#4-navigation)
5. [Screen by screen](#5-screen-by-screen)
6. [The main flows, step by step](#6-the-main-flows-step-by-step)
7. [Rules Chief follows (no AI)](#7-rules-chief-follows-no-ai)
8. [The nightly EOD check](#8-the-nightly-eod-check)
9. [Privacy and security](#9-privacy-and-security)
10. [Saving Netlify credits](#10-saving-netlify-credits)
11. [Known limits and differences from the original spec](#11-known-limits-and-differences-from-the-original-spec)
12. [Glossary](#12-glossary)

---

## 1. The big picture

```
 Slack EODs ─────┐
 (developers)    │
                 │
 Your to-dos ────┼──►  DRAFT (you review & edit)  ──►  Slack #product_management
                 │                                       as "Kritika's Chief"
 Client calls ───┘
 (Fathom)            ▲
                     │
             Pinned lines, status lines (Planned vs Actual, dates)
```

- **Inputs:** developer EODs from Slack, your ticked to-dos, client-call key points from Fathom, standup notes, and pinned lines.
- **Output:** one Slack message with every active project, in your format:

```
Bles
Planned vs Actual: On Track, Dev Ongoing
Dev Completion: 12 Oct 2026
Launch: 21 Oct 2026
Key Updates:
• Manju went through the payment bugs and the active account deduction flow.
• Nileshwar's update is awaited.
• Shared revised timeline with Patrick.
• QA is ongoing.
--------------------------------------------------
Italica
Status: Initial Design Phase
Design Started: 14 Sep 2026
Key Updates:
• …
```

- **Nothing is ever posted or emailed without your approval.** Chief never sends email; it only prepares Gmail drafts.

Around the update, Chief also keeps track of:
- **Meetings:** call reviews, minutes and Gmail drafts.
- **Standup tasks:** posts them to Slack and checks them off when matching EODs arrive.
- **Follow-ups:** what you promised clients.
- **Decisions:** a searchable log.
- **Pre-call briefs:** "who's working on what".
- **History:** every update you've posted.

---

## 2. Your day with Chief

| When | What happens | Where |
|---|---|---|
| During the day | Write to-dos as you think of them ("Share revised timeline with Patrick"). Tick them when done. | **To-dos** |
| After a client call | Fathom sends the call to Chief. Review it: tick key points for the update, tag decisions, route action items. A Gmail draft of the minutes is created. | **Meetings** |
| After a standup | Review the tasks and click **Post to Slack**. One message goes out with @mentions. | **Meetings** |
| Before a client call | Open the brief: updates since the last call, who's working on what, open follow-ups. | **Meetings → Upcoming client calls → Brief** |
| **11:00 pm (Mon–Fri)** | Chief reads the day's EODs, reminds developers who haven't posted, and DMs you a summary with a link to cross-check your to-dos. | Automatic |
| Next morning | Click **Start today's draft**. Chief reads Slack live, adds your done to-dos and call points, and you edit, then **Copy** or **Approve & Post**. | **Draft** |

---

## 3. Where things live

| Thing | Address / place | Notes |
|---|---|---|
| **Live site** | https://chief-pm.netlify.app | Built from the `main` branch. Updated only when you say **"release"** (15 Netlify credits each). |
| **Test site** | https://claude-youthful-ptolemy-d5k800--chief-pm.netlify.app | Built from the work branch. Updates automatically and is **free**. It uses the **same real data and connections** as the live site, so **Approve & Post** really posts. |
| Database and sign-in | Supabase project `ngutmgiodmwjpesmsgkc` | Stores all data. Each PM sees only their own rows. |
| Slack app | "Chief", installed in Byldd | Reads EOD channels, posts updates and standup tasks, sends DMs. |
| Google | Your Google account (Calendar read-only, Gmail drafts) | Connected under **Connectors → Google**. |
| Fathom | Your Fathom API key and webhook | Connected under **Connectors → Fathom**. New calls arrive automatically. |
| Hosting | Netlify project `chief-pm` | Settings live in **Project configuration → Environment variables**. |
| Code | GitHub `kritika49/chief` | `main` is the live version; `claude/youthful-ptolemy-d5k800` is the work branch. |

The step-by-step setup of every service is in **SETUP_GUIDE.md**, and what has been built so far is in **PROGRESS.md**.

---

## 4. Navigation

- **Desktop:** a left sidebar with **Home, To-dos, Meetings, Tracker, Decisions, History**. At the bottom: **Connectors, Settings**, and **Admin** (admins only).
- **Phone:** bottom tabs **Home, To-dos, Meetings, More**. **More** holds the rest.
- **Top-right:** a light/dark theme switch and your avatar menu (Account, Sign out).

---

## 5. Screen by screen

### 5.1 Sign in
- **What's there:** a **Sign in with Google** button.
- **Who can get in:** only `@byldd.com` accounts. Anyone else sees "This account can't use Chief".
- **Admins** (set in `ADMIN_EMAILS`) also see the Admin page.

### 5.2 Home
Your one screen for the day: what needs attention at the top, then today's update with a card per project. (The old Today and Draft pages are merged here; old /draft links open Home.) Each attention section only appears when it has something in it.

| Section | What it shows |
|---|---|
| **Get Chief ready** | A 5-step setup checklist: Google, Slack, Fathom, first project, first draft. It disappears when everything is done. |
| **Load your starter projects** | A one-click setup of Bles, Dontbelated and Italica. Only shown to Kritika, and only until it's used. |
| **Missing EODs** | People still marked "update is awaited" in the open draft. |
| **Dates reached** | A project's Dev Completion or Launch date is today or past ("mark done or revise"). |
| **Today's meetings** | From your Google Calendar, with a pointer to the client-call briefs. |
| **Meetings awaiting review** | Fathom calls and standups you haven't reviewed yet. |
| **Unassigned meetings** | Calls Chief couldn't match to a project. |
| **Follow-ups due** | Due today, or overdue in red. Chief doesn't DM you about these, so check here. |
| **Stale standup tasks** | Open tasks with no matching EOD for 2 or more working days. |
| **Suggested task matches** | Tasks that may be done, waiting for you to confirm in Tracker. |

### 5.3 Today's update (on Home)
Where the daily update is built. It is always a draft: nothing is posted or emailed until you press **Approve & Post** (or copy it yourself).

- **Starting a draft:** the first time you open Home each day, Chief assembles the draft for you (unless today's update was already posted, or you discarded today's draft — then a **Start today's draft** / **Start another draft** button is shown). Chief then:
  - reads each Dev + PM project's Slack channels, from your last posted update (or from the previous working day if you've never posted from Chief);
  - creates one bullet per EOD point, written as a sentence ("Shlok worked on card rotation across batches.");
  - adds "<Name>'s update is awaited." for each Slack-tracked person with no EOD;
  - adds your **done to-dos** in past tense ("Shared revised timeline with Patrick.");
  - adds the client-call key points and standup lines you accepted;
  - adds **pinned lines** (e.g. "QA is ongoing.").
- **Slack bar (top):**
  - when EODs were read;
  - **Refresh from Slack**, which picks up late EODs for anyone still awaited;
  - **Add to roster?**, shown when someone not on the team posted an EOD.
- **Each project card:**
  - **Status summary** under the project name: the stored Planned vs Actual / dates exactly as saved (— when empty). Chief never guesses a status.
  - **Brief** and **Settings** links.
  - **To-dos (side panel):** today's to-dos for the project. Tick one and it's added to the update in past tense; untick and it's removed. Add a to-do right there.
  - **Calls to review:** calls/standups for this project still waiting for review.
  - **Staying in step:** when you reopen Home, newly ticked to-dos and newly accepted call points are added. A line you deleted stays deleted.
  - **Status line fields:** Planned vs Actual, Dev Completion and Launch (or Status and Design Started). You can edit them inline, and every change is logged.
  - **Date warnings** when a date has been reached.
  - **Key updates:** every bullet is editable. You can also move it up or down, pin it (repeat it every day), or delete it. Each bullet shows its source (EOD with a link to the Slack message, Awaited, Typed, To-do, Client call, Standup, Pinned, Added).
  - **Add a bullet:** your own free text.
  - **Team updates:**
    - **Paste <Name>'s EOD:** paste a message from Slack by hand, and Chief splits it into bullets.
    - **Type <Name>'s update:** for people tracked by hand (e.g. Shourya).
    - **Gentle reminders to copy into Slack:** ready-made text for anyone missing.
  - **Saved** / **Saving** indicator. Edits save automatically.
- **Copy update / Preview & post** bar stays at the bottom of the screen while you scroll.
- **Slack preview (below the project cards):** the exact message, with a character count.
  - **Copy update:** copies it for pasting into Slack yourself.
  - **Approve & Post:** posts to your update channel(s) as "Kritika's Chief", after you confirm.
  - **I posted it myself:** saves it to History when you pasted it by hand.
  - **Discard draft:** start again.
- **After posting:** included to-dos are archived, included call notes are marked as used, and the update goes to **History**.

### 5.4 To-dos
- **Project tabs** across the top, showing the count of Today items.
- **Add box:** write the to-do as something to do, e.g. *"Share revised timeline with Patrick"*. Choose **Today** or **Later**.
- **Three columns:**
  - **Later:** your backlog.
  - **Today:** what you're on.
  - **Done:** ticked items. They go into your next update in **past tense** ("Shared revised timeline with Patrick.").
- **Each to-do:**
  - a tick box (done or not done);
  - editable text;
  - arrows to move between Later and Today;
  - a flag to mark it as a **blocker** (it shows in pre-call briefs);
  - delete.
- **Source tags:** to-dos created from a client call or standup show a tag with the call date that links back to the meeting.
- **After you post:** done items are archived and disappear from the board.

### 5.5 Meetings
- **Upcoming client calls:** calls in your calendar in the next 36 hours that match a project's rules, each with a **Brief** link.
- **Filters:** All, Needs review, Client calls, Standups, Unassigned.
- **Meeting list:** title, date, project, type, plus a "Needs review" or "Reviewed" badge.
- **Add notes for a call that wasn't recorded:** title, date, project, type, notes (one point per line) and action items. It then opens the same review screen as a Fathom call.

**How meetings arrive:** Fathom sends each finished call to Chief, which checks it's genuine (signed). Chief then finds the matching calendar event and sorts the call with your **meeting rules**:
- the title contains a keyword;
- an attendee's email domain matches;
- it's a specific recurring calendar event.

Calls that match no rule go to **Unassigned**.

### 5.6 Meeting page (one call)
- **Header:** title, date, project and attendees, plus **Open in Fathom**.
- **If it's unassigned:** **"Which project is this?"**
  - Choose the project and type (Client call, Standup or Ignore).
  - Optionally save a rule ("when the title contains…" or "when an attendee's email is @…") so similar calls sort themselves next time.
- **If it's a client call, the review has two parts:**
  - **Summary:** Fathom's summary split into lines. Tick the lines to include in your next update for this project. Tag any line as a **Decision**, which saves it to the decision log. Every line is editable.
  - **Action items:** for each one, pick an owner (pre-filled from your People list, including name variations), a due date, and where it goes:
    - **To-do:** added to Later, tagged "(call 5 Oct)".
    - **Follow-up:** added to the Tracker.
    - **Both**, or **Dismiss**.
  - Click **Accept review** (or **Save changes**), or **Dismiss meeting**.
- **Minutes** (after review):
  - The minutes text: greeting, key points, decisions, action items with owners and due dates, next call date, sign-off.
  - **Copy as text.**
  - **Gmail draft:** To is pre-filled with the external attendees (editable), CC with the project's CC list. Click **Create** or **Re-create Gmail draft** (re-creating replaces the previous one), then **Open in Gmail**. If the automatic option is on in Preferences, the draft is created when you accept the review.
  - **Post minutes to Slack:** choose a channel, then confirm.
- **If it's a standup:**
  - **Standup tasks:** text, owner (shows **"Owner not matched"** if Chief couldn't match the name), due date, and where it goes: Post in Slack, Slack + my To-dos, Only my To-dos, or Dismiss.
  - **Post to Slack** sends **one message** to the project's primary channel:
    ```
    Standup tasks — 5 Oct
    • @Manju Go through the payment bugs and the active account deduction flow
    • @Nileshwar Resolve issues in admin payout (due 7 Oct)
    ```
  - **Save without posting** or **Dismiss**.
  - **Summary (optional):** tick lines to add to your next update.
- **Transcript:** a collapsible full transcript.

### 5.7 Pre-call brief
Opened from **Meetings → Upcoming client calls → Brief**. It's shown on the platform only; no DM is sent.
- **Where things stand:** the project's status lines and the date of the last client call.
- **Open follow-ups:** with owner and due date; overdue ones in red.
- **Updates since the last call:** the project's Key Updates from each update you've posted since then, by date.
- **Who's working on what:** for each team member, their latest EOD (last few days) and open standup tasks ("to be worked on"). Under **You**: your open to-dos for the project (Today and Later).
- **Open to-dos from client calls.**
- **Flagged blockers:** EOD points with words like "blocked", "waiting on" or "stuck" (last 7 days), plus to-dos you flagged.

### 5.8 Tracker
Two tabs. **Show done too** / **Only open** toggles finished items.
- **Follow-ups:**
  - Each one shows the item, project, owner, the call it came from, and its due date (overdue rows highlighted).
  - The status dropdown sets it to Open, Done or Cancelled.
  - **Promised vs delivered, per call:** "1 of 3 delivered".
  - **Add a follow-up** by hand.
- **Standup tasks:**
  - Each one shows the task, owner, project and standup date, plus Mark done or Reopen.
  - **Auto-matched:** Chief found the matching EOD point and marked the task done. It shows the EOD text, with **Undo**.
  - **Suggested match:** Chief isn't sure, so you choose **Confirm** or **Not a match**. A rejected pair is never suggested again.
  - **Stale:** no matching EOD for 2 or more working days. You can change this number in Preferences.

### 5.9 Decisions
- **Search by:** keyword, project, and from/to dates.
- **Each decision shows:** the text, date and project, plus a link to the source call.
- **Log a decision manually.**

### 5.10 History
- Every update you've posted, newest first, with the date and "Posted by Chief" or "Posted by you".
- Search box, e.g. a project or person's name.

### 5.11 Connectors
The hub shows Google, Slack and Fathom with a status (**Connected**, **Needs attention** or **Not connected**), the account, and the last successful sync.
- **Google:** **Connect Google** asks you to allow two things: see calendars and manage Gmail drafts.
  - **Test** shows the number of calendars, events in the next 24 hours, and your Gmail address.
  - Also: **Reconnect**, **Disconnect**, and **Calendars to watch**.
- **Slack:**
  - **Company Slack app** status: "Working, installed in Byldd as @chief".
  - **Your Slack account:** auto-matched by your email, or picked from a list. **Test (send me a DM)**, **Unlink**.
  - **Your project channels:** each checked directly ("Chief can read it" or "Not invited — type /invite @chief"). This works for private channels too.
  - **Other channels Chief is in.**
- **Fathom:**
  - Paste your **API key** and click **Connect Fathom**. Chief checks the key and sets up the webhook automatically. If that fails, the page shows 5 manual steps and a box for Fathom's `whsec_` secret.
  - The page also shows the webhook URL, the last meeting received, **Test**, **Replace API key** and **Disconnect**.

### 5.12 Settings → Projects
- **List:** your active projects in update order. Use the ↑ ↓ arrows to reorder; the order here is the order in the update.
- **New project:** a name and a type:
  - **Dev + PM:** has developers. Slack EODs are combined with your own PM work.
  - **Design + PM:** no developers; you're also the designer. No Slack EODs.
- **Archived projects** can be restored.
- **Load starter projects** (Kritika only, until used).

### 5.13 Project page
- **General & status line:**
  - Name and type.
  - For Dev + PM: Planned vs Actual, Dev Completion, Launch.
  - For Design + PM: Status, Design Started.
  - Every change is logged.
- **Slack channels** (Dev + PM only):
  - Add a channel from the list, or **by ID** for private channels. Chief checks it can read the channel.
  - For each channel: an **EOD keyword** (default "EOD"), Active, Primary (standup tasks go here), Remove.
- **Team:**
  - Add an existing person, or type a new name.
  - Each person's update can be:
    - **Read EOD from Slack:** Chief scans their EODs, shows "awaited" if missing, and can remind them.
    - **I type their update:** you type it on the draft.
    - **Don't track.**
  - **Remind if EOD missing**, per person.
- **Meeting rules:**
  - The type to assign: Client call, Standup or Ignore.
  - Matched by title contains / attendee email domain / recurring calendar event ID.
- **Options & schedule:**
  - **Auto-post standup tasks** without review (off by default).
  - **Always CC on minutes:** email addresses.
  - **Send missing-EOD reminders for this project** (nightly, 11 pm).
  - **Different working days** for this project.
- **Pinned lines:** repeated in every update until you unpin them.
- **Archive / Restore:** archived projects leave drafts, scans and reminders, but their history is kept.

### 5.14 Settings → People
- **Each person:** name, role (Developer, Designer, QA, Other), email, **Slack member ID** (needed to match EODs and @mention), and **Fathom name variations** (comma-separated, used to match call action items).
- Shows which projects each person is on.
- **Remove this person everywhere.**

### 5.15 Settings → Preferences
- **Basics:**
  - Timezone.
  - **Post my update to:** Slack channel ID(s), e.g. `C027NN9JC7M` for #product_management.
  - Working days.
- **Nightly EOD check (11:00 pm IST, Mon–Fri):**
  - **Remind developers whose EOD is missing.**
  - **Send me a summary and a to-do cross-check reminder.**
- **Meeting minutes email:** greeting, sign-off, and **Create the Gmail draft automatically** after a review.
- **Blockers & task matching:**
  - Blocker words.
  - Auto-match score (default 0.6) and suggest score (default 0.3).
  - Number of working days before a task is flagged stale (default 2).

### 5.16 Settings → Account
- Your name, email and timezone, plus **Sign out**.
- **Disconnect all:** removes Google and Fathom access and unlinks Slack. Your data stays.
- **Delete my data:** type DELETE to permanently remove your account and everything in it.

### 5.17 Admin (admins only)
- **Company settings:**
  - Slack app status.
  - **Server key** check: whether the Supabase secret key works. It shows only the key's type, role and project, never the key itself.
  - Google keys set.
- **People using Chief:** each PM's Google, Slack and Fathom connection status.

---

## 6. The main flows, step by step

### A. Daily update
1. **Draft → Start today's draft.**
2. Check **Missing EODs**. Paste or type any you got elsewhere, or copy a gentle reminder.
3. Edit bullets, status lines and order. Add your own lines.
4. **Copy update**, or **Approve & Post**.
5. Done to-dos are archived and the update is saved in History.

### B. Client call
1. Record it with Fathom. It arrives in **Meetings** by itself.
2. If it's under **Unassigned**, pick the project and save a rule.
3. Review it: tick key points, tag decisions, and send each action item to To-do, Follow-up or both.
4. Check the minutes and the Gmail draft, then open them in Gmail and send them yourself.
5. The key points appear in your next update for that project. Decisions appear in **Decisions**, and follow-ups in **Tracker**.

### C. Standup
1. Record the standup in Fathom. Chief sorts it with your rule (e.g. title contains "standup").
2. Check owners and due dates, then **Post to Slack**. One message goes out with @mentions.
3. Chief compares each task with the owner's later EODs (nightly, and whenever you start or refresh a draft). Matching tasks are marked done.
4. Open **Tracker → Standup tasks** to confirm suggestions, undo auto-matches, and watch stale tasks.

### D. To-dos into the update
1. Add "Share revised timeline with Patrick" in **To-dos**.
2. Tick it when done.
3. The next draft shows "Shared revised timeline with Patrick."
4. After posting, it's archived.

### E. Before a client call
1. **Meetings → Upcoming client calls → Brief.**
2. Read the updates since the last call, who's working on what, open follow-ups and blockers.

### F. Adding a new project
1. **Settings → Projects → New project:** name and type.
2. Fill in the status line, Slack channel(s) (by ID for private ones), team, meeting rules and pinned lines. Each section can be skipped.
3. In Slack, type `/invite @chief` in the channel.

### G. A new PM joining
1. They sign in with their `@byldd.com` Google account.
2. They connect Google, check Slack is linked (it's automatic by email), and paste their own Fathom key.
3. They create their projects. Their data is completely separate from yours.

---

## 7. Rules Chief follows (no AI)

Chief uses fixed rules, so the results are predictable and nothing is invented. You polish the wording.

| Rule | Example |
|---|---|
| **Finding an EOD:** a message in a project channel containing the channel's keyword ("EOD", any capitalisation), including replies in threads. | "*EOD Update: @Kritika*", "EoD Update 01 Oct:" |
| **Splitting an EOD:** the heading line is dropped. Lines starting with -, *, • or a number become bullets. Indented sub-points are folded into their parent. Plain lines after a bullet continue it. A message with no bullets becomes one bullet per line. | "• Library — completed / ◦ PNG only" → "Library — completed (PNG only)" |
| **EOD point → sentence:** past-tense or action words become a sentence about the person. Points with no action word keep "Name: …". | "Worked on X" → "Shlok worked on X." / "WIP: X" → "Shlok is working on X." / "BLE-155 is done" → "Nileshwar: BLE-155 is done." |
| **To-do → update line:** the first word changes to past tense, and "(call 5 Oct)" tags are removed. | "Give KT to Satya" → "Gave KT to Satya." |
| **Order in each project:** EODs → awaited → typed updates → done to-dos → client-call points → standup lines → pinned lines. | |
| **Clean-up:** each bullet is trimmed, ends with a full stop, and duplicates are removed. | |
| **Status dates** are shown with the year. | "12 Oct 2026" |
| **Blockers:** EOD points containing a blocker word are flagged. | "Blocked on EasyPost approval" |
| **Task matching:** shared keywords between the task and the EOD point, plus a boost for shared names or tickets. ≥ 0.6 counts as auto-matched; ≥ 0.3 is suggested. | "Resolve issues in admin payout" ↔ "Resolve Issues in Admin Payout" |
| **Meeting sorting:** the first matching rule wins, checking the recurring event first, then the title, then the email domain. | Attendee `@blesapp.com` → Bles client call |

---

## 8. The nightly EOD check

- **When:** **11:00 pm IST, Monday to Friday**, on the live site only. The test site doesn't run it.
- **What it does:**
  1. Reads the day's EODs from each Dev + PM project's channels and saves them.
  2. Matches them against open standup tasks.
  3. Sends a gentle DM to each developer whose EOD is missing: *"Chief here 👋 friendly reminder to drop your EOD when you get a moment."* This only goes to people set to "Read EOD from Slack" with reminders on, and only once per person per night.
  4. DMs you one summary:
     ```
     Chief here 👋 tonight's EOD check is done.
     ✅ EOD posted: Manju (Bles), Shlok (Dontbelated)
     🔔 Reminded: Nileshwar (Bles)
     Time to cross-check your to-dos — 2 still in Today: <link>
     ```
- **What it doesn't do:** no morning DM, no pre-call brief DM, no follow-up DM. Those all stay on the platform.
- **Turning parts off:** **Settings → Preferences** has two switches. Each project and each person can also have reminders switched off.

---

## 9. Privacy and security

- **Sign-in:** only `@byldd.com` Google accounts.
- **Data separation:** every PM sees only their own data. The database enforces this, and it was tested with two separate users.
- **Credentials:** the Google login, Fathom key and Fathom webhook secret are stored **encrypted** and never sent to the browser.
- **Incoming Fathom calls** are checked for a valid signature; forged ones are rejected.
- **The nightly job** only runs with a secret key (`CRON_SECRET`).
- **Email:** Chief never sends email. It only creates Gmail drafts.
- **Posting:** Chief never posts an update without your **Approve & Post**. Standup tasks only post when you click **Post to Slack**, unless you switch on auto-post for that project.
- **Secrets** live only in Netlify's environment variables and in the private settings file, never in GitHub.

---

## 10. Saving Netlify credits

- **The budget:** Netlify's free plan gives 300 credits a month. Each **live release costs 15**; **test-site builds are free**.
- **How I save:** new work goes to the **test site** first. The **live site** only updates when you say **"release"**.
- **The nightly check** runs once a night, so its cost is close to zero.
- **Normal browsing** of either site uses a tiny amount.
- **Checking usage:** Netlify → **Team → Usage & billing**.

---

## 11. Known limits and differences from the original spec

- **No AI:** wording is rule-based, so some EOD points keep "Name: …" and you polish them in the draft. An optional "polish wording" AI button could be added later.
- **Project setup:** new projects are set up on one page with skippable sections, rather than a step-by-step wizard.
- **Reordering:** projects and to-dos move with arrows and buttons rather than drag-and-drop.
- **Posting name:** updates post as **"Kritika's Chief"** (needs the Slack permission `chat:write.customize`); Slack always adds an "APP" tag. Posting as your own account would need a "Connect Slack as me" feature.
- **Nightly check timing:** it runs at a fixed time (11 pm IST). PMs in other timezones would need it changed.
- **Delete my data** has not been tested end to end yet, because it needs the real sign-in service.
- **Testing:** everything else was tested against a stand-in database, a fake Slack, a fake Google and signed Fathom deliveries: 53 automated rule tests and about 90 click-through checks.

---

## 12. Glossary

| Term | Meaning |
|---|---|
| **EOD** | End-of-day update a developer posts in Slack. |
| **Draft** | Today's update while you're still editing it (shown on Home). |
| **Status line / header** | Planned vs Actual, Dev Completion and Launch (or Status and Design Started) at the top of each project. |
| **Pinned line** | A bullet that repeats in every update until unpinned. |
| **Awaited** | A Slack-tracked person with no EOD since your last update. |
| **Meeting rule** | How Chief recognises a project's client calls and standups. |
| **Follow-up** | Something promised to a client, tracked with an owner and due date. |
| **Standup task** | A task assigned in a standup, posted to Slack and auto-checked against EODs. |
| **Live site / test site** | Live is your everyday address (paid releases); test is the free preview of new work. |
| **Release** | Copying finished work to the live site (15 credits). |
| **Webhook** | The private address Fathom uses to send Chief new calls. |

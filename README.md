Project:ENTR222-Team7-GoogleCalendar

# Natural-language week calendar (prototype)

A one-week calendar laid out like Google Calendar. The "Create" button is replaced by a
text box in the left sidebar: you describe what you want ("Lunch with Sam tomorrow at noon",
"move my gym session to Friday 6pm", "cancel everything on Wednesday") and Claude turns it into
create / update / delete actions.

You can also work with the grid directly:

- **Drag** an event to move it (to another time or day); drag its **bottom edge** to change its length.
- **Click** an empty slot (or drag across a range) to create an event: a small popup asks you to
  describe it, and Claude fills in the title/details using the slot you picked — or fill in the title,
  location, and calendar yourself (like the event popup) and press Save (month view: saves as all-day).
- **Click an event** to see its details and describe a change right there ("move to 3pm",
  "make it 2 hours", "rename to Design review", "delete it"); Claude knows which event you mean.
- **Month view** (switch from the top-right menu): drag an event to another day to move it, click an empty
  day to create one (include a time in the description), click "N more" to see a full day, click a date
  number to open that week.
- **Tasks** (sidebar, under the mini calendar): `+` adds a task, clicking a task edits it, the circle
  completes it. The AI box can manage tasks too ("remind me to call mom", "done with the pitch deck").
- **Drag a task onto the calendar** to schedule it: on the week grid it becomes a 1-hour event at that
  time; on a day in month view, 9–10am that day. Drop it on a day header (week) or the date strip
  (month) — highlighted "All day" while dragging — to make an all-day event. The task stays in the list
  (showing when it's scheduled) and has a single calendar entry: dragging it again moves that entry, and
  renaming the task renames the entry.
- Scheduled tasks show a **checkbox** on the calendar: checking it strikes the event through and takes the
  task off the list (unchecking puts it back); completing the task in the sidebar checks its events too.
- Dragging an event near the top/bottom edge of the week grid scrolls it.
- **All-day events** appear under the day headers (week) and as filled bars (month); they can be
  dragged to another day and created by the AI ("holiday on Friday").
- **My calendars** (tags): every event belongs to a calendar and takes its colour. Tick a calendar to
  show/hide its events, `+` creates one (name + colour), the pencil on hover renames/recolours/deletes.
  In an event's popup, click the colour square (or the calendar name) to move it to another calendar.
  The AI box can do all of this too ("make a Health tag in green and put the gym in it", "hide Classes").
- Every change (AI or drag) can be undone/redone from the sidebar or the keyboard.

## Modes

The three tabs at the top left switch modes in one click — **Calendar**, **Action Timeline** and
**Connection Hub**. The current mode shows its icon and name; the others show just their icon.

The **(?)** button at the top right starts a short guided tour of the current mode. Each tour is split into
sections (Calendar: AI add & edit, Tasks, Whentomeet · Action Timeline: reading the timeline, Work with AI ·
Connection Hub: messages, Construct) that can be skipped or jumped to. Short tips also appear as tooltips
when hovering over the relevant area.

New visitors start with sample events, tasks, calendars, and an example Whentomeet ("Pitch practice").

## Whentomeet (find a time with others)

- The people icon next to the mini calendar starts a new Whentomeet. The mini calendar turns into a short
  setup: pick **specific dates** (click or drag; the first row is the current week) or **days of the week**,
  then **No earlier than / No later than**, then a **name**, then **share**: copy a (demo) link or add people
  by email — clicking the box lists made-up people, and each person gets random but fixed availability.
- **Done** adds a "Whentomeet for <event>" line under a new **Whentomeet** section. Clicking it opens the
  event: the line moves to the top left, the sidebar becomes the Whentomeet panel, and the calendar shows just
  the week's day headers above big 30-minute blocks for the chosen days and hours — green where you have
  nothing scheduled, gray where an event takes the time. Each of your events appears as one line (like the
  month view) in the block where it starts, with a bar in its calendar colour running down to where it ends
  and the end time at the bottom; overlapping events get side-by-side lanes. Drag across blocks to mark
  time available or not available, or reset to your calendar. If an event later lands on time you marked
  available, a red warning appears under the Whentomeet line (with a one-click fix).
- **Group availability** shows only the overlap (greener = more people free); click a time to see who is
  and isn't available. Click a person to see just their availability.
- Close with the ✕ or by clicking the top line again. Everything is stored in the browser.

## Booking pages (book time with me)

Like Calendly or Google's appointment schedules: a page where other people pick a free time with you.

- The **Booking pages** section (sidebar, under Whentomeet) lists your pages, e.g. "Coffee chat · 30 min" with
  "Mon–Fri · 9 AM – 5 PM" under it. `+` creates one, the pencil on hover edits or deletes it. A page has a
  name, a length (15 / 30 / 45 / 60 min), the weekdays and hours you're available, how far ahead people can
  book (1, 2 or 4 weeks), the minimum notice (none, 1 hour, 4 hours, 1 day), the calendar bookings go into
  and an optional location. New visitors start with an example "Coffee chat" page (30 min, Mon–Fri, 9–5, Zoom).
- **Copy link** copies this app's own address with `#book/<id>` on the end; **Preview** opens the same view.
  Opening the app with that link shows the booking page instead of the calendar: the page name, length and
  location; a month where days with open times are in bold (‹ › move between months inside the booking
  window); and the open start times for the chosen day. "Back to calendar" (or Esc) closes it.
- Start times run every <length> minutes from the start of the day's hours (9:00, 9:30, … 4:30 for a
  30-minute page from 9 to 5) and must end by the end of the hours. A time is left out if it's sooner than the
  minimum notice, beyond the booking window, or overlaps any timed event on any of your calendars (hidden
  ones too — you're busy either way). All-day events don't block anything.
- Picking a time asks for a name, an email and an optional note. Confirming adds "<page name> with <name>"
  to the page's calendar, with the page's location, plus a "Booking details.txt" attachment holding the
  email and note (events have no description field; the file shows in the event's popup). It can be undone
  like any other change. Then "You're booked" shows the time, and that time is gone from the list.
- Pages are stored in the browser like everything else, so a link only works in the browser it was made in
  (anywhere else it says the page doesn't exist).

## Connection Hub (messages → events and tasks)

Click the **Connection Hub** tab (top left). It uses made-up demo messages — nothing is really connected.

- **Sources** (left): All sources, Slack, Email, Canvas, Microsoft Teams, Discord, Text messages, GroupMe.
  With **All sources** (the default) the feed shows every message newest first, each tagged with its source;
  click a source to see only its messages (click it again to go back to all), or drag across sources,
  Shift-click a range, or Ctrl/⌘-click to show several sources together. Messages are listed one block
  per message, top to bottom, 12 per page (‹ › to page, **«** back to page 1). Click messages to select them,
  drag across them (the first one decides select or unselect; the list scrolls at the edges), Shift-click
  to select a range (works across pages), or **Select all** to take every message in the current view. **Add a source** connects more apps (demo
  only — they arrive empty); ☰ hides the sources list.
- **Construct** (the big section on the right): choose **Build: Auto / Events / Tasks**, then either
  **✨ construct from the selected messages** or add events or tasks **by hand** (+ Event / + Task).
  Constructed items stack like calendar blocks (tasks like task rows); each can be edited (type, title,
  date/time, calendar, location), unticked, or removed. **Add … to calendar** places the ticked events on the
  calendar at their dates and times and puts tasks in the task list (undoable).
- **Update events from Connection Hub** (the round hub icon in the bottom-left corner of the Calendar sidebar,
  with a red badge counting new messages) opens the hub with every new message selected (they're tagged
  **New**); review the selection, then **✨ From selected messages**. Messages stop counting as new once
  they've been constructed from.
- Endpoint: `api/hub.js` (same model, `claude-haiku-5-5`); relative dates are read against each message's
  sent time, and things already on your calendar are skipped.

## Action Timeline mode

Click the **Action Timeline** tab (top left) for a read-only "what's now / what's next" view:

- One horizontal line. The **centre node** is the imminent event (happening now, or the next to start) with
  that day's all-day items underneath; the **right node** is the next event; both edges fade out (the previous event shows faded on the left).
- Left of the centre: time until the centre event starts ("Now" while it's on). Right of the centre: the gap
  between the end of the centre event and the start of the next. Green normally, **orange under 15 min**,
  **red under 5 min** (overlaps show in red).
- **Drag the line** (or use ← / → or the mouse wheel) to look further ahead; the ◀ ▶ buttons at the top middle (around the date)
  step one day at a time — days with nothing planned show a "Nothing planned" card (plus any all-day items);
  **Now** returns to the present.
- Shows only events from visible calendars, skips checked-off tasks, and allows no edits — switch back to
  Calendar to change anything. The mode is remembered between visits.

## Work with AI (Action Timeline)

- **✨ Work** (bottom middle) starts an AI chat about the event shown in the centre. If that day has several
  things (the event plus all-day items) you pick one; with just one it opens the input bar straight away.
- After the first message the bar becomes a small chat box. Each event/task has its own chat; asking the AI
  to draft something (agenda, notes, email, checklist…) creates a file **attached to the event**. You can
  also attach your own text files (📎) for the AI to read.
- **Expand** (or **☰** at the top left in Action Timeline mode) turns the chat into the left half of the
  screen with the timeline vertical on the right; ☰ also opens this view when no chat has started yet.
  Browsing the timeline doesn't disturb the chat; a **Work** button on another event starts a new session.
- Several sessions can run at once. The **session switcher** (chat header) jumps between them and moves the
  timeline to that event; navigating the timeline onto an event with an open session shows its chat.
- Attachments (files the AI created or you uploaded) appear on the event in both modes and open in a viewer
  with Download and a trash icon to delete that file.
- The trash icon in the chat header deletes the whole AI chat, after asking whether to also remove the
  event's files (Remove AI chat / Remove AI chat and files / Cancel).
- Endpoint: `api/work.js` (same model, `claude-haiku-5-5`). Chats and files are stored in the browser.

Keyboard shortcuts (ignored while typing in a text box):

| Keys | Action |
|---|---|
| `Ctrl/⌘ + Z` | Undo |
| `Ctrl + Y`, `Ctrl/⌘ + Shift + Z` | Redo |
| `W` / `M` | Week / Month view |
| `T` | Today |
| `J` or `N` / `K` or `P` | Next / previous period |

- **Frontend:** static `index.html`, `styles.css`, `app.js` (no build step). Events are stored in the browser's `localStorage`.
- **Backend:** `api/schedule.js`, a Vercel serverless function that calls the Anthropic API with
  `claude-haiku-5-5` (the lightest Claude model), low effort, and a strict JSON output schema.

## Deploy on Vercel

1. Import this repo in Vercel (Framework preset: **Other**, no build command needed).
2. In **Project → Settings → Environment Variables** add `ANTHROPIC_API_KEY`.
3. Deploy. The page is served at `/` and the AI endpoint at `/api/schedule`.

Once the repo is connected, every push to `main` triggers a new production deployment automatically;
pushes to other branches get their own preview URLs.

## Run locally

```bash
npm install
ANTHROPIC_API_KEY=sk-ant-... npx vercel dev
```

Opening `index.html` directly works for the layout, but the input box needs the `/api/schedule` endpoint.

## Not done yet

- No auth / rate limiting: anyone with the public link can spend API credits.
- Events are per-browser only (no shared database).
- No recurring events. Dragging tasks needs a mouse (not touch).

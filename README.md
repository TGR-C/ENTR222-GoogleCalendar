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

## Whentomeet (find a time with others)

- The people icon next to the mini calendar starts a new Whentomeet. The mini calendar turns into a short
  setup: pick **specific dates** (click or drag; the first row is the current week) or **days of the week**,
  then **No earlier than / No later than**, then a **name**, then **share**: copy a (demo) link or add people
  by email — clicking the box lists made-up people, and each person gets random but fixed availability.
- **Done** adds a "Whentomeet for <event>" line under a new **Whentomeet** section. Clicking it opens the
  event: the line moves to the top left, the sidebar becomes the Whentomeet panel, and the calendar shows just
  the week's day headers above big 30-minute blocks for the chosen days and hours — green where you have
  nothing scheduled, gray where an event takes the time. Each of your events appears as one line (like the
  month view) in the block where it starts. Drag across blocks to mark time free or busy.
- **Group availability** shows only the overlap (greener = more people free); click a time to see who is
  and isn't available. Click a person to see just their availability.
- Close with the ✕ or by clicking the top line again. Everything is stored in the browser.

## Action Timeline mode

Click **Calendar ▾** (top left) and pick **Action Timeline** for a read-only "what's now / what's next" view:

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

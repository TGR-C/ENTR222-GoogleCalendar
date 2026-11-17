Project:ENTR222-Team7-GoogleCalendar

# Natural-language week calendar (prototype)

A one-week calendar laid out like Google Calendar. The "Create" button is replaced by a
text box in the left sidebar: you describe what you want ("Lunch with Sam tomorrow at noon",
"move my gym session to Friday 6pm", "cancel everything on Wednesday") and Claude turns it into
create / update / delete actions.

- **Frontend:** static `index.html`, `styles.css`, `app.js` (no build step). Events are stored in the browser's `localStorage`.
- **Backend:** `api/schedule.js`, a Vercel serverless function that calls the Anthropic API with
  `claude-haiku-5-5` (the lightest Claude model), low effort, and a strict JSON output schema.

## Deploy on Vercel

1. Import this repo in Vercel (Framework preset: **Other**, no build command needed).
2. In **Project → Settings → Environment Variables** add `ANTHROPIC_API_KEY`.
3. Deploy. The page is served at `/` and the AI endpoint at `/api/schedule`.

## Run locally

```bash
npm install
ANTHROPIC_API_KEY=sk-ant-... npx vercel dev
```

Opening `index.html` directly works for the layout, but the input box needs the `/api/schedule` endpoint.

## Not done yet

- No auth / rate limiting: anyone with the public link can spend API credits.
- Events are per-browser only (no shared database).
- No all-day events or recurring events.

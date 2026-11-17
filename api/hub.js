// Vercel serverless function: Connection Hub. Reads incoming messages (Slack, email, Canvas, …) and
// proposes calendar events and tasks from them. Requires the ANTHROPIC_API_KEY environment variable.
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

// Lightest / cheapest current Claude model (same as the other endpoints).
const MODEL = "claude-haiku-5-5";

const SCHEMA = {
  type: "object",
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["event", "task"] },
          title: { type: "string" },
          start: { type: "string" },
          end: { type: "string" },
          all_day: { type: "boolean" },
          location: { type: "string" },
          calendar: { type: "string" },
          source_ids: { type: "array", items: { type: "string" } },
        },
        required: ["type", "title", "start", "end", "all_day", "location", "calendar", "source_ids"],
        additionalProperties: false,
      },
    },
    reply: { type: "string" },
  },
  required: ["items", "reply"],
  additionalProperties: false,
};

const SYSTEM = `You turn incoming messages (chat, email, course announcements, texts) into calendar events and to-do tasks for the user.

What to create:
- event: something that happens at a specific day/time (a meeting, call, class change, office hours, dinner, interview) or an all-day item tied to a date (a deadline or due date, a trip). Give start and end as "YYYY-MM-DDTHH:MM" local time. Default length 1 hour if none is given. For all-day items set all_day true, start "YYYY-MM-DDT00:00" and end "T00:00" of the next day.
- task: something the user needs to do with no specific time ("send me your slides", "review the PR", "reply to Sam"). Use start "" and end "", all_day false.
- A due date can be both: an all-day "… due" event, plus a task to do the work, when the message asks for real work.
- Resolve relative dates ("tomorrow", "Thursday", "next week") against each message's sent_at time, not against now. A bare weekday means the next one after the message was sent.
- Skip chatter, FYIs, and anything already on the user's calendar (see "existing_events").
- Skip things that already happened (before "now").
- Respect "build": "events" means only events, "tasks" means only tasks, "auto" means decide for each.
- title: short and clear, the way the user would write it in their own calendar (e.g. "Pitch deck review with Alex").
- location: a room, address, or "Zoom" if given, else "".
- calendar: for events, the exact name of the best-fitting calendar from "calendars" (e.g. class things in a class calendar); use "" for tasks.
- source_ids: the ids of the messages each item came from.
- reply: one short sentence on what you found (or that there was nothing to schedule).`;

const TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;
const clip = (s, n) => (typeof s === "string" ? s.slice(0, n) : "");

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { messages = [], build = "auto", now, calendars = [], existing = [] } = req.body || {};
  if (!Array.isArray(messages) || !messages.length) {
    return res.status(400).json({ error: "No messages to read" });
  }

  const context = {
    now,
    build: ["auto", "events", "tasks"].includes(build) ? build : "auto",
    calendars: (Array.isArray(calendars) ? calendars : []).slice(0, 30).map((c) => clip(c && c.name, 60)),
    existing_events: (Array.isArray(existing) ? existing : []).slice(0, 60).map((e) => ({
      title: clip(e && e.title, 120), start: clip(e && e.start, 16), end: clip(e && e.end, 16),
    })),
    messages: messages.slice(0, 80).map((m) => ({
      id: clip(m && m.id, 40),
      source: clip(m && m.source, 40),
      from: clip(m && m.from, 80),
      where: clip(m && m.where, 120),
      sent_at: clip(m && m.sent_at, 40),
      text: clip(m && m.text, 1500),
    })),
  };

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 6000,
      system: SYSTEM,
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: SCHEMA },
      },
      messages: [{ role: "user", content: `Context:\n${JSON.stringify(context)}\n\nConstruct events and tasks from these messages.` }],
    });

    if (response.stop_reason === "refusal") {
      return res.status(200).json({ items: [], reply: "Sorry, I can't help with that." });
    }
    if (response.stop_reason === "max_tokens") {
      return res.status(502).json({ error: "Too much to read at once. Try fewer messages." });
    }
    const text = response.content.find((b) => b.type === "text")?.text;
    if (!text) return res.status(502).json({ error: "Empty model response" });
    const parsed = JSON.parse(text);

    const ids = new Set(context.messages.map((m) => m.id));
    const items = (parsed.items || [])
      .filter((it) => it && it.title && it.title.trim())
      .filter((it) => it.type === "task" || (TIME_RE.test(it.start) && TIME_RE.test(it.end)))
      .slice(0, 30)
      .map((it) => ({ ...it, title: clip(it.title, 200), source_ids: (it.source_ids || []).filter((x) => ids.has(x)) }));

    return res.status(200).json({ items, reply: parsed.reply || "" });
  } catch (err) {
    if (err instanceof Anthropic.AuthenticationError) {
      return res.status(500).json({ error: "Server API key is missing or invalid." });
    }
    if (err instanceof Anthropic.RateLimitError) {
      return res.status(429).json({ error: "Rate limited, try again in a moment." });
    }
    if (err instanceof Anthropic.APIError) {
      return res.status(502).json({ error: `Model API error (${err.status ?? "network"}).` });
    }
    console.error(err);
    return res.status(500).json({ error: "Unexpected server error." });
  }
}

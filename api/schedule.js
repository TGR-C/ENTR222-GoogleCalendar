// Vercel serverless function: turns a natural-language request into calendar actions.
// Requires the ANTHROPIC_API_KEY environment variable (set it in the Vercel project settings).
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

// Lightest / cheapest current Claude model.
const MODEL = "claude-haiku-5-5";

const COLORS = [
  "tomato", "flamingo", "tangerine", "banana", "sage", "basil",
  "peacock", "blueberry", "lavender", "grape", "graphite",
];

const SCHEMA = {
  type: "object",
  properties: {
    actions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["create", "update", "delete"] },
          id: { type: "string" },
          title: { type: "string" },
          start: { type: "string" },
          end: { type: "string" },
          color: { type: "string", enum: COLORS },
          location: { type: "string" },
        },
        required: ["type", "id", "title", "start", "end", "color", "location"],
        additionalProperties: false,
      },
    },
    reply: { type: "string" },
  },
  required: ["actions", "reply"],
  additionalProperties: false,
};

const SYSTEM = `You are the scheduling engine of a calendar app. Turn the user's request into actions on their events.

Rules:
- All times are the user's local time, formatted exactly "YYYY-MM-DDTHH:MM" (24h).
- Resolve relative dates ("tomorrow", "next Tuesday", "this Friday") against the "now" value given. A bare weekday means the next upcoming one (today counts if the time has not passed).
- Default duration is 1 hour when none is given. Default color is "peacock" unless the user asks for one or an existing event is being kept.
- create: set id to "".
- update: use the existing event's id and give the full final values (copy unchanged fields from the existing event).
- delete: use the existing event's id and copy its other fields.
- One request can produce several actions (e.g. "move all my Monday meetings to Tuesday").
- Use location "" when none is known.
- If the request is ambiguous (e.g. several events match and you can't tell which) or is not about the calendar, return no actions and ask a short question in reply.
- reply: one short, friendly sentence saying what you did.`;

const TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { command, events = [], now, weekStart, weekEnd } = req.body || {};
  if (typeof command !== "string" || !command.trim()) {
    return res.status(400).json({ error: "Missing command" });
  }
  if (command.length > 1000) {
    return res.status(400).json({ error: "Command too long" });
  }

  const context = {
    now,
    visible_week: { start: weekStart, end: weekEnd },
    events: events.map(({ id, title, start, end, color, location }) => ({
      id, title, start, end, color, location: location || "",
    })),
  };

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 4096,
      system: SYSTEM,
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: SCHEMA },
      },
      messages: [
        {
          role: "user",
          content: `Context:\n${JSON.stringify(context)}\n\nRequest: ${command.trim()}`,
        },
      ],
    });

    if (response.stop_reason === "refusal") {
      return res.status(200).json({ actions: [], reply: "Sorry, I can't help with that request." });
    }
    if (response.stop_reason === "max_tokens") {
      return res.status(502).json({ error: "The model response was cut off. Try a simpler request." });
    }

    const text = response.content.find((b) => b.type === "text")?.text;
    if (!text) return res.status(502).json({ error: "Empty model response" });

    const parsed = JSON.parse(text);
    const knownIds = new Set(context.events.map((e) => e.id));
    const actions = (parsed.actions || []).filter((a) => {
      if (a.type !== "delete" && (!TIME_RE.test(a.start) || !TIME_RE.test(a.end))) return false;
      if (a.type !== "create" && !knownIds.has(a.id)) return false;
      return true;
    });

    return res.status(200).json({ actions, reply: parsed.reply || "Done." });
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

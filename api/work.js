// Vercel serverless function: the "Work" chat for one calendar event / task.
// Replies to the user and can create or update text files that get attached to the event.
// Requires the ANTHROPIC_API_KEY environment variable.
import Anthropic from "@anthropic-ai/sdk";

const client = new Anthropic();

// Lightest / cheapest current Claude model (same as the scheduling endpoint).
const MODEL = "claude-haiku-5-5";

const SCHEMA = {
  type: "object",
  properties: {
    reply: { type: "string" },
    files: {
      type: "array",
      items: {
        type: "object",
        properties: {
          name: { type: "string" },
          content: { type: "string" },
        },
        required: ["name", "content"],
        additionalProperties: false,
      },
    },
  },
  required: ["reply", "files"],
  additionalProperties: false,
};

const SYSTEM = `You are a work assistant inside a calendar app. The user is working on one specific event or task from their calendar, and this chat is only about that event. Help them get it done: plan, prepare, draft, summarise, brainstorm, answer questions.

Files:
- When the user asks you to write, draft, prepare, or create something they will keep (notes, an agenda, an outline, an email draft, a checklist, a summary, a table), put it in "files" as a complete document. It is attached to the event.
- Use a short descriptive file name with an extension: .md for documents (default), .txt for plain text, .csv for tables.
- To change an existing attached file, return it again with exactly the same name and the full new content (it replaces the old version).
- Don't create files for simple answers or chit-chat; use "files": [] then.
- Files the user attached (and earlier ones) are given in the context; read them when relevant.

Reply:
- "reply" is your chat message: short and friendly. If you created or updated files, say which ones and what is in them in a sentence or two; don't paste the whole file into the reply.
- Plain text; simple "- " bullet lists are fine.`;

const ROLES = new Set(["user", "assistant"]);
const clip = (s, n) => (typeof s === "string" ? s.slice(0, n) : "");

function cleanName(name) {
  let n = clip(String(name || ""), 80).replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ").trim();
  if (!n) n = "Notes";
  if (!/\.[a-z0-9]{1,5}$/i.test(n)) n += ".md";
  return n;
}

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { event = {}, files = [], history = [], message, now } = req.body || {};
  if (typeof message !== "string" || !message.trim()) {
    return res.status(400).json({ error: "Missing message" });
  }
  if (message.length > 8000) {
    return res.status(400).json({ error: "Message too long" });
  }

  // Previous turns, oldest first. The conversation has to start with a user turn and alternate.
  const turns = [];
  for (const m of (Array.isArray(history) ? history : []).slice(-16)) {
    if (!m || !ROLES.has(m.role) || typeof m.text !== "string" || !m.text.trim()) continue;
    if (!turns.length && m.role !== "user") continue;
    const last = turns[turns.length - 1];
    if (last && last.role === m.role) last.content += `\n\n${clip(m.text, 6000)}`;
    else turns.push({ role: m.role, content: clip(m.text, 6000) });
  }
  if (turns.length && turns[turns.length - 1].role === "user") turns.pop();

  const context = {
    now,
    event: {
      title: clip(event.title, 200),
      when: clip(event.when, 200),
      location: clip(event.location, 200),
      calendar: clip(event.calendar, 100),
      all_day: !!event.all_day,
      is_task: !!event.is_task,
      done: !!event.done,
    },
    attached_files: (Array.isArray(files) ? files : []).slice(0, 12).map((f) => ({
      name: clip(f && f.name, 100),
      content: clip(f && f.content, 8000),
    })),
  };

  turns.push({
    role: "user",
    content: `Context:\n${JSON.stringify(context)}\n\nMessage: ${message.trim()}`,
  });

  try {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 8000,
      system: SYSTEM,
      output_config: {
        effort: "low",
        format: { type: "json_schema", schema: SCHEMA },
      },
      messages: turns,
    });

    if (response.stop_reason === "refusal") {
      return res.status(200).json({ reply: "Sorry, I can't help with that.", files: [] });
    }
    if (response.stop_reason === "max_tokens") {
      return res.status(502).json({ error: "The reply was too long and got cut off. Try asking for something shorter." });
    }

    const text = response.content.find((b) => b.type === "text")?.text;
    if (!text) return res.status(502).json({ error: "Empty model response" });
    const parsed = JSON.parse(text);

    const out = (parsed.files || [])
      .filter((f) => f && typeof f.content === "string" && f.content.trim())
      .slice(0, 6)
      .map((f) => ({ name: cleanName(f.name), content: clip(f.content, 100000) }));

    return res.status(200).json({ reply: parsed.reply || "", files: out });
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

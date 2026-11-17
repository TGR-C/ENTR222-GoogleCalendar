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
          calendar: { type: "string" },
          location: { type: "string" },
          all_day: { type: "boolean" },
        },
        required: ["type", "id", "title", "start", "end", "calendar", "location", "all_day"],
        additionalProperties: false,
      },
    },
    task_actions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["create", "update", "complete"] },
          id: { type: "string" },
          title: { type: "string" },
        },
        required: ["type", "id", "title"],
        additionalProperties: false,
      },
    },
    calendar_actions: {
      type: "array",
      items: {
        type: "object",
        properties: {
          type: { type: "string", enum: ["create", "update", "delete"] },
          id: { type: "string" },
          name: { type: "string" },
          color: { type: "string", enum: COLORS },
          visible: { type: "boolean" },
        },
        required: ["type", "id", "name", "color", "visible"],
        additionalProperties: false,
      },
    },
    reply: { type: "string" },
  },
  required: ["actions", "task_actions", "calendar_actions", "reply"],
  additionalProperties: false,
};

const SYSTEM = `You are the scheduling engine of a calendar app. Turn the user's request into actions on their calendar events ("actions"), their to-do list ("task_actions"), and their calendars/tags ("calendar_actions").

Rules:
- All times are the user's local time, formatted exactly "YYYY-MM-DDTHH:MM" (24h).
- Resolve relative dates ("tomorrow", "next Tuesday", "this Friday") against the "now" value given. A bare weekday means the next upcoming one (today counts if the time has not passed).
- Default duration is 1 hour when none is given.
- Every event belongs to one calendar (a tag) from "calendars"; the event's color is its calendar's color. Set "calendar" to the calendar's exact name. For a new event pick the calendar that fits best (e.g. a class goes in a class/school calendar, a workout in a fitness one); if none fits, use "Personal" if it exists, else the first calendar. When updating, keep the event's current calendar unless the user asks to change it.
- create: set id to "".
- update: use the existing event's id and give the full final values (copy unchanged fields from the existing event).
- delete: use the existing event's id and copy its other fields.
- One request can produce several actions (e.g. "move all my Monday meetings to Tuesday").
- Use location "" when none is known.
- all_day: true for all-day events (holidays, birthdays, deadlines, trips, anything the user calls "all day"); then start is "YYYY-MM-DDT00:00" of the first day and end is "T00:00" of the day after the last day. Otherwise false.

To-do list ("tasks" in the context; each task has only an id and a title, no time):
- task create (id ""): the user wants something on their to-do list with no specific time, e.g. "add X to my tasks", "remind me to X", "I need to X", "to-do: X".
- task update: rename an existing task (use its id).
- task complete: the user finished it or wants it off the list ("done with X", "check off X", "remove X from my tasks").
- Events with is_task true are tasks the user placed on the calendar; done tells whether they were checked off. Treat them like other events for moving, renaming, or deleting.
- Something with a specific day or time is a calendar event, not a task.

Calendars / tags ("calendars" in the context; each has id, name, color, visible):
- calendar create (id ""): a new tag/calendar with a name and one of the allowed colors (pick a fitting unused one if the user gives none). New calendars are visible.
- calendar update (existing id): rename, recolor, show or hide (visible). Copy unchanged fields.
- calendar delete (existing id): only when the user explicitly asks; this also deletes the calendar's events.
- "Change an event's color" means moving it to a calendar with that color. If no calendar has that color, ask which calendar to use, unless the user asked to make a new tag.
- An event can be put in a calendar created in the same response by using the new calendar's name. If the user asks to schedule an existing task, create an event with the task's title and leave the task alone unless they say it is done.
- If "selected_slot" is present, the user clicked that slot on the calendar to create a new event: create it at exactly that start and end unless the description explicitly gives a different time, date, or duration.
- If "selected_event_id" is present, the user opened that event and is describing a change to it: "it", "this", or a bare instruction ("move to 3pm", "make it longer", "delete") refers to that event. Only touch other events if the request clearly names them.
- If the request is ambiguous (e.g. several events match and you can't tell which) or is not about the calendar, return no actions and ask a short question in reply.
- reply: one short, friendly sentence saying what you did.`;

const TIME_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/;

export default async function handler(req, res) {
  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    return res.status(405).json({ error: "Method not allowed" });
  }

  const { command, events = [], tasks = [], calendars = [], now, weekStart, weekEnd, slot, eventId } = req.body || {};
  if (typeof command !== "string" || !command.trim()) {
    return res.status(400).json({ error: "Missing command" });
  }
  if (command.length > 1000) {
    return res.status(400).json({ error: "Command too long" });
  }

  const calList = (Array.isArray(calendars) ? calendars : []).map(({ id, name, color, visible }) => ({
    id, name, color, visible: visible !== false,
  }));
  const calName = new Map(calList.map((c) => [c.id, c.name]));

  const context = {
    now,
    visible_week: { start: weekStart, end: weekEnd },
    ...(slot && TIME_RE.test(slot.start) && TIME_RE.test(slot.end)
      ? { selected_slot: { start: slot.start, end: slot.end } }
      : {}),
    ...(typeof eventId === "string" && Array.isArray(events) && events.some((e) => e && e.id === eventId)
      ? { selected_event_id: eventId }
      : {}),
    calendars: calList,
    events: events.map(({ id, title, start, end, cal, location, allDay, taskId, done }) => ({
      id, title, start, end, calendar: calName.get(cal) || "", location: location || "", all_day: !!allDay,
      ...(taskId ? { is_task: true, done: !!done } : {}),
    })),
    tasks: (Array.isArray(tasks) ? tasks : []).map(({ id, title }) => ({ id, title })),
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
      return res.status(200).json({ actions: [], task_actions: [], calendar_actions: [], reply: "Sorry, I can't help with that request." });
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

    const knownTasks = new Set(context.tasks.map((t) => t.id));
    const taskActions = (parsed.task_actions || []).filter((t) =>
      t.type === "create" ? !!t.title?.trim() : knownTasks.has(t.id));

    const knownCals = new Set(calList.map((c) => c.id));
    const calendarActions = (parsed.calendar_actions || []).filter((c) =>
      c.type === "create" ? !!c.name?.trim() : knownCals.has(c.id));

    return res.status(200).json({
      actions, task_actions: taskActions, calendar_actions: calendarActions, reply: parsed.reply || "Done.",
    });
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

// Prototype week calendar. Events live in localStorage; all add/edit/delete goes
// through the natural-language box, which calls /api/schedule (Claude) on Vercel.
(() => {
  "use strict";

  const COLORS = {
    tomato: "#d50000", flamingo: "#e67c73", tangerine: "#f4511e", banana: "#f6bf26",
    sage: "#33b679", basil: "#0b8043", peacock: "#039be5", blueberry: "#3f51b5",
    lavender: "#7986cb", grape: "#8e24aa", graphite: "#616161",
  };
  const DAY_SHORT = ["SUN", "MON", "TUE", "WED", "THU", "FRI", "SAT"];
  const MONTHS = ["January", "February", "March", "April", "May", "June", "July",
    "August", "September", "October", "November", "December"];
  const STORE_KEY = "nl-calendar-events-v1";

  const $ = (id) => document.getElementById(id);
  const el = {
    weekHead: $("weekHead"), weekGrid: $("weekGrid"), weekBody: $("weekBody"),
    rangeTitle: $("rangeTitle"), logoDate: $("logoDate"),
    miniTitle: $("miniTitle"), miniGrid: $("miniGrid"),
    aiForm: $("aiForm"), aiInput: $("aiInput"), aiSend: $("aiSend"), aiStatus: $("aiStatus"),
    aiHints: $("aiHints"), popover: $("popover"), toast: $("toast"), sidebar: $("sidebar"),
    main: $("main"), monthHead: $("monthHead"), monthGrid: $("monthGrid"),
    viewBtn: $("viewBtn"), viewMenu: $("viewMenu"), viewLabel: $("viewLabel"),
    taskList: $("taskList"), taskAdd: $("taskAdd"), taskEmpty: $("taskEmpty"),
    calList: $("calList"), calAdd: $("calAdd"),
    quickAdd: $("quickAdd"), qaFab: $("qaFab"), qaCard: $("qaCard"),
  };
  const CAL_KEY = "nl-calendar-cals-v1";
  // Starter calendars (tags). Fixed ids so sample events and older saved data can be mapped onto them.
  const DEFAULT_CALENDARS = [
    { id: "cal-startup", name: "Startup project", color: "peacock", visible: true },
    { id: "cal-classes", name: "Classes", color: "grape", visible: true },
    { id: "cal-personal", name: "Personal", color: "flamingo", visible: true },
    { id: "cal-fitness", name: "Fitness", color: "basil", visible: true },
    { id: "cal-tasks", name: "Tasks", color: "blueberry", visible: true },
  ];
  // Which starter calendar each sample event belongs to (also used to migrate older saves).
  const SAMPLE_CAL = {
    "Team standup": "cal-startup", "Project sync": "cal-startup", "Customer interview": "cal-startup",
    "Pitch practice": "cal-startup", "Pitch deck due": "cal-startup",
    "ENTR 222 lecture": "cal-classes", "Office hours": "cal-classes",
    "Lunch with Alex": "cal-personal", "Dinner": "cal-personal",
    "Gym": "cal-fitness", "Hike": "cal-fitness",
  };
  const TASK_KEY = "nl-calendar-tasks-v1";
  const VIEW_KEY = "nl-calendar-view";

  // ---------- date helpers (all local time) ----------
  const pad = (n) => String(n).padStart(2, "0");
  const toISO = (d) =>
    `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  const parseISO = (s) => {
    const [date, time = "00:00"] = s.split("T");
    const [y, m, d] = date.split("-").map(Number);
    const [hh, mm] = time.split(":").map(Number);
    return new Date(y, m - 1, d, hh, mm);
  };
  const dayKey = (d) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
  const addDays = (d, n) => { const r = new Date(d); r.setDate(r.getDate() + n); return r; };
  const startOfDay = (d) => new Date(d.getFullYear(), d.getMonth(), d.getDate());
  const startOfWeek = (d) => addDays(startOfDay(d), -d.getDay()); // Sunday start, like Google
  const sameDay = (a, b) => dayKey(a) === dayKey(b);
  const fmtTime = (d) => {
    const h = d.getHours(), m = d.getMinutes();
    const h12 = h % 12 || 12;
    return m ? `${h12}:${pad(m)}${h < 12 ? "am" : "pm"}` : `${h12}${h < 12 ? "am" : "pm"}`;
  };
  const fmtRange = (s, e) => {
    const sameHalf = (s.getHours() < 12) === (e.getHours() < 12);
    const a = fmtTime(s);
    return `${sameHalf ? a.replace(/am|pm/, "") : a} – ${fmtTime(e)}`;
  };
  const uid = () => Math.random().toString(36).slice(2, 10);

  // ---------- state ----------
  let calendars = loadCalendars();
  let events = loadEvents();
  migrateEvents();
  let tasks = loadTasks();          // [{id, title}] — the sidebar to-do list
  let view = loadView();           // "week" | "month"
  let focus = startOfDay(new Date()); // the date being looked at
  let weekStart = startOfWeek(focus);
  let monthStart = new Date(focus.getFullYear(), focus.getMonth(), 1);
  let miniMonth = new Date(monthStart);
  let undoStack = [];
  let redoStack = [];
  let flashIds = new Set();
  let draft = null;        // {start, end} slot picked by click-to-create
  let drag = null;         // active pointer interaction on the grid
  let suppressClick = false;

  function loadEvents() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    const seeded = seedEvents();
    try { localStorage.setItem(STORE_KEY, JSON.stringify(seeded)); } catch { /* ignore */ }
    return seeded;
  }
  function loadCalendars() {
    try {
      const raw = localStorage.getItem(CAL_KEY);
      if (raw) { const c = JSON.parse(raw); if (Array.isArray(c) && c.length) return c; }
    } catch { /* ignore */ }
    const seeded = DEFAULT_CALENDARS.map((c) => ({ ...c }));
    try { localStorage.setItem(CAL_KEY, JSON.stringify(seeded)); } catch { /* ignore */ }
    return seeded;
  }
  function saveCalendars() {
    try { localStorage.setItem(CAL_KEY, JSON.stringify(calendars)); } catch { /* ignore */ }
  }
  // (function declarations, not consts: migrateEvents() uses them while state is being set up)
  function calById(id) { return calendars.find((c) => c.id === id); }
  function calByName(name) {
    const n = String(name || "").trim().toLowerCase();
    return n ? calendars.find((c) => c.name.toLowerCase() === n || c.id === name) : undefined;
  }
  // New events go to "Personal" if it exists, else the first calendar.
  function defaultCalId() { return (calById("cal-personal") || calendars[0]).id; }
  function tasksCalId() { return (calById("cal-tasks") || calById(defaultCalId())).id; }
  function calOf(ev) { return calById(ev.cal) || calById(defaultCalId()); }
  function colorNameOf(ev) { return (calOf(ev) || {}).color || "peacock"; }
  function colorOf(ev) { return COLORS[colorNameOf(ev)] || COLORS.peacock; }
  function isVisible(ev) { return (calOf(ev) || {}).visible !== false; }

  // Older saves stored a colour on each event; give every event a calendar instead.
  function migrateEvents() {
    let changed = false;
    for (const ev of events) {
      if (ev.cal && calById(ev.cal)) continue;
      ev.cal = (SAMPLE_CAL[ev.title] && calById(SAMPLE_CAL[ev.title]) && SAMPLE_CAL[ev.title])
        || (ev.taskId && tasksCalId())
        || (calendars.find((c) => c.color === ev.color) || {}).id
        || defaultCalId();
      delete ev.color;
      changed = true;
    }
    if (changed) saveEvents();
  }

  function loadTasks() {
    try {
      const raw = localStorage.getItem(TASK_KEY);
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    const seeded = ["Finish pitch deck", "Email professor about project", "Book a team meeting room"]
      .map((title) => ({ id: uid(), title }));
    try { localStorage.setItem(TASK_KEY, JSON.stringify(seeded)); } catch { /* ignore */ }
    return seeded;
  }
  function saveTasks() {
    try { localStorage.setItem(TASK_KEY, JSON.stringify(tasks)); } catch { /* ignore */ }
  }
  // All-day events are stored as midnight → next midnight (end exclusive) with allDay: true.
  function allDaySpan(date, days = 1) {
    const d = startOfDay(date);
    return { start: toISO(d), end: toISO(addDays(d, days)), allDay: true };
  }
  function loadView() {
    try { return localStorage.getItem(VIEW_KEY) === "month" ? "month" : "week"; } catch { return "week"; }
  }
  function saveEvents() {
    try { localStorage.setItem(STORE_KEY, JSON.stringify(events)); } catch { /* ignore */ }
  }
  function seedEvents() {
    const ws = startOfWeek(new Date());
    const at = (day, h, m = 0) => toISO(new Date(ws.getFullYear(), ws.getMonth(), ws.getDate() + day, h, m));
    const mk = (title, day, sh, sm, eh, em, location = "") =>
      ({ id: uid(), title, start: at(day, sh, sm), end: at(day, eh, em), cal: SAMPLE_CAL[title], location });
    return [
      mk("Team standup", 1, 9, 30, 10, 0, "Zoom"),
      mk("ENTR 222 lecture", 1, 13, 0, 14, 30, "Room 104"),
      mk("Gym", 2, 7, 0, 8, 0, "Campus rec center"),
      mk("Project sync", 2, 11, 0, 12, 0),
      mk("Lunch with Alex", 3, 12, 0, 13, 0, "Campus café"),
      mk("ENTR 222 lecture", 3, 13, 0, 14, 30, "Room 104"),
      mk("Customer interview", 3, 13, 30, 14, 15, "Zoom"),
      mk("Office hours", 4, 15, 0, 16, 30),
      mk("Pitch practice", 5, 10, 0, 11, 30),
      mk("Dinner", 5, 19, 0, 20, 30),
      mk("Hike", 6, 9, 0, 12, 0, "Trailhead"),
      { id: uid(), title: "Pitch deck due", ...allDaySpan(addDays(ws, 5)), cal: "cal-startup", location: "" },
    ];
  }

  // ---------- rendering ----------
  function render() {
    updateTaskSchedules();
    el.main.dataset.view = view;
    el.viewLabel.textContent = view === "month" ? "Month" : "Week";
    renderHeader();
    refreshMain();
    renderMini();
  }
  // Re-draw only the main area (used on resize, every minute, and after drags).
  function refreshMain() {
    if (view === "month") renderMonth();
    else renderGrid();
  }

  function renderHeader() {
    el.logoDate.textContent = new Date().getDate();
    if (view === "month") {
      el.rangeTitle.textContent = `${MONTHS[monthStart.getMonth()]} ${monthStart.getFullYear()}`;
      return;
    }
    const end = addDays(weekStart, 6);
    const y1 = weekStart.getFullYear(), y2 = end.getFullYear();
    const m1 = weekStart.getMonth(), m2 = end.getMonth();
    let title;
    if (m1 === m2) title = `${MONTHS[m1]} ${y1}`;
    else if (y1 === y2) title = `${MONTHS[m1].slice(0, 3)} – ${MONTHS[m2].slice(0, 3)} ${y1}`;
    else title = `${MONTHS[m1].slice(0, 3)} ${y1} – ${MONTHS[m2].slice(0, 3)} ${y2}`;
    el.rangeTitle.textContent = title;

    const today = new Date();
    const offset = -today.getTimezoneOffset() / 60;
    let html = `<div class="tz">GMT${offset >= 0 ? "+" : ""}${offset}</div>`;
    for (let i = 0; i < 7; i++) {
      const d = addDays(weekStart, i);
      // The whole column header (name, number, all-day row) is the all-day drop zone.
      html += `<div class="day-head allday-zone${sameDay(d, today) ? " today" : ""}" data-day="${i}">
        <div class="dname">${DAY_SHORT[i]}</div><div class="dnum">${d.getDate()}</div><div class="allday-list"></div></div>`;
    }
    el.weekHead.innerHTML = html;
    el.weekHead.querySelectorAll(".day-head").forEach((head, i) => {
      const d = addDays(weekStart, i);
      const list = head.querySelector(".allday-list");
      eventsOnDay(d).filter(({ ev }) => ev.allDay).forEach(({ ev, s }) => list.appendChild(chipEl(ev, s, d)));
    });
  }

  function renderGrid() {
    const grid = el.weekGrid;
    grid.innerHTML = "";

    const gutter = document.createElement("div");
    gutter.className = "gutter";
    for (let h = 1; h < 24; h++) {
      const lab = document.createElement("div");
      lab.className = "hlabel";
      lab.style.top = `calc(var(--hour) * ${h})`;
      lab.textContent = `${h % 12 || 12} ${h < 12 ? "AM" : "PM"}`;
      gutter.appendChild(lab);
    }
    grid.appendChild(gutter);

    const today = new Date();
    for (let i = 0; i < 7; i++) {
      const day = addDays(weekStart, i);
      const col = document.createElement("div");
      col.className = "day-col";

      const dayStart = startOfDay(day), dayEnd = addDays(dayStart, 1);
      const items = events
        .filter((ev) => !ev.allDay && isVisible(ev))
        .map((ev) => ({ ev, s: parseISO(ev.start), e: parseISO(ev.end) }))
        .filter(({ s, e }) => s < dayEnd && e > dayStart)
        .map((it) => ({
          ...it,
          dayStart,
          top: Math.max(0, (it.s - dayStart) / 60000),            // minutes from midnight
          bottom: Math.min(1440, (it.e - dayStart) / 60000),
        }))
        .sort((a, b) => a.top - b.top || b.bottom - a.bottom);

      col.dataset.day = i;
      layoutColumns(items).forEach((it) => col.appendChild(eventEl(it)));

      if (draft && sameDay(parseISO(draft.start), day)) col.appendChild(draftEl());

      if (sameDay(day, today)) {
        const line = document.createElement("div");
        line.className = "now-line";
        line.style.top = `calc(var(--hour) * ${(today.getHours() * 60 + today.getMinutes()) / 60})`;
        col.appendChild(line);
      }
      grid.appendChild(col);
    }

    const sb = el.weekBody.offsetWidth - el.weekBody.clientWidth;
    document.documentElement.style.setProperty("--scrollbar", `${sb}px`);
  }

  // Assign overlapping events to side-by-side columns (simple greedy clustering).
  function layoutColumns(items) {
    let cluster = [], clusterEnd = -1;
    const flush = () => {
      const cols = [];
      cluster.forEach((it) => {
        let c = cols.findIndex((end) => end <= it.top);
        if (c === -1) { c = cols.length; cols.push(0); }
        cols[c] = it.bottom;
        it.col = c;
      });
      cluster.forEach((it) => (it.cols = cols.length));
      cluster = [];
    };
    items.forEach((it) => {
      if (it.top >= clusterEnd) { flush(); clusterEnd = -1; }
      cluster.push(it);
      clusterEnd = Math.max(clusterEnd, it.bottom);
    });
    flush();
    return items;
  }

  function eventEl({ ev, s, e, top, bottom, col, cols, dayStart }) {
    const div = document.createElement("div");
    const mins = Math.max(bottom - top, 15);
    div.className = "event" + (mins < 45 ? " compact" : "") + (flashIds.has(ev.id) ? " flash" : "");
    div.style.top = `calc(var(--hour) * ${top / 60})`;
    div.style.height = `calc(var(--hour) * ${mins / 60} - 2px)`;
    const w = 100 / cols;
    div.style.left = `calc(${col * w}% + 1px)`;
    div.style.width = `calc(${col === cols - 1 ? w : w * 1.6}% - 10px)`;
    div.style.zIndex = 1 + col;
    div.style.background = colorOf(ev);
    if (colorNameOf(ev) === "banana") div.style.color = "#202124";
    div.innerHTML = `<div class="etitle"></div><div class="etime"></div>`;
    div.querySelector(".etitle").textContent = ev.title || "(No title)";
    div.querySelector(".etime").textContent = fmtRange(s, e) + (ev.location && mins >= 60 ? `, ${ev.location}` : "");
    div.dataset.id = ev.id;
    if (ev.taskId) {
      div.classList.add("is-task");
      if (ev.done) div.classList.add("done");
      div.querySelector(".etitle").prepend(checkboxEl(ev));
    }
    // Only the segment that holds the real end time gets a resize handle.
    if (e - dayStart <= 86400000) {
      const h = document.createElement("div");
      h.className = "resize";
      div.appendChild(h);
    }
    return div;
  }

  // Temporary block shown while picking a slot for click-to-create.
  const draftColor = () => COLORS[(calById(draft && draft.cal) || calById(defaultCalId())).color] || COLORS.peacock;
  function draftEl() {
    const s = parseISO(draft.start), e = parseISO(draft.end);
    const top = s.getHours() * 60 + s.getMinutes();
    const mins = Math.max((e - s) / 60000, 15);
    const div = document.createElement("div");
    div.className = "event draft" + (mins < 45 ? " compact" : "");
    div.style.top = `calc(var(--hour) * ${top / 60})`;
    div.style.height = `calc(var(--hour) * ${mins / 60} - 2px)`;
    div.style.left = "1px";
    div.style.width = "calc(100% - 10px)";
    div.style.background = draftColor();
    div.innerHTML = `<div class="etitle"></div><div class="etime"></div>`;
    div.querySelector(".etitle").textContent = draft.title || "(No title)";
    div.querySelector(".etime").textContent = fmtRange(s, e);
    return div;
  }

  function renderMini() {
    const y = miniMonth.getFullYear(), m = miniMonth.getMonth();
    el.miniTitle.textContent = `${MONTHS[m]} ${y}`;
    const first = startOfWeek(new Date(y, m, 1));
    const today = new Date();
    const weekEnd = addDays(weekStart, 7);
    let html = ["S", "M", "T", "W", "T", "F", "S"].map((d) => `<div class="dow">${d}</div>`).join("");
    for (let i = 0; i < 42; i++) {
      const d = addDays(first, i);
      const cls = [
        d.getMonth() !== m ? "other" : "",
        sameDay(d, today) ? "today"
          : view === "week" && d >= weekStart && d < weekEnd ? "in-week"
          : view === "month" && sameDay(d, focus) ? "in-week" : "",
      ].join(" ");
      html += `<button class="${cls}" data-date="${dayKey(d)}">${d.getDate()}</button>`;
    }
    el.miniGrid.innerHTML = html;
  }

  // ---------- popover ----------
  const FINE_POINTER = !window.matchMedia("(pointer: coarse)").matches; // not a touch screen
  const CLOSE_BTN = `<div class="ptop"><button class="icon-btn" aria-label="Close" data-close>
        <svg viewBox="0 0 24 24" width="20" height="20"><path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
      </button></div>`;

  // The pill-shaped "describe it" input used in popovers. onSubmit(text) returns the API
  // reply; if Claude changed nothing (e.g. it asked a question) the reply is shown inline.
  function aiBar({ placeholder, hint, busyText, onSubmit }) {
    const wrap = document.createElement("div");
    wrap.className = "pbar";
    wrap.innerHTML = `
      <form class="ai-input-wrap pnew-form" autocomplete="off">
        <svg class="ai-spark" viewBox="0 0 24 24" width="20" height="20"><path d="M12 2l1.9 5.6L19.5 9.5l-5.6 1.9L12 17l-1.9-5.6L4.5 9.5l5.6-1.9z M19 14l.9 2.6 2.6.9-2.6.9L19 21l-.9-2.6-2.6-.9 2.6-.9z"/></svg>
        <textarea rows="1"></textarea>
        <button type="submit" class="ai-send" aria-label="Send">
          <svg viewBox="0 0 24 24" width="18" height="18"><path d="M2.01 21 23 12 2.01 3 2 10l15 2-15 2z"/></svg>
        </button>
      </form>
      <div class="ai-status pnew-status"></div>`;
    const form = wrap.querySelector("form"), input = wrap.querySelector("textarea");
    const status = wrap.querySelector(".pnew-status"), send = wrap.querySelector(".ai-send");
    input.placeholder = placeholder;
    input.setAttribute("aria-label", placeholder);
    status.textContent = hint;
    let busy = false;
    input.addEventListener("input", () => {
      input.style.height = "auto";
      input.style.height = `${Math.min(input.scrollHeight, 120)}px`;
    });
    const submit = async () => {
      const text = input.value.trim();
      if (!text || busy) return;
      busy = true;
      send.disabled = true; input.readOnly = true;
      status.classList.remove("error");
      status.innerHTML = `<span class="spinner"></span>${escapeHTML(busyText)}`;
      try {
        const reply = await onSubmit(text);
        if (reply) { status.textContent = reply; input.value = ""; }
      } catch (err) {
        status.classList.add("error");
        status.textContent = err.message || "Something went wrong.";
      } finally {
        busy = false;
        send.disabled = false; input.readOnly = false;
        if (!el.popover.hidden) input.focus();
      }
    };
    form.addEventListener("submit", (e) => { e.preventDefault(); submit(); });
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); submit(); }
    });
    return { wrap, input };
  }

  // Send a request from a popover; close it and apply the result if anything changed.
  async function popoverRequest(text, ctx) {
    const data = await callSchedule(text, ctx);
    const actions = data.actions || [], taskActions = data.task_actions || [], calActions = data.calendar_actions || [];
    if (!actions.length && !taskActions.length && !calActions.length) return data.reply || "I couldn’t work out a change — try rephrasing.";
    el.popover.hidden = true;
    if (draft) { draft.busy = false; draft = null; }
    const changed = applyActions(actions, taskActions, calActions);
    setStatus(escapeHTML(data.reply || "Done.") + (changed.length ? ` <button class="undo" type="button">Undo</button>` : ""));
    return null;
  }

  // Clicking an event: details plus an input bar to describe a change to it.
  function showPopover(ev, anchor) {
    clearDraft();
    const s = parseISO(ev.start), e = parseISO(ev.end);
    const dayStr = s.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
    const p = el.popover;
    p.innerHTML = `${CLOSE_BTN}
      <div class="prow"><div class="picon"><button type="button" class="swatch swatch-btn" style="background:${colorOf(ev)}" aria-label="Change calendar" title="Change calendar"></button></div>
        <div class="pinfo"><div class="ptitle"></div><div class="pwhen"></div></div></div>
      <div class="prow ploc-row"><div class="picon"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/></svg></div>
        <div class="pinfo"><div class="ploc"></div></div></div>
      <div class="prow pcal-row"><div class="picon"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-2 .9-2 2v14a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z"/></svg></div>
        <div class="pinfo"><button type="button" class="pcal" title="Change calendar"></button></div></div>`;
    p.querySelector(".pcal").textContent = (calOf(ev) || {}).name || "";
    // The colour square and the calendar name both open the calendar picker.
    const pick = (id) => setEventCalendar(ev, id);
    p.querySelector(".swatch-btn").addEventListener("click", (e) => { e.stopPropagation(); toggleCalMenu(ev.cal, e.currentTarget, pick); });
    p.querySelector(".pcal").addEventListener("click", (e) => { e.stopPropagation(); toggleCalMenu(ev.cal, e.currentTarget, pick); });
    p.querySelector(".ptitle").textContent = ev.title || "(No title)";
    const days = Math.round((startOfDay(e) - startOfDay(s)) / 86400000);
    p.querySelector(".pwhen").textContent = !ev.allDay ? `${dayStr} · ${fmtRange(s, e)}`
      : days > 1 ? `${dayStr} – ${addDays(e, -1).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}`
      : `${dayStr} · All day`;
    const locEl = p.querySelector(".ploc");
    locEl.textContent = ev.location || "Add location";
    locEl.classList.toggle("empty", !ev.location);
    locEl.title = ev.location ? "Double-click to edit" : "Click to add a location";
    locEl.addEventListener("dblclick", () => editPopoverField(ev, "location", locEl));
    // An empty location is just a placeholder, so a single click is enough there.
    locEl.addEventListener("click", () => { if (!ev.location) editPopoverField(ev, "location", locEl); });
    p.querySelector("[data-close]").onclick = hidePopover;
    p.dataset.eventId = ev.id;
    const titleEl = p.querySelector(".ptitle");
    titleEl.title = "Double-click to edit";
    titleEl.addEventListener("dblclick", () => editPopoverField(ev, "title", titleEl));
    // Trash icon next to the close button, like Google.
    const del = document.createElement("button");
    del.type = "button";
    del.className = "icon-btn pdelete";
    const what = ev.taskId ? "task" : "event";
    del.setAttribute("aria-label", `Delete ${what}`);
    del.title = `Delete ${what}`;
    del.innerHTML = `<svg viewBox="0 0 24 24" width="20" height="20"><path d="M15 4V3H9v1H4v2h1v13c0 1.1.9 2 2 2h10c1.1 0 2-.9 2-2V6h1V4h-5zm2 15H7V6h10v13zM9 8h2v9H9zm4 0h2v9h-2z"/></svg>`;
    del.onclick = (e) => { e.stopPropagation(); deleteEvent(ev.id); };
    p.querySelector(".ptop").prepend(del);
    if (ev.taskId) {
      if (ev.done) p.querySelector(".ptitle").classList.add("done");
      const b = document.createElement("button");
      b.type = "button";
      b.className = "pdone";
      b.textContent = ev.done ? "Mark as not completed" : "Mark completed";
      b.onclick = (e) => { e.stopPropagation(); toggleTaskEvent(ev.id); };
      const row = document.createElement("div");
      row.className = "prow";
      row.innerHTML = `<div class="picon"></div><div class="pinfo"></div>`;
      row.querySelector(".pinfo").appendChild(b);
      p.querySelector(".pcal-row").after(row);
    }

    const bar = aiBar({
      placeholder: "Describe a change",
      hint: "e.g. “move to 3pm”, “make it 2 hours”, “rename to Design review”, “delete it”",
      busyText: "Updating…",
      onSubmit: (text) => popoverRequest(text, { eventId: ev.id }),
    });
    bar.wrap.classList.add("pedit");
    p.appendChild(bar.wrap);
    p.hidden = false;
    placePopover(anchor);
    if (FINE_POINTER) bar.input.focus(); // don't pop the keyboard up on phones
  }
  function hidePopover() {
    // Don't leave focus in a hidden input, or keyboard shortcuts would think we're still typing.
    if (el.popover.contains(document.activeElement)) document.activeElement.blur();
    el.popover.hidden = true;
    delete el.popover.dataset.eventId;
    clearDraft();
  }
  // Remove the click-to-create placeholder without re-rendering (keeps any dragged block attached).
  function clearDraft() {
    if (!draft || draft.busy) return;
    draft = null;
    document.querySelectorAll(".draft").forEach((n) => n.remove());
  }
  
  function placePopover(anchor) {
    const p = el.popover;
    const r = anchor.getBoundingClientRect();
    const pw = p.offsetWidth, ph = p.offsetHeight;
    let left = r.right + 8;
    if (left + pw > window.innerWidth - 8) left = r.left - pw - 8;
    left = Math.max(8, Math.min(left, window.innerWidth - pw - 8));
    const top = Math.min(Math.max(8, r.top), window.innerHeight - ph - 8);
    p.style.left = `${left}px`;
    p.style.top = `${top}px`;
  }

  // Click-to-create: the popover only asks for a description; Claude fills in the rest.
  const POP_PIN = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/></svg>`;
  const POP_CAL = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M19 4h-1V2h-2v2H8V2H6v2H5c-1.11 0-2 .9-2 2v14a2 2 0 0 0 2 2h14c1.1 0 2-.9 2-2V6c0-1.1-.9-2-2-2zm0 16H5V10h14v10zm0-12H5V6h14v2z"/></svg>`;

  // Click-to-create: laid out like the event popover — fill in title / location / calendar and Save,
  // or describe the event to the AI underneath (it also sees whatever was filled in).
  function showCreatePopover() {
    const s = parseISO(draft.start), e = parseISO(draft.end);
    const dayStr = s.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
    if (!draft.cal || !calById(draft.cal)) draft.cal = defaultCalId();
    const p = el.popover;
    p.innerHTML = `${CLOSE_BTN}
      <form class="pnew-manual" autocomplete="off">
        <div class="prow"><div class="picon"><button type="button" class="swatch swatch-btn" aria-label="Choose calendar" title="Choose calendar"></button></div>
          <div class="pinfo"><input class="pnew-title-input" type="text" maxlength="200" placeholder="Add title" aria-label="Title">
            <div class="pwhen"></div></div></div>
        <div class="prow ploc-row"><div class="picon">${POP_PIN}</div>
          <div class="pinfo"><input class="pnew-field" type="text" maxlength="200" placeholder="Add location" aria-label="Location"></div></div>
        <div class="prow pcal-row"><div class="picon">${POP_CAL}</div>
          <div class="pinfo"><button type="button" class="pcal" title="Choose calendar"></button></div></div>
        <div class="pnew-actions"><button type="submit" class="pnew-save">Save</button></div>
      </form>`;
    // Month view picks a day, not a time: a typed title saves as all-day; the AI reads a time from the text.
    p.querySelector(".pwhen").textContent = draft.dayOnly ? `${dayStr} · All day` : `${dayStr} · ${fmtRange(s, e)}`;
    p.querySelector("[data-close]").onclick = () => { if (draft) draft.busy = false; hidePopover(); };
    const form = p.querySelector(".pnew-manual");
    const titleInput = form.querySelector(".pnew-title-input");
    const locInput = form.querySelector(".pnew-field");
    const swatch = form.querySelector(".swatch-btn");
    const calBtn = form.querySelector(".pcal");
    const slot = { start: draft.start, end: draft.end, dayOnly: !!draft.dayOnly };
    titleInput.value = draft.title || "";
    locInput.value = draft.location || "";

    const paintCal = () => {
      const cal = calById(draft.cal);
      swatch.style.background = COLORS[cal.color] || COLORS.peacock;
      calBtn.textContent = cal.name;
      document.querySelectorAll(".draft").forEach((d) => { d.style.background = COLORS[cal.color] || COLORS.peacock; });
    };
    paintCal();
    const pickCal = (id) => { if (draft) draft.cal = id; p.querySelector(".cal-menu")?.remove(); paintCal(); };
    swatch.addEventListener("click", (ev) => { ev.stopPropagation(); toggleCalMenu(draft.cal, swatch, pickCal, { allowNew: false }); });
    calBtn.addEventListener("click", (ev) => { ev.stopPropagation(); toggleCalMenu(draft.cal, calBtn, pickCal, { allowNew: false }); });
    // Show the typed title on the placeholder block as you type.
    titleInput.addEventListener("input", () => {
      if (!draft) return;
      draft.title = titleInput.value;
      document.querySelectorAll(".draft").forEach((d) => {
        const t = d.querySelector(".etitle") || d;
        t.textContent = titleInput.value.trim() || "(No title)";
      });
    });
    locInput.addEventListener("input", () => { if (draft) draft.location = locInput.value; });

    form.addEventListener("submit", (ev) => {
      ev.preventDefault();
      if (!draft) return;
      const span = slot.dayOnly ? allDaySpan(s) : { start: slot.start, end: slot.end, allDay: false };
      const created = {
        id: uid(), title: titleInput.value.trim() || "(No title)", cal: draft.cal,
        location: locInput.value.trim(), ...span,
      };
      pushUndo();
      events.push(created);
      saveEvents();
      draft.busy = false;
      draft = null;
      el.popover.hidden = true;
      flashIds = new Set([created.id]);
      render();
      flashIds = new Set();
      setStatus(`Created “${escapeHTML(created.title)}”. <button class="undo" type="button">Undo</button>`);
    });
    for (const input of [titleInput, locInput]) {
      input.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" && !ev.isComposing) { ev.preventDefault(); form.requestSubmit(); }
        else if (ev.key === "Escape") { ev.preventDefault(); ev.stopPropagation(); if (draft) draft.busy = false; hidePopover(); }
      });
    }

    // …or describe it to the AI (any fields already filled in are passed along).
    const bar = aiBar({
      placeholder: "Or describe it",
      hint: draft.dayOnly
        ? "e.g. “Dinner with Sam at 7pm” — include a time (defaults to 9am)"
        : "e.g. “Coffee with Jordan at Blue Bottle” or “Dentist, 30 min”",
      busyText: "Creating…",
      onSubmit: async (text) => {
        if (draft) draft.busy = true; // keep the placeholder while the request runs
        const filled = {
          start: slot.start, end: slot.end,
          title: titleInput.value.trim(), location: locInput.value.trim(),
          calendar: (calById(draft && draft.cal) || {}).name || "",
        };
        try { return await popoverRequest(text, { slot: filled }); }
        finally { if (draft) draft.busy = false; }
      },
    });
    bar.wrap.classList.add("pedit");
    p.appendChild(bar.wrap);

    p.hidden = false;
    const anchor = document.querySelector(".draft");
    if (anchor) placePopover(anchor);
    if (FINE_POINTER) titleInput.focus(); // don't pop the keyboard up on phones
  }



  // ---------- AI command ----------
  async function callSchedule(command, { slot = null, eventId = null } = {}) {
    const res = await fetch("/api/schedule", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        command,
        events,
        tasks,
        calendars,
        slot,
        eventId,
        now: `${toISO(new Date())} (${new Date().toLocaleDateString(undefined, { weekday: "long" })})`,
        weekStart: dayKey(weekStart),
        weekEnd: dayKey(addDays(weekStart, 6)),
      }),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
    return data;
  }

  async function submitCommand(text) {
    const command = text.trim();
    if (!command) return;
    setBusy(true);
    setStatus(`<span class="spinner"></span>Working on it…`);
    try {
      const data = await callSchedule(command);
      const changed = applyActions(data.actions || [], data.task_actions || [], data.calendar_actions || []);
      el.aiInput.value = "";
      autosize();
      setStatus(escapeHTML(data.reply || "Done.") + (changed.length ? ` <button class="undo" type="button">Undo</button>` : ""));
    } catch (err) {
      setStatus(escapeHTML(err.message || "Something went wrong."), true);
    } finally {
      setBusy(false);
    }
  }

  // ---------- dragging: move, resize, and click/drag-to-create ----------
  const SNAP = 15;
  const hourPx = () => el.weekGrid.offsetHeight / 24;
  const dayCols = () => [...el.weekGrid.querySelectorAll(".day-col")];
  const colAtX = (x) => {
    const cols = dayCols();
    let i = cols.findIndex((c) => { const r = c.getBoundingClientRect(); return x >= r.left && x < r.right; });
    if (i === -1) i = x < cols[0].getBoundingClientRect().left ? 0 : 6;
    return i;
  };
  const minuteAtY = (y) => (y - el.weekGrid.getBoundingClientRect().top) / hourPx() * 60;
  const snap = (m, fn = Math.round) => fn(m / SNAP) * SNAP;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const atMinute = (dayIdx, min) => new Date(addDays(weekStart, dayIdx).getTime() + min * 60000);

  function setBlockTime(block, s, e) {
    const top = s.getHours() * 60 + s.getMinutes();
    const mins = Math.max((e - s) / 60000, 15);
    block.style.top = `calc(var(--hour) * ${top / 60})`;
    block.style.height = `calc(var(--hour) * ${mins / 60} - 2px)`;
    block.classList.toggle("compact", mins < 45);
    const t = block.querySelector(".etime");
    if (t) t.textContent = fmtRange(s, e);
  }

  el.weekGrid.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || drag || e.target.closest(".echeck")) return;
    const evBlock = e.target.closest(".event:not(.draft)");
    const col = e.target.closest(".day-col");
    if (!col) return;
    const pointerMin = minuteAtY(e.clientY);

    if (evBlock) {
      const ev = events.find((x) => x.id === evBlock.dataset.id);
      if (!ev) return;
      const s = parseISO(ev.start), en = parseISO(ev.end);
      const dayIdx = Number(col.dataset.day);
      drag = {
        mode: e.target.classList.contains("resize") ? "resize" : "move",
        ev, block: evBlock, x0: e.clientX, y0: e.clientY, moved: false,
        duration: en - s, newStart: s, newEnd: en,
        // where inside the event the pointer grabbed it (minutes from event start)
        grab: pointerMin - (s - addDays(weekStart, dayIdx)) / 60000,
      };
    } else {
      // First click on empty space while a popover is open just closes it (like Google).
      if (!el.popover.hidden) { hidePopover(); drag = { mode: "dismiss" }; el.weekGrid.setPointerCapture(e.pointerId); return; }
      drag = { mode: "create", day: Number(col.dataset.day), anchorMin: pointerMin, x0: e.clientX, y0: e.clientY, moved: false };
    }
    el.weekGrid.setPointerCapture(e.pointerId);
  });

  el.weekGrid.addEventListener("pointermove", (e) => {
    if (!drag || drag.mode === "dismiss") return;
    drag.px = e.clientX; drag.py = e.clientY;
    if (!drag.moved) {
      if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 4) return;
      drag.moved = true;
      hidePopover();
      if (drag.block) drag.block.classList.add("dragging");
      gridAutoScroll();
    }
    weekDragMove();
  });

  // Speed for scrolling the week grid when the pointer is near (or past) its top/bottom edge.
  function edgeScrollSpeed(y) {
    const r = el.weekBody.getBoundingClientRect();
    const EDGE = 48;
    if (y < r.top + EDGE) return -Math.min(20, Math.ceil((r.top + EDGE - y) / 3));
    if (y > r.bottom - EDGE) return Math.min(20, Math.ceil((y - (r.bottom - EDGE)) / 3));
    return 0;
  }
  function gridAutoScroll() {
    if (!drag || !drag.moved || !["move", "resize", "create"].includes(drag.mode)) return;
    const dy = edgeScrollSpeed(drag.py);
    if (dy) {
      const before = el.weekBody.scrollTop;
      el.weekBody.scrollTop += dy;
      if (el.weekBody.scrollTop !== before) weekDragMove(); // keep the block under the pointer
    }
    requestAnimationFrame(gridAutoScroll);
  }

  function weekDragMove() {
    const m = minuteAtY(drag.py);

    if (drag.mode === "move") {
      const dayIdx = colAtX(drag.px);
      const durMin = drag.duration / 60000;
      const startMin = clamp(snap(m - drag.grab), 0, Math.max(0, 1440 - Math.min(durMin, 1440)));
      drag.newStart = atMinute(dayIdx, startMin);
      drag.newEnd = new Date(drag.newStart.getTime() + drag.duration);
      const col = dayCols()[dayIdx];
      if (drag.block.parentNode !== col) col.appendChild(drag.block);
      drag.block.style.left = "1px";
      drag.block.style.width = "calc(100% - 10px)";
      setBlockTime(drag.block, drag.newStart, drag.newEnd > atMinute(dayIdx, 1440) ? atMinute(dayIdx, 1440) : drag.newEnd);
      if (drag.newEnd > atMinute(dayIdx, 1440)) drag.block.querySelector(".etime").textContent = fmtRange(drag.newStart, drag.newEnd);
    } else if (drag.mode === "resize") {
      // The handle sits on the segment that holds the end time; resize within that day.
      const s = parseISO(drag.ev.start);
      const endDay = startOfDay(new Date(parseISO(drag.ev.end).getTime() - 1));
      let end = new Date(endDay.getTime() + clamp(snap(m), 0, 1440) * 60000);
      if (end - s < SNAP * 60000) end = new Date(s.getTime() + SNAP * 60000);
      drag.newEnd = end;
      setBlockTime(drag.block, s > endDay ? s : endDay, end);
      drag.block.querySelector(".etime").textContent = fmtRange(s, end);
    } else if (drag.mode === "create") {
      const a = snap(drag.anchorMin, Math.floor), b = snap(m, Math.ceil);
      const lo = clamp(Math.min(a, b), 0, 1440 - SNAP);
      const hi = clamp(Math.max(a + SNAP, b), lo + SNAP, 1440);
      draft = { start: toISO(atMinute(drag.day, lo)), end: toISO(atMinute(drag.day, hi)) };
      renderGrid();
    }
  }

  function endDrag(e, cancelled) {
    if (!drag) return;
    const d = drag;
    drag = null;
    try { el.weekGrid.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    // The browser fires "click" right after pointerup; swallow just that one.
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 0);

    if (d.mode === "dismiss") return;
    if (cancelled) { draft = null; render(); return; }

    if (d.mode === "create") {
      if (!d.moved) {
        // Single click: a one-hour slot starting at the half hour that was clicked.
        const start = clamp(snap(d.anchorMin, Math.floor) - (snap(d.anchorMin, Math.floor) % 30), 0, 1380);
        draft = { start: toISO(atMinute(d.day, start)), end: toISO(atMinute(d.day, start + 60)) };
      }
      renderGrid();
      showCreatePopover();
      return;
    }

    if (!d.moved) { showPopover(d.ev, d.block); return; }

    const newStart = toISO(d.mode === "move" ? d.newStart : parseISO(d.ev.start));
    const newEnd = toISO(d.newEnd);
    if (newStart === d.ev.start && newEnd === d.ev.end) { render(); return; }
    pushUndo();
    d.ev.start = newStart;
    d.ev.end = newEnd;
    saveEvents();
    flashIds = new Set([d.ev.id]);
    render();
    flashIds = new Set();
    setStatus(`${d.mode === "move" ? "Moved" : "Resized"} “${escapeHTML(d.ev.title)}”. <button class="undo" type="button">Undo</button>`);
  }
  el.weekGrid.addEventListener("pointerup", (e) => endDrag(e, false));
  el.weekGrid.addEventListener("pointercancel", (e) => endDrag(e, true));
  // A finished drag/click on the grid shouldn't also count as an outside click that closes popovers.
  window.addEventListener("click", (e) => {
    if (suppressClick) { suppressClick = false; e.stopPropagation(); }
  }, true);

  function applyActions(actions, taskActions = [], calActions = []) {
    if (!actions.length && !taskActions.length && !calActions.length) return [];
    pushUndo();
    const changed = [];
    // Calendars first, so events in this same reply can refer to a newly created calendar by name.
    for (const c of calActions) {
      const color = COLORS[c.color] ? c.color : "peacock";
      if (c.type === "create") {
        const name = c.name.trim();
        if (!name || calByName(name)) continue;
        const cal = { id: "cal-" + uid(), name, color, visible: true };
        calendars.push(cal);
        changed.push(cal);
      } else if (c.type === "update") {
        const cal = calById(c.id);
        if (!cal) continue;
        const name = c.name.trim();
        if (name && !(calByName(name) && calByName(name) !== cal)) cal.name = name;
        cal.color = color;
        cal.visible = c.visible !== false;
        changed.push(cal);
      } else if (c.type === "delete" && calendars.length > 1) {
        const cal = calById(c.id);
        if (!cal) continue;
        calendars = calendars.filter((x) => x !== cal);
        events = events.filter((ev) => ev.cal !== cal.id);
        changed.push(cal);
      }
    }
    for (const a of actions) {
      const target = calByName(a.calendar);
      const fields = { title: a.title, start: a.start, end: a.end, location: a.location || "", allDay: !!a.all_day };
      if (target) fields.cal = target.id;
      else if (a.type === "create") fields.cal = defaultCalId();
      if (fields.allDay && fields.start) {
        // Normalise to whole days: midnight → midnight after the last day.
        const s0 = startOfDay(parseISO(fields.start));
        let e0 = fields.end ? parseISO(fields.end) : addDays(s0, 1);
        if (e0 <= s0) e0 = addDays(s0, 1);
        else if (e0.getHours() || e0.getMinutes()) e0 = addDays(startOfDay(e0), 1);
        fields.start = toISO(s0);
        fields.end = toISO(e0);
      } else if (fields.end && fields.start && parseISO(fields.end) <= parseISO(fields.start)) {
        fields.end = toISO(new Date(parseISO(fields.start).getTime() + 3600000));
      }
      if (a.type === "create") {
        const ev = { id: uid(), ...fields };
        events.push(ev);
        changed.push(ev);
      } else if (a.type === "update") {
        const ev = events.find((x) => x.id === a.id);
        if (ev) { Object.assign(ev, fields); changed.push(ev); }
      } else if (a.type === "delete") {
        const i = events.findIndex((x) => x.id === a.id);
        if (i !== -1) { changed.push(events[i]); events.splice(i, 1); }
      }
    }
    for (const t of taskActions) {
      if (t.type === "create" && t.title.trim()) {
        const task = { id: uid(), title: t.title.trim() };
        tasks.unshift(task);
        changed.push(task);
      } else if (t.type === "update") {
        const task = tasks.find((x) => x.id === t.id);
        if (task && t.title.trim()) { renameTask(task.id, t.title.trim()); changed.push(task); }
      } else if (t.type === "complete") {
        const task = tasks.find((x) => x.id === t.id);
        if (task) { changed.push(task); setTaskDone(task.id, true, task.title); }
      }
    }
    saveCalendars();
    saveEvents();
    saveTasks();
    renderCalendars();
    renderTasks(new Set(taskActions.filter((t) => t.type !== "complete").map((t) => t.id)));

    // Jump to the week of the first created/updated event if it's not visible.
    const target = actions.find((a) => a.type !== "delete");
    if (target) {
      const d = parseISO(target.start);
      const visible = view === "week"
        ? d >= weekStart && d < addDays(weekStart, 7)
        : d.getMonth() === monthStart.getMonth() && d.getFullYear() === monthStart.getFullYear();
      if (!visible) goToDate(d, false);
    }
    flashIds = new Set(changed.map((e) => e.id));
    render();
    flashIds = new Set();
    return changed;
  }

  // Snapshot-based history. Any new change clears the redo stack.
  const HISTORY_LIMIT = 100;
  const snapshot = () => JSON.stringify({ events, tasks, calendars });
  function pushUndo() {
    undoStack.push(snapshot());
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    redoStack = [];
  }
  function restore(snap) {
    const o = JSON.parse(snap);
    events = o.events;
    tasks = o.tasks;
    if (o.calendars) {
      const shown = new Map(calendars.map((c) => [c.id, c.visible]));
      calendars = o.calendars.map((c) => (shown.has(c.id) ? { ...c, visible: shown.get(c.id) } : c));
    }
    saveCalendars();
    saveEvents();
    saveTasks();
    hidePopover();
    render();
    renderTasks();
    renderCalendars();
  }
  function undo() {
    if (!undoStack.length) { setStatus("Nothing to undo."); return; }
    redoStack.push(snapshot());
    restore(undoStack.pop());
    setStatus(`Undone. <button class="redo" type="button">Redo</button>`);
  }
  function redo() {
    if (!redoStack.length) { setStatus("Nothing to redo."); return; }
    undoStack.push(snapshot());
    restore(redoStack.pop());
    setStatus(`Redone. <button class="undo" type="button">Undo</button>`);
  }

  const escapeHTML = (s) => String(s).replace(/[&<>"']/g, (c) =>
    ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]);
  function setStatus(html, isError = false) {
    el.aiStatus.innerHTML = html;
    el.aiStatus.classList.toggle("error", isError);
    el.aiHints.hidden = true;
  }
  function setBusy(b) {
    el.aiSend.disabled = b;
    el.aiInput.readOnly = b;
  }
  function autosize() {
    el.aiInput.style.height = "auto";
    el.aiInput.style.height = `${Math.min(el.aiInput.scrollHeight, 120)}px`;
    el.aiInput.style.overflowY = el.aiInput.scrollHeight > 120 ? "auto" : "hidden";
  }

  // ---------- month view ----------
  const CHIP_H = 22; // px per event row in a month cell

  function eventsOnDay(day) {
    const ds = startOfDay(day), de = addDays(ds, 1);
    return events
      .filter(isVisible)
      .map((ev) => ({ ev, s: parseISO(ev.start), e: parseISO(ev.end) }))
      .filter(({ s, e }) => s < de && e > ds)
      .sort((a, b) => (b.ev.allDay ? 1 : 0) - (a.ev.allDay ? 1 : 0) || a.s - b.s || b.e - a.e);
  }

  function monthRange() {
    const first = startOfWeek(monthStart);
    const lastOfMonth = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 0);
    const rows = Math.ceil((Math.round((lastOfMonth - first) / 86400000) + 1) / 7);
    return { first, rows };
  }

  function chipEl(ev, s, day) {
    const c = document.createElement("div");
    c.className = "mchip" + (ev.allDay ? " allday" : "") + (flashIds.has(ev.id) ? " flash" : "");
    c.dataset.id = ev.id;
    c.dataset.date = dayKey(day);
    if (ev.taskId) {
      c.classList.add("is-task");
      if (ev.done) c.classList.add("done");
    }
    if (ev.allDay) {
      // Filled bar, like Google's all-day events.
      c.style.background = colorOf(ev);
      if (colorNameOf(ev) === "banana") c.style.color = "#202124";
      c.innerHTML = `<span class="mtitle"></span>`;
      c.querySelector(".mtitle").textContent = ev.title || "(No title)";
      if (ev.taskId) c.prepend(checkboxEl(ev));
      return c;
    }
    c.innerHTML = `<span class="mdot"></span><span class="mtime"></span><span class="mtitle"></span>`;
    c.querySelector(".mdot").style.background = colorOf(ev);
    // A multi-day event shows its start time only on the first day.
    c.querySelector(".mtime").textContent = sameDay(s, day) ? fmtTime(s) : "";
    c.querySelector(".mtitle").textContent = ev.title || "(No title)";
    if (ev.taskId) {
      // Tasks show a checkbox (in the event colour) where other events show a dot.
      c.querySelector(".mdot").replaceWith(checkboxEl(ev));
    }
    return c;
  }

  function renderMonth() {
    const { first, rows } = monthRange();
    const today = new Date();
    el.monthHead.innerHTML = DAY_SHORT.map((d) => `<div>${d}</div>`).join("");
    const grid = el.monthGrid;
    grid.style.gridTemplateRows = `repeat(${rows}, 1fr)`;
    grid.innerHTML = "";

    const cells = [];
    for (let i = 0; i < rows * 7; i++) {
      const d = addDays(first, i);
      const cell = document.createElement("div");
      cell.className = "mcell" + (d.getMonth() !== monthStart.getMonth() ? " other" : "");
      cell.dataset.date = dayKey(d);
      const label = d.getDate() === 1 ? `${MONTHS[d.getMonth()].slice(0, 3)} 1` : d.getDate();
      cell.innerHTML = `<div class="mhead allday-zone"><button class="mdate${sameDay(d, today) ? " today" : ""}" title="Open this week">${label}</button></div><div class="mlist"></div>`;
      grid.appendChild(cell);
      cells.push({ cell, d });
    }

    // How many chips fit is decided by the actual cell height.
    const cellH = cells[0].cell.clientHeight;
    const fit = Math.max(1, Math.floor((cellH - 30) / CHIP_H));
    for (const { cell, d } of cells) {
      const list = cell.querySelector(".mlist");
      const items = eventsOnDay(d);
      const showDraft = draft && draft.dayOnly && sameDay(parseISO(draft.start), d);
      const slots = fit - (showDraft ? 1 : 0);
      const shown = items.length > slots ? Math.max(0, slots - 1) : items.length;
      items.slice(0, shown).forEach(({ ev, s }) => list.appendChild(chipEl(ev, s, d)));
      if (items.length > shown) {
        const more = document.createElement("button");
        more.className = "mmore";
        more.textContent = `${items.length - shown} more`;
        list.appendChild(more);
      }
      if (showDraft) {
        const dc = document.createElement("div");
        dc.className = "mchip mdraft draft";
        dc.textContent = draft.title || "(No title)";
        dc.style.background = draftColor();
        list.appendChild(dc);
      }
    }
  }

  // "N more" popover: every event on that day.
  function showDayPopover(day, anchor) {
    clearDraft();
    const p = el.popover;
    p.innerHTML = `
      <div class="ptop"><button class="icon-btn" aria-label="Close" data-close>
        <svg viewBox="0 0 24 24" width="20" height="20"><path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
      </button></div>
      <div class="pday"><div class="pday-name">${DAY_SHORT[day.getDay()]}</div><div class="pday-num">${day.getDate()}</div></div>
      <div class="pday-list"></div>`;
    const list = p.querySelector(".pday-list");
    eventsOnDay(day).forEach(({ ev, s }) => list.appendChild(chipEl(ev, s, day)));
    list.addEventListener("click", (e) => {
      if (e.target.closest(".echeck")) return; // handled by the global checkbox handler
      const c = e.target.closest(".mchip");
      const ev = c && events.find((x) => x.id === c.dataset.id);
      if (ev) { e.stopPropagation(); showPopover(ev, anchor); }
    });
    p.querySelector("[data-close]").onclick = hidePopover;
    p.hidden = false;
    placePopover(anchor);
  }

  const cellAt = (x, y) => {
    const n = document.elementFromPoint(x, y);
    return n && n.closest(".mcell");
  };

  el.monthGrid.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || drag || e.target.closest(".echeck")) return;
    const cell = e.target.closest(".mcell");
    if (!cell) return;
    const chip = e.target.closest(".mchip:not(.draft)");
    const base = { x0: e.clientX, y0: e.clientY, moved: false, cell };
    if (chip) drag = { ...base, mode: "mmove", chip, ev: events.find((x) => x.id === chip.dataset.id), from: chip.dataset.date };
    else if (e.target.closest(".mmore")) drag = { ...base, mode: "mmore", anchor: e.target.closest(".mmore") };
    else if (e.target.closest(".mdate")) drag = { ...base, mode: "mdate" };
    else if (!el.popover.hidden) { hidePopover(); drag = { mode: "dismiss" }; }
    else drag = { ...base, mode: "mcreate" };
    if (drag.mode === "mmove" && !drag.ev) { drag = null; return; }
    el.monthGrid.setPointerCapture(e.pointerId);
  });

  el.monthGrid.addEventListener("pointermove", (e) => {
    if (!drag || drag.mode !== "mmove") return;
    if (!drag.moved) {
      if (Math.hypot(e.clientX - drag.x0, e.clientY - drag.y0) < 4) return;
      drag.moved = true;
      hidePopover();
      drag.chip.classList.add("dragging");
    }
    const target = cellAt(e.clientX, e.clientY);
    if (target && target !== drag.over) {
      el.monthGrid.querySelectorAll(".drop").forEach((n) => n.classList.remove("drop"));
      target.classList.add("drop");
      target.querySelector(".mlist").prepend(drag.chip);
      drag.over = target;
    }
  });

  function endMonthDrag(e, cancelled) {
    if (!drag || !["mmove", "mmore", "mdate", "mcreate", "dismiss"].includes(drag.mode)) return;
    const d = drag;
    drag = null;
    try { el.monthGrid.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 0);
    if (d.mode === "dismiss") return;
    if (cancelled) { renderMonth(); return; }

    const date = parseISO(d.cell.dataset.date);
    if (d.mode === "mdate") { view = "week"; saveViewPref(); goToDate(date); return; }
    if (d.mode === "mmore") { showDayPopover(date, d.anchor); return; }
    if (d.mode === "mcreate") {
      draft = { start: toISO(new Date(date.getTime() + 9 * 3600000)), end: toISO(new Date(date.getTime() + 10 * 3600000)), dayOnly: true };
      renderMonth();
      showCreatePopover();
      return;
    }
    // mmove
    if (!d.moved) { showPopover(d.ev, d.chip); return; }
    const target = d.over ? parseISO(d.over.dataset.date) : parseISO(d.from);
    const shift = Math.round((target - parseISO(d.from)) / 86400000);
    if (!shift) { renderMonth(); return; }
    pushUndo();
    d.ev.start = toISO(addDays(parseISO(d.ev.start), shift));
    d.ev.end = toISO(addDays(parseISO(d.ev.end), shift));
    saveEvents();
    flashIds = new Set([d.ev.id]);
    renderMonth();
    flashIds = new Set();
    setStatus(`Moved “${escapeHTML(d.ev.title)}”. <button class="undo" type="button">Undo</button>`);
  }
  el.monthGrid.addEventListener("pointerup", (e) => endMonthDrag(e, false));
  el.monthGrid.addEventListener("pointercancel", (e) => endMonthDrag(e, true));

  // ---------- tasks placed on the calendar ----------
  // An event with a taskId came from a task. Checking it marks every event of that task done and
  // takes the task off the list; unchecking puts the task back.
  function checkboxEl(ev) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "echeck";
    b.dataset.id = ev.id;
    b.setAttribute("aria-label", ev.done ? "Mark as not completed" : "Mark completed");
    b.title = ev.done ? "Mark as not completed" : "Mark completed";
    b.innerHTML = CHECK_SVG;
    b.style.setProperty("--c", colorOf(ev));
    return b;
  }
  function setTaskDone(taskId, done, title) {
    events.forEach((x) => { if (x.taskId === taskId) x.done = done; });
    if (done) tasks = tasks.filter((t) => t.id !== taskId);
    else if (!tasks.some((t) => t.id === taskId)) tasks.unshift({ id: taskId, title });
  }
  function toggleTaskEvent(id) {
    const ev = events.find((x) => x.id === id);
    if (!ev || !ev.taskId) return;
    pushUndo();
    const done = !ev.done;
    setTaskDone(ev.taskId, done, ev.title);
    saveEvents();
    saveTasks();
    const popoverOpenFor = !el.popover.hidden && el.popover.dataset.eventId === id;
    render();
    renderTasks();
    if (popoverOpenFor) {
      const anchor = document.querySelector(`[data-id="${id}"]:not(.echeck)`);
      if (anchor) showPopover(ev, anchor); else hidePopover();
    }
    setStatus(`${done ? "Completed" : "Reopened"} “${escapeHTML(ev.title)}”. <button class="undo" type="button">Undo</button>`);
  }

  // Inline editing of a popover field ("title" or "location").
  // Renaming a task placed on the calendar renames the task and all of its calendar entries.
  function editPopoverField(ev, field, node) {
    if (node.querySelector("input")) return;
    const isTitle = field === "title";
    const current = ev[field] || "";
    const input = document.createElement("input");
    input.className = isTitle ? "ptitle-input" : "pfield-input";
    input.type = "text";
    input.maxLength = 200;
    input.value = current;
    input.placeholder = isTitle ? "Title" : "Add location";
    input.setAttribute("aria-label", isTitle ? "Title" : "Location");
    node.classList.remove("empty");
    node.textContent = "";
    node.appendChild(input);
    input.focus();
    input.select();

    const restore = () => {
      node.textContent = current || (isTitle ? "(No title)" : "Add location");
      if (!isTitle) node.classList.toggle("empty", !current);
    };
    let done = false;
    const finish = (save) => {
      if (done) return;
      done = true;
      const val = input.value.trim();
      // A title can't be blank; a blank location removes it.
      if (!save || val === current || (isTitle && !val)) { restore(); return; }
      pushUndo();
      if (isTitle && ev.taskId) {
        events.forEach((x) => { if (x.taskId === ev.taskId) x.title = val; });
        const task = tasks.find((t) => t.id === ev.taskId);
        if (task) task.title = val;
        saveTasks();
        renderTasks();
      } else {
        ev[field] = val;
      }
      saveEvents();
      const popoverOpen = !el.popover.hidden && el.popover.dataset.eventId === ev.id;
      flashIds = new Set([ev.id]);
      render();
      flashIds = new Set();
      if (popoverOpen) {
        // Re-open on the freshly drawn event so the popover shows the new value.
        const anchor = document.querySelector(`[data-id="${ev.id}"]:not(.echeck)`);
        if (anchor) showPopover(ev, anchor); else node.textContent = val;
      }
      const msg = isTitle ? `Renamed to “${escapeHTML(val)}”.`
        : val ? `Location set to “${escapeHTML(val)}”.` : "Location removed.";
      setStatus(`${msg} <button class="undo" type="button">Undo</button>`);
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); finish(true); }
      else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finish(false); }
    });
    input.addEventListener("blur", () => finish(true));
  }

  // Delete from the popover. A task placed on the calendar is deleted as a task: all of its
  // calendar entries and its line in the task list go (Google behaves the same way).
  function deleteEvent(id) {
    const ev = events.find((x) => x.id === id);
    if (!ev) return;
    pushUndo();
    if (ev.taskId) {
      events = events.filter((x) => x.taskId !== ev.taskId);
      tasks = tasks.filter((t) => t.id !== ev.taskId);
      saveTasks();
      renderTasks();
    } else {
      events = events.filter((x) => x.id !== id);
    }
    saveEvents();
    hidePopover();
    render();
    setStatus(`Deleted ${ev.taskId ? "task " : ""}“${escapeHTML(ev.title)}”. <button class="undo" type="button">Undo</button>`);
  }

  // A task and its calendar entry always share one title.
  function renameTask(taskId, title) {
    const task = tasks.find((t) => t.id === taskId);
    if (task) task.title = title;
    events.forEach((x) => { if (x.taskId === taskId) x.title = title; });
  }

  // ---------- task list (sidebar) ----------
  const CHECK_SVG = `<svg viewBox="0 0 24 24" width="14" height="14"><path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`;

  function renderTasks(flash = new Set()) {
    el.taskList.innerHTML = "";
    for (const t of tasks) {
      const li = document.createElement("li");
      li.className = "task" + (flash.has(t.id) ? " flash" : "");
      li.dataset.id = t.id;
      li.innerHTML = `<button class="tcheck" type="button" aria-label="Mark complete" title="Mark complete">${CHECK_SVG}</button><span class="tbody"><span class="ttitle"></span><span class="tsched"></span></span>`;
      li.querySelector(".ttitle").textContent = t.title;
      li.title = "Click to edit · drag onto the calendar to schedule";
      el.taskList.appendChild(li);
    }
    el.taskEmpty.hidden = tasks.length > 0;
    updateTaskSchedules();
  }
  // The little "Tue, Nov 17 · 3pm" under a scheduled task (refreshed on every calendar render).
  function updateTaskSchedules() {
    el.taskList.querySelectorAll("li.task[data-id]").forEach((li) => {
      const label = li.querySelector(".tsched");
      if (!label) return;
      const ev = events.find((x) => x.taskId === li.dataset.id);
      if (!ev) { label.textContent = ""; label.hidden = true; return; }
      const s = parseISO(ev.start);
      label.textContent = ev.allDay ? `${shortDate(s)} · All day` : `${shortDate(s)} · ${fmtTime(s)}`;
      label.hidden = false;
    });
  }

  // Inline editor for a task title. For a new task, `li` is a fresh row not yet in `tasks`.
  function editTask(li, isNew = false) {
    if (!li || li.querySelector(".tinput")) return;
    const task = tasks.find((t) => t.id === li.dataset.id);
    const span = li.querySelector(".ttitle");
    const input = document.createElement("input");
    input.className = "tinput";
    input.type = "text";
    input.maxLength = 200;
    input.placeholder = "Title";
    input.value = task ? task.title : "";
    input.setAttribute("aria-label", "Task title");
    span.replaceWith(input);
    li.classList.add("editing");
    input.focus();
    input.setSelectionRange(input.value.length, input.value.length);

    let done = false;
    const finish = (save) => {
      if (done) return;
      done = true;
      const val = input.value.trim();
      if (save && isNew && val) {
        pushUndo();
        tasks.unshift({ id: li.dataset.id, title: val });
        saveTasks();
      } else if (save && task && val && val !== task.title) {
        pushUndo();
        renameTask(task.id, val);
        saveTasks();
        saveEvents();
        render();
      }
      renderTasks();
    };
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); finish(true); }
      else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); finish(false); }
    });
    input.addEventListener("blur", () => finish(true));
  }

  function addTask() {
    const existing = el.taskList.querySelector("li.new .tinput");
    if (existing) { existing.focus(); return; }
    const li = document.createElement("li");
    li.className = "task new";
    li.dataset.id = uid();
    li.innerHTML = `<span class="tcheck" aria-hidden="true"></span><span class="ttitle"></span>`;
    el.taskList.prepend(li);
    el.taskEmpty.hidden = true;
    editTask(li, true);
  }

  function completeTask(id) {
    const li = el.taskList.querySelector(`li[data-id="${id}"]`);
    const task = tasks.find((t) => t.id === id);
    if (!task || !li || li.classList.contains("done")) return;
    li.classList.add("done"); // show the check + strike-through briefly, like Google Tasks
    setTimeout(() => {
      pushUndo();
      setTaskDone(id, true, task.title);
      saveTasks();
      saveEvents();
      renderTasks();
      if (events.some((x) => x.taskId === id)) render();
      setStatus(`Completed “${escapeHTML(task.title)}”. <button class="undo" type="button">Undo</button>`);
    }, 350);
  }

  // ----- drag a task onto the calendar -----
  let tdrag = null;
  const shortDate = (d) => d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });

  el.taskList.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || tdrag || drag) return;
    const li = e.target.closest("li.task");
    if (!li || li.classList.contains("new") || li.classList.contains("editing")) return;
    if (e.target.closest(".tcheck")) return;
    const task = tasks.find((t) => t.id === li.dataset.id);
    if (!task) return;
    tdrag = { task, x0: e.clientX, y0: e.clientY, x: e.clientX, y: e.clientY, moved: false, target: null };
    el.taskList.setPointerCapture(e.pointerId);
  });

  el.taskList.addEventListener("pointermove", (e) => {
    if (!tdrag) return;
    tdrag.x = e.clientX; tdrag.y = e.clientY;
    if (!tdrag.moved) {
      if (Math.hypot(e.clientX - tdrag.x0, e.clientY - tdrag.y0) < 5) return;
      tdrag.moved = true;
      hidePopover();
      tdrag.ghost = document.createElement("div");
      tdrag.ghost.className = "task-ghost";
      tdrag.ghost.innerHTML = `<div class="tg-title"></div><div class="tg-where"></div>`;
      tdrag.ghost.querySelector(".tg-title").textContent = tdrag.task.title;
      document.body.appendChild(tdrag.ghost);
      document.body.classList.add("task-dragging"); // shows the "All day" masks
      autoScroll();
    }
    updateTaskTarget();
  });

  // Work out what dropping at the current pointer position would create, and preview it.
  function updateTaskTarget() {
    const t = tdrag;
    t.ghost.style.left = `${t.x + 14}px`;
    t.ghost.style.top = `${t.y + 10}px`;
    document.querySelectorAll(".zone-hot").forEach((n) => n.classList.remove("zone-hot"));
    document.querySelectorAll(".mcell.drop").forEach((n) => n.classList.remove("drop"));
    document.querySelectorAll(".event.preview").forEach((n) => n.remove());
    t.target = null;

    const n = document.elementFromPoint(t.x, t.y);
    const zone = n && n.closest(".allday-zone");
    const col = n && n.closest(".day-col");
    const cell = n && n.closest(".mcell");
    if (zone) {
      const date = view === "week" ? addDays(weekStart, Number(zone.dataset.day)) : parseISO(zone.closest(".mcell").dataset.date);
      zone.classList.add("zone-hot");
      t.target = { allDay: true, date };
    } else if (view === "week" && col) {
      const dayIdx = Number(col.dataset.day);
      const startMin = clamp(snap(minuteAtY(t.y), Math.floor), 0, 1440 - 60);
      const start = atMinute(dayIdx, startMin);
      t.target = { allDay: false, start };
      const pv = document.createElement("div");
      pv.className = "event preview";
      pv.style.setProperty("--pc", COLORS[calById(tasksCalId()).color] || COLORS.peacock);
      pv.innerHTML = `<div class="etitle"></div><div class="etime"></div>`;
      pv.querySelector(".etitle").textContent = t.task.title;
      pv.style.left = "1px";
      pv.style.width = "calc(100% - 10px)";
      setBlockTime(pv, start, new Date(start.getTime() + 3600000));
      col.appendChild(pv);
    } else if (view === "month" && cell) {
      cell.classList.add("drop");
      const d = parseISO(cell.dataset.date);
      t.target = { allDay: false, start: new Date(d.getTime() + 9 * 3600000) };
    }
    const where = t.ghost.querySelector(".tg-where");
    const verb = events.some((x) => x.taskId === t.task.id) ? "Move to " : "";
    where.textContent = !t.target ? "Drop on the calendar"
      : verb + (t.target.allDay ? `All day · ${shortDate(t.target.date)}`
      : `${shortDate(t.target.start)}, ${fmtRange(t.target.start, new Date(t.target.start.getTime() + 3600000))}`);
    t.ghost.classList.toggle("no-target", !t.target);
  }

  // Scroll the week grid while dragging near its top or bottom edge.
  function autoScroll() {
    if (!tdrag || !tdrag.moved) return;
    if (view === "week") {
      const r = el.weekBody.getBoundingClientRect();
      // Only over the grid itself (not while passing over the header or sidebar).
      const over = tdrag.x > r.left && tdrag.x < r.right && tdrag.y > r.top - 4 && tdrag.y < r.bottom + 40;
      const dy = over ? edgeScrollSpeed(tdrag.y) : 0;
      if (dy) {
        el.weekBody.scrollTop += dy;
        updateTaskTarget();
      }
    }
    requestAnimationFrame(autoScroll);
  }

  function endTaskDrag(e, cancelled) {
    if (!tdrag) return;
    const t = tdrag;
    tdrag = null;
    try { el.taskList.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    if (t.ghost) t.ghost.remove();
    document.body.classList.remove("task-dragging");
    document.querySelectorAll(".zone-hot").forEach((n) => n.classList.remove("zone-hot"));
    document.querySelectorAll(".mcell.drop").forEach((n) => n.classList.remove("drop"));
    document.querySelectorAll(".event.preview").forEach((n) => n.remove());

    if (!t.moved) {
      // A plain click: edit the title. Re-find the row in case a blur re-rendered the list.
      if (!cancelled) editTask(el.taskList.querySelector(`li[data-id="${t.task.id}"]`));
      return;
    }
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 0);
    if (cancelled || !t.target) return;

    // A task has one calendar entry (like Google): if it's already scheduled, move that entry.
    const existing = events.find((x) => x.taskId === t.task.id);
    const span = t.target.allDay ? allDaySpan(t.target.date)
      : { start: toISO(t.target.start), end: toISO(new Date(t.target.start.getTime() + 3600000)), allDay: false };
    pushUndo();
    let ev;
    if (existing) {
      ev = existing;
      Object.assign(ev, span, { title: t.task.title, done: false });
    } else {
      ev = { id: uid(), title: t.task.title, cal: tasksCalId(), location: "", taskId: t.task.id, done: false, ...span };
      events.push(ev);
    }
    saveEvents();
    flashIds = new Set([ev.id]);
    render();
    flashIds = new Set();
    const when = t.target.allDay ? `${shortDate(t.target.date)} (all day)` : `${shortDate(t.target.start)} at ${fmtTime(t.target.start)}`;
    setStatus(`${existing ? "Moved" : "Scheduled"} “${escapeHTML(ev.title)}” ${existing ? "to" : "for"} ${escapeHTML(when)}. <button class="undo" type="button">Undo</button>`);
  }
  el.taskList.addEventListener("pointerup", (e) => endTaskDrag(e, false));
  el.taskList.addEventListener("pointercancel", (e) => endTaskDrag(e, true));
  el.taskList.addEventListener("click", (e) => {
    const c = e.target.closest("button.tcheck");
    if (c) completeTask(c.closest("li").dataset.id);
  });
  el.taskAdd.addEventListener("click", (e) => { e.stopPropagation(); addTask(); });

  // ----- all-day events in the week header: click for details, drag to another day -----
  let hdrag = null;
  el.weekHead.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || drag || tdrag || e.target.closest(".echeck")) return;
    const chip = e.target.closest(".mchip");
    if (!chip) return;
    const ev = events.find((x) => x.id === chip.dataset.id);
    if (!ev) return;
    hdrag = { ev, chip, from: chip.dataset.date, x0: e.clientX, y0: e.clientY, moved: false, over: null };
    el.weekHead.setPointerCapture(e.pointerId);
  });
  el.weekHead.addEventListener("pointermove", (e) => {
    if (!hdrag) return;
    if (!hdrag.moved) {
      if (Math.hypot(e.clientX - hdrag.x0, e.clientY - hdrag.y0) < 4) return;
      hdrag.moved = true;
      hidePopover();
      hdrag.chip.classList.add("dragging");
    }
    const n = document.elementFromPoint(e.clientX, e.clientY);
    const head = n && n.closest(".day-head");
    if (head && head !== hdrag.over) {
      hdrag.over = head;
      head.querySelector(".allday-list").prepend(hdrag.chip);
    }
  });
  function endHeadDrag(e, cancelled) {
    if (!hdrag) return;
    const d = hdrag;
    hdrag = null;
    try { el.weekHead.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    suppressClick = true;
    setTimeout(() => (suppressClick = false), 0);
    if (!d.moved) { if (!cancelled) showPopover(d.ev, d.chip); return; }
    const target = d.over ? addDays(weekStart, Number(d.over.dataset.day)) : parseISO(d.from);
    const shift = Math.round((startOfDay(target) - parseISO(d.from)) / 86400000);
    if (cancelled || !shift) { renderHeader(); return; }
    pushUndo();
    d.ev.start = toISO(addDays(parseISO(d.ev.start), shift));
    d.ev.end = toISO(addDays(parseISO(d.ev.end), shift));
    saveEvents();
    flashIds = new Set([d.ev.id]);
    render();
    flashIds = new Set();
    setStatus(`Moved “${escapeHTML(d.ev.title)}”. <button class="undo" type="button">Undo</button>`);
  }
  el.weekHead.addEventListener("pointerup", (e) => endHeadDrag(e, false));
  el.weekHead.addEventListener("pointercancel", (e) => endHeadDrag(e, true));

  // ---------- calendars (tags) ----------
  const PALETTE = Object.keys(COLORS);
  const PALETTE_LABEL = {
    tomato: "Tomato", flamingo: "Flamingo", tangerine: "Tangerine", banana: "Banana", sage: "Sage", basil: "Basil",
    peacock: "Peacock", blueberry: "Blueberry", lavender: "Lavender", grape: "Grape", graphite: "Graphite",
  };
  const CHECK_ICON = `<svg viewBox="0 0 24 24" width="14" height="14"><path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`;
  const PENCIL = `<svg viewBox="0 0 24 24" width="16" height="16"><path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/></svg>`;

  function renderCalendars() {
    el.calList.innerHTML = "";
    for (const c of calendars) {
      const li = document.createElement("li");
      li.className = "cal-item" + (c.visible === false ? " off" : "");
      li.dataset.id = c.id;
      li.innerHTML = `<button type="button" class="check" role="checkbox"></button><span class="cal-name"></span>
        <button type="button" class="icon-btn small cal-edit">${PENCIL}</button>`;
      const box = li.querySelector(".check");
      box.style.setProperty("--c", COLORS[c.color] || COLORS.peacock);
      box.setAttribute("aria-checked", String(c.visible !== false));
      box.setAttribute("aria-label", `Show ${c.name}`);
      box.innerHTML = CHECK_ICON;
      li.querySelector(".cal-name").textContent = c.name;
      const edit = li.querySelector(".cal-edit");
      edit.setAttribute("aria-label", `Edit ${c.name}`);
      edit.title = "Edit calendar";
      el.calList.appendChild(li);
    }
  }

  // Show/hide a calendar's events. This is a view setting, so it isn't part of undo.
  function toggleCalendar(id) {
    const c = calById(id);
    if (!c) return;
    c.visible = c.visible === false;
    saveCalendars();
    renderCalendars();
    hidePopover();
    render();
  }

  // Create (cal = null) or edit a calendar: name + colour, and delete when editing.
  function showCalEditor(cal, anchor) {
    clearDraft();
    const p = el.popover;
    const isNew = !cal;
    let color = cal ? cal.color : PALETTE.find((k) => !calendars.some((c) => c.color === k)) || "peacock";
    p.innerHTML = `${CLOSE_BTN}
      <div class="cal-editor">
        <div class="ce-title">${isNew ? "New calendar" : "Edit calendar"}</div>
        <input class="ce-name" type="text" maxlength="60" placeholder="Name" aria-label="Calendar name">
        <div class="ce-swatches" role="radiogroup" aria-label="Color"></div>
        <div class="ce-error" aria-live="polite"></div>
        <div class="ce-actions">
          ${isNew ? "" : `<button type="button" class="ce-delete">Delete</button>`}
          <span class="ce-spacer"></span>
          <button type="button" class="ce-cancel">Cancel</button>
          <button type="button" class="ce-save">${isNew ? "Create" : "Save"}</button>
        </div>
      </div>`;
    delete p.dataset.eventId;
    const name = p.querySelector(".ce-name");
    name.value = cal ? cal.name : "";
    const sw = p.querySelector(".ce-swatches");
    const paint = () => sw.querySelectorAll("button").forEach((b) => {
      b.classList.toggle("sel", b.dataset.color === color);
      b.setAttribute("aria-checked", String(b.dataset.color === color));
    });
    for (const k of PALETTE) {
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.color = k;
      b.style.background = COLORS[k];
      b.title = PALETTE_LABEL[k];
      b.setAttribute("role", "radio");
      b.setAttribute("aria-label", PALETTE_LABEL[k]);
      b.innerHTML = CHECK_ICON;
      b.onclick = (e) => { e.stopPropagation(); color = k; paint(); };
      sw.appendChild(b);
    }
    paint();
    const err = p.querySelector(".ce-error");
    const save = () => {
      const val = name.value.trim();
      if (!val) { err.textContent = "Give the calendar a name."; name.focus(); return; }
      const clash = calByName(val);
      if (clash && clash !== cal) { err.textContent = "There's already a calendar with that name."; name.focus(); return; }
      pushUndo();
      if (isNew) calendars.push({ id: "cal-" + uid(), name: val, color, visible: true });
      else Object.assign(cal, { name: val, color });
      saveCalendars();
      hidePopover();
      renderCalendars();
      render();
      setStatus(`${isNew ? "Created" : "Updated"} calendar “${escapeHTML(val)}”. <button class="undo" type="button">Undo</button>`);
    };
    p.querySelector(".ce-save").onclick = (e) => { e.stopPropagation(); save(); };
    p.querySelector(".ce-cancel").onclick = hidePopover;
    p.querySelector("[data-close]").onclick = hidePopover;
    name.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.isComposing) { e.preventDefault(); save(); }
    });
    name.addEventListener("input", () => { err.textContent = ""; });
    const del = p.querySelector(".ce-delete");
    if (del) {
      const count = events.filter((ev) => ev.cal === cal.id).length;
      let armed = false;
      del.onclick = (e) => {
        e.stopPropagation();
        if (calendars.length <= 1) { err.textContent = "You need at least one calendar."; return; }
        // Two-step delete: the first click asks for confirmation.
        if (!armed && count) {
          armed = true;
          del.textContent = `Delete with ${count} event${count === 1 ? "" : "s"}?`;
          del.classList.add("armed");
          return;
        }
        pushUndo();
        calendars = calendars.filter((c) => c !== cal);
        events = events.filter((ev) => ev.cal !== cal.id);
        saveCalendars();
        saveEvents();
        hidePopover();
        renderCalendars();
        render();
        setStatus(`Deleted calendar “${escapeHTML(cal.name)}”. <button class="undo" type="button">Undo</button>`);
      };
    }
    p.hidden = false;
    placePopover(anchor);
    name.focus();
    name.select();
  }

  // Calendar picker inside the event popover.
  // Calendar picker inside a popover. onPick(calendarId) is called with the choice.
  function toggleCalMenu(currentId, anchor, onPick, { allowNew = true } = {}) {
    const p = el.popover;
    const open = p.querySelector(".cal-menu");
    if (open) { open.remove(); return; }
    const menu = document.createElement("div");
    menu.className = "cal-menu";
    menu.setAttribute("role", "menu");
    for (const c of calendars) {
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", "menuitemradio");
      b.setAttribute("aria-checked", String(c.id === currentId));
      b.innerHTML = `<span class="cm-dot"></span><span class="cm-name"></span><span class="cm-check">${c.id === currentId ? CHECK_ICON : ""}</span>`;
      b.querySelector(".cm-dot").style.background = COLORS[c.color] || COLORS.peacock;
      b.querySelector(".cm-name").textContent = c.name + (c.visible === false ? " (hidden)" : "");
      b.onclick = (e) => { e.stopPropagation(); onPick(c.id); };
      menu.appendChild(b);
    }
    if (allowNew) {
      const add = document.createElement("button");
      add.type = "button";
      add.className = "cm-new";
      add.textContent = "+ New calendar";
      add.onclick = (e) => { e.stopPropagation(); showCalEditor(null, el.calAdd); };
      menu.appendChild(add);
    }
    p.appendChild(menu);
    const pr = p.getBoundingClientRect(), ar = anchor.getBoundingClientRect();
    menu.style.left = `${Math.max(8, ar.left - pr.left)}px`;
    menu.style.top = `${ar.bottom - pr.top + 4}px`;
  }

  function setEventCalendar(ev, calId) {
    if (ev.cal === calId) { el.popover.querySelector(".cal-menu")?.remove(); return; }
    pushUndo();
    ev.cal = calId;
    saveEvents();
    const cal = calById(calId);
    flashIds = new Set([ev.id]);
    render();
    flashIds = new Set();
    const anchor = cal.visible !== false && document.querySelector(`[data-id="${ev.id}"]:not(.echeck)`);
    if (anchor) showPopover(ev, anchor); else hidePopover();
    setStatus(`Moved “${escapeHTML(ev.title)}” to ${escapeHTML(cal.name)}. <button class="undo" type="button">Undo</button>`);
  }

  el.calAdd.addEventListener("click", (e) => { e.stopPropagation(); showCalEditor(null, el.calAdd); });
  el.calList.addEventListener("click", (e) => {
    const li = e.target.closest(".cal-item");
    if (!li) return;
    e.stopPropagation();
    if (e.target.closest(".cal-edit")) showCalEditor(calById(li.dataset.id), li);
    else toggleCalendar(li.dataset.id);
  });

  // ---------- navigation ----------
  function goToDate(d, doRender = true) {
    focus = startOfDay(d);
    weekStart = startOfWeek(focus);
    monthStart = new Date(focus.getFullYear(), focus.getMonth(), 1);
    miniMonth = new Date(monthStart);
    if (doRender) render();
  }
  function step(dir) {
    if (view === "week") return goToDate(addDays(weekStart, 7 * dir));
    const m = new Date(monthStart.getFullYear(), monthStart.getMonth() + dir, 1);
    const today = new Date();
    // Land on today when moving into the current month, else on the 1st (like Google).
    goToDate(m.getMonth() === today.getMonth() && m.getFullYear() === today.getFullYear() ? today : m);
  }
  function saveViewPref() {
    try { localStorage.setItem(VIEW_KEY, view); } catch { /* ignore */ }
  }
  function setView(v) {
    if (v === view) return;
    hidePopover();
    view = v;
    saveViewPref();
    render();
    if (view === "week") el.weekBody.scrollTop = hourPx() * 7.5;
  }

  // ---------- modes: Calendar / Action timeline ----------
  const MODE_KEY = "nl-calendar-mode";
  let mode = (() => {
    try { return localStorage.getItem(MODE_KEY) === "timeline" ? "timeline" : "calendar"; } catch { return "calendar"; }
  })();
  const modeEl = { btn: $("modeBtn"), menu: $("modeMenu"), label: $("modeLabel") };

  function setMode(m) {
    mode = m;
    try { localStorage.setItem(MODE_KEY, m); } catch { /* ignore */ }
    document.body.dataset.mode = m;
    modeEl.label.textContent = m === "timeline" ? "Action timeline" : "Calendar";
    modeEl.menu.querySelectorAll("[data-mode]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.mode === m)));
    closeModeMenu();
    hidePopover();
    if (quickAddOpen()) closeQuickAdd();
    tlEl.root.hidden = m !== "timeline";
    if (m === "timeline") { tl.auto = true; buildTimeline(); }
    else render();
  }
  function closeModeMenu() {
    modeEl.menu.hidden = true;
    modeEl.btn.setAttribute("aria-expanded", "false");
  }
  modeEl.btn.addEventListener("click", (e) => {
    e.stopPropagation();
    modeEl.menu.hidden = !modeEl.menu.hidden;
    modeEl.btn.setAttribute("aria-expanded", String(!modeEl.menu.hidden));
  });
  modeEl.menu.addEventListener("click", (e) => {
    const b = e.target.closest("[data-mode]");
    if (b) { e.stopPropagation(); setMode(b.dataset.mode); }
  });

  // ---------- Action timeline (read-only) ----------
  // Timed events from visible calendars, in order, laid out as nodes on one line. The focused
  // node sits in the centre; the next one sits toward the faded right edge.
  const tlEl = {
    root: $("timeline"), stage: $("tlStage"), track: $("tlTrack"), countdown: $("tlCountdown"),
    allday: $("tlAllday"), dayLabel: $("tlDayLabel"), prev: $("tlPrev"), next: $("tlNext"),
    empty: $("tlEmpty"), now: $("tlNow"),
  };
  // seq = the events plus, when a day with nothing planned is being viewed, a placeholder for that day.
  const tl = { items: [], seq: [], focus: 0, focusId: null, emptyDay: null, auto: true, drag: null, spacing: 300 };
  const MIN = 60000;
  const PIN_SVG = `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5a2.5 2.5 0 1 1 0-5 2.5 2.5 0 0 1 0 5z"/></svg>`;

  function timelineItems() {
    return events
      .filter((ev) => !ev.allDay && isVisible(ev) && !(ev.taskId && ev.done))
      .map((ev) => ({ ev, s: parseISO(ev.start), e: parseISO(ev.end) }))
      .sort((a, b) => a.s - b.s || a.e - b.e);
  }
  // The imminent event: the one happening now, otherwise the next one to start.
  function imminentIndex(items) {
    const now = new Date();
    const i = items.findIndex((it) => it.e > now);
    return i === -1 ? items.length - 1 : i;
  }
  function fmtDur(ms) {
    const m = Math.max(0, Math.round(ms / MIN));
    if (m < 60) return `${m}m`;
    if (m < 1440) return `${Math.floor(m / 60)}h${m % 60 ? ` ${m % 60}m` : ""}`;
    const d = Math.floor(m / 1440), h = Math.floor((m % 1440) / 60);
    return `${d}d${h ? ` ${h}h` : ""}`;
  }
  // Under 15 minutes turns orange, under 5 minutes red.
  const tone = (ms) => (ms < 5 * MIN ? "red" : ms < 15 * MIN ? "orange" : "green");
  const dayName = (d) => {
    const diff = Math.round((startOfDay(d) - startOfDay(new Date())) / 86400000);
    return diff === 0 ? "Today" : diff === 1 ? "Tomorrow" : diff === -1 ? "Yesterday"
      : d.toLocaleDateString(undefined, { weekday: "long" });
  };

  function makeSeq() {
    const seq = tl.items.slice();
    if (tl.emptyDay) {
      const ds = startOfDay(tl.emptyDay);
      const i = seq.findIndex((it) => it.s >= ds);
      seq.splice(i === -1 ? seq.length : i, 0, { virtual: true, s: ds, e: ds });
    }
    return seq;
  }
  const seqKey = (it) => (it.virtual ? "virtual" : it.ev.id);

  function buildTimeline() {
    tl.items = timelineItems();
    if (tl.auto) {
      // Following "now": the imminent event, or today as an empty day if there's nothing at all.
      tl.emptyDay = tl.items.length ? null : startOfDay(new Date());
      tl.focusId = tl.items.length ? tl.items[imminentIndex(tl.items)].ev.id : "virtual";
    } else if (tl.focusId !== "virtual" && !tl.items.some((it) => it.ev.id === tl.focusId)) {
      // The focused event is gone (deleted, hidden, or checked off): fall back to its day.
      tl.emptyDay = tl.emptyDay || startOfDay(new Date());
      tl.focusId = "virtual";
    }
    tl.seq = makeSeq();
    tl.focus = Math.max(0, tl.seq.findIndex((it) => seqKey(it) === tl.focusId));
    drawTimeline();
  }

  function tlNode(it, x, central, refDay) {
    const { ev, s, e } = it;
    const cal = calOf(ev) || {};
    const color = colorOf(ev);
    const now = new Date();
    const node = document.createElement("div");
    node.className = "tl-node" + (central ? " central" : "") + (s <= now && now < e ? " ongoing" : "");
    node.style.left = `${x}px`;
    node.style.setProperty("--c", color);
    node.innerHTML = `
      <div class="tl-card">
        <div class="tl-time"></div>
        <div class="tl-title"></div>
        <div class="tl-loc">${PIN_SVG}<span></span></div>
        <div class="tl-tag"><span class="tl-tagdot"></span><span class="tl-tagname"></span></div>
      </div>
      <div class="tl-dot"></div>`;
    const sameDayAsRef = sameDay(s, refDay);
    node.querySelector(".tl-time").textContent = (sameDayAsRef ? "" : `${shortDate(s)} · `) + fmtRange(s, e);
    const title = node.querySelector(".tl-title");
    title.textContent = ev.title || "(No title)";
    if (ev.taskId) {
      const t = document.createElement("span");
      t.className = "tl-taskmark";
      t.title = "Task";
      title.prepend(t);
    }
    if (s <= now && now < e) {
      const b = document.createElement("span");
      b.className = "tl-live";
      b.textContent = "Now";
      title.prepend(b);
    }
    const loc = node.querySelector(".tl-loc");
    if (ev.location) loc.querySelector("span").textContent = ev.location; else loc.remove();
    node.querySelector(".tl-tagdot").style.background = color;
    node.querySelector(".tl-tagname").textContent = cal.name || "";
    return node;
  }
  // Centre card for a day with nothing planned.
  function tlEmptyNode(it, x, central, hasAllDay) {
    const node = document.createElement("div");
    node.className = "tl-node tl-free" + (central ? " central" : "");
    node.style.left = `${x}px`;
    node.style.setProperty("--c", "#9aa0a6");
    node.innerHTML = `
      <div class="tl-card">
        <div class="tl-time"></div>
        <div class="tl-title">Nothing planned</div>
        <div class="tl-freenote"></div>
      </div>
      <div class="tl-dot"></div>`;
    node.querySelector(".tl-time").textContent = it.s.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
    node.querySelector(".tl-freenote").textContent = !tl.items.length
      ? "Your calendar is empty — switch to Calendar mode to add events."
      : hasAllDay ? "No timed events — all-day items are below." : "This day is free.";
    return node;
  }

  function tlGap(a, b, x) {
    const gap = b.s - a.e;
    const g = document.createElement("div");
    g.style.left = `${x}px`;
    if (gap < 0) {
      g.className = "tl-pill red";
      g.innerHTML = `<b>${fmtDur(-gap)}</b><small>overlap</small>`;
    } else {
      g.className = `tl-pill ${tone(gap)}`;
      g.innerHTML = `<b>${gap ? fmtDur(gap) : "0m"}</b><small>${gap ? "until next" : "back-to-back"}</small>`;
    }
    return g;
  }

  function drawTimeline() {
    const W = tlEl.stage.clientWidth;
    tl.spacing = Math.max(240, W * 0.38);
    const cx = W / 2;
    tlEl.track.innerHTML = "";
    tlEl.track.style.transition = "none";
    tlEl.track.style.transform = "";
    tlEl.empty.hidden = true;
    tlEl.now.hidden = tl.auto;
    const seq = tl.seq;
    const focusIt = seq[tl.focus];
    const refDay = focusIt ? focusIt.s : new Date();

    // Day label (days can be stepped one at a time, including days with nothing planned).
    tlEl.dayLabel.innerHTML = `<b></b><span></span>`;
    tlEl.dayLabel.querySelector("b").textContent = dayName(refDay);
    tlEl.dayLabel.querySelector("span").textContent = refDay.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
    tlEl.prev.disabled = false;
    tlEl.next.disabled = false;

    // That day's all-day items (checked-off tasks are left out).
    const ds = startOfDay(refDay), de = addDays(ds, 1);
    const allDay = events.filter((ev) => ev.allDay && isVisible(ev) && !(ev.taskId && ev.done)
      && parseISO(ev.start) < de && parseISO(ev.end) > ds);

    // Nodes near the viewport (a few extra on each side so dragging has something to show).
    // Beside the centre, only events from the same day or the neighbouring day are shown: if the day
    // before (left) or after (right) is free, events further away stay hidden. They only appear while
    // dragging, so moving along the line stays smooth.
    const prevDay = addDays(startOfDay(refDay), -1);
    const afterNextDay = addDays(startOfDay(refDay), 2);
    const isFar = (i) => (i < tl.focus && startOfDay(seq[i].s) < prevDay) || (i > tl.focus && seq[i].s >= afterNextDay);
    for (let i = Math.max(0, tl.focus - 3); i <= Math.min(seq.length - 1, tl.focus + 4); i++) {
      const x = cx + (i - tl.focus) * tl.spacing;
      const it = seq[i];
      const node = it.virtual ? tlEmptyNode(it, x, i === tl.focus, allDay.length > 0) : tlNode(it, x, i === tl.focus, refDay);
      if (isFar(i)) node.classList.add("tl-far");
      tlEl.track.appendChild(node);
      // Gap labels from the central node onward (left of centre is the countdown);
      // a gap leading to a hidden event is hidden with it.
      const nx = seq[i + 1];
      if (i >= tl.focus && nx && !it.virtual && !nx.virtual) {
        const gap = tlGap(it, nx, x + tl.spacing / 2);
        if (isFar(i + 1)) gap.classList.add("tl-far");
        tlEl.track.appendChild(gap);
      }
    }

    // Left of the central node: time until it starts (from now).
    const cd = tlEl.countdown;
    cd.style.left = `${Math.max(70, cx - tl.spacing / 2)}px`;
    if (!focusIt || focusIt.virtual) {
      cd.innerHTML = "";
    } else {
      const now = new Date();
      if (now < focusIt.s) {
        const ms = focusIt.s - now;
        cd.className = `tl-countdown tl-pill ${tone(ms)}`;
        cd.innerHTML = `<b>${fmtDur(ms)}</b><small>until it starts</small>`;
      } else if (now < focusIt.e) {
        cd.className = "tl-countdown tl-pill red";
        cd.innerHTML = `<b>Now</b><small>${fmtDur(focusIt.e - now)} left</small>`;
      } else {
        cd.className = "tl-countdown tl-pill past";
        cd.innerHTML = `<b>Ended</b><small>${fmtDur(now - focusIt.e)} ago</small>`;
      }
    }

    // Under the central node: that day's all-day items.
    tlEl.allday.hidden = !allDay.length;
    tlEl.allday.style.left = `${cx}px`;
    tlEl.allday.innerHTML = allDay.length ? `<div class="tl-allday-head">All day</div>` : "";
    for (const ev of allDay) {
      const row = document.createElement("div");
      row.className = "tl-allday-item";
      row.innerHTML = `<span class="tl-tagdot"></span><span class="tl-ad-title"></span><span class="tl-ad-cal"></span>`;
      row.querySelector(".tl-tagdot").style.background = colorOf(ev);
      row.querySelector(".tl-ad-title").textContent = ev.title || "(No title)";
      row.querySelector(".tl-ad-cal").textContent = (calOf(ev) || {}).name || "";
      if (ev.taskId) row.classList.add("is-task");
      tlEl.allday.appendChild(row);
    }
  }

  // Move the focus by n nodes with a slide, starting from an optional drag offset.
  function slideFrom(offset) {
    if (!offset) return;
    tlEl.track.style.transition = "none";
    tlEl.track.style.transform = `translateX(${offset}px)`;
    void tlEl.track.offsetWidth; // apply the start position before animating
    tlEl.track.style.transition = "transform .32s cubic-bezier(.2,.8,.2,1)";
    tlEl.track.style.transform = "translateX(0)";
  }
  // Move the focus to another node, starting from an optional drag offset.
  function tlGo(newFocus, fromOffset = 0) {
    if (!tl.seq.length) return;
    newFocus = clamp(newFocus, 0, tl.seq.length - 1);
    const moved = newFocus - tl.focus;
    if (moved) tl.auto = false;
    const target = tl.seq[newFocus];
    tl.focusId = seqKey(target);
    // Leaving an empty day: drop its placeholder from the line.
    if (!target.virtual) tl.emptyDay = null;
    tl.seq = makeSeq();
    tl.focus = Math.max(0, tl.seq.findIndex((it) => seqKey(it) === tl.focusId));
    drawTimeline();
    slideFrom(fromOffset + moved * tl.spacing);
  }
  // Step exactly one day. A day with events focuses its first one (or the current one, today);
  // a day without shows a "Nothing planned" placeholder.
  function tlDay(dir) {
    const cur = tl.seq[tl.focus];
    const ref = startOfDay(cur ? cur.s : new Date());
    const day = addDays(ref, dir);
    const onDay = tl.items.filter((it) => sameDay(it.s, day));
    tl.auto = false;
    if (onDay.length) {
      const now = new Date();
      const pick = sameDay(day, now) ? (onDay.find((it) => it.e > now) || onDay[0]) : onDay[0];
      tl.emptyDay = null;
      tl.focusId = pick.ev.id;
    } else {
      tl.emptyDay = day;
      tl.focusId = "virtual";
    }
    tl.seq = makeSeq();
    tl.focus = Math.max(0, tl.seq.findIndex((it) => seqKey(it) === tl.focusId));
    drawTimeline();
    slideFrom(dir * tl.spacing * 0.6);
  }

  tlEl.prev.addEventListener("click", (e) => { e.stopPropagation(); tlDay(-1); });
  tlEl.next.addEventListener("click", (e) => { e.stopPropagation(); tlDay(1); });
  tlEl.now.addEventListener("click", (e) => { e.stopPropagation(); tl.auto = true; tl.emptyDay = null; buildTimeline(); });

  // Drag the line to look further ahead (or back).
  tlEl.stage.addEventListener("pointerdown", (e) => {
    if (e.button !== 0 || e.target.closest("button") || !tl.seq.length) return;
    tl.drag = { x0: e.clientX, dx: 0 };
    tlEl.stage.setPointerCapture(e.pointerId);
    tlEl.stage.classList.add("dragging");
    tlEl.track.style.transition = "none";
  });
  tlEl.stage.addEventListener("pointermove", (e) => {
    if (!tl.drag) return;
    let dx = e.clientX - tl.drag.x0;
    // Resist past the first / last event.
    if ((tl.focus === 0 && dx > 0) || (tl.focus === tl.seq.length - 1 && dx < 0)) dx *= 0.3;
    tl.drag.dx = dx;
    tlEl.track.style.transform = `translateX(${dx}px)`;
  });
  function tlEndDrag(e) {
    if (!tl.drag) return;
    const dx = tl.drag.dx;
    tl.drag = null;
    try { tlEl.stage.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    tlEl.stage.classList.remove("dragging");
    tlGo(tl.focus + Math.round(-dx / tl.spacing), dx);
  }
  tlEl.stage.addEventListener("pointerup", tlEndDrag);
  tlEl.stage.addEventListener("pointercancel", tlEndDrag);
  // Horizontal scrolling (trackpads) steps through events too.
  let tlWheelAt = 0;
  tlEl.stage.addEventListener("wheel", (e) => {
    const d = Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.shiftKey ? e.deltaY : 0;
    if (Math.abs(d) < 15 || Date.now() - tlWheelAt < 350) return;
    e.preventDefault();
    tlWheelAt = Date.now();
    tlGo(tl.focus + Math.sign(d));
  }, { passive: false });

  // Keep the countdown live; while following "now", move on as events end.
  setInterval(() => { if (mode === "timeline" && !tl.drag) buildTimeline(); }, 30000);

  // ---------- wiring ----------
  $("todayBtn").onclick = () => goToDate(new Date());
  $("prevBtn").onclick = () => step(-1);
  $("nextBtn").onclick = () => step(1);
  $("miniPrev").onclick = () => { miniMonth = new Date(miniMonth.getFullYear(), miniMonth.getMonth() - 1, 1); renderMini(); };
  $("miniNext").onclick = () => { miniMonth = new Date(miniMonth.getFullYear(), miniMonth.getMonth() + 1, 1); renderMini(); };
  el.miniGrid.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-date]");
    if (!b) return;
    const keepMonth = miniMonth;
    goToDate(parseISO(b.dataset.date), false);
    if (view === "week") miniMonth = keepMonth;
    render();
  });
  $("menuBtn").onclick = () => {
    el.sidebar.classList.toggle(isMobile() ? "open" : "collapsed");
    syncQuickAdd();
    setTimeout(refreshMain, 220);
  };

  // ----- quick add: when the sidebar is closed, a round + stands in for the input bar -----
  const isMobile = () => window.matchMedia("(max-width: 800px)").matches;
  const sidebarClosed = () => (isMobile() ? !el.sidebar.classList.contains("open") : el.sidebar.classList.contains("collapsed"));
  // Where the input bar normally lives, so it can be put back.
  const aiHome = { parent: el.aiForm.parentNode, next: el.aiForm.nextSibling };
  const quickAddOpen = () => !el.qaCard.hidden;

  function openQuickAdd() {
    hidePopover();
    el.qaCard.appendChild(el.aiForm); // move the real bar (with its status, Undo, hints) into the card
    el.qaCard.hidden = false;
    el.qaFab.hidden = true;
    autosize();
    el.aiInput.focus();
  }
  function closeQuickAdd() {
    if (el.aiForm.parentNode !== aiHome.parent) aiHome.parent.insertBefore(el.aiForm, aiHome.next);
    el.qaCard.hidden = true;
    el.qaFab.hidden = false;
    autosize();
  }
  function syncQuickAdd() {
    const closed = sidebarClosed();
    if (!closed) closeQuickAdd();
    el.quickAdd.hidden = !closed;
  }
  el.qaFab.addEventListener("click", (e) => { e.stopPropagation(); openQuickAdd(); });
  // Clicking elsewhere folds the card back into the + (unless something is typed or a request is running).
  document.addEventListener("pointerdown", (e) => {
    if (!quickAddOpen() || el.quickAdd.contains(e.target)) return;
    if (el.aiInput.value.trim() || el.aiSend.disabled) return;
    closeQuickAdd();
  });

  el.viewBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    el.viewMenu.hidden = !el.viewMenu.hidden;
    el.viewBtn.setAttribute("aria-expanded", String(!el.viewMenu.hidden));
  });
  el.viewMenu.addEventListener("click", (e) => {
    const b = e.target.closest("[data-view]");
    if (!b) return;
    el.viewMenu.hidden = true;
    el.viewBtn.setAttribute("aria-expanded", "false");
    setView(b.dataset.view);
  });

  el.aiForm.addEventListener("submit", (e) => { e.preventDefault(); submitCommand(el.aiInput.value); });
  el.aiInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); submitCommand(el.aiInput.value); }
  });
  el.aiInput.addEventListener("input", autosize);
  el.aiHints.addEventListener("click", (e) => {
    const h = e.target.closest(".hint");
    if (h) { el.aiInput.value = h.textContent; el.aiInput.focus(); autosize(); }
  });
  el.aiStatus.addEventListener("click", (e) => {
    if (e.target.closest(".undo")) undo();
    else if (e.target.closest(".redo")) redo();
  });

  document.addEventListener("click", (e) => {
    const cb = e.target.closest(".echeck");
    if (cb) {
      e.stopPropagation();
      const inDayList = cb.closest(".pday-list");
      toggleTaskEvent(cb.dataset.id);
      if (inDayList && !el.popover.hidden) {
        // Refresh the "N more" list in place so the check shows up there too.
        const c = cb.closest(".mchip");
        const box = c && inDayList.querySelector(`.echeck[data-id="${cb.dataset.id}"]`);
        if (box) box.closest(".mchip").classList.toggle("done");
      }
      return;
    }
    if (!el.popover.contains(e.target)) hidePopover();
    else if (!e.target.closest(".cal-menu")) el.popover.querySelector(".cal-menu")?.remove();
    if (!modeEl.menu.hidden && !modeEl.menu.contains(e.target)) closeModeMenu();
    if (!el.viewMenu.hidden && !el.viewMenu.contains(e.target)) {
      el.viewMenu.hidden = true;
      el.viewBtn.setAttribute("aria-expanded", "false");
    }
  });

  const isTyping = (t) => t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !modeEl.menu.hidden) { closeModeMenu(); return; }
    if (mode === "timeline") {
      // View only: no undo/redo or calendar shortcuts here.
      if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "ArrowRight") { e.preventDefault(); tlGo(tl.focus + 1); }
      else if (e.key === "ArrowLeft") { e.preventDefault(); tlGo(tl.focus - 1); }
      return;
    }
    if (e.key === "Escape") {
      if (quickAddOpen() && el.quickAdd.contains(e.target) && !el.aiSend.disabled) {
        closeQuickAdd();
        el.qaFab.focus();
        return;
      }
      if (draft) draft.busy = false;
      hidePopover();
      el.viewMenu.hidden = true;
      return;
    }
    // Inside a text box, keep the browser's own text undo/redo and typing.
    if (isTyping(e.target) || dragging()) return;
    const mod = e.ctrlKey || e.metaKey;
    const key = e.key.toLowerCase();
    if (mod && !e.altKey) {
      if (key === "z" && !e.shiftKey) { e.preventDefault(); undo(); }
      else if (key === "y" || (key === "z" && e.shiftKey)) { e.preventDefault(); redo(); }
      return;
    }
    if (e.altKey || e.shiftKey) return;
    // Google Calendar's single-key shortcuts.
    if (key === "w") setView("week");
    else if (key === "m") setView("month");
    else if (key === "t") goToDate(new Date());
    else if (key === "j" || key === "n") step(1);
    else if (key === "k" || key === "p") step(-1);
  });
  const dragging = () => drag || tdrag || hdrag;
  window.addEventListener("resize", () => {
    syncQuickAdd();
    if (mode === "timeline") { if (!tl.drag) drawTimeline(); }
    else if (!dragging()) refreshMain();
  });
  setInterval(() => { if (!dragging() && view === "week") renderGrid(); }, 60000); // keep the red "now" line moving

  render();
  renderTasks();
  renderCalendars();
  syncQuickAdd();
  setMode(mode);
  el.weekBody.scrollTop = 48 * 7.5; // start around 7:30am like Google Calendar
})();

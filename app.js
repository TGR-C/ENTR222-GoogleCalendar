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
  // Examples the help tour puts on screen are marked demo: true and never saved.
  const notDemo = (x) => !(x && x.demo);

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
  let meetsReady = false; // Whentomeet state is set up further down

  function loadEvents() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) {
        const list = JSON.parse(raw);
        if (Array.isArray(list)) {
          return list.filter((ev) => ev && typeof ev === "object" && typeof ev.start === "string" && typeof ev.end === "string");
        }
      }
    } catch { /* ignore */ }
    const seeded = seedEvents();
    try { localStorage.setItem(STORE_KEY, JSON.stringify(seeded)); } catch { /* ignore */ }
    return seeded;
  }
  function loadCalendars() {
    try {
      const raw = localStorage.getItem(CAL_KEY);
      if (raw) { const c = JSON.parse(raw); if (Array.isArray(c)) { const ok = c.filter((x) => x && typeof x === "object" && typeof x.id === "string" && typeof x.name === "string"); if (ok.length) return ok; } }
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
      if (raw) {
        const list = JSON.parse(raw);
        if (Array.isArray(list)) return list.filter((t) => t && typeof t === "object" && typeof t.id === "string");
      }
    } catch { /* ignore */ }
    const seeded = ["Finish pitch deck", "Email professor about project", "Book a team meeting room"]
      .map((title) => ({ id: uid(), title }));
    try { localStorage.setItem(TASK_KEY, JSON.stringify(seeded)); } catch { /* ignore */ }
    return seeded;
  }
  function saveTasks() {
    try { localStorage.setItem(TASK_KEY, JSON.stringify(tasks.filter(notDemo))); } catch { /* ignore */ }
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
    try { localStorage.setItem(STORE_KEY, JSON.stringify(events.filter(notDemo))); } catch { /* ignore */ }
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
    if (typeof updateMeetWarnings === "function" && meetsReady) updateMeetWarnings();
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
          top: it.s <= dayStart ? 0 : it.s.getHours() * 60 + it.s.getMinutes(),            // wall-clock minutes from midnight
          bottom: it.e >= dayEnd ? 1440 : it.e.getHours() * 60 + it.e.getMinutes(),
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
    if (wtm.active) renderMeetGrid(); // sets --scrollbar for its own grid
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
    if (e <= addDays(dayStart, 1)) {
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
    const atts = attachmentChips(ev.id, { max: 6 });
    if (!atts.hidden) {
      const row = document.createElement("div");
      row.className = "prow patt-row";
      row.innerHTML = `<div class="picon"><svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M16.5 6v11.5a4 4 0 0 1-8 0V5a2.5 2.5 0 0 1 5 0v10.5a1 1 0 0 1-2 0V6H10v9.5a2.5 2.5 0 0 0 5 0V5a4 4 0 0 0-8 0v12.5a5.5 5.5 0 0 0 11 0V6h-1.5z"/></svg></div><div class="pinfo"></div>`;
      row.querySelector(".pinfo").appendChild(atts);
      p.querySelector(".pcal-row").after(row);
    }
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
    // Hide first: an inline edit saves on blur, and must not see the popover as still open (it would re-open it).
    const focused = el.popover.contains(document.activeElement) ? document.activeElement : null;
    el.popover.hidden = true;
    if (focused) focused.blur();
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
  // Wall-clock minutes after local midnight of that day (Date rolls past 1440 into the next day), so DST days stay right.
  const atMinute = (dayIdx, min) => { const d = addDays(weekStart, dayIdx); d.setHours(0, min, 0, 0); return d; };
  const atDayMinute = (day, min) => { const d = startOfDay(day); d.setHours(0, min, 0, 0); return d; };

  function setBlockTime(block, s, e) {
    const top = s.getHours() * 60 + s.getMinutes();
    const endMin = sameDay(s, e) ? e.getHours() * 60 + e.getMinutes() : 1440; // wall-clock, clipped to this day
    const mins = Math.max(endMin - top, 15);
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
        // (measured from the grabbed segment's own day: a continuation segment starts at 00:00)
        grab: pointerMin - (sameDay(s, addDays(weekStart, dayIdx)) ? s.getHours() * 60 + s.getMinutes() : 0),
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
      const startMin = clamp(snap(m - drag.grab), 0, 1440 - SNAP);
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
      let end = atDayMinute(endDay, clamp(snap(m), 0, 1440));
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
    const savedRedo = redoStack;
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
        if (ev) {
          Object.assign(ev, fields);
          // A task placed on the calendar shares its title with the task (and its other entries).
          if (ev.taskId && ev.title && ev.title.trim()) renameTask(ev.taskId, ev.title);
          changed.push(ev);
        }
      } else if (a.type === "delete") {
        const i = events.findIndex((x) => x.id === a.id);
        if (i !== -1) {
          const gone = events[i];
          changed.push(gone);
          // Like deleteEvent: deleting a scheduled task removes the task and all of its entries.
          if (gone.taskId) {
            events = events.filter((x) => x.taskId !== gone.taskId);
            tasks = tasks.filter((t) => t.id !== gone.taskId);
          } else events.splice(i, 1);
        }
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
    // Every action missed (unknown id, blank name…): nothing changed, so don't keep a no-op undo step.
    if (!changed.length) { undoStack.pop(); redoStack = savedRedo; return changed; }
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
    if (o.calendars) calendars = o.calendars;
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
    if (cancelled) { render(); return; }

    const date = parseISO(d.cell.dataset.date);
    if (d.mode === "mdate") { view = "week"; saveViewPref(); goToDate(date); return; }
    if (d.mode === "mmore") { showDayPopover(date, d.anchor); return; }
    if (d.mode === "mcreate") {
      draft = { start: toISO(atDayMinute(date, 540)), end: toISO(atDayMinute(date, 600)), dayOnly: true };
      renderMonth();
      showCreatePopover();
      return;
    }
    // mmove
    if (!d.moved) { showPopover(d.ev, d.chip); return; }
    const target = d.over ? parseISO(d.over.dataset.date) : parseISO(d.from);
    const shift = Math.round((target - parseISO(d.from)) / 86400000);
    if (!shift) { render(); return; }
    pushUndo();
    d.ev.start = toISO(addDays(parseISO(d.ev.start), shift));
    d.ev.end = toISO(addDays(parseISO(d.ev.end), shift));
    saveEvents();
    flashIds = new Set([d.ev.id]);
    render();
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
      t.target = { allDay: false, start: atDayMinute(d, 540) };
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
    // Sidebar show/hide isn't part of undo: carry the new value into every saved snapshot.
    const patch = (snap) => {
      try {
        const o = JSON.parse(snap);
        (o.calendars || []).forEach((x) => { if (x.id === id) x.visible = c.visible; });
        return JSON.stringify(o);
      } catch { return snap; }
    };
    undoStack = undoStack.map(patch);
    redoStack = redoStack.map(patch);
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
    if (wtm.active && v !== "week") return; // Whentomeet paints over the week view
    hidePopover();
    view = v;
    saveViewPref();
    render();
    if (view === "week") el.weekBody.scrollTop = hourPx() * 7.5;
  }

  // ---------- modes: Calendar / Action Timeline ----------
  const MODE_KEY = "nl-calendar-mode";
  let mode = (() => {
    try { const v = localStorage.getItem(MODE_KEY); return v === "timeline" || v === "hub" ? v : "calendar"; } catch { return "calendar"; }
  })();
  const modeEl = { tabs: [...document.querySelectorAll(".mode-tab")] };

  function setMode(m) {
    mode = m;
    try { localStorage.setItem(MODE_KEY, m); } catch { /* ignore */ }
    document.body.dataset.mode = m;
    modeEl.tabs.forEach((t) => {
      const on = t.dataset.mode === m;
      t.setAttribute("aria-selected", String(on));
      t.tabIndex = on ? 0 : -1;
    });
    const menuBtn = $("menuBtn");
    const menuLabel = m === "timeline" ? "AI chat + vertical timeline" : m === "hub" ? "Show or hide sources" : "Main menu";
    menuBtn.setAttribute("aria-label", menuLabel);
    menuBtn.title = menuLabel;
    hidePopover();
    if (quickAddOpen()) closeQuickAdd();
    tlEl.root.hidden = m !== "timeline";
    hubEl.root.hidden = m !== "hub";
    if (m === "timeline") { if (wtm.active) exitMeet(); tl.auto = true; buildTimeline(); renderWork(); }
    else if (m === "hub") { if (wtm.active) exitMeet(); setExpanded(false); renderHub(); }
    else {
      setExpanded(false);
      render();
      updateHubSync();
      // If the week view was hidden when the page loaded, it never got its usual starting scroll position.
      if (view === "week" && el.weekBody.scrollTop === 0) el.weekBody.scrollTop = hourPx() * 7.5;
    }
  }
  // One click switches mode; ← / → move between the tabs from the keyboard.
  modeEl.tabs.forEach((t, i) => {
    t.addEventListener("click", (e) => { e.stopPropagation(); if (t.dataset.mode !== mode) setMode(t.dataset.mode); });
    t.addEventListener("keydown", (e) => {
      if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
      e.preventDefault();
      e.stopPropagation();
      const next = modeEl.tabs[(i + (e.key === "ArrowRight" ? 1 : modeEl.tabs.length - 1)) % modeEl.tabs.length];
      setMode(next.dataset.mode);
      next.focus();
    });
  });

  // ---------- Action Timeline (read-only) ----------
  // Timed events from visible calendars, in order, laid out as nodes on one line. The focused
  // node sits in the centre; the next one sits toward the faded right edge.
  const tlEl = {
    root: $("timeline"), stage: $("tlStage"), track: $("tlTrack"), countdown: $("tlCountdown"),
    allday: $("tlAllday"), dayLabel: $("tlDayLabel"), prev: $("tlPrev"), next: $("tlNext"),
    empty: $("tlEmpty"), now: $("tlNow"),
  };
  // seq = the events plus, when a day with nothing planned is being viewed, a placeholder for that day.
  const tl = { items: [], seq: [], focus: 0, focusId: null, emptyDay: null, auto: true, drag: null, spacing: 300,
    vertical: false, lastKey: null, options: [] };
  // Nodes sit along the line: left offset when horizontal, top offset when vertical (expanded work view).
  const setPos = (elm, v) => { if (tl.vertical) elm.style.top = `${v}px`; else elm.style.left = `${v}px`; };
  const axis = () => (tl.vertical ? "Y" : "X");
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
    setPos(node, x);
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
    const card = node.querySelector(".tl-card");
    card.appendChild(attachmentChips(ev.id));
    // Expanded work view: a Work button on the centre card unless it's the event being worked on.
    if (tl.vertical && central && work.displayed !== ev.id) card.appendChild(cardWorkButton(ev.id));
    return node;
  }
  // Centre card for a day with nothing planned.
  function tlEmptyNode(it, x, central, hasAllDay) {
    const node = document.createElement("div");
    node.className = "tl-node tl-free" + (central ? " central" : "");
    setPos(node, x);
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
    setPos(g, x);
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
    tl.vertical = tlEl.root.classList.contains("expanded");
    const size = tl.vertical ? tlEl.stage.clientHeight : tlEl.stage.clientWidth;
    tl.spacing = tl.vertical ? Math.max(190, size * 0.34) : Math.max(240, size * 0.38);
    const cx = size / 2;
    tlEl.track.innerHTML = "";
    tlEl.track.style.transition = "none";
    tlEl.track.style.transform = "";
    tlEl.empty.hidden = true;
    const seq = tl.seq;
    const focusIt = seq[tl.focus];
    // Back on the imminent event (by any route)? Then we're "at now": hide the Now button and
    // resume following the clock.
    if (!tl.auto && focusIt) {
      const nowKey = tl.items.length ? tl.items[imminentIndex(tl.items)].ev.id : "virtual";
      const atNow = seqKey(focusIt) === nowKey && (nowKey !== "virtual" || sameDay(focusIt.s, new Date()));
      if (atNow) { tl.auto = true; tl.emptyDay = tl.items.length ? null : tl.emptyDay; }
    }
    tlEl.now.hidden = tl.auto;
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
    cd.style.left = cd.style.top = "";
    setPos(cd, tl.vertical ? cx - tl.spacing / 2 : Math.max(70, cx - tl.spacing / 2));
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
    tlEl.allday.style.left = tlEl.allday.style.top = "";
    if (!tl.vertical) tlEl.allday.style.left = `${cx}px`;
    tlEl.allday.innerHTML = allDay.length ? `<div class="tl-allday-head">All day</div>` : "";
    for (const ev of allDay) {
      const row = document.createElement("div");
      row.className = "tl-allday-item";
      row.innerHTML = `<span class="tl-tagdot"></span><span class="tl-ad-title"></span><span class="tl-ad-cal"></span>`;
      row.querySelector(".tl-tagdot").style.background = colorOf(ev);
      row.querySelector(".tl-ad-title").textContent = ev.title || "(No title)";
      row.querySelector(".tl-ad-cal").textContent = (calOf(ev) || {}).name || "";
      if (ev.taskId) row.classList.add("is-task");
      const chips = attachmentChips(ev.id, { max: 2 });
      if (!chips.hidden) row.appendChild(chips);
      if (tl.vertical && work.displayed !== ev.id) row.appendChild(cardWorkButton(ev.id, true));
      tlEl.allday.appendChild(row);
    }

    // What the Work button can work on here: the centre event and the day's all-day items.
    tl.options = [...(focusIt && !focusIt.virtual ? [focusIt.ev.id] : []), ...allDay.map((ev) => ev.id)];
    const key = focusIt ? seqKey(focusIt) + "@" + dayKey(refDay) : "";
    if (key !== tl.lastKey) {
      tl.lastKey = key;
      const dropped = pruneEmptySessions(tl.options);
      onTimelineFocus(tl.options);
      if (dropped) renderWork();
    }
    updateWorkButton();
  }

  // Move the focus by n nodes with a slide, starting from an optional drag offset.
  function slideFrom(offset) {
    if (!offset) return;
    tlEl.track.style.transition = "none";
    tlEl.track.style.transform = `translate${axis()}(${offset}px)`;
    void tlEl.track.offsetWidth; // apply the start position before animating
    tlEl.track.style.transition = "transform .32s cubic-bezier(.2,.8,.2,1)";
    tlEl.track.style.transform = `translate${axis()}(0)`;
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
    tl.drag = { x0: e.clientX, y0: e.clientY, dx: 0 };
    tlEl.stage.setPointerCapture(e.pointerId);
    tlEl.stage.classList.add("dragging");
    tlEl.track.style.transition = "none";
  });
  tlEl.stage.addEventListener("pointermove", (e) => {
    if (!tl.drag) return;
    let dx = tl.vertical ? e.clientY - tl.drag.y0 : e.clientX - tl.drag.x0;
    // Resist past the first / last event.
    if ((tl.focus === 0 && dx > 0) || (tl.focus === tl.seq.length - 1 && dx < 0)) dx *= 0.3;
    tl.drag.dx = dx;
    tlEl.track.style.transform = `translate${axis()}(${dx}px)`;
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
    // Wheel (or trackpad) steps through events in both views: down/right = later, up/left = earlier.
    const d = tl.vertical ? e.deltaY : Math.abs(e.deltaX) > Math.abs(e.deltaY) ? e.deltaX : e.deltaY;
    if (Math.abs(d) < 15 || Date.now() - tlWheelAt < 350) return;
    e.preventDefault();
    tlWheelAt = Date.now();
    tlGo(tl.focus + Math.sign(d));
  }, { passive: false });

  // Keep the countdown live; while following "now", move on as events end.
  setInterval(() => { if (mode === "timeline" && !tl.drag) buildTimeline(); }, 30000);

  // ---------- AI work sessions + attachments ----------
  // Each event/task gets its own chat ("session"). Files the AI writes (and files the user attaches)
  // are stored per event, separately from the events themselves so calendar undo never drops them.
  const ATT_KEY = "nl-calendar-attachments-v1";
  const SES_KEY = "nl-calendar-sessions-v1";
  function loadJSON(key, fallback) {
    try { const raw = localStorage.getItem(key); if (raw) return JSON.parse(raw); } catch { /* ignore */ }
    return fallback;
  }
  let attachments = loadJSON(ATT_KEY, {});   // { [eventId]: [{id, name, content, source, createdAt, updatedAt}] }
  let sessions = loadJSON(SES_KEY, {});      // { [eventId]: {eventId, title, messages, open, lastActive} }
  const work = { displayed: null, pending: new Set(), unread: new Set(), drafts: {} };
  const saveAttachments = () => { try { localStorage.setItem(ATT_KEY, JSON.stringify(Object.fromEntries(Object.entries(attachments)
    .map(([k, list]) => [k, list.filter(notDemo)]).filter(([, list]) => list.length)))); } catch { /* storage full */ } };
  const saveSessions = () => { try { localStorage.setItem(SES_KEY, JSON.stringify(Object.fromEntries(Object.entries(sessions).filter(([, x]) => notDemo(x))))); } catch { /* storage full */ } };

  const wk = {
    panel: $("wkPanel"), switchBtn: $("wkSwitch"), dot: $("wkDot"), title: $("wkTitle"), count: $("wkCount"),
    menu: $("wkSwitchMenu"), expand: $("wkExpand"), close: $("wkClose"), files: $("wkFiles"), msgs: $("wkMsgs"),
    form: $("wkForm"), text: $("wkText"), send: $("wkSend"), attach: $("wkAttach"), file: $("wkFile"), cancel: $("wkCancel"),
    workBtn: $("tlWork"), workLabel: $("tlWorkLabel"), workMenu: $("tlWorkMenu"),
    viewer: $("viewer"), vTitle: $("viewerTitle"), vSub: $("viewerSub"), vBody: $("viewerBody"),
    vDownload: $("viewerDownload"), vDelete: $("viewerDelete"), vClose: $("viewerClose"),
  };
  const ICON_EXPAND = `<svg viewBox="0 0 24 24" width="18" height="18"><path d="M7 14H5v5h5v-2H7v-3zm-2-4h2V7h3V5H5v5zm12 7h-3v2h5v-5h-2v3zM14 5v2h3v3h2V5h-5z"/></svg>`;
  const ICON_COLLAPSE = `<svg viewBox="0 0 24 24" width="18" height="18"><path d="M5 16h3v3h2v-5H5v2zm3-8H5v2h5V5H8v3zm6 11h2v-3h3v-2h-5v5zm2-11V5h-2v5h5V8h-3z"/></svg>`;
  const FILE_ICON = `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M14 2H6c-1.1 0-2 .9-2 2v16c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V8l-6-6zm4 18H6V4h7v5h5v11z"/></svg>`;

  const eventById = (id) => events.find((x) => x.id === id);
  const sessionTitle = (id) => (eventById(id) || {}).title || (sessions[id] || {}).title || "(No title)";
  const filesFor = (id) => attachments[id] || [];
  // Everything shown as attachments for an event: the files the AI created and the user uploaded.
  const allAttachments = (id) => filesFor(id).map((f) => ({ ...f, eventId: id }));

  function upsertFile(eventId, name, content, source) {
    const list = attachments[eventId] || (attachments[eventId] = []);
    const existing = list.find((f) => f.name.toLowerCase() === name.toLowerCase());
    const now = Date.now();
    if (existing) Object.assign(existing, { content, updatedAt: now, source: existing.source === "user" ? "user" : source });
    else list.push({ id: uid(), name, content, source, createdAt: now, updatedAt: now });
  }

  // Small file chips (cards, chat header, popovers). Clicking opens the viewer.
  function attachmentChips(eventId, { max = 3 } = {}) {
    const wrap = document.createElement("div");
    wrap.className = "att-chips";
    const all = allAttachments(eventId);
    all.slice(0, max).forEach((a) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "att-chip";
      b.innerHTML = `${FILE_ICON}<span></span>`;
      b.querySelector("span").textContent = a.name;
      b.title = a.name;
      b.addEventListener("click", (e) => { e.stopPropagation(); openViewer(a); });
      wrap.appendChild(b);
    });
    if (all.length > max) {
      const more = document.createElement("button");
      more.type = "button";
      more.className = "att-chip more";
      more.textContent = `+${all.length - max}`;
      more.title = all.slice(max).map((a) => a.name).join("\n");
      more.addEventListener("click", (e) => { e.stopPropagation(); openViewer(all[max]); });
      wrap.appendChild(more);
    }
    if (!all.length) wrap.hidden = true;
    return wrap;
  }

  // ----- viewer -----
  let viewing = null;
  function openViewer(att) {
    viewing = att;
    wk.vTitle.textContent = att.name;
    const ev = eventById(att.eventId);
    wk.vSub.textContent = [ev ? ev.title : sessionTitle(att.eventId),
      att.source === "user" ? "uploaded by you" : "created by AI"].join(" · ");
    wk.vBody.textContent = att.content;
    wk.viewer.hidden = false;
    wk.viewer.querySelector(".viewer-card").focus(); // keyboard users land in the dialog
  }
  const closeViewer = () => { wk.viewer.hidden = true; viewing = null; };
  wk.vClose.addEventListener("click", closeViewer);
  wk.viewer.addEventListener("click", (e) => { if (e.target === wk.viewer) closeViewer(); });
  wk.vDownload.addEventListener("click", () => {
    if (!viewing) return;
    const type = /\.csv$/i.test(viewing.name) ? "text/csv" : /\.json$/i.test(viewing.name) ? "application/json" : "text/plain";
    const url = URL.createObjectURL(new Blob([viewing.content], { type: `${type};charset=utf-8` }));
    const a = document.createElement("a");
    a.href = url;
    a.download = viewing.name;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  });
  // Trash icon in the viewer: delete this one file (AI-created or uploaded), in either mode.
  wk.vDelete.addEventListener("click", () => {
    if (!viewing) return;
    const id = viewing.eventId, name = viewing.name;
    const list = (attachments[id] || []).filter((f) => f.id !== viewing.id);
    if (list.length) attachments[id] = list; else delete attachments[id];
    saveAttachments();
    closeViewer();
    if (mode === "timeline") renderWork();
    // Refresh the event popover if it is showing this event.
    if (!el.popover.hidden && el.popover.dataset.eventId === id) {
      const ev = eventById(id);
      const anchor = document.querySelector(`[data-id="${id}"]:not(.echeck)`);
      if (ev && anchor) showPopover(ev, anchor);
    }
    setStatus(`Deleted “${escapeHTML(name)}”.`);
  });

  // ----- delete an AI chat (with confirmation) -----
  const cf = {
    root: $("confirmChat"), title: $("confirmTitle"), text: $("confirmText"),
    cancel: $("confirmCancel"), chatOnly: $("confirmChatOnly"), chatFiles: $("confirmChatFiles"), eventId: null,
  };
  function askDeleteChat(eventId) {
    const n = filesFor(eventId).length;
    cf.eventId = eventId;
    cf.title.textContent = `Delete the AI chat for “${sessionTitle(eventId)}”?`;
    cf.text.textContent = n
      ? `This removes the whole conversation. The event has ${n} attached file${n === 1 ? "" : "s"}; you can keep ${n === 1 ? "it" : "them"} or remove ${n === 1 ? "it" : "them"} too. This can't be undone.`
      : "This removes the whole conversation. This can't be undone.";
    cf.chatFiles.textContent = n ? `Remove AI chat and files (${n})` : "Remove AI chat and files";
    cf.root.hidden = false;
    cf.cancel.focus();
  }
  const closeConfirm = () => { cf.root.hidden = true; cf.eventId = null; };
  function deleteChat(eventId, withFiles) {
    delete sessions[eventId];
    work.pending.delete(eventId);   // a reply still on its way is ignored (see sendMessage)
    work.unread.delete(eventId);
    delete work.drafts[eventId];
    if (withFiles) { delete attachments[eventId]; saveAttachments(); }
    saveSessions();
    if (work.displayed === eventId) {
      work.displayed = null;
      wk.text.value = "";
      const next = activeSessions()[0];
      if (next) displaySession(next.eventId, { focusTimeline: true });
    }
    renderWork();
    setStatus(withFiles ? "Deleted the AI chat and its files." : "Deleted the AI chat.");
  }
  cf.cancel.addEventListener("click", closeConfirm);
  cf.root.addEventListener("click", (e) => { if (e.target === cf.root) closeConfirm(); });
  cf.chatOnly.addEventListener("click", () => { const id = cf.eventId; closeConfirm(); if (id) deleteChat(id, false); });
  cf.chatFiles.addEventListener("click", () => { const id = cf.eventId; closeConfirm(); if (id) deleteChat(id, true); });
  $("wkDelete").addEventListener("click", (e) => { e.stopPropagation(); if (work.displayed) askDeleteChat(work.displayed); });

  // ----- sessions -----
  const openSessions = () => Object.values(sessions).filter((s) => s.open).sort((a, b) => b.lastActive - a.lastActive);
  // Sessions that have actually started (something was sent or attached). Only these appear in the switcher.
  const activeSessions = () => openSessions().filter((s) => s.messages.length > 0 || work.pending.has(s.eventId));
  // Clicked Work but nothing typed or sent yet.
  function isEmptySession(id) {
    const s = sessions[id];
    if (!s || s.messages.length || work.pending.has(id)) return false;
    const draft = id === work.displayed ? wk.text.value : work.drafts[id];
    return !(draft || "").trim();
  }
  // Silently discard an empty session (no timeline movement).
  function dropSession(id) {
    delete sessions[id];
    delete work.drafts[id];
    work.unread.delete(id);
    if (work.displayed === id) {
      work.displayed = null;
      wk.text.value = "";
    }
    saveSessions();
  }
  // The timeline moved away: empty sessions not on the new node end automatically.
  function pruneEmptySessions(options) {
    let droppedShown = false;
    for (const s of openSessions()) {
      if (options.includes(s.eventId) || !isEmptySession(s.eventId)) continue;
      if (s.eventId === work.displayed) droppedShown = true;
      dropSession(s.eventId);
    }
    if (droppedShown) {
      // Fall back to the most recent real session, without moving the timeline.
      const next = activeSessions()[0];
      if (next) {
        work.displayed = next.eventId;
        wk.text.value = work.drafts[next.eventId] || "";
      }
    }
    return droppedShown;
  }

  function startSession(eventId) {
    closeWorkMenu();
    const ev = eventById(eventId);
    let s = sessions[eventId];
    if (!s) s = sessions[eventId] = { eventId, title: ev ? ev.title : "", messages: [], open: true, lastActive: Date.now() };
    s.open = true;
    if (ev) s.title = ev.title;
    displaySession(eventId);
    if (FINE_POINTER) wk.text.focus();
  }

  // Show a session's chat. With focusTimeline, the timeline also moves to its event.
  function displaySession(eventId, { focusTimeline = false } = {}) {
    const s = sessions[eventId];
    if (!s) return;
    const prev = work.displayed;
    if (prev && prev !== eventId && isEmptySession(prev)) dropSession(prev);
    else if (prev && prev !== eventId) work.drafts[prev] = wk.text.value;
    if (work.displayed !== eventId) wk.text.value = work.drafts[eventId] || "";
    work.displayed = eventId;
    work.unread.delete(eventId);
    s.lastActive = Date.now();
    saveSessions();
    if (focusTimeline) focusTimelineOn(eventId);
    renderWork();
  }

  function endSession(eventId) {
    const s = sessions[eventId];
    if (!s) return;
    s.open = false;
    // A session nobody typed in leaves nothing behind.
    if (!s.messages.length && !work.pending.has(eventId)) delete sessions[eventId];
    delete work.drafts[eventId];
    if (work.displayed === eventId) {
      wk.text.value = "";
      const next = activeSessions()[0];
      work.displayed = null;
      if (next) displaySession(next.eventId, { focusTimeline: true });
    }
    saveSessions();
    renderWork();
  }

  // The timeline moved: if it now shows an event with an open session, show that chat.
  function onTimelineFocus(options) {
    if (work.displayed && options.includes(work.displayed)) return;
    const hit = options.find((id) => sessions[id] && sessions[id].open);
    if (hit) displaySession(hit);
  }

  // Move the timeline to an event (timed: that node; all-day: its day).
  function focusTimelineOn(eventId) {
    const ev = eventById(eventId);
    if (!ev || mode !== "timeline") return;
    tl.items = timelineItems();
    tl.auto = false;
    if (!ev.allDay && tl.items.some((it) => it.ev.id === eventId)) {
      tl.emptyDay = null;
      tl.focusId = eventId;
    } else {
      const day = startOfDay(parseISO(ev.start));
      const onDay = tl.items.find((it) => sameDay(it.s, day));
      tl.emptyDay = onDay ? null : day;
      tl.focusId = onDay ? onDay.ev.id : "virtual";
    }
    tl.seq = makeSeq();
    tl.focus = Math.max(0, tl.seq.findIndex((it) => seqKey(it) === tl.focusId));
    tl.lastKey = null; // let the focus hook see the change (it keeps the chosen session)
    drawTimeline();
  }

  async function sendMessage(eventId, text) {
    const s = sessions[eventId];
    if (!s || work.pending.has(eventId) || !text.trim()) return;
    const history = s.messages.filter((m) => m.role === "user" || m.role === "assistant").map((m) => ({ role: m.role, text: m.text }));
    s.messages.push({ role: "user", text: text.trim(), at: Date.now() });
    s.lastActive = Date.now();
    work.pending.add(eventId);
    saveSessions();
    renderWork();
    try {
      const ev = eventById(eventId);
      const s0 = ev ? parseISO(ev.start) : null, e0 = ev ? parseISO(ev.end) : null;
      const res = await fetch("/api/work", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: text.trim(),
          history,
          now: `${toISO(new Date())} (${new Date().toLocaleDateString(undefined, { weekday: "long" })})`,
          event: ev ? {
            title: ev.title,
            when: ev.allDay ? `${shortDate(s0)}, all day` : `${shortDate(s0)}, ${fmtRange(s0, e0)}`,
            location: ev.location || "",
            calendar: (calOf(ev) || {}).name || "",
            all_day: !!ev.allDay, is_task: !!ev.taskId, done: !!ev.done,
          } : { title: s.title },
          files: filesFor(eventId).map((f) => ({ name: f.name, content: f.content.slice(0, 8000) })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (sessions[eventId] !== s) return; // the chat was deleted meanwhile
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      const names = [];
      for (const f of data.files || []) { upsertFile(eventId, f.name, f.content, "ai"); names.push(f.name); }
      if (names.length) saveAttachments();
      s.messages.push({ role: "assistant", text: data.reply || "", files: names, at: Date.now() });
    } catch (err) {
      if (sessions[eventId] === s) s.messages.push({ role: "error", text: err.message || "Something went wrong.", at: Date.now() });
    } finally {
      if (sessions[eventId] !== s) return;
      work.pending.delete(eventId);
      if (work.displayed !== eventId) work.unread.add(eventId);
      saveSessions();
      renderWork();
    }
  }

  // User-attached text files go on the event and into the AI's context.
  wk.attach.addEventListener("click", (e) => { e.stopPropagation(); wk.file.click(); });
  wk.file.addEventListener("change", async () => {
    const id = work.displayed;
    const s = id && sessions[id];
    const picked = [...wk.file.files];
    wk.file.value = "";
    if (!s || !picked.length) return;
    for (const f of picked) {
      if (f.size > 200 * 1024) { s.messages.push({ role: "error", text: `“${f.name}” is too big (text files up to 200 KB).`, at: Date.now() }); continue; }
      const text = await f.text().catch(() => null);
      if (text == null || text.includes("\u0000")) { s.messages.push({ role: "error", text: `“${f.name}” isn't a text file.`, at: Date.now() }); continue; }
      upsertFile(id, f.name, text, "user");
      s.messages.push({ role: "note", text: `Attached ${f.name}`, at: Date.now() });
    }
    saveAttachments();
    saveSessions();
    renderWork();
  });

  // ----- rendering -----
  function setExpanded(on) {
    const was = tlEl.root.classList.contains("expanded");
    tlEl.root.classList.toggle("expanded", !!on);
    $("menuBtn").setAttribute("aria-pressed", String(!!on && mode === "timeline"));
    if (was === !!on) return;
    closeWorkMenu();
    wk.menu.hidden = true;
    // Opening the split view with no chat showing: bring up the most recent session, if any.
    if (on && !work.displayed && activeSessions().length) { displaySession(activeSessions()[0].eventId, { focusTimeline: true }); return; }
    if (on && work.displayed) focusTimelineOn(work.displayed);
    else if (mode === "timeline") drawTimeline();
    renderWork();
  }

  const fmtMsg = (t) => escapeHTML(t).replace(/\*\*(.+?)\*\*/g, "<b>$1</b>");
  function renderWork() {
    const s = work.displayed && sessions[work.displayed];
    const expanded = tlEl.root.classList.contains("expanded");
    if (!s || !s.open) {
      work.displayed = null;
      tlEl.root.classList.remove("tl-chat-bar", "tl-chat-compact");
      // Expanded with no session (opened from ☰): show a hint in the chat half.
      wk.panel.hidden = !expanded;
      wk.panel.classList.toggle("idle", expanded);
      if (mode === "timeline" && !tl.drag) drawTimeline();
      return;
    }
    wk.panel.classList.remove("idle");
    const id = s.eventId;
    const hasMsgs = s.messages.length > 0;
    wk.panel.hidden = false;
    tlEl.root.classList.toggle("tl-chat-bar", !expanded && !hasMsgs);
    tlEl.root.classList.toggle("tl-chat-compact", !expanded && hasMsgs);

    // Header: which session + switcher.
    const ev = eventById(id);
    wk.dot.style.background = ev ? colorOf(ev) : "#9aa0a6";
    wk.title.textContent = sessionTitle(id);
    const active = activeSessions();
    const others = active.filter((x) => x.eventId !== id);
    const total = others.length + (active.some((x) => x.eventId === id) ? 1 : 0);
    wk.count.textContent = total > 1 ? String(total) : "";
    wk.count.classList.toggle("alert", others.some((x) => work.unread.has(x.eventId)));
    wk.expand.innerHTML = expanded ? ICON_COLLAPSE : ICON_EXPAND;
    wk.expand.title = expanded ? "Shrink to a small chat" : "Expand";
    wk.expand.setAttribute("aria-label", wk.expand.title);

    // Files attached to this event.
    wk.files.innerHTML = "";
    wk.files.appendChild(attachmentChips(id, { max: expanded ? 8 : 4 }));

    // Messages.
    const pinned = wk.msgs.scrollHeight - wk.msgs.scrollTop - wk.msgs.clientHeight < 40;
    wk.msgs.innerHTML = "";
    for (const m of s.messages) {
      const b = document.createElement("div");
      b.className = `wk-msg ${m.role}`;
      if (m.role === "note") b.innerHTML = `${FILE_ICON}<span>${escapeHTML(m.text)}</span>`;
      else b.innerHTML = `<div class="wk-bubble">${fmtMsg(m.text)}</div>`;
      if (m.files && m.files.length) {
        const row = document.createElement("div");
        row.className = "att-chips";
        for (const name of m.files) {
          const f = filesFor(id).find((x) => x.name.toLowerCase() === name.toLowerCase());
          if (!f) continue;
          const c = document.createElement("button");
          c.type = "button";
          c.className = "att-chip";
          c.innerHTML = `${FILE_ICON}<span></span>`;
          c.querySelector("span").textContent = f.name;
          c.addEventListener("click", (e) => { e.stopPropagation(); openViewer({ ...f, eventId: id }); });
          row.appendChild(c);
        }
        b.appendChild(row);
      }
      wk.msgs.appendChild(b);
    }
    if (work.pending.has(id)) {
      const t = document.createElement("div");
      t.className = "wk-msg assistant typing";
      t.innerHTML = `<div class="wk-bubble"><span></span><span></span><span></span></div>`;
      wk.msgs.appendChild(t);
    }
    if (pinned || work.pending.has(id)) wk.msgs.scrollTop = wk.msgs.scrollHeight;

    // Input.
    wk.text.placeholder = hasMsgs ? "Message" : `What should we work on for “${sessionTitle(id)}”?`;
    wk.send.disabled = work.pending.has(id);
    autosizeWork();
    if (!wk.menu.hidden) renderSwitchMenu();
    if (mode === "timeline" && !tl.drag) drawTimeline();
  }
  function autosizeWork() {
    wk.text.style.height = "auto";
    wk.text.style.height = `${Math.min(wk.text.scrollHeight, 140)}px`;
  }

  // The Work button (compact view): hidden when there's nothing else here to work on.
  function updateWorkButton() {
    const choices = tl.options.filter((id) => id !== work.displayed);
    const show = mode === "timeline" && !tlEl.root.classList.contains("expanded") && choices.length > 0;
    wk.workBtn.hidden = !show;
    if (!show) { closeWorkMenu(); return; }
    wk.workLabel.textContent = choices.length === 1
      ? `Work on “${sessionTitle(choices[0])}”`
      : "Work";
  }
  function closeWorkMenu() { wk.workMenu.hidden = true; }
  function workOptionRow(id) {
    const ev = eventById(id);
    const b = document.createElement("button");
    b.type = "button";
    b.setAttribute("role", "menuitem");
    const s0 = parseISO(ev.start), e0 = parseISO(ev.end);
    b.innerHTML = `<span class="wk-dot"></span><span class="wm-text"><b></b><small></small></span>`;
    b.querySelector(".wk-dot").style.background = colorOf(ev);
    b.querySelector("b").textContent = ev.title || "(No title)";
    b.querySelector("small").textContent = (ev.allDay ? "All day" : fmtRange(s0, e0)) + (ev.taskId ? " · Task" : "")
      + (sessions[id] && sessions[id].open ? " · open session" : "");
    b.addEventListener("click", (e) => { e.stopPropagation(); startSession(id); });
    return b;
  }
  function openWorkMenu() {
    wk.workMenu.innerHTML = `<div class="wm-head">Work on…</div>`;
    tl.options.filter((id) => id !== work.displayed).forEach((id) => wk.workMenu.appendChild(workOptionRow(id)));
    wk.workMenu.hidden = false;
  }
  wk.workBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    const choices = tl.options.filter((id) => id !== work.displayed);
    if (choices.length === 1) { startSession(choices[0]); return; }
    // Several things on this day: let the user pick.
    if (!wk.workMenu.hidden) { closeWorkMenu(); return; }
    openWorkMenu();
  });
  function cardWorkButton(eventId, small = false) {
    const b = document.createElement("button");
    b.type = "button";
    b.className = "tl-cardwork" + (small ? " small" : "");
    b.innerHTML = `<svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M12 2l1.9 5.6L19.5 9.5l-5.6 1.9L12 17l-1.9-5.6L4.5 9.5l5.6-1.9z"/></svg><span>Work</span>`;
    b.title = `Work on “${sessionTitle(eventId)}”`;
    b.addEventListener("click", (e) => { e.stopPropagation(); startSession(eventId); });
    return b;
  }

  // Session switcher.
  function renderSwitchMenu() {
    wk.menu.innerHTML = `<div class="wm-head">Active sessions</div>`;
    const list = activeSessions();
    if (!list.length) wk.menu.insertAdjacentHTML("beforeend", `<div class="wm-empty">Nothing yet — send a message to start this session.</div>`);
    for (const s of list) {
      const ev = eventById(s.eventId);
      const b = document.createElement("button");
      b.type = "button";
      b.setAttribute("role", "menuitemradio");
      b.setAttribute("aria-checked", String(s.eventId === work.displayed));
      b.innerHTML = `<span class="wk-dot"></span><span class="wm-text"><b></b><small></small></span><span class="wm-state"></span>`;
      b.querySelector(".wk-dot").style.background = ev ? colorOf(ev) : "#9aa0a6";
      b.querySelector("b").textContent = sessionTitle(s.eventId);
      if (ev) {
        const s0 = parseISO(ev.start), e0 = parseISO(ev.end);
        b.querySelector("small").textContent = `${shortDate(s0)} · ${ev.allDay ? "All day" : fmtRange(s0, e0)}`;
      }
      const st = b.querySelector(".wm-state");
      if (work.pending.has(s.eventId)) { st.className = "wm-state busy"; st.title = "Working…"; }
      else if (work.unread.has(s.eventId)) { st.className = "wm-state unread"; st.title = "New reply"; }
      else if (s.eventId === work.displayed) st.innerHTML = CHECK_ICON;
      b.addEventListener("click", (e) => {
        e.stopPropagation();
        wk.menu.hidden = true;
        displaySession(s.eventId, { focusTimeline: true });
      });
      wk.menu.appendChild(b);
    }
  }
  wk.switchBtn.addEventListener("click", (e) => {
    e.stopPropagation();
    if (!wk.menu.hidden) { wk.menu.hidden = true; return; }
    renderSwitchMenu();
    wk.menu.hidden = false;
  });
  wk.expand.addEventListener("click", (e) => { e.stopPropagation(); setExpanded(!tlEl.root.classList.contains("expanded")); renderWork(); });
  wk.close.addEventListener("click", (e) => { e.stopPropagation(); if (work.displayed) endSession(work.displayed); });
  wk.cancel.addEventListener("click", (e) => { e.stopPropagation(); if (work.displayed) endSession(work.displayed); });
  wk.form.addEventListener("submit", (e) => {
    e.preventDefault();
    const id = work.displayed;
    const text = wk.text.value;
    if (!id || !text.trim() || work.pending.has(id)) return;
    wk.text.value = "";
    delete work.drafts[id];
    sendMessage(id, text);
  });
  wk.text.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); wk.form.requestSubmit(); }
    else if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); wk.text.blur(); }
  });
  wk.text.addEventListener("input", autosizeWork);
  // Clicks outside close the small menus.
  document.addEventListener("click", (e) => {
    if (!wk.workMenu.hidden && !wk.workMenu.contains(e.target)) closeWorkMenu();
    if (!wk.menu.hidden && !wk.menu.contains(e.target) && !wk.switchBtn.contains(e.target)) wk.menu.hidden = true;
  });

  // ---------- Whentomeet: find a time with other people ----------
  // Create (pick dates or weekdays → time window → name → share/add people), then open it to paint
  // your availability over the week view, see the group's overlap, or one person's availability.
  const MEET_KEY = "nl-calendar-meets-v1";
  // Made-up people for the prototype (example.com is reserved for examples).
  const CONTACTS = [
    { name: "Alex Rivera", email: "alex.rivera@example.com" },
    { name: "Priya Shah", email: "priya.shah@example.com" },
    { name: "Jordan Lee", email: "jordan.lee@example.com" },
    { name: "Sam Chen", email: "sam.chen@example.com" },
    { name: "Maya Thompson", email: "maya.thompson@example.com" },
    { name: "Diego Martinez", email: "diego.martinez@example.com" },
    { name: "Hannah Kim", email: "hannah.kim@example.com" },
    { name: "Omar Haddad", email: "omar.haddad@example.com" },
  ];
  const AVATAR_COLORS = ["#1a73e8", "#e8710a", "#188038", "#a142f4", "#d93025", "#12b5cb", "#f538a0", "#5f6368"];
  const SLOT_MIN = 30;
  let meets = loadJSON(MEET_KEY, []);
  meetsReady = true;
  const saveMeets = () => { try { localStorage.setItem(MEET_KEY, JSON.stringify(meets.filter(notDemo))); } catch { /* storage full */ } };
  const wtm = { wizard: null, active: null, view: "mine", member: null, sel: null, paint: null };
  const wz = {
    mini: $("miniCal"), box: $("wtmWizard"), list: $("wtmList"), items: $("wtmItems"),
    panel: $("wtmPanel"), newBtn: $("wtmNew"), grid: $("meetGrid"),
  };
  const meetById = (id) => meets.find((m) => m.id === id);
  const activeMeet = () => wtm.active && meetById(wtm.active);
  const DAY_NAMES = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const hourLabel = (h) => (h % 24 === 0 ? "12 AM" : h === 12 ? "12 PM" : h < 12 ? `${h} AM` : `${h - 12} PM`);
  const initials = (name) => name.split(/\s+/).map((w) => w[0]).join("").slice(0, 2).toUpperCase();
  const avatarColor = (key) => AVATAR_COLORS[hashStr(key) % AVATAR_COLORS.length];

  // Seeded random numbers so each person's made-up availability stays the same for an event.
  function hashStr(str) {
    let h = 2166136261;
    for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
    return h >>> 0;
  }
  function seeded(seed) {
    return () => {
      seed = (seed + 0x6d2b79f5) | 0;
      let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // A meeting "day" is a date ("2026-11-18") or a weekday ("3"); slots are 30-minute cells inside the window.
  const meetDays = (m) => (m.mode === "dates" ? m.dates : m.days.map(String));
  const slotsPerDay = (m) => ((m.end - m.start) * 60) / SLOT_MIN;
  const slotKey = (dk, i) => `${dk}#${i}`;
  function meetDayKeyFor(m, date) {
    if (m.mode === "dates") { const k = dayKey(date); return m.dates.includes(k) ? k : null; }
    return m.days.includes(date.getDay()) ? String(date.getDay()) : null;
  }
  function slotTimes(m, date, i) {
    const s = new Date(startOfDay(date).getTime() + (m.start * 60 + i * SLOT_MIN) * 60000);
    return [s, new Date(s.getTime() + SLOT_MIN * 60000)];
  }
  const busyAt = (s, e) => events.some((ev) => !ev.allDay && isVisible(ev) && parseISO(ev.start) < e && parseISO(ev.end) > s);
  // Your availability: what you painted, otherwise free unless an existing event is there.
  function mineFree(m, dk, i, date) {
    const k = slotKey(dk, i);
    if (Object.prototype.hasOwnProperty.call(m.mine, k)) return m.mine[k];
    const [s, e] = slotTimes(m, date, i);
    return !busyAt(s, e);
  }
  const availCache = new WeakMap();
  function memberFree(mem, dk, i) {
    let set = availCache.get(mem);
    if (!set) { set = new Set(mem.avail); availCache.set(mem, set); }
    return set.has(slotKey(dk, i));
  }
  function randomAvail(m, seedText) {
    const r = seeded(hashStr(`${m.id}|${seedText}`));
    const n = slotsPerDay(m);
    const out = new Set();
    for (const dk of meetDays(m)) {
      const roll = r();
      if (roll < 0.12) continue;                                   // busy all day
      if (roll > 0.9) { for (let i = 0; i < n; i++) out.add(slotKey(dk, i)); continue; } // free all day
      const blocks = 1 + Math.floor(r() * 2);
      for (let b = 0; b < blocks; b++) {
        const len = 2 + Math.floor(r() * Math.max(1, n / 2));
        const st = Math.floor(r() * Math.max(1, n - len + 1));
        for (let i = st; i < Math.min(n, st + len); i++) out.add(slotKey(dk, i));
      }
    }
    return [...out];
  }
  // Times you marked available that now overlap one of your events (e.g. an event was moved or edited
  // after you painted). Defaults can't conflict: a time with an event is "not available" by default.
  function meetConflicts(m) {
    // Weekday Whentomeets are checked against the week being viewed (or this week, outside the mode).
    const ref = wtm.active === m.id ? weekStart : startOfWeek(new Date());
    const out = [];
    for (const [k, free] of Object.entries(m.mine)) {
      if (!free) continue;
      const [dk, si] = k.split("#");
      const i = Number(si);
      if (i >= slotsPerDay(m)) continue;
      if (m.mode === "dates" ? !m.dates.includes(dk) : !m.days.includes(Number(dk))) continue;
      const date = m.mode === "dates" ? parseISO(dk) : addDays(ref, Number(dk));
      const [s0, e0] = slotTimes(m, date, i);
      if (busyAt(s0, e0)) out.push(k);
    }
    return out;
  }
  const conflictText = (n) => `${n} available time${n === 1 ? "" : "s"} overlap${n === 1 ? "s" : ""} your events`;
  // Refresh the red overlap warnings (sidebar list + open Whentomeet) without rebuilding anything.
  function updateMeetWarnings() {
    document.querySelectorAll(".wtm-warn[data-meet]").forEach((w) => {
      const m = meetById(w.dataset.meet);
      const n = m ? meetConflicts(m).length : 0;
      w.hidden = !n;
      const t = w.querySelector(".wtm-warn-text") || w;
      if (n) t.textContent = conflictText(n);
    });
  }
  function fixConflicts(m) {
    for (const k of meetConflicts(m)) delete m.mine[k]; // back to the default: an event means not available
    saveMeets();
    renderMeetGrid();
    renderMeetPanel();
  }
  function resetMine(m) {
    m.mine = {};
    saveMeets();
    renderMeetGrid();
    renderMeetPanel();
  }

  function addMember(m, name, email) {
    if (m.members.some((p) => p.email.toLowerCase() === email.toLowerCase())) return false;
    m.members.push({ id: uid(), name, email, avail: randomAvail(m, email.toLowerCase()) });
    saveMeets();
    return true;
  }
  function meetSummary(m) {
    let when;
    if (m.mode === "days") when = m.days.map((d) => DAY_NAMES[d]).join(", ");
    else {
      const ds = m.dates.map(parseISO);
      const f = (d, withMonth = true) => d.toLocaleDateString(undefined, withMonth ? { month: "short", day: "numeric" } : { day: "numeric" });
      if (ds.length <= 3) when = ds.map((d, i) => f(d, i === 0 || d.getMonth() !== ds[i - 1].getMonth())).join(", ");
      else when = `${f(ds[0])} – ${f(ds[ds.length - 1])} (${ds.length} days)`;
    }
    return `${when} · ${hourLabel(m.start)} – ${hourLabel(m.end)}`;
  }
  const demoLink = (m) => `https://whentomeet.example/e/${m.id}`;
  async function copyLink(m, btn) {
    try { await navigator.clipboard.writeText(demoLink(m)); } catch { /* the demo link doesn't need to land anywhere */ }
    const old = btn.innerHTML;
    btn.textContent = "Link copied (demo link)";
    btn.classList.add("done");
    setTimeout(() => { btn.innerHTML = old; btn.classList.remove("done"); }, 1800);
  }

  // Email box that lists the made-up people when focused; typing filters, Enter adds a typed address.
  function peopleAdder(m, onChange) {
    const wrap = document.createElement("div");
    wrap.className = "wtm-adder";
    wrap.innerHTML = `<input type="email" placeholder="Add people by email" aria-label="Add people by email" autocomplete="off">
      <div class="wtm-suggest" role="listbox" hidden></div>`;
    const input = wrap.querySelector("input"), box = wrap.querySelector(".wtm-suggest");
    const show = () => {
      const q = input.value.trim().toLowerCase();
      const opts = CONTACTS.filter((c) => !m.members.some((p) => p.email === c.email)
        && (!q || c.name.toLowerCase().includes(q) || c.email.includes(q)));
      box.innerHTML = "";
      for (const c of opts) {
        const b = document.createElement("button");
        b.type = "button";
        b.setAttribute("role", "option");
        b.innerHTML = `<span class="wtm-av"></span><span class="wtm-pt"><b></b><small></small></span>`;
        b.querySelector(".wtm-av").textContent = initials(c.name);
        b.querySelector(".wtm-av").style.background = avatarColor(c.email);
        b.querySelector("b").textContent = c.name;
        b.querySelector("small").textContent = c.email;
        // mousedown so the input's blur doesn't close the list first
        b.addEventListener("mousedown", (e) => { e.preventDefault(); addMember(m, c.name, c.email); input.value = ""; onChange(); show(); });
        box.appendChild(b);
      }
      if (!opts.length) box.innerHTML = `<div class="wtm-suggest-empty">${q ? "Press Enter to add this email" : "Everyone's been added"}</div>`;
      box.hidden = false;
    };
    input.addEventListener("focus", show);
    input.addEventListener("input", show);
    input.addEventListener("blur", () => setTimeout(() => { box.hidden = true; }, 120));
    input.addEventListener("keydown", (e) => {
      if (e.key === "Enter") {
        e.preventDefault();
        const v = input.value.trim();
        if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v)) return;
        const known = CONTACTS.find((c) => c.email === v.toLowerCase());
        const name = known ? known.name : v.split("@")[0].replace(/[._-]+/g, " ").replace(/\b\w/g, (c) => c.toUpperCase());
        addMember(m, name, known ? known.email : v);
        input.value = "";
        onChange();
        show();
      } else if (e.key === "Escape") { e.stopPropagation(); input.blur(); }
    });
    return wrap;
  }

  // ----- creation wizard (inside the mini calendar) -----
  function openWizard() {
    if (wtm.active) exitMeet();
    wtm.wizard = { step: "dates", mode: "dates", dates: new Set(), days: new Set(), offset: 0, start: 9, end: 17, name: "", meetId: null };
    renderWizard();
  }
  function closeWizard() {
    wtm.wizard = null;
    renderWizard();
    renderMeetList();
  }
  function renderWizard() {
    const w = wtm.wizard;
    wz.mini.classList.toggle("wtm-on", !!w);
    wz.box.hidden = !w;
    wz.newBtn.setAttribute("aria-pressed", String(!!w));
    if (!w) { renderMini(); return; }
    const box = wz.box;
    box.innerHTML = "";
    const head = document.createElement("div");
    head.className = "wz-head";
    const titles = { dates: "New Whentomeet", times: "What times?", name: "Name the event", share: "Invite people" };
    head.innerHTML = `<span class="wz-step">Step ${["dates", "times", "name", "share"].indexOf(w.step) + 1} of 4</span><span class="wz-title"></span>`;
    head.querySelector(".wz-title").textContent = titles[w.step];
    box.appendChild(head);
    const actions = document.createElement("div");
    actions.className = "wz-actions";
    const btn = (label, cls, fn, disabled = false) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = `wz-btn ${cls}`;
      b.textContent = label;
      b.disabled = disabled;
      b.addEventListener("click", (e) => { e.stopPropagation(); fn(); });
      return b;
    };

    if (w.step === "dates") {
      const seg = document.createElement("div");
      seg.className = "wz-seg";
      seg.innerHTML = `<button type="button" data-wmode="dates">Specific dates</button><button type="button" data-wmode="days">Days of the week</button>`;
      seg.querySelectorAll("button").forEach((b) => {
        b.setAttribute("aria-pressed", String(b.dataset.wmode === w.mode));
        b.addEventListener("click", (e) => { e.stopPropagation(); w.mode = b.dataset.wmode; renderWizard(); });
      });
      box.appendChild(seg);
      if (w.mode === "dates") box.appendChild(wizardDateGrid(w));
      else {
        const days = document.createElement("div");
        days.className = "wz-days";
        DAY_NAMES.forEach((n, d) => {
          const b = document.createElement("button");
          b.type = "button";
          b.textContent = n;
          b.setAttribute("aria-pressed", String(w.days.has(d)));
          b.addEventListener("click", (e) => { e.stopPropagation(); w.days.has(d) ? w.days.delete(d) : w.days.add(d); renderWizard(); });
          days.appendChild(b);
        });
        box.appendChild(days);
      }
      // (the instruction is a tooltip now; the help tour covers the rest)
      box.lastElementChild.title = w.mode === "dates" ? "Click or drag to choose the dates" : "Choose the weekdays that work";
      const count = w.mode === "dates" ? w.dates.size : w.days.size;
      actions.append(btn("Cancel", "", closeWizard), btn("Next", "primary", () => { w.step = "times"; renderWizard(); }, !count));
    } else if (w.step === "times") {
      const t = document.createElement("div");
      t.className = "wz-times";
      const sel = (label, value, from, to, key) => {
        const row = document.createElement("label");
        row.className = "wz-time";
        row.innerHTML = `<span></span><select></select>`;
        row.querySelector("span").textContent = label;
        const s = row.querySelector("select");
        for (let h = from; h <= to; h++) s.add(new Option(h === 24 ? "12 AM (midnight)" : hourLabel(h), h));
        s.value = value;
        s.addEventListener("change", () => {
          w[key] = Number(s.value);
          if (w.end <= w.start) { if (key === "start") w.end = Math.min(24, w.start + 1); else w.start = Math.max(0, w.end - 1); }
          renderWizard();
        });
        return row;
      };
      t.append(sel("No earlier than", w.start, 0, 23, "start"), sel("No later than", w.end, 1, 24, "end"));
      box.appendChild(t);
      actions.append(btn("Back", "", () => { w.step = "dates"; renderWizard(); }), btn("Next", "primary", () => { w.step = "name"; renderWizard(); }));
    } else if (w.step === "name") {
      const input = document.createElement("input");
      input.className = "wz-name";
      input.type = "text";
      input.maxLength = 80;
      input.placeholder = "e.g. Team kickoff";
      input.setAttribute("aria-label", "Event name");
      input.value = w.name;
      const create = btn("Create", "primary", () => createMeet(), !w.name.trim());
      input.addEventListener("input", () => { w.name = input.value; create.disabled = !w.name.trim(); });
      input.addEventListener("keydown", (e) => { if (e.key === "Enter" && w.name.trim()) { e.preventDefault(); createMeet(); } });
      box.appendChild(input);
      const sum = document.createElement("div");
      sum.className = "wz-hint";
      sum.textContent = meetSummary({ mode: w.mode, dates: [...w.dates].sort(), days: [...w.days].sort(), start: w.start, end: w.end });
      box.appendChild(sum);
      actions.append(btn("Back", "", () => { w.step = "times"; renderWizard(); }), create);
      setTimeout(() => input.focus(), 0);
    } else if (w.step === "share") {
      const m = meetById(w.meetId);
      const sum = document.createElement("div");
      sum.className = "wz-made";
      sum.innerHTML = `<b></b><small></small>`;
      sum.querySelector("b").textContent = `Whentomeet for ${m.name}`;
      sum.querySelector("small").textContent = meetSummary(m);
      box.appendChild(sum);
      const copy = btn("", "link", () => copyLink(m, copy));
      copy.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M3.9 12a3.1 3.1 0 0 1 3.1-3.1h4V7H7a5 5 0 0 0 0 10h4v-1.9H7A3.1 3.1 0 0 1 3.9 12zM8 13h8v-2H8v2zm9-6h-4v1.9h4a3.1 3.1 0 0 1 0 6.2h-4V17h4a5 5 0 0 0 0-10z"/></svg>Copy shareable link`;
      box.appendChild(copy);
      const chips = document.createElement("div");
      chips.className = "wz-chips";
      const paintChips = () => {
        chips.innerHTML = "";
        for (const p of m.members) {
          const c = document.createElement("span");
          c.className = "wz-chip";
          c.innerHTML = `<span class="wtm-av"></span><span class="wz-chip-name"></span><button type="button" aria-label="Remove">×</button>`;
          c.querySelector(".wtm-av").textContent = initials(p.name);
          c.querySelector(".wtm-av").style.background = avatarColor(p.email);
          c.querySelector(".wz-chip-name").textContent = p.name;
          c.querySelector("button").addEventListener("click", (e) => {
            e.stopPropagation();
            m.members = m.members.filter((x) => x !== p);
            saveMeets();
            paintChips();
          });
          chips.appendChild(c);
        }
      };
      paintChips();
      box.appendChild(peopleAdder(m, paintChips));
      box.appendChild(chips);
      actions.append(btn("Done", "primary", closeWizard));
    }
    box.appendChild(actions);
  }

  // Date picker: first row is the current week, no "current week" highlight; click or drag to select.
  function wizardDateGrid(w) {
    const wrap = document.createElement("div");
    const first = addDays(startOfWeek(new Date()), w.offset * 7);
    const last = addDays(first, 41);
    const bar = document.createElement("div");
    bar.className = "wz-monthbar";
    const m1 = MONTHS[first.getMonth()].slice(0, 3), m2 = MONTHS[last.getMonth()].slice(0, 3);
    bar.innerHTML = `<span></span><div>
      <button type="button" class="icon-btn small" aria-label="Earlier weeks"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M15.41 7.41 14 6l-6 6 6 6 1.41-1.41L10.83 12z"/></svg></button>
      <button type="button" class="icon-btn small" aria-label="Later weeks"><svg viewBox="0 0 24 24" width="18" height="18"><path d="M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6z"/></svg></button></div>`;
    bar.querySelector("span").textContent = m1 === m2 ? `${MONTHS[first.getMonth()]} ${first.getFullYear()}` : `${m1} – ${m2} ${last.getFullYear()}`;
    const [prev, next] = bar.querySelectorAll("button");
    prev.disabled = w.offset <= 0;
    prev.addEventListener("click", (e) => { e.stopPropagation(); w.offset = Math.max(0, w.offset - 4); renderWizard(); });
    next.addEventListener("click", (e) => { e.stopPropagation(); w.offset += 4; renderWizard(); });
    wrap.appendChild(bar);
    const grid = document.createElement("div");
    grid.className = "mini-grid wz-grid";
    grid.innerHTML = ["S", "M", "T", "W", "T", "F", "S"].map((d) => `<div class="dow">${d}</div>`).join("");
    const today = startOfDay(new Date());
    for (let i = 0; i < 42; i++) {
      const d = addDays(first, i);
      const b = document.createElement("button");
      b.type = "button";
      b.dataset.date = dayKey(d);
      b.textContent = d.getDate() === 1 ? `${MONTHS[d.getMonth()].slice(0, 3)} 1` : d.getDate();
      if (d.getDate() === 1) b.classList.add("first");
      if (d < today) b.disabled = true;
      if (sameDay(d, today)) b.classList.add("is-today");
      b.classList.toggle("sel", w.dates.has(b.dataset.date));
      grid.appendChild(b);
    }
    // Drag selection: the first cell decides whether the drag adds or removes dates.
    let painting = null;
    const apply = (b) => {
      if (!b || b.disabled || !b.dataset.date) return;
      if (painting.add) w.dates.add(b.dataset.date); else w.dates.delete(b.dataset.date);
      b.classList.toggle("sel", painting.add);
    };
    grid.addEventListener("pointerdown", (e) => {
      const b = e.target.closest("button[data-date]");
      if (!b || b.disabled) return;
      e.preventDefault();
      painting = { add: !w.dates.has(b.dataset.date) };
      grid.setPointerCapture(e.pointerId);
      apply(b);
    });
    grid.addEventListener("pointermove", (e) => {
      if (!painting) return;
      const n = document.elementFromPoint(e.clientX, e.clientY);
      apply(n && n.closest && n.closest(".wz-grid button[data-date]"));
    });
    const end = () => { if (painting) { painting = null; renderWizard(); } };
    grid.addEventListener("pointerup", end);
    grid.addEventListener("pointercancel", end);
    wrap.appendChild(grid);
    return wrap;
  }

  function createMeet() {
    const w = wtm.wizard;
    if (!w || !w.name.trim()) return;
    const m = {
      id: "m" + uid(), name: w.name.trim(), mode: w.mode,
      dates: [...w.dates].sort(), days: [...w.days].sort((a, b) => a - b),
      start: w.start, end: w.end, members: [], mine: {}, createdAt: Date.now(),
    };
    meets.push(m);
    saveMeets();
    w.meetId = m.id;
    w.step = "share";
    renderWizard();
    renderMeetList();
  }

  // ----- list in the sidebar -----
  const MEET_ICON = `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="M16 11c1.66 0 2.99-1.34 2.99-3S17.66 5 16 5c-1.66 0-3 1.34-3 3s1.34 3 3 3zm-8 0c1.66 0 2.99-1.34 2.99-3S9.66 5 8 5C6.34 5 5 6.34 5 8s1.34 3 3 3zm0 2c-2.33 0-7 1.17-7 3.5V19h14v-2.5c0-2.33-4.67-3.5-7-3.5zm8 0c-.29 0-.62.02-.97.05 1.16.84 1.97 1.97 1.97 3.45V19h6v-2.5c0-2.33-4.67-3.5-7-3.5z"/></svg>`;
  function renderMeetList() {
    wz.list.hidden = !meets.length;
    wz.items.innerHTML = "";
    for (const m of meets) {
      const li = document.createElement("li");
      li.className = "wtm-li";
      const b = document.createElement("button");
      b.type = "button";
      b.className = "wtm-item";
      b.innerHTML = `${MEET_ICON}<span class="wtm-pt"><b></b><small></small></span>`;
      b.querySelector("b").textContent = `Whentomeet for ${m.name}`;
      const count = m.members.length + 1;
      b.querySelector("small").textContent = `${count} ${count === 1 ? "person" : "people"} · ${meetSummary(m)}`;
      const warn = document.createElement("small");
      warn.className = "wtm-warn";
      warn.dataset.meet = m.id;
      warn.hidden = true;
      b.querySelector(".wtm-pt").appendChild(warn);
      b.addEventListener("click", (e) => { e.stopPropagation(); enterMeet(m.id); });
      li.appendChild(b);
      wz.items.appendChild(li);
    }
    updateMeetWarnings();
  }

  // ----- Whentomeet mode -----
  function enterMeet(id) {
    const m = meetById(id);
    if (!m) return;
    if (wtm.wizard) { wtm.wizard = null; renderWizard(); }
    if (mode !== "calendar") setMode("calendar");
    hidePopover();
    wtm.active = id; wtm.view = "mine"; wtm.member = null; wtm.sel = null; wtm.paint = null;
    // The sidebar becomes the Whentomeet panel, so make sure it's showing.
    el.sidebar.classList.remove("collapsed");
    if (isMobile()) el.sidebar.classList.add("open");
    syncQuickAdd();
    el.sidebar.classList.add("meet-mode");
    el.main.classList.add("meet");
    if (view !== "week") { view = "week"; saveViewPref(); }
    goToDate(m.mode === "dates" && m.dates.length ? parseISO(m.dates.find((d) => parseISO(d) >= startOfDay(new Date())) || m.dates[0]) : new Date(), false);
    render();
    renderMeetPanel();
    wz.grid.scrollTop = 0;
  }
  function exitMeet() {
    if (!wtm.active) return;
    wtm.active = null; wtm.paint = null; wtm.sel = null;
    el.sidebar.classList.remove("meet-mode");
    el.main.classList.remove("meet");
    wz.grid.hidden = true;
    wz.grid.innerHTML = "";
    wz.panel.hidden = true;
    renderMeetList();
    render();
  }
  function setMeetView(v, memberId = null) {
    wtm.view = v; wtm.member = memberId; wtm.sel = null;
    renderMeetPanel();
    renderMeetGrid();
  }

  // The Whentomeet grid: one big block per 30 minutes for each day of the week shown, under the
  // normal day headers. Your events appear as month-view-style lines in the block where they start.
  function renderMeetGrid() {
    const m = activeMeet();
    wz.grid.hidden = !m;
    if (!m) return;
    const n = slotsPerDay(m);
    const people = 1 + m.members.length;
    const member = wtm.view === "member" && m.members.find((p) => p.id === wtm.member);
    const scroll = wz.grid.scrollTop;
    wz.grid.innerHTML = "";
    const g = document.createElement("div");
    g.className = "mg";
    g.style.gridTemplateRows = `repeat(${n}, minmax(30px, 1fr))`;
    // Time labels on the hour.
    for (let i = 0; i < n; i++) {
      const lab = document.createElement("div");
      lab.className = "mg-time";
      lab.style.gridRow = String(i + 1);
      const mins = m.start * 60 + i * SLOT_MIN;
      if (mins % 60 === 0) lab.textContent = hourLabel(mins / 60);
      g.appendChild(lab);
    }
    for (let ci = 0; ci < 7; ci++) {
      const date = addDays(weekStart, ci);
      const dk = meetDayKeyFor(m, date);
      if (!dk) {
        // Not one of this Whentomeet's days.
        const off = document.createElement("div");
        off.className = "mg-off";
        off.style.gridColumn = String(ci + 2);
        off.style.gridRow = `1 / ${n + 1}`;
        g.appendChild(off);
        continue;
      }
      // Your events: a title line in the block where each starts (or the first block if it began
      // earlier), plus a bar down to where it ends. Overlapping events get side-by-side lanes.
      const lines = {};
      const dayEvents = [];
      let laneCount = 0;
      const winStart = slotTimes(m, date, 0)[0], winEnd = slotTimes(m, date, n - 1)[1];
      if (wtm.view === "mine") {
        const laneEnds = [];
        events
          .filter((ev) => !ev.allDay && isVisible(ev) && parseISO(ev.start) < winEnd && parseISO(ev.end) > winStart)
          .sort((a, b) => parseISO(a.start) - parseISO(b.start) || parseISO(b.end) - parseISO(a.end))
          .forEach((ev) => {
            const st = parseISO(ev.start), en = parseISO(ev.end);
            const i = clamp(Math.floor((st - winStart) / (SLOT_MIN * 60000)), 0, n - 1);
            (lines[i] = lines[i] || []).push(ev);
            let lane = laneEnds.findIndex((t) => t <= st);
            if (lane === -1) { lane = laneEnds.length; laneEnds.push(0); }
            laneEnds[lane] = en;
            dayEvents.push({ ev, st, en, lane });
          });
        laneCount = laneEnds.length;
      }
      for (let i = 0; i < n; i++) {
        const cell = document.createElement("div");
        cell.className = "wtm-cell";
        cell.style.gridColumn = String(ci + 2);
        cell.style.gridRow = String(i + 1);
        cell.dataset.dk = dk;
        cell.dataset.i = i;
        cell.dataset.col = ci;
        cell.dataset.date = dayKey(date);
        if ((m.start * 60 + i * SLOT_MIN) % 60 === 0) cell.classList.add("hour");
        if (laneCount) cell.style.paddingLeft = `${BAR_X0 + laneCount * BAR_STEP + 2}px`; // keep titles clear of the bars
        if (wtm.view === "group") {
          let k = mineFree(m, dk, i, date) ? 1 : 0;
          for (const p of m.members) if (memberFree(p, dk, i)) k++;
          cell.style.background = k ? `rgba(52,168,83,${(0.15 + 0.75 * (k / people)).toFixed(3)})` : "";
          cell.classList.add(k ? "g" : "busy");
          cell.title = `${k}/${people} available`;
          if (k) {
            const c = document.createElement("span");
            c.className = "mg-count";
            c.textContent = `${k}/${people}`;
            cell.appendChild(c);
          }
          if (wtm.sel && wtm.sel.dk === dk && wtm.sel.i === i) cell.classList.add("sel");
        } else if (member) {
          cell.classList.add(memberFree(member, dk, i) ? "free" : "busy");
        } else {
          const free = mineFree(m, dk, i, date);
          cell.classList.add(free ? "free" : "busy");
          // Marked available but an event is there now: outline it so the overlap is easy to spot.
          if (free && busyAt(...slotTimes(m, date, i))) { cell.classList.add("conflict"); cell.title = "Marked available, but an event overlaps this time"; }
          for (const ev of (lines[i] || [])) {
            const line = document.createElement("div");
            line.className = "mg-ev";
            line.style.setProperty("--c", colorOf(ev));
            line.innerHTML = `<span class="mdot"></span><span class="mtime"></span><span class="mtitle"></span>`;
            line.querySelector(".mdot").style.background = colorOf(ev);
            line.querySelector(".mtime").textContent = fmtTime(parseISO(ev.start));
            line.querySelector(".mtitle").textContent = ev.title || "(No title)";
            line.title = `${ev.title || "(No title)"} · ${fmtRange(parseISO(ev.start), parseISO(ev.end))}`;
            cell.appendChild(line);
          }
        }
        g.appendChild(cell);
      }
      if (dayEvents.length) {
        const layer = document.createElement("div");
        layer.className = "mg-bars";
        layer.style.gridColumn = String(ci + 2);
        layer.style.gridRow = `1 / ${n + 1}`;
        layer._bars = dayEvents;
        layer._win = winStart;
        g.appendChild(layer);
      }
    }
    wz.grid.appendChild(g);
    placeEventBars(g, n);
    wz.grid.scrollTop = scroll;
    // Keep the day headers lined up with the grid when it has a scrollbar.
    const sb = wz.grid.offsetWidth - wz.grid.clientWidth;
    document.documentElement.style.setProperty("--scrollbar", `${sb}px`);
  }

  // Draw each event's bar from its start to its end, using the real block positions (blocks have gaps).
  const BAR_X0 = 4, BAR_STEP = 8, BAR_W = 4;
  function placeEventBars(g, n) {
    const slotMs = SLOT_MIN * 60000;
    g.querySelectorAll(".mg-bars").forEach((layer) => {
      const col = layer.style.gridColumn;
      const cells = [...g.querySelectorAll(".wtm-cell")].filter((c) => c.style.gridColumn === col)
        .sort((a, b) => Number(a.dataset.i) - Number(b.dataset.i));
      const base = layer.getBoundingClientRect().top;
      if (!cells.length || !layer.getBoundingClientRect().height) return;
      const rects = cells.map((c) => { const r = c.getBoundingClientRect(); return { top: r.top - base, h: r.height }; });
      // Position (in px) of a moment within the window. An end time that falls exactly on a block
      // boundary stops at the bottom of the block before it (not across the gap into the next block).
      const yAt = (t, isEnd = false) => {
        const pos = (t - layer._win) / slotMs;
        if (pos <= 0) return rects[0].top;
        if (pos >= n) return rects[n - 1].top + rects[n - 1].h;
        if (isEnd && Number.isInteger(pos)) return rects[pos - 1].top + rects[pos - 1].h;
        const i = Math.min(n - 1, Math.floor(pos));
        return rects[i].top + (pos - i) * rects[i].h;
      };
      const labels = [];
      for (const b of layer._bars) {
        const color = colorOf(b.ev);
        const x = BAR_X0 + b.lane * BAR_STEP;
        const y1 = yAt(b.st), y2 = Math.max(yAt(b.en, true), y1 + 6);
        const bar = document.createElement("div");
        bar.className = "mg-bar" + (b.st < layer._win ? " cut-top" : "");
        bar.style.cssText = `left:${x}px;top:${y1}px;height:${y2 - y1}px;width:${BAR_W}px;--c:${color}`;
        bar.title = `${b.ev.title || "(No title)"} · ${fmtRange(b.st, b.en)}`;
        layer.appendChild(bar);
        labels.push({ y: y2, x, color, text: fmtTime(b.en), cut: (b.en - layer._win) / slotMs > n });
      }
      // End-time pills next to the bar ends. Events ending at the same moment share one pill (a dot per
      // event); pills that would still overlap are nudged apart.
      labels.sort((a, b) => a.y - b.y || a.x - b.x);
      const merged = [];
      for (const l of labels) {
        const prev = merged[merged.length - 1];
        if (prev && prev.text === l.text && Math.abs(prev.y - l.y) < 1) { prev.colors.push(l.color); prev.x = Math.max(prev.x, l.x); }
        else merged.push({ ...l, colors: [l.color] });
      }
      const PILL_H = 16;
      let lastY = -Infinity;
      for (const l of merged) {
        const y = Math.max(l.y - PILL_H / 2, lastY + PILL_H + 1);
        lastY = y;
        const pill = document.createElement("div");
        pill.className = "mg-end" + (l.cut ? " cut" : "") + (l.colors.length > 1 ? " multi" : "");
        pill.style.cssText = `left:${l.x + BAR_W + 3}px;top:${y}px;--c:${l.colors[0]}`;
        if (l.colors.length > 1) {
          for (const c of l.colors) { const d = document.createElement("span"); d.className = "mg-end-dot"; d.style.background = c; pill.appendChild(d); }
        }
        pill.appendChild(document.createTextNode(l.text));
        layer.appendChild(pill);
      }
    });
  }

  // Painting your availability: drag a rectangle; the first block decides free or busy.
  function meetCellAt(x, y) {
    const n = document.elementFromPoint(x, y);
    return n && n.closest && n.closest(".mg .wtm-cell");
  }
  function meetDown(e) {
    const cell = e.target.closest(".wtm-cell");
    if (!cell || e.button !== 0) return;
    const m = activeMeet();
    const dk = cell.dataset.dk, i = Number(cell.dataset.i);
    if (wtm.view === "group") {
      wtm.sel = { dk, i, date: cell.dataset.date };
      wz.grid.querySelectorAll(".wtm-cell.sel").forEach((c) => c.classList.remove("sel"));
      cell.classList.add("sel");
      renderMeetPanel();
      return;
    }
    if (wtm.view !== "mine" || !m) return;
    e.preventDefault();
    const pos = { col: Number(cell.dataset.col), i };
    wtm.paint = { target: !cell.classList.contains("free"), a: pos, b: pos };
    wz.grid.setPointerCapture(e.pointerId);
    previewPaint();
  }
  function meetMove(e) {
    if (!wtm.paint) return;
    const cell = meetCellAt(e.clientX, e.clientY);
    if (!cell) return;
    wtm.paint.b = { col: Number(cell.dataset.col), i: Number(cell.dataset.i) };
    previewPaint();
  }
  const inPaintRect = (cell) => {
    const p = wtm.paint, c = Number(cell.dataset.col), i = Number(cell.dataset.i);
    return c >= Math.min(p.a.col, p.b.col) && c <= Math.max(p.a.col, p.b.col)
      && i >= Math.min(p.a.i, p.b.i) && i <= Math.max(p.a.i, p.b.i);
  };
  function previewPaint() {
    const m = activeMeet();
    wz.grid.querySelectorAll(".wtm-cell").forEach((cell) => {
      const date = parseISO(cell.dataset.date), i = Number(cell.dataset.i);
      const free = inPaintRect(cell) ? wtm.paint.target : mineFree(m, cell.dataset.dk, i, date);
      cell.classList.toggle("free", free);
      cell.classList.toggle("busy", !free);
      cell.classList.toggle("conflict", free && busyAt(...slotTimes(m, date, i)));
    });
  }
  function meetUp(e) {
    if (!wtm.paint) return;
    const m = activeMeet();
    try { wz.grid.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    if (m) {
      wz.grid.querySelectorAll(".wtm-cell").forEach((cell) => {
        if (inPaintRect(cell)) m.mine[slotKey(cell.dataset.dk, Number(cell.dataset.i))] = wtm.paint.target;
      });
      saveMeets();
    }
    wtm.paint = null;
    renderMeetGrid();
    const reset = wz.panel.querySelector(".wtm-reset");
    if (reset && m) reset.disabled = !Object.keys(m.mine).length;
    updateMeetWarnings();
  }

  // Sidebar panel while a Whentomeet is open.
  function renderMeetPanel() {
    const m = activeMeet();
    const p = wz.panel;
    p.hidden = !m;
    if (!m) return;
    const people = 1 + m.members.length;
    p.innerHTML = `
      <div class="wtm-top">
        <button type="button" class="wtm-block" title="Back to the normal calendar">${MEET_ICON}<span class="wtm-pt"><b></b><small></small></span></button>
        <button type="button" class="icon-btn small wtm-x" aria-label="Close Whentomeet" title="Close Whentomeet">
          <svg viewBox="0 0 24 24" width="18" height="18"><path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
        </button>
      </div>
      <div class="wtm-warn wtm-warn-row" data-meet="${m.id}" hidden>
        <svg viewBox="0 0 24 24" width="14" height="14" aria-hidden="true"><path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/></svg>
        <span class="wtm-warn-text"></span>
        <button type="button" class="wtm-warn-fix">Mark not available</button>
      </div>
      <div class="wtm-seg" role="tablist">
        <button type="button" role="tab" data-v="mine">My availability</button>
        <button type="button" role="tab" data-v="group">Group availability</button>
      </div>
      <div class="wtm-help"></div>
      <div class="wtm-info" hidden></div>
      <div class="wtm-people-head">People (${people})</div>
      <ul class="wtm-people"></ul>
      <div class="wtm-add-slot"></div>
      <div class="wtm-foot">
        <button type="button" class="wz-btn link wtm-copy"></button>
        <button type="button" class="wtm-del">Delete this Whentomeet</button>
      </div>`;
    p.querySelector(".wtm-block b").textContent = `Whentomeet for ${m.name}`;
    p.querySelector(".wtm-block small").textContent = meetSummary(m);
    p.querySelector(".wtm-block").addEventListener("click", (e) => { e.stopPropagation(); exitMeet(); });
    p.querySelector(".wtm-warn-fix").addEventListener("click", (e) => { e.stopPropagation(); fixConflicts(m); });
    p.querySelector(".wtm-x").addEventListener("click", (e) => { e.stopPropagation(); exitMeet(); });
    p.querySelectorAll("[data-v]").forEach((b) => {
      b.setAttribute("aria-selected", String(wtm.view === b.dataset.v));
      b.addEventListener("click", (e) => { e.stopPropagation(); setMeetView(b.dataset.v); });
    });

    const help = p.querySelector(".wtm-help");
    if (wtm.view === "mine") {
      help.innerHTML = `<div class="wtm-legend2" title="Drag on the calendar to mark times available or not available"><span class="sw free"></span>Available <span class="sw busy"></span>Not available</div>`;
      const reset = document.createElement("button");
      reset.type = "button";
      reset.className = "wtm-reset";
      reset.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M17.65 6.35A7.96 7.96 0 0 0 12 4a8 8 0 1 0 7.73 10h-2.08A6 6 0 1 1 12 6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z"/></svg>Reset to my calendar`;
      reset.title = "Clear what you painted and go back to the default (times with events are not available)";
      reset.disabled = !Object.keys(m.mine).length;
      reset.addEventListener("click", (e) => { e.stopPropagation(); resetMine(m); });
      help.appendChild(reset);
    } else if (wtm.view === "group") {
      help.innerHTML = `<div class="wtm-scale" title="Greener = more people free · click a time to see who"><span>0/${people}</span><span class="bar"></span><span>${people}/${people}</span></div>`;
    } else {
      const mem = m.members.find((x) => x.id === wtm.member);
      help.innerHTML = `<div class="wtm-legend2"><span class="sw free"></span>Available <span class="sw busy"></span>Not available</div>`;
      const t = document.createElement("div");
      t.textContent = `Showing ${mem ? mem.name : "this person"}'s availability.`;
      help.appendChild(t);
    }

    // Who is free at the selected time (group view).
    const info = p.querySelector(".wtm-info");
    if (wtm.view === "group" && wtm.sel) {
      const date = parseISO(wtm.sel.date);
      const [s, e] = slotTimes(m, date, wtm.sel.i);
      const all = [{ name: "You", free: mineFree(m, wtm.sel.dk, wtm.sel.i, date), key: "you" },
        ...m.members.map((x) => ({ name: x.name, free: memberFree(x, wtm.sel.dk, wtm.sel.i), key: x.email }))];
      const yes = all.filter((x) => x.free), no = all.filter((x) => !x.free);
      const label = m.mode === "days" ? DAY_NAMES[Number(wtm.sel.dk)] : date.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
      info.hidden = false;
      info.innerHTML = `<div class="wtm-info-when"><b></b><span></span></div>
        <div class="wtm-info-cols"><div><div class="wtm-info-h ok">Available (${yes.length}/${all.length})</div><ul class="ok"></ul></div>
        <div><div class="wtm-info-h no">Unavailable (${no.length}/${all.length})</div><ul class="no"></ul></div></div>`;
      info.querySelector("b").textContent = label;
      info.querySelector(".wtm-info-when span").textContent = fmtRange(s, e);
      for (const [list, sel] of [[yes, "ul.ok"], [no, "ul.no"]]) {
        const ul = info.querySelector(sel);
        for (const x of list) { const li = document.createElement("li"); li.textContent = x.name; ul.appendChild(li); }
        if (!list.length) ul.innerHTML = `<li class="none">Nobody</li>`;
      }
    }

    // People: "You" opens your editable availability; a member shows theirs.
    const ul = p.querySelector(".wtm-people");
    const row = (name, sub, key, active, onClick, removable) => {
      const li = document.createElement("li");
      li.innerHTML = `<button type="button" class="wtm-person"><span class="wtm-av"></span><span class="wtm-pt"><b></b><small></small></span></button>`;
      const b = li.querySelector("button");
      b.classList.toggle("on", active);
      b.querySelector(".wtm-av").textContent = initials(name);
      b.querySelector(".wtm-av").style.background = key === "you" ? "#7b1fa2" : avatarColor(key);
      b.querySelector("b").textContent = name;
      b.querySelector("small").textContent = sub;
      b.addEventListener("click", (e) => { e.stopPropagation(); onClick(); });
      if (removable) {
        const x = document.createElement("button");
        x.type = "button";
        x.className = "wtm-remove";
        x.setAttribute("aria-label", `Remove ${name}`);
        x.title = "Remove";
        x.textContent = "×";
        x.addEventListener("click", (e) => { e.stopPropagation(); removable(); });
        li.appendChild(x);
      }
      ul.appendChild(li);
    };
    row("You", "Edit your availability", "you", wtm.view === "mine", () => setMeetView("mine"));
    for (const mem of m.members) {
      row(mem.name, mem.email, mem.email, wtm.view === "member" && wtm.member === mem.id, () => setMeetView("member", mem.id), () => {
        m.members = m.members.filter((x) => x !== mem);
        saveMeets();
        if (wtm.member === mem.id) wtm.view = "mine";
        wtm.sel = null;
        renderMeetPanel();
        renderGrid();
      });
    }
    p.querySelector(".wtm-add-slot").appendChild(peopleAdder(m, () => { renderMeetPanel(); renderGrid(); }));
    const copy = p.querySelector(".wtm-copy");
    copy.innerHTML = `<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M3.9 12a3.1 3.1 0 0 1 3.1-3.1h4V7H7a5 5 0 0 0 0 10h4v-1.9H7A3.1 3.1 0 0 1 3.9 12zM8 13h8v-2H8v2zm9-6h-4v1.9h4a3.1 3.1 0 0 1 0 6.2h-4V17h4a5 5 0 0 0 0-10z"/></svg>Copy shareable link`;
    copy.addEventListener("click", (e) => { e.stopPropagation(); copyLink(m, copy); });
    updateMeetWarnings();
    p.querySelector(".wtm-del").addEventListener("click", (e) => {
      e.stopPropagation();
      if (!window.confirm(`Delete “Whentomeet for ${m.name}”? Everyone's availability for it will be lost.`)) return;
      meets = meets.filter((x) => x !== m);
      saveMeets();
      exitMeet();
    });
  }

  // First visit: an example Whentomeet over the next three weekdays with a few people already invited.
  if (localStorage.getItem(MEET_KEY) === null) {
    const days = [];
    for (let d = addDays(startOfDay(new Date()), 1); days.length < 3; d = addDays(d, 1)) if (d.getDay() % 6) days.push(dayKey(d));
    const ex = { id: "m-example", name: "Pitch practice", mode: "dates", dates: days, days: [], start: 9, end: 17, members: [], mine: {}, createdAt: Date.now() };
    for (const c of CONTACTS.slice(0, 4)) ex.members.push({ id: uid(), name: c.name, email: c.email, avail: randomAvail(ex, c.email) });
    meets = [ex];
    saveMeets();
  }

  wz.newBtn.addEventListener("click", (e) => { e.stopPropagation(); if (wtm.wizard) closeWizard(); else openWizard(); });
  wz.grid.addEventListener("pointerdown", meetDown);
  wz.grid.addEventListener("pointermove", meetMove);
  wz.grid.addEventListener("pointerup", meetUp);
  wz.grid.addEventListener("pointercancel", () => { if (wtm.paint) { wtm.paint = null; renderMeetGrid(); } });
  // While a Whentomeet is open the day headers are display-only.
  el.weekHead.addEventListener("pointerdown", (e) => { if (wtm.active) e.stopImmediatePropagation(); }, true);

  // ---------- Connection Hub ----------
  // Incoming messages from other apps (made-up demo data), up to 3 sources shown as columns, and a
  // Construct section that turns them into events/tasks (by hand or with AI) and adds them to the calendar.
  const HUB_KEY = "nl-calendar-hub-v1";
  const HUB_PAGE = 12;
  const HUB_SOURCES = [
    { id: "slack", name: "Slack", color: "#611f69", glyph: "#" },
    { id: "email", name: "Email", color: "#d93025", glyph: "@" },
    { id: "canvas", name: "Canvas", color: "#c2410c", glyph: "C" },
    { id: "teams", name: "Microsoft Teams", color: "#5b5fc7", glyph: "T" },
    { id: "discord", name: "Discord", color: "#5865f2", glyph: "D" },
    { id: "sms", name: "Text messages", color: "#188038", glyph: "✉" },
    { id: "groupme", name: "GroupMe", color: "#0090c8", glyph: "G" },
  ];
  // [minutes ago, from, channel / subject / course, text] — demo messages, times are relative to "now".
  const HUB_RAW = {
    slack: [
      [12, "Alex Rivera", "#pitch-team", "Can we do a pitch run-through tomorrow at 3pm? Room 204 if it's free."],
      [47, "Priya Shah", "#pitch-team", "Deck v3 is up in the drive. Can someone review slides 8–12 before Friday?"],
      [95, "Jordan Lee", "#general", "Lol the coffee machine is broken again ☕"],
      [180, "Sam Chen", "Direct message", "Hey, could you send me the customer interview notes when you get a chance?"],
      [320, "Maya Thompson", "#pitch-team", "Investor practice Q&A moved to Thursday 10:30–11:30, same Zoom link."],
      [600, "Alex Rivera", "#design", "Love the new logo direction 🔥"],
      [1100, "Diego Martinez", "Direct message", "Are you free for a quick sync on pricing next Monday at 9?"],
      [1500, "Priya Shah", "#general", "Reminder: team photos are this Friday at noon outside the library."],
      [2900, "Hannah Kim", "#pitch-team", "Thanks everyone for today 🙌"],
      [4300, "Omar Haddad", "#ops", "Please submit your expense reports by the end of next week."],
      [2, "Jordan Lee", "#pitch-team", "Can we push standup to 10:15 tomorrow? My bus is late in the mornings this week."],
      [260, "Priya Shah", "Direct message", "Do you have 20 minutes Wednesday afternoon to rehearse the Q&A? 4pm works for me."],
      [700, "Maya Thompson", "#general", "Pizza in the lab at 6 tonight 🍕"],
      [2000, "Sam Chen", "#research", "Uploaded 3 new interview transcripts. Please tag the pain points by Thursday."],
      [3400, "Alex Rivera", "#pitch-team", "Demo day dry run is Saturday at 11am in the Innovation Hub — everyone please be there."],
      [5600, "Omar Haddad", "#ops", "New badge access policy starts Monday — swing by the front desk to update your card."],
    ],
    email: [
      [25, "Prof. Dana Whitfield", "Office hours change", "This week my office hours move to Wednesday 2–4pm in Room 310 instead of Thursday."],
      [70, "Career Center", "Mock interview confirmed", "Your mock interview is confirmed for Friday at 11:00 AM at the Career Center, 2nd floor."],
      [150, "Alex Rivera", "Re: lunch", "Lunch tomorrow works! 12:30 at Campus Café?"],
      [260, "Founder Weekly", "This week in startups", "Top 10 fundraising tips for first-time founders, plus this week's demo day recap."],
      [400, "Maria Lopez (landlord)", "Maintenance visit", "A plumber will stop by on Thursday between 9 and 11am to check the kitchen sink."],
      [900, "Registrar", "Spring registration", "Spring registration opens next Tuesday at 8:00 AM. Please review your degree audit before then."],
      [1300, "Sam Chen", "Draft for review", "Attached the market sizing draft — could you give me feedback by Wednesday?"],
      [2000, "Campus Bank", "Statement ready", "Your monthly statement is ready to view online."],
      [3100, "Dr. Patel's office", "Appointment reminder", "Reminder: your dental cleaning is on Monday at 4:15 PM."],
      [5200, "Library", "Book due soon", "\"The Lean Startup\" is due back next Thursday."],
      [5, "Jordan Lee", "Study group?", "Want to study for the stats midterm together Saturday around 2pm at the library?"],
      [330, "Innovation Hub", "Booking confirmed", "Your booking for Room 204 is confirmed for Thursday 1–2pm."],
      [1700, "Prof. Dana Whitfield", "Pitch feedback", "Please sign up for a 15-minute feedback slot before Monday using the class sheet."],
      [2400, "SkyWay Airlines", "Trip reminder", "Your flight to Chicago departs Wednesday, Nov 25 at 6:40 PM. Check in online 24 hours before."],
      [4400, "Campus Rec", "Class canceled", "Tonight's spin class is canceled. See you next week!"],
    ],
    canvas: [
      [40, "ENTR 222 · Prof. Whitfield", "Announcement", "Final pitch deck is due Friday at 11:59 PM. Upload a PDF to the assignment page."],
      [200, "ENTR 222", "Assignment", "Read Chapter 7 (Customer Discovery) before Thursday's class."],
      [500, "STAT 210 · Dr. Huang", "Announcement", "Midterm 2 is next Tuesday during class time (2:00–3:15pm) in Hall B. Bring a calculator."],
      [800, "STAT 210", "Grades posted", "Homework 5 grades are now available."],
      [1400, "ENTR 222", "Discussion", "Reply to at least two classmates on the market sizing thread by Sunday night."],
      [2300, "WRIT 150 · Ms. Ortega", "Announcement", "Peer review workshop on Wednesday at 10am — bring two printed copies of your draft."],
      [3600, "STAT 210", "Office hours", "TA office hours this week: Thursday 5–6pm, Room 112."],
      [5000, "ENTR 222", "Announcement", "Great job on the elevator pitches, everyone!"],
      [10, "WRIT 150 · Ms. Ortega", "Assignment", "Final essay outline is due Monday at 9am — submit it through Canvas."],
      [650, "STAT 210 · Dr. Huang", "Announcement", "Review session for Midterm 2 on Sunday 4–6pm in Hall B."],
      [1900, "ENTR 222", "Quiz", "Quiz 4 opens Wednesday and closes Thursday at midnight."],
      [4200, "WRIT 150", "Grades posted", "Essay 2 grades are available."],
      [5800, "STAT 210", "Announcement", "Project groups are posted on the People page."],
    ],
    teams: [
      [30, "Maya Thompson", "Internship · Weekly", "Can you join the client call tomorrow at 2pm? I'll send the Teams link."],
      [240, "Diego Martinez", "Internship", "Please update the project tracker before end of day Friday."],
      [700, "HR Team", "Internship", "Reminder: complete the security training module this week."],
      [1600, "Maya Thompson", "Internship · Weekly", "Nice work on the slides yesterday."],
      [3000, "Diego Martinez", "Internship", "Team lunch next Wednesday at 12, my treat 🍕"],
      [4800, "HR Team", "Internship", "Timesheets are due every Friday by 5pm."],
      [90, "Diego Martinez", "Internship · Standup", "Daily standup tomorrow moves to 9:15 because of the all-hands."],
      [1300, "Maya Thompson", "Internship", "Could you draft the client recap email? No rush, sometime this week."],
      [2500, "HR Team", "Internship", "Holiday party is Friday, Dec 11 at 5pm at the Rooftop Lounge 🎉"],
      [3700, "Diego Martinez", "Internship", "Thanks for jumping on that bug yesterday."],
    ],
    discord: [
      [15, "kai_dev", "#study-group", "Study session for the stats midterm Sunday 7pm in the library basement, who's in?"],
      [130, "leo", "#gaming", "gg last night"],
      [450, "nora", "#study-group", "Can someone share the practice exam answers?"],
      [1000, "kai_dev", "#hackathon", "Hackathon registration closes Saturday at midnight — sign up if you're joining our team!"],
      [2200, "mira", "#general", "anyone want to get boba later?"],
      [3900, "nora", "#hackathon", "Team kickoff call Friday 8pm on voice chat."],
      [300, "mira", "#study-group", "Flashcards for chapter 9 are in the pinned messages"],
      [900, "kai_dev", "#hackathon", "Can someone set up the GitHub repo for our hackathon project before Friday?"],
      [1800, "leo", "#gaming", "tournament next Saturday 8pm, sign-ups in #events"],
      [3200, "nora", "#general", "happy friday!! 🎉"],
      [4600, "kai_dev", "#study-group", "TA office hours are Thursday 5pm, I'll save us seats"],
    ],
    sms: [
      [8, "Mom", "Text", "Call me when you get a chance! Also, dinner Sunday at 6?"],
      [60, "Jordan Lee", "Text", "Running 10 min late to the gym"],
      [210, "Alex Rivera", "Text", "Can you pick up poster board for the pitch before Thursday?"],
      [900, "Dr. Patel's office", "Text", "Reply C to confirm your appointment Monday 4:15 PM."],
      [2600, "Sam Chen", "Text", "Haha that meme 😂"],
      [4100, "Grandpa", "Text", "Happy early birthday! Party is Saturday the 28th at 2pm at our place."],
      [35, "Priya Shah", "Text", "Are we still on for coffee tomorrow at 9:30?"],
      [400, "Mom", "Text", "Don't forget to book your train home for Thanksgiving!"],
      [1600, "Campus Pharmacy", "Text", "Your prescription is ready for pickup."],
      [3500, "Hannah Kim", "Text", "Can you send me the soccer schedule?"],
    ],
    groupme: [
      [55, "Hannah Kim", "Club Soccer", "Practice moved to Wednesday 6–7:30pm on the north field."],
      [380, "Omar Haddad", "Club Soccer", "Bring your dues ($20) to the next practice."],
      [1200, "Hannah Kim", "Roommates", "Can someone take out the recycling this week?"],
      [2500, "Jordan Lee", "Roommates", "Apartment cleaning Saturday at 10am, everyone please be home 🧽"],
      [4500, "Omar Haddad", "Club Soccer", "Game this Saturday at 1pm vs. State, meet at 12:15."],
      [140, "Jordan Lee", "Roommates", "Rent is due on the 1st — Venmo me your share by Monday please"],
      [850, "Hannah Kim", "Club Soccer", "Team dinner after Saturday's game, 6pm at Luigi's 🍝"],
      [1800, "Omar Haddad", "Club Soccer", "Need 2 more people to drive for the away game next weekend"],
      [3300, "Jordan Lee", "Roommates", "Who ate my leftovers 😤"],
      [5000, "Hannah Kim", "Club Soccer", "Jersey sizes are due this Friday"],
    ],
  };
  const hubNow = Date.now();
  const hubMsgs = {};
  for (const src of HUB_SOURCES) {
    hubMsgs[src.id] = (HUB_RAW[src.id] || [])
      .map(([mins, from, where, text], i) => ({ id: `${src.id}-${i + 1}`, source: src.id, from, where, text, at: new Date(hubNow - mins * 60000) }))
      .sort((a, b) => b.at - a.at); // newest first
  }
  const msgById = (id) => hubMsgs[id.split("-")[0]]?.find((m) => m.id === id);
  // Apps that can be "connected" as extra sources (demo: they arrive with no messages).
  const HUB_CATALOG = [
    { id: "outlook", name: "Outlook", color: "#0f6cbd", glyph: "O" },
    { id: "whatsapp", name: "WhatsApp", color: "#1fa855", glyph: "W" },
    { id: "messenger", name: "Messenger", color: "#7b61ff", glyph: "M" },
    { id: "classroom", name: "Google Classroom", color: "#1e8e3e", glyph: "GC" },
    { id: "blackboard", name: "Blackboard", color: "#262626", glyph: "Bb" },
    { id: "zoom", name: "Zoom Chat", color: "#2d8cff", glyph: "Z" },
    { id: "notion", name: "Notion", color: "#37352f", glyph: "N" },
    { id: "asana", name: "Asana", color: "#e8615a", glyph: "A" },
    { id: "trello", name: "Trello", color: "#0c66e4", glyph: "Tr" },
    { id: "linkedin", name: "LinkedIn", color: "#0a66c2", glyph: "in" },
    { id: "instagram", name: "Instagram", color: "#c13584", glyph: "IG" },
    { id: "telegram", name: "Telegram", color: "#229ed9", glyph: "Tg" },
  ];
  let hubExtra = [];
  const allSources = () => [...HUB_SOURCES, ...hubExtra];
  const srcById = (id) => allSources().find((s) => s.id === id);
  const hubSaved = loadJSON(HUB_KEY, {});
  hubExtra = (Array.isArray(hubSaved.extra) ? hubSaved.extra : []).map((id) => HUB_CATALOG.find((c) => c.id === id)).filter(Boolean);
  for (const src of hubExtra) hubMsgs[src.id] = [];
  const hub = {
    // Sources shown in the feed ([] = all sources). Older saves kept a single "view".
    views: (Array.isArray(hubSaved.views) ? hubSaved.views : hubSaved.view ? [hubSaved.view] : []).filter((id) => srcById(id)),
    anchor: null, // last clicked source, for Shift-click ranges
    items: Array.isArray(hubSaved.items) ? hubSaved.items : [],
    build: ["auto", "events", "tasks"].includes(hubSaved.build) ? hubSaved.build : "auto",
    pages: {}, selected: new Set(), busy: false, editing: null, undoable: false,
    seen: new Set(Array.isArray(hubSaved.seen) ? hubSaved.seen : []), // messages already checked by "Update events"
  };
  const saveHub = () => { try { localStorage.setItem(HUB_KEY, JSON.stringify({ views: hub.views, items: hub.items.filter(notDemo), build: hub.build, extra: hubExtra.map((x) => x.id), seen: [...hub.seen] })); } catch { /* ignore */ } };
  const ALL_MSGS = Object.values(hubMsgs).flat().sort((a, b) => b.at - a.at);
  const viewMsgs = () => (hub.views.length
    ? hub.views.flatMap((id) => hubMsgs[id] || []).sort((a, b) => b.at - a.at)
    : ALL_MSGS);
  const viewName = () => {
    const names = hub.views.map((id) => srcById(id).name);
    return !names.length ? "All sources" : names.length <= 3 ? names.join(", ") : `${names.length} sources`;
  };
  const hubEl = {
    root: $("hub"), sources: $("hubSources"), note: $("hubSideNote"), cols: $("hubCols"),
    build: $("hcBuild"), fromSel: $("hcFromSel"), fromSelLabel: $("hcFromSelLabel"),
    newEvent: $("hcNewEvent"), newTask: $("hcNewTask"),
    status: $("hcStatus"), count: $("hcCount"), all: $("hcAll"), list: $("hcList"), add: $("hcAdd"),
  };
  function msgTime(d) {
    const mins = Math.round((Date.now() - d) / 60000);
    if (mins < 1) return "now";
    if (mins < 60) return `${mins}m ago`;
    if (sameDay(d, new Date())) return fmtTime(d);
    if (sameDay(d, addDays(new Date(), -1))) return `Yesterday ${fmtTime(d)}`;
    return d.toLocaleDateString(undefined, { weekday: "short", month: "short", day: "numeric" });
  }

  function renderHub() {
    renderHubSources();
    renderHubCols();
    renderConstruct();
  }

  // Sidebar: source tabs. "All sources" (or no tab picked) shows everything in time order.
  function renderHubSources() {
    hubEl.sources.innerHTML = "";
    hubEl.note.textContent = !hub.views.length ? "Showing all sources, newest first"
      : hub.views.length === 1 ? `Showing ${srcById(hub.views[0]).name} only` : `Showing ${hub.views.length} sources together`;
    const tab = (id, name, glyph, color, count) => {
      const li = document.createElement("li");
      const b = document.createElement("button");
      b.type = "button";
      const on = id ? hub.views.includes(id) : !hub.views.length;
      b.className = "hub-src" + (on ? " on" : "");
      b.dataset.id = id || "";
      b.setAttribute("aria-pressed", String(on));
      b.innerHTML = `<span class="hub-glyph"></span><span class="hub-src-name"></span><span class="hub-src-count"></span>`;
      b.querySelector(".hub-glyph").textContent = glyph;
      b.querySelector(".hub-glyph").style.background = color;
      b.querySelector(".hub-src-name").textContent = name;
      const sel = (id ? hubMsgs[id] : ALL_MSGS).filter((m) => hub.selected.has(m.id)).length;
      b.querySelector(".hub-src-count").textContent = sel ? `${sel}/${count}` : count;
      if (sel) b.querySelector(".hub-src-count").classList.add("sel");
      li.appendChild(b);
      hubEl.sources.appendChild(li);
    };
    tab(null, "All sources", "∗", "#5f6368", ALL_MSGS.length);
    for (const src of allSources()) tab(src.id, src.name, src.glyph, src.color, hubMsgs[src.id].length);
    // Added (demo) sources can be removed again.
    hubEl.sources.querySelectorAll("li").forEach((li, i) => {
      const src = allSources()[i - 1];
      if (!src || !hubExtra.includes(src)) return;
      const x = document.createElement("button");
      x.type = "button";
      x.className = "hub-src-x";
      x.setAttribute("aria-label", `Remove ${src.name}`);
      x.title = "Remove this source";
      x.textContent = "×";
      x.addEventListener("pointerdown", (e) => e.stopPropagation()); // not the start of a drag-select
      x.addEventListener("click", (e) => {
        e.stopPropagation();
        hubExtra = hubExtra.filter((y) => y !== src);
        delete hubMsgs[src.id];
        hub.views = hub.views.filter((v) => v !== src.id);
        saveHub();
        renderHub();
      });
      li.appendChild(x);
    });
  }

  // Picking sources: click = just that one (again = all sources), drag across = every source dragged over,
  // Shift+click = range from the last clicked one, Ctrl/Cmd+click = add or remove one. "All sources" clears.
  let srcDrag = null;
  const srcIndex = (id) => allSources().findIndex((x) => x.id === id);
  const srcRange = (a, b) => allSources().slice(Math.min(a, b), Math.max(a, b) + 1).map((x) => x.id);
  const srcTabAt = (x, y) => {
    const n = document.elementFromPoint(x, y);
    const b = n && n.closest && n.closest(".hub-src");
    return b && hubEl.sources.contains(b) ? b : null;
  };
  function commitSources() {
    saveHub(); // (selected messages are kept across source changes)
    renderHub();
  }
  hubEl.sources.addEventListener("pointerdown", (e) => {
    const b = e.target.closest(".hub-src");
    if (!b || e.button !== 0) return;
    const id = b.dataset.id;
    e.preventDefault();
    if (!id) { hub.views = []; hub.anchor = null; commitSources(); return; } // All sources
    const idx = srcIndex(id);
    if (e.shiftKey && hub.anchor != null) {
      hub.views = srcRange(srcIndex(hub.anchor), idx);
      commitSources();
      return;
    }
    if (e.ctrlKey || e.metaKey) {
      hub.views = hub.views.includes(id) ? hub.views.filter((v) => v !== id) : [...hub.views, id];
      hub.anchor = id;
      commitSources();
      return;
    }
    srcDrag = { start: idx, id, moved: false, before: hub.views };
    hubEl.sources.setPointerCapture(e.pointerId);
  });
  hubEl.sources.addEventListener("pointermove", (e) => {
    if (!srcDrag) return;
    const b = srcTabAt(e.clientX, e.clientY);
    if (!b || !b.dataset.id) return;
    const idx = srcIndex(b.dataset.id);
    if (idx === srcDrag.start && !srcDrag.moved) return;
    srcDrag.moved = true;
    hub.views = srcRange(srcDrag.start, idx);
    renderHubSources(); // live highlight while dragging; the feed updates on release
  });
  const endSrcDrag = (e) => {
    if (!srcDrag) return;
    const d = srcDrag;
    srcDrag = null;
    try { hubEl.sources.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    if (!d.moved) hub.views = d.before.length === 1 && d.before[0] === d.id ? [] : [d.id]; // plain click
    hub.anchor = d.id;
    commitSources();
  };
  hubEl.sources.addEventListener("pointerup", endSrcDrag);
  hubEl.sources.addEventListener("pointercancel", endSrcDrag);

  // The feed: the chosen source(s) (or everything), newest first.
  function renderHubCols() {
    const box = hubEl.cols;
    const src = hub.views.length === 1 ? srcById(hub.views[0]) : null;
    const msgs = viewMsgs();
    const key = hub.views.length ? [...hub.views].sort().join("+") : "all";
    const pages = Math.max(1, Math.ceil(msgs.length / HUB_PAGE));
    const page = clamp(hub.pages[key] || 0, 0, pages - 1);
    hub.pages[key] = page;
    const sel = msgs.filter((m) => hub.selected.has(m.id)).length;
    const allOn = sel === msgs.length && msgs.length > 0;
    box.innerHTML = `<div class="hub-feed-head"><span class="hub-glyph"></span><span class="hub-col-name"></span><span class="hub-col-count"></span>
        <button type="button" class="hub-col-all"></button></div>
      <div class="hub-grid"></div>
      <div class="hub-pager">
        <button type="button" class="icon-btn small" data-p="first" title="Back to page 1 (newest)" aria-label="First page, newest messages">
          <svg viewBox="0 0 24 24" width="18" height="18"><path d="M11 6v12L3 12zm9 0v12l-8-6z"/></svg></button>
        <button type="button" class="icon-btn small" data-p="prev" title="Newer" aria-label="Newer messages">
          <svg viewBox="0 0 24 24" width="18" height="18"><path d="M15 6v12l-8-6z"/></svg></button>
        <span class="hub-page"></span>
        <button type="button" class="icon-btn small" data-p="next" title="Older" aria-label="Older messages">
          <svg viewBox="0 0 24 24" width="18" height="18"><path d="M9 6v12l8-6z"/></svg></button>
      </div>`;
    box.style.setProperty("--src", src ? src.color : "#5f6368");
    const g = box.querySelector(".hub-feed-head .hub-glyph");
    g.textContent = src ? src.glyph : "∗";
    g.style.background = src ? src.color : "#5f6368";
    box.querySelector(".hub-col-name").textContent = viewName();
    box.querySelector(".hub-col-count").textContent = sel ? `${sel} of ${msgs.length} selected` : `${msgs.length} messages`;
    const allBtn = box.querySelector(".hub-col-all");
    allBtn.textContent = allOn ? "Unselect all" : "Select all";
    allBtn.title = allOn ? "Unselect every message in this view" : `Select all ${msgs.length} messages in this view (every page)`;
    allBtn.setAttribute("aria-pressed", String(allOn));
    allBtn.addEventListener("click", () => {
      toggleMsgs(msgs.map((m) => m.id), !allOn);
      refreshSelection();
    });
    const grid = box.querySelector(".hub-grid");
    for (const m of msgs.slice(page * HUB_PAGE, page * HUB_PAGE + HUB_PAGE)) grid.appendChild(hubMsgEl(m, hub.views.length !== 1));
    if (!msgs.length) grid.innerHTML = `<div class="hub-feed-empty">No messages from ${escapeHTML(src ? src.name : "your sources")} yet.<br><small>This is a demo connection.</small></div>`;
    box.querySelector(".hub-page").textContent = `Page ${page + 1} / ${pages}`;
    const go = (p) => { hub.pages[key] = p; renderHubCols(); grid.scrollTop = 0; };
    box.querySelector('[data-p="first"]').disabled = page === 0;
    box.querySelector('[data-p="prev"]').disabled = page === 0;
    box.querySelector('[data-p="next"]').disabled = page >= pages - 1;
    box.querySelector('[data-p="first"]').addEventListener("click", () => go(0));
    box.querySelector('[data-p="prev"]').addEventListener("click", () => go(page - 1));
    box.querySelector('[data-p="next"]').addEventListener("click", () => go(page + 1));
  }
  function hubMsgEl(m, showSource = false) {
    const on = hub.selected.has(m.id);
    const b = document.createElement("button");
    b.type = "button";
    b.className = "hub-msg" + (on ? " sel" : "");
    b.setAttribute("role", "checkbox");
    b.setAttribute("aria-checked", String(on));
    b.title = on ? "Selected for Construct — click to unselect" : "Click to select for Construct";
    b.innerHTML = `<div class="hm-top"><span class="wtm-av"></span><span class="hm-from"></span><span class="hm-time"></span>
      <span class="hm-check">${CHECK_ICON}</span></div><div class="hm-where"></div><div class="hm-text"></div>`;
    b.querySelector(".wtm-av").textContent = initials(m.from.replace(/[^A-Za-z ]/g, "") || m.from);
    b.querySelector(".wtm-av").style.background = avatarColor(m.from);
    b.querySelector(".hm-from").textContent = m.from;
    b.querySelector(".hm-time").textContent = msgTime(m.at);
    if (!hub.seen.has(m.id)) {
      const tag = document.createElement("span");
      tag.className = "hm-new";
      tag.textContent = "New";
      b.querySelector(".hm-from").after(tag);
    }
    b.querySelector(".hm-where").textContent = m.where;
    if (showSource) {
      // In the all-sources feed, tag each card with where it came from.
      const src = srcById(m.source);
      const tag = document.createElement("span");
      tag.className = "hm-src";
      tag.innerHTML = `<span class="hub-glyph"></span><span></span>`;
      tag.querySelector(".hub-glyph").textContent = src.glyph;
      tag.querySelector(".hub-glyph").style.background = src.color;
      tag.querySelector("span:last-child").textContent = src.name;
      b.querySelector(".hm-where").prepend(tag);
    }
    b.style.setProperty("--src", srcById(m.source).color);
    b.querySelector(".hm-text").textContent = m.text;
    b.dataset.id = m.id;
    // Mouse/touch selection is handled on the feed (click, drag, Shift-click); this covers Enter/Space.
    b.addEventListener("click", (e) => {
      if (e.detail !== 0) return;
      toggleMsgs([m.id], !hub.selected.has(m.id));
      hub.msgAnchor = m.id;
      refreshSelection();
    });
    return b;
  }

  // ----- selecting messages: click toggles one, drag paints a range (the first card decides select or
  // unselect), Shift+click selects everything between the last clicked message and this one -----
  let msgDrag = null;
  function toggleMsgs(ids, on) { for (const id of ids) { if (on) hub.selected.add(id); else hub.selected.delete(id); } }
  function refreshSelection() {
    const scroll = hubEl.cols.querySelector(".hub-grid")?.scrollTop || 0;
    renderHubSources();
    renderHubCols();
    renderConstructTools();
    const g = hubEl.cols.querySelector(".hub-grid");
    if (g) g.scrollTop = scroll;
  }
  const msgCardAt = (x, y) => {
    const n = document.elementFromPoint(x, y);
    const c = n && n.closest && n.closest(".hub-msg");
    return c && hubEl.cols.contains(c) ? c : null;
  };
  const viewIds = () => viewMsgs().map((m) => m.id);
  function msgRange(a, b) {
    const ids = viewIds();
    const i = ids.indexOf(a), j = ids.indexOf(b);
    return i === -1 || j === -1 ? [b] : ids.slice(Math.min(i, j), Math.max(i, j) + 1);
  }
  function previewMsgDrag() {
    const range = new Set(msgRange(msgDrag.start, msgDrag.cur));
    hubEl.cols.querySelectorAll(".hub-msg").forEach((c) => {
      const on = range.has(c.dataset.id) ? msgDrag.target : hub.selected.has(c.dataset.id);
      c.classList.toggle("sel", on);
      c.setAttribute("aria-checked", String(on));
    });
  }
  function msgAutoScroll() {
    if (!msgDrag) return;
    const g = hubEl.cols.querySelector(".hub-grid");
    if (g) {
      const r = g.getBoundingClientRect(), EDGE = 40;
      const dy = msgDrag.y < r.top + EDGE ? -Math.ceil((r.top + EDGE - msgDrag.y) / 4)
        : msgDrag.y > r.bottom - EDGE ? Math.ceil((msgDrag.y - (r.bottom - EDGE)) / 4) : 0;
      if (dy) {
        g.scrollTop += Math.max(-16, Math.min(16, dy));
        const c = msgCardAt(msgDrag.x, Math.min(Math.max(msgDrag.y, r.top + 2), r.bottom - 2));
        if (c && c.dataset.id !== msgDrag.cur) { msgDrag.cur = c.dataset.id; msgDrag.moved = true; previewMsgDrag(); }
      }
    }
    requestAnimationFrame(msgAutoScroll);
  }
  hubEl.cols.addEventListener("pointerdown", (e) => {
    const c = e.target.closest(".hub-msg");
    if (!c || e.button !== 0) return;
    e.preventDefault();
    const id = c.dataset.id;
    if (e.shiftKey && hub.msgAnchor && viewIds().includes(hub.msgAnchor)) {
      toggleMsgs(msgRange(hub.msgAnchor, id), true);
      refreshSelection();
      return;
    }
    msgDrag = { start: id, cur: id, target: !hub.selected.has(id), moved: false, x: e.clientX, y: e.clientY };
    hubEl.cols.setPointerCapture(e.pointerId);
    previewMsgDrag();
    msgAutoScroll();
  });
  hubEl.cols.addEventListener("pointermove", (e) => {
    if (!msgDrag) return;
    msgDrag.x = e.clientX; msgDrag.y = e.clientY;
    const c = msgCardAt(e.clientX, e.clientY);
    if (!c || c.dataset.id === msgDrag.cur) return;
    msgDrag.cur = c.dataset.id;
    msgDrag.moved = true;
    previewMsgDrag();
  });
  const endMsgDrag = (e, cancelled) => {
    if (!msgDrag) return;
    const d = msgDrag;
    msgDrag = null;
    try { hubEl.cols.releasePointerCapture(e.pointerId); } catch { /* already released */ }
    if (!cancelled) {
      toggleMsgs(msgRange(d.start, d.cur), d.target);
      hub.msgAnchor = d.cur;
    }
    refreshSelection();
  };
  hubEl.cols.addEventListener("pointerup", (e) => endMsgDrag(e, false));
  hubEl.cols.addEventListener("pointercancel", (e) => endMsgDrag(e, true));

  // ----- Construct -----
  function renderConstruct() {
    renderConstructTools();
    renderConstructList();
  }
  function renderConstructTools() {
    hubEl.build.querySelectorAll("[data-build]").forEach((b) => b.setAttribute("aria-checked", String(b.dataset.build === hub.build)));
    const n = hub.selected.size;
    hubEl.fromSelLabel.textContent = n ? `From ${n} selected message${n === 1 ? "" : "s"}` : "From selected messages";
    hubEl.fromSel.disabled = !n || hub.busy;
    hubEl.fromSel.title = n ? "" : "Click messages in the columns to select them";
  }
  function hubStatus(html, isError = false) {
    hubEl.status.innerHTML = html;
    hubEl.status.classList.toggle("error", isError);
  }

  function itemWhen(it) {
    if (it.type === "task") return "Task";
    const s0 = parseISO(it.start), e0 = parseISO(it.end);
    if (it.allDay) {
      const days = Math.round((startOfDay(e0) - startOfDay(s0)) / 86400000);
      return days > 1 ? `${shortDate(s0)} – ${shortDate(addDays(e0, -1))} · All day` : `${shortDate(s0)} · All day`;
    }
    return `${shortDate(s0)} · ${fmtRange(s0, e0)}`;
  }
  function renderConstructList() {
    const items = hub.items;
    const keep = items.filter((it) => it.keep).length;
    hubEl.count.textContent = items.length ? `Constructed (${items.length})` : "Constructed";
    hubEl.all.hidden = !items.length;
    hubEl.all.textContent = keep === items.length ? "Select none" : "Select all";
    const nEv = items.filter((it) => it.keep && it.type === "event").length, nTk = keep - nEv;
    const parts = [nEv && `${nEv} event${nEv === 1 ? "" : "s"}`, nTk && `${nTk} task${nTk === 1 ? "" : "s"}`].filter(Boolean);
    hubEl.add.textContent = keep ? `Add ${parts.join(" + ")} to calendar` : "Add to calendar";
    hubEl.add.disabled = !keep;
    hubEl.list.innerHTML = "";
    if (!items.length) {
      hubEl.list.innerHTML = `<div class="hc-empty" title="Select messages and click From selected messages, or add an event or task by hand">Nothing constructed yet.</div>`;
      return;
    }
    for (const it of items) hubEl.list.appendChild(hubItemEl(it));
  }
  function hubItemEl(it) {
    const card = document.createElement("div");
    const color = it.type === "event" ? (COLORS[(calById(it.cal) || calById(defaultCalId())).color] || COLORS.peacock) : "#1a73e8";
    // (hc-ev / hc-task, not "event"/"task": those class names are taken by the calendar's own blocks)
    card.className = `hc-item ${it.type === "event" ? "hc-ev" : "hc-task"}${it.keep ? " keep" : ""}`;
    card.style.setProperty("--c", color);
    card.innerHTML = `<div class="hc-item-row">
        <label class="hc-keep" title="Keep this one"><input type="checkbox"></label>
        <div class="hc-item-body"><div class="hc-it-title"></div><div class="hc-it-when"></div><div class="hc-it-from"></div></div>
        <button type="button" class="hc-ibtn" data-a="edit" aria-label="Edit" title="Edit">${PENCIL}</button>
        <button type="button" class="hc-ibtn" data-a="del" aria-label="Remove" title="Remove">
          <svg viewBox="0 0 24 24" width="16" height="16"><path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg></button>
      </div>`;
    const cb = card.querySelector("input");
    cb.checked = !!it.keep;
    cb.addEventListener("change", () => { it.keep = cb.checked; saveHub(); renderConstructList(); });
    card.querySelector(".hc-it-title").textContent = it.title || "(No title)";
    card.querySelector(".hc-it-when").textContent = itemWhen(it) + (it.type === "event" && it.location ? ` · ${it.location}` : "");
    card.querySelector(".hc-it-from").textContent = it.from || "";
    card.querySelector('[data-a="edit"]').addEventListener("click", () => { hub.editing = hub.editing === it.id ? null : it.id; renderConstructList(); });
    card.querySelector('[data-a="del"]').addEventListener("click", () => {
      hub.items = hub.items.filter((x) => x !== it);
      if (hub.editing === it.id) hub.editing = null;
      saveHub();
      renderConstructList();
    });
    if (hub.editing === it.id) card.appendChild(hubEditForm(it));
    return card;
  }
  // Inline editor: type, title, date/times (events), calendar, location.
  function hubEditForm(it) {
    const f = document.createElement("form");
    f.className = "hc-edit";
    f.autocomplete = "off";
    const s0 = it.start ? parseISO(it.start) : null, e0 = it.end ? parseISO(it.end) : null;
    f.innerHTML = `
      <div class="hc-seg small" role="radiogroup"><button type="button" data-t="event">Event</button><button type="button" data-t="task">Task</button></div>
      <input class="hc-in" name="title" placeholder="Title" maxlength="200">
      <div class="hc-ev-fields">
        <div class="hc-line"><input class="hc-in" type="date" name="date"><label class="hc-check"><input type="checkbox" name="allDay"> All day</label></div>
        <div class="hc-line hc-times"><input class="hc-in" type="time" name="from" step="900"><span>–</span><input class="hc-in" type="time" name="to" step="900"></div>
        <div class="hc-line"><select class="hc-in" name="cal"></select></div>
        <input class="hc-in" name="location" placeholder="Location" maxlength="200">
      </div>
      <div class="hc-edit-actions"><button type="submit" class="hc-small primary">Done</button></div>`;
    f.querySelectorAll("[data-t]").forEach((b) => {
      b.setAttribute("aria-checked", String(b.dataset.t === it.type));
      b.addEventListener("click", () => { setItemType(it, b.dataset.t); saveHub(); renderConstructList(); });
    });
    f.title.value = it.title || "";
    const evf = f.querySelector(".hc-ev-fields");
    evf.hidden = it.type !== "event";
    if (it.type === "event") {
      f.date.value = dayKey(s0);
      f.allDay.checked = !!it.allDay;
      f.from.value = `${pad(s0.getHours())}:${pad(s0.getMinutes())}`;
      f.to.value = `${pad(e0.getHours())}:${pad(e0.getMinutes())}`;
      f.querySelector(".hc-times").hidden = !!it.allDay;
      for (const c of calendars) f.cal.add(new Option(c.name, c.id));
      f.cal.value = calById(it.cal) ? it.cal : defaultCalId();
      f.location.value = it.location || "";
    }
    const apply = () => {
      it.title = f.title.value.trim();
      if (it.type === "event" && f.date.value) {
        if (f.allDay.checked) Object.assign(it, allDaySpan(parseISO(`${f.date.value}T00:00`)));
        else {
          const st = parseISO(`${f.date.value}T${f.from.value || "09:00"}`);
          let en = parseISO(`${f.date.value}T${f.to.value || "10:00"}`);
          if (en <= st) en = new Date(st.getTime() + 3600000);
          Object.assign(it, { start: toISO(st), end: toISO(en), allDay: false });
        }
        it.cal = f.cal.value;
        it.location = f.location.value.trim();
      }
      saveHub();
    };
    f.addEventListener("input", apply);
    f.allDay && f.allDay.addEventListener("change", () => { apply(); renderConstructList(); });
    f.addEventListener("submit", (e) => { e.preventDefault(); apply(); hub.editing = null; renderConstructList(); });
    setTimeout(() => { if (FINE_POINTER) f.title.focus(); }, 0);
    return f;
  }
  function setItemType(it, type) {
    if (it.type === type) return;
    it.type = type;
    if (type === "event" && !it.start) {
      // A task becoming an event: tomorrow 9–10am until the user picks a time.
      const d = addDays(startOfDay(new Date()), 1);
      Object.assign(it, { start: toISO(new Date(d.getTime() + 9 * 3600000)), end: toISO(new Date(d.getTime() + 10 * 3600000)), allDay: false, cal: it.cal || defaultCalId() });
    }
  }
  function newHubItem(type) {
    const st = new Date(); st.setMinutes(0, 0, 0); st.setHours(st.getHours() + 1);
    const it = { id: "h" + uid(), type, title: "", keep: true, from: "Added by you", cal: defaultCalId(), location: "",
      start: type === "event" ? toISO(st) : "", end: type === "event" ? toISO(new Date(st.getTime() + 3600000)) : "", allDay: false };
    hub.items.unshift(it);
    hub.editing = it.id;
    saveHub();
    renderConstructList();
  }

  // AI: read the chosen messages and propose events/tasks.
  async function hubConstruct(msgs, label) {
    if (!msgs.length || hub.busy) return false;
    let ok = false;
    hub.busy = true;
    renderConstructTools();
    hubStatus(`<span class="spinner"></span>Reading ${msgs.length} message${msgs.length === 1 ? "" : "s"} from ${escapeHTML(label)}…`);
    try {
      const soon = addDays(startOfDay(new Date()), 21), past = addDays(startOfDay(new Date()), -1);
      const res = await fetch("/api/hub", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          build: hub.build,
          now: `${toISO(new Date())} (${new Date().toLocaleDateString(undefined, { weekday: "long" })})`,
          calendars: calendars.map((c) => ({ name: c.name })),
          existing: events.filter((e) => parseISO(e.start) < soon && parseISO(e.end) > past).map((e) => ({ title: e.title, start: e.start, end: e.end })),
          messages: msgs.map((m) => ({
            id: m.id, source: srcById(m.source).name, from: m.from, where: m.where, text: m.text,
            sent_at: `${toISO(m.at)} (${m.at.toLocaleDateString(undefined, { weekday: "long" })})`,
          })),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);
      const made = (data.items || []).map((it) => {
        const first = it.source_ids && it.source_ids.length ? msgById(it.source_ids[0]) : null;
        const from = first ? `From ${srcById(first.source).name} · ${first.from}${it.source_ids.length > 1 ? ` +${it.source_ids.length - 1}` : ""}` : "From messages";
        const base = { id: "h" + uid(), title: it.title, keep: true, from, sourceIds: it.source_ids || [], location: it.location || "", allDay: false, start: "", end: "" };
        if (it.type === "task") return { ...base, type: "task", cal: defaultCalId() };
        let span = { start: it.start, end: it.end, allDay: false };
        if (it.all_day) span = allDaySpan(parseISO(it.start), Math.max(1, Math.round((startOfDay(parseISO(it.end)) - startOfDay(parseISO(it.start))) / 86400000)));
        else if (parseISO(it.end) <= parseISO(it.start)) span.end = toISO(new Date(parseISO(it.start).getTime() + 3600000));
        return { ...base, ...span, type: "event", cal: (calByName(it.calendar) || calById(defaultCalId())).id };
      });
      hub.items = [...made, ...hub.items];
      saveHub();
      const reply = data.reply ? escapeHTML(data.reply) : "";
      hubStatus(made.length ? `${reply || "Done."} <b>${made.length} new</b> below.` : (reply || "Nothing to schedule in those messages."));
      ok = true;
    } catch (err) {
      hubStatus(escapeHTML(err.message || "Something went wrong."), true);
    } finally {
      hub.busy = false;
      renderConstruct();
    }
    return ok;
  }

  // Put the kept items into the calendar (events) and task list (tasks).
  function hubAddToCalendar() {
    const kept = hub.items.filter((it) => it.keep && (it.type === "task" || (it.start && it.end)));
    if (!kept.length) return;
    pushUndo();
    let nE = 0, nT = 0;
    for (const it of kept) {
      const title = it.title || "(No title)";
      if (it.type === "task") { tasks.unshift({ id: uid(), title }); nT++; }
      else {
        events.push({ id: uid(), title, start: it.start, end: it.end, allDay: !!it.allDay, cal: calById(it.cal) ? it.cal : defaultCalId(), location: it.location || "" });
        nE++;
      }
    }
    hub.items = hub.items.filter((it) => !kept.includes(it));
    hub.editing = null;
    saveEvents();
    saveTasks();
    saveHub();
    renderTasks();
    renderConstructList();
    const parts = [nE && `${nE} event${nE === 1 ? "" : "s"} to your calendar`, nT && `${nT} task${nT === 1 ? "" : "s"} to your task list`].filter(Boolean);
    hubStatus(`Added ${parts.join(" and ")}. <button type="button" class="hc-link" data-undo>Undo</button>`);
  }

  // ----- add a source (demo) -----
  const hubDlg = { root: $("hubDlg"), grid: $("hubDlgGrid"), close: $("hubDlgClose") };
  function openAddSource() {
    hubDlg.grid.innerHTML = "";
    for (const app of HUB_CATALOG) {
      const added = hubExtra.some((x) => x.id === app.id);
      const b = document.createElement("button");
      b.type = "button";
      b.className = "hub-app" + (added ? " added" : "");
      b.innerHTML = `<span class="hub-glyph"></span><span class="hub-app-name"></span><span class="hub-app-state"></span>`;
      b.querySelector(".hub-glyph").textContent = app.glyph;
      b.querySelector(".hub-glyph").style.background = app.color;
      b.querySelector(".hub-app-name").textContent = app.name;
      b.querySelector(".hub-app-state").textContent = added ? "Added ✓" : "Add";
      b.disabled = added;
      b.addEventListener("click", () => {
        hubExtra.push(app);
        hubMsgs[app.id] = [];
        saveHub();
        renderHubSources();
        openAddSource();
      });
      hubDlg.grid.appendChild(b);
    }
    hubDlg.root.hidden = false;
    hubDlg.root.querySelector(".hub-dlg-card").focus();
  }
  const closeAddSource = () => { hubDlg.root.hidden = true; };
  $("hubAddSrc").addEventListener("click", openAddSource);
  hubDlg.close.addEventListener("click", closeAddSource);
  hubDlg.root.addEventListener("click", (e) => { if (e.target === hubDlg.root) closeAddSource(); });
  hubDlg.root.addEventListener("keydown", (e) => { if (e.key === "Escape") { e.stopPropagation(); closeAddSource(); } });

  // ----- "Update events from Connection Hub" (calendar sidebar) -----
  const newHubMsgs = () => Object.values(hubMsgs).flat().filter((m) => !hub.seen.has(m.id)).sort((a, b) => b.at - a.at);
  function updateHubSync() {
    const n = newHubMsgs().length;
    const badge = $("hubSyncBadge"), btn = $("hubSync");
    badge.hidden = !n;
    badge.textContent = n > 99 ? "99+" : String(n);
    const label = `Update events from Connection Hub — ${n ? `${n} new message${n === 1 ? "" : "s"}` : "up to date"}`;
    btn.title = label;
    btn.setAttribute("aria-label", label);
    btn.classList.toggle("has-new", n > 0);
  }
  // Opens the hub on all sources with every new message selected; the user decides what to construct.
  $("hubSync").addEventListener("click", () => {
    const fresh = newHubMsgs();
    setMode("hub");
    hub.views = [];
    hub.pages.all = 0;
    for (const m of fresh) hub.selected.add(m.id);
    saveHub();
    renderHub();
    const g = hubEl.cols.querySelector(".hub-grid");
    if (g) g.scrollTop = 0;
    hubStatus(fresh.length
      ? `Selected ${fresh.length} new message${fresh.length === 1 ? "" : "s"}. Review them, then click <b>✨ From selected messages</b>.`
      : "No new messages since your last update.");
  });

  hubEl.build.querySelectorAll("[data-build]").forEach((b) => b.addEventListener("click", () => { hub.build = b.dataset.build; saveHub(); renderConstructTools(); }));
  hubEl.fromSel.addEventListener("click", () => {
    const msgs = [...hub.selected].map(msgById).filter(Boolean);
    const srcs = [...new Set(msgs.map((m) => srcById(m.source).name))];
    hubConstruct(msgs, srcs.length > 2 ? `${srcs.length} sources` : srcs.join(", ")).then((ok) => {
      if (ok) { msgs.forEach((m) => hub.seen.add(m.id)); saveHub(); updateHubSync(); } // no longer "new"
      hub.selected.clear();
      renderHubSources();
      renderHubCols();
      renderConstructTools();
    });
  });
  hubEl.newEvent.addEventListener("click", () => newHubItem("event"));
  hubEl.newTask.addEventListener("click", () => newHubItem("task"));
  hubEl.all.addEventListener("click", () => {
    const all = hub.items.every((it) => it.keep);
    hub.items.forEach((it) => { it.keep = !all; });
    saveHub();
    renderConstructList();
  });
  hubEl.add.addEventListener("click", hubAddToCalendar);
  hubEl.status.addEventListener("click", (e) => {
    if (e.target.closest("[data-undo]")) { undo(); hubStatus("Undone — removed them from your calendar and task list."); }
  });

  // ---------- Help tour (one per mode) ----------
  // Sections are separate topics; each step highlights an element (if it's on screen) and explains it.
  // Each step can list "demo" keys: things the tour opens or puts on screen for that step (see DEMOS).
  const TOURS = {
    calendar: [
      { name: "AI: add & edit", steps: [
        { title: "Just type what you want", target: "#aiForm", demo: ["sidebar", "aiText"], body: "Describe events in plain words: “Lunch with Sam tomorrow at noon”, “move my gym session to Friday 6pm”, “cancel everything on Wednesday”. The AI adds, moves or removes the right events." },
        { title: "Click an empty time", target: [".week-grid .event.draft", "#popover"], demo: ["week", "createPop"], body: "Click (or drag across) an empty slot and this opens. Type a title and Save, or describe it under “Or describe it” and let the AI fill in the details." },
        { title: "Click an event to change it", target: () => [tourEventBlock(), el.popover], demo: ["week", "eventPop"], body: "Clicking an event opens this. It takes a description too (“make it 2 hours”, “delete it”). Double-click the title or location to edit it, and click the colour square to move it to another calendar." },
        { title: "Calendars are your tags", target: [".my-cals", "#popover"], demo: ["sidebar", "calEditor"], body: "Each event takes its calendar's colour. Tick a calendar to show or hide it, + to make one, the pencil to rename or recolour (open here). The AI can do this too (“make a Health tag in green”)." },
        { title: "Messages from other apps", target: "#hubSync", demo: ["sidebar"], body: "The red badge counts new messages in the Connection Hub. Click it to jump there with them selected." },
        { title: "Undo anything", target: null, body: "Ctrl/⌘ + Z undoes and Ctrl + Y redoes every change — AI edits, drags and deletes included." },
      ] },
      { name: "Tasks", steps: [
        { title: "Your to-do list", target: ".tasks", demo: ["sidebar", "tasks"], body: "+ adds a task, click one to rename it, and the circle checks it off. You can also tell the AI “remind me to call Mom”." },
        { title: "Drag a task onto the calendar", target: "#weekHead", demo: ["sidebar", "week", "tasks", "taskDrag"], body: "Drop it on a time for a 1-hour event, or on a day header (the “All day” zones light up, like now) for an all-day item. Dragging it again moves it." },
        { title: "Check it off on the calendar", target: () => [tourEventBlock()], demo: ["week", "taskEvent"], body: "Scheduled tasks show a circle on the calendar — tick it and the task is done everywhere." },
      ] },
      { name: "Whentomeet", steps: [
        { title: "Find a time with people", target: ["#wtmNew", "#wtmWizard"], demo: ["sidebar", "wizard"], body: "The people icon next to the mini calendar starts a Whentomeet: pick dates (or days of the week), the hours, a name, then invite people." },
        { title: "Open one", target: ".wtm-top", demo: ["meet"], body: "Click a Whentomeet in the sidebar list to open it — here's the example, opened for you. The sidebar becomes its panel and the calendar turns into big blocks; click this line or ✕ to go back." },
        { title: "Mark your availability", target: "#meetGrid", demo: ["meet"], body: "Green blocks are available, gray are not. By default, times with an event on your calendar are not available and the rest are. Drag across blocks to change them; “Reset to my calendar” undoes your painting." },
        { title: "See the group", target: "#meetGrid", demo: ["meet", "meetGroup"], body: "Group availability shades each time by how many people are free — click a time to see who is and isn't. Click a person in the list to see just their times." },
        { title: "Overlap warnings", target: ".wtm-top", demo: ["meet"], body: "If an event later lands on time you marked available, a red warning appears right under this line, with a one-click fix." },
      ] },
    ],
    timeline: [
      { name: "Reading the timeline", steps: [
        { title: "Now and next", target: ".tl-node.central .tl-card", demo: ["tlEvents"], body: "The centre is what's happening now, or next. The faded card to the right is the event after it; that day's all-day items sit under the line." },
        { title: "Time labels", target: "#tlCountdown", demo: ["tlEvents"], body: "Left of the centre: time until it starts. Right of it: the gap until the next event. They turn orange under 15 minutes and red under 5." },
        { title: "Look around", target: "#tlStage", demo: ["tlEvents"], body: "Drag the line, scroll the mouse wheel, or use the arrow keys to move between events. This mode is view-only." },
        { title: "Change day", target: ".tl-nav", demo: ["tlEvents"], body: "◀ ▶ step through the days — free days say “Nothing planned”. Now jumps back to the present." },
      ] },
      { name: "Work with AI", steps: [
        { title: "Start working", target: ["#tlWork", "#tlWorkMenu"], demo: ["tlEvents", "workMenu"], body: "Work opens an AI chat about the event in the centre. If the day has several items, you pick which one, like here." },
        { title: "Chat and files", target: "#wkPanel", demo: ["tlEvents", "chat"], body: "Ask for notes, an agenda, an email draft… Files the AI writes are attached to the event (📎 attaches your own text files) and show up in Calendar mode too." },
        { title: "Split view", target: ["#menuBtn", "#wkPanel"], demo: ["tlEvents", "chat", "split"], body: "☰ (or expand in the chat) puts the chat on the left and turns the timeline vertical. A Work button on another event starts another session." },
        { title: "Several sessions", target: ["#wkSwitch", "#wkSwitchMenu"], demo: ["tlEvents", "chat", "split", "sessions"], body: "Sessions run side by side — switch with this menu in the chat header. The trash icon deletes a chat, optionally with its files." },
      ] },
    ],
    // First visit: each mode is opened while it's introduced (lightly dimmed so it can be seen),
    // then back to Calendar for the ? button.
    welcome: [
      { name: "Welcome", steps: [
        { title: "Mode 1 of 3: Calendar", target: '.mode-tab[data-mode="calendar"]', demo: ["modeCalendar"], light: true, body: "Your week and month. Add, move and change events by just typing what you want — the AI does the rest. Tasks and Whentomeet live here too." },
        { title: "Mode 2 of 3: Action Timeline", target: '.mode-tab[data-mode="timeline"]', demo: ["modeTimeline", "tlEvents"], light: true, body: "What's happening now and what's next, on one line with countdowns. Click Work to get an AI's help with any event." },
        { title: "Mode 3 of 3: Connection Hub", target: '.mode-tab[data-mode="hub"]', demo: ["modeHub"], light: true, body: "Messages from Slack, email, Canvas and more in one place. Pick some and the AI turns them into events and tasks." },
        { title: "Tour any mode", target: "#helpBtn", demo: ["modeCalendar"], body: "Click ? whenever you like for a short tour of the mode you're in — it opens everything it explains for you." },
      ] },
    ],
    hub: [
      { name: "Messages", steps: [
        { title: "Sources", target: "#hubSources", demo: ["hubSide", "hubCombine"], body: "All sources shows every message, newest first. Click a source to see only it; drag across sources or Shift-click to combine several (two are combined here)." },
        { title: "Add a source", target: ".hub-dlg-card", demo: ["hubSide", "addSource"], body: "Connect more apps (demo connections — they arrive empty)." },
        { title: "Select messages", target: "#hubCols", demo: ["hubSel"], body: "Click to select, drag across several, Shift-click a range, or Select all. New messages are tagged New." },
      ] },
      { name: "Construct", steps: [
        { title: "What to build", target: "#hcBuild", demo: ["hubSel"], body: "Auto lets the AI decide between events and tasks; or force one kind." },
        { title: "Construct with AI", target: "#hcFromSel", demo: ["hubSel"], body: "Turns the selected messages into events and tasks. You can also add one by hand with + Event / + Task." },
        { title: "Review", target: "#hcList", demo: ["hubItems", "hubEdit"], body: "Check what was built (these are examples): edit, untick or remove anything that's off." },
        { title: "Add to calendar", target: "#hcAdd", demo: ["hubItems"], body: "Ticked events go on your calendar and tasks into your task list. Undo is right there." },
      ] },
    ],
  };
  const tour = { root: $("tour"), ring: $("tourRing"), card: $("tourCard"), sections: $("tourSections"), title: $("tourTitle"),
    body: $("tourBody"), count: $("tourCount"), skip: $("tourSkip"), back: $("tourBack"), next: $("tourNext"), sec: 0, step: 0, set: null,
    active: [], ui: null, pickId: null, timer: 0 };
  const shown = (x) => { const r = x.getBoundingClientRect(); return r.width > 2 && r.height > 2 && getComputedStyle(x).visibility !== "hidden"; };
  function visibleTarget(sel) {
    if (!sel) return null;
    return [...document.querySelectorAll(sel)].find(shown) || null;
  }

  // ----- tour demos: whatever a step talks about is opened or shown for the user -----
  // Each demo sets something up and returns how to undo it. Demos the next step also lists stay up;
  // the rest are undone (newest first). Example data is marked demo: true, so it's never saved.
  const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
  const shuffle = (arr) => arr.map((x) => [Math.random(), x]).sort((a, b) => a[0] - b[0]).map((x) => x[1]);
  function setSidebar(open) {
    if (sidebarClosed() === !open) return;
    el.sidebar.classList.toggle(isMobile() ? "open" : "collapsed", isMobile() ? open : !open);
    syncQuickAdd();
    setTimeout(refreshMain, 220);
  }
  // The day of the visible week the tour uses: today if it's in view, else Monday.
  const tourDay = () => { const t = startOfDay(new Date()); return t >= weekStart && t < addDays(weekStart, 7) ? t : addDays(weekStart, 1); };
  function freeHour(day, hours = [10, 14, 11, 15, 9, 16, 13]) {
    const at = (h) => new Date(day.getTime() + h * 3600000);
    return hours.find((h) => !busyAt(at(h), at(h + 1))) ?? hours[0];
  }
  const scrollToHour = (h) => { el.weekBody.scrollTop = Math.max(0, hourPx() * (h - 1.5)); };
  const tourEventBlock = () => tour.pickId && el.weekGrid.querySelector(`.event[data-id="${tour.pickId}"]`);
  function addDemoEvent(ev) {
    const x = { id: "tour-" + uid(), cal: defaultCalId(), location: "", allDay: false, ...ev, demo: true };
    events.push(x);
    return x;
  }
  const dropDemoEvents = () => { events = events.filter(notDemo); };
  const inWeek = (ev) => { const s0 = parseISO(ev.start); return !ev.allDay && isVisible(ev) && s0 >= weekStart && s0 < addDays(weekStart, 7) && s0.getHours() >= 7 && s0.getHours() < 20; };

  const DEMOS = {
    // Switch modes (the welcome); the mode the tour started in comes back when it closes.
    modeCalendar() { if (mode !== "calendar") setMode("calendar"); return null; },
    modeTimeline() { if (mode !== "timeline") setMode("timeline"); return null; },
    modeHub() { if (mode !== "hub") setMode("hub"); return null; },
    sidebar() { if (!isMobile()) setSidebar(true); else setSidebar(true); return null; },
    week() {
      if (wtm.active && !tour.ui.meet) exitMeet();
      if (view !== "week") setView("week");
      if (isMobile()) setSidebar(false);
      return null;
    },
    aiText() {
      const before = el.aiInput.value;
      el.aiInput.value = pick(["Lunch with Sam tomorrow at noon", "Move my gym session to Friday 6pm", "Dentist next Tuesday at 3"]);
      autosize();
      return () => { el.aiInput.value = before; autosize(); };
    },
    createPop() {
      const day = tourDay(), h = freeHour(day);
      draft = { start: toISO(new Date(day.getTime() + h * 3600000)), end: toISO(new Date(day.getTime() + (h + 1) * 3600000)) };
      renderGrid();
      scrollToHour(h);
      showCreatePopover();
      const ta = el.popover.querySelector(".pbar textarea");
      if (ta) ta.value = pick(["Coffee with Jordan at Blue Bottle", "Study group in the library, 2 hours", "Call with Mom"]);
      return () => { if (draft) draft.busy = false; hidePopover(); renderGrid(); };
    },
    eventPop() {
      let ev = events.filter(inWeek).sort((a, b) => parseISO(a.start) - parseISO(b.start))[0];
      if (!ev) {
        const day = tourDay(), h = freeHour(day);
        ev = addDemoEvent({ title: pick(["Coffee with Sam", "Team sync", "Dinner with friends"]), location: pick(["Blue Bottle", "Room 204", "Zoom"]),
          start: toISO(new Date(day.getTime() + h * 3600000)), end: toISO(new Date(day.getTime() + (h + 1) * 3600000)) });
        render();
      }
      tour.pickId = ev.id;
      scrollToHour(parseISO(ev.start).getHours());
      const block = tourEventBlock();
      if (block) showPopover(ev, block);
      return () => { hidePopover(); tour.pickId = null; if (ev.demo) { dropDemoEvents(); render(); } };
    },
    calEditor() {
      const btn = el.calList.querySelector(".cal-edit");
      if (!btn || !calendars.length) return null;
      showCalEditor(calendars[0], btn);
      return () => hidePopover();
    },
    tasks() {
      if (tasks.length >= 2) return null;
      for (const title of shuffle(["Read chapter 4", "Email the TA", "Buy groceries", "Update résumé", "Reply to Sam"]).slice(0, 3)) {
        tasks.push({ id: "tour-" + uid(), title, demo: true });
      }
      renderTasks();
      return () => { tasks = tasks.filter(notDemo); renderTasks(); };
    },
    taskDrag() {
      const task = tasks[0];
      const idx = Math.round((tourDay() - weekStart) / 86400000);
      const zone = el.weekHead.querySelectorAll(".allday-zone")[idx];
      if (!task || !zone) return null;
      document.body.classList.add("task-dragging");
      zone.classList.add("zone-hot");
      const ghost = document.createElement("div");
      ghost.className = "task-ghost";
      ghost.innerHTML = `<div class="tg-title"></div><div class="tg-where"></div>`;
      ghost.querySelector(".tg-title").textContent = task.title;
      ghost.querySelector(".tg-where").textContent = `All day · ${shortDate(tourDay())}`;
      const r = zone.getBoundingClientRect();
      ghost.style.left = `${r.left + r.width / 2 + 14}px`;
      ghost.style.top = `${r.top + r.height / 2 + 10}px`;
      document.body.appendChild(ghost);
      return () => {
        ghost.remove();
        document.body.classList.remove("task-dragging");
        document.querySelectorAll(".zone-hot").forEach((n) => n.classList.remove("zone-hot"));
      };
    },
    taskEvent() {
      let ev = events.filter((x) => x.taskId && !x.done && inWeek(x))[0];
      if (!ev) {
        const title = pick(["Read chapter 4", "Email the TA", "Finish problem set"]);
        const t = { id: "tour-" + uid(), title, demo: true };
        tasks.push(t);
        const day = tourDay(), h = freeHour(day, [15, 11, 14, 10, 16, 9]);
        ev = addDemoEvent({ title, taskId: t.id, cal: tasksCalId(), start: toISO(new Date(day.getTime() + h * 3600000)), end: toISO(new Date(day.getTime() + (h + 1) * 3600000)) });
        renderTasks();
        render();
      }
      tour.pickId = ev.id;
      scrollToHour(parseISO(ev.start).getHours());
      return () => {
        tour.pickId = null;
        if (!ev.demo) return;
        dropDemoEvents();
        tasks = tasks.filter(notDemo);
        renderTasks();
        render();
      };
    },
    wizard() {
      if (wtm.active) return null;
      openWizard();
      return () => { if (wtm.wizard) closeWizard(); };
    },
    meet() {
      if (wtm.active) return null; // the user already has one open: use that one
      let m = meets[0];
      if (!m) {
        const days = [];
        for (let d = addDays(startOfDay(new Date()), 1); days.length < 3; d = addDays(d, 1)) if (d.getDay() % 6) days.push(dayKey(d));
        m = { id: "tour-" + uid(), name: "Pitch practice", mode: "dates", dates: days, days: [], start: 9, end: 17, members: [], mine: {}, createdAt: Date.now(), demo: true };
        for (const c of CONTACTS.slice(0, 4)) m.members.push({ id: uid(), name: c.name, email: c.email, avail: randomAvail(m, c.email) });
        meets.push(m);
      }
      enterMeet(m.id);
      return () => {
        if (wtm.active === m.id) exitMeet();
        if (m.demo) { meets = meets.filter(notDemo); renderMeetList(); }
      };
    },
    meetGroup() {
      if (!wtm.active || wtm.view === "group") return null;
      setMeetView("group");
      return () => { if (wtm.active) setMeetView("mine"); };
    },

    // Timeline: example events when there's not much coming up, plus an all-day item on that day.
    tlEvents() {
      const now = Date.now();
      if (timelineItems().filter((it) => it.e > now).length < 2) {
        const base = Math.ceil(now / (15 * MIN)) * 15 * MIN + 15 * MIN;
        const [a, b, c] = shuffle([["Study group", "Library, 2nd floor"], ["Coffee with Sam", "Blue Bottle"], ["Gym", ""], ["Team sync", "Zoom"], ["Office hours", "Room 204"]]);
        for (const [[title, location], off, len] of [[a, 0, 60], [b, 120, 45], [c, 240, 60]]) {
          addDemoEvent({ title, location, start: toISO(new Date(base + off * MIN)), end: toISO(new Date(base + (off + len) * MIN)) });
        }
      }
      const items = timelineItems();
      const day = startOfDay(items.length ? items[imminentIndex(items)].s : new Date());
      const hasAllDay = events.some((ev) => ev.allDay && isVisible(ev) && parseISO(ev.start) <= day && parseISO(ev.end) > day);
      if (!hasAllDay) addDemoEvent({ title: pick(["Essay due", "Reading quiz", "Mom's birthday"]), ...allDaySpan(day) });
      tl.auto = true; tl.emptyDay = null;
      buildTimeline();
      return () => { dropDemoEvents(); tl.auto = true; tl.emptyDay = null; buildTimeline(); renderWork(); };
    },
    workMenu() {
      if (wk.workBtn.hidden || tl.options.filter((id) => id !== work.displayed).length < 2) return null;
      openWorkMenu();
      return () => closeWorkMenu();
    },
    chat() {
      const id = tl.options[0];
      if (!id) return null;
      const before = { displayed: work.displayed, text: wk.text.value };
      const real = sessions[id] && sessions[id].messages.length;
      if (!real) demoSession(id, [
        ["user", pick(["Can you draft an agenda for this?", "Make me a prep checklist for this.", "Write some notes I can bring."])],
        ["assistant", "Sure — I put it in a file and attached it to the event. It covers the goals, a short timeline and what to bring.", "Prep notes.md"],
      ]);
      displaySession(id);
      return () => {
        dropDemoSessions();
        const back = before.displayed && sessions[before.displayed] && sessions[before.displayed].open ? before.displayed : null;
        work.displayed = back;
        wk.text.value = before.text;
        renderWork();
      };
    },
    split() {
      if (tlEl.root.classList.contains("expanded")) return null;
      setExpanded(true);
      return () => setExpanded(false);
    },
    sessions() {
      const other = timelineItems().find((it) => it.e > Date.now() && it.ev.id !== work.displayed && !sessions[it.ev.id]);
      if (other) demoSession(other.ev.id, [["user", "Remind me what I need for this."], ["assistant", "Here's a short checklist — attached as a file.", "Checklist.md"]], Date.now() - 60000);
      renderSwitchMenu();
      wk.menu.hidden = false;
      renderWork();
      return () => { wk.menu.hidden = true; if (other) { dropDemoSessions(other.ev.id); renderWork(); } };
    },

    // Connection Hub.
    hubSide() { hubEl.root.classList.remove("side-hidden"); return null; },
    hubCombine() {
      const before = hub.views.slice();
      hub.views = allSources().slice(0, 2).map((x) => x.id);
      renderHub();
      return () => { hub.views = before; renderHub(); };
    },
    addSource() { openAddSource(); return () => closeAddSource(); },
    hubSel() {
      if (hub.selected.size) return null;
      const ids = viewMsgs().slice(0, 3).map((m) => m.id);
      toggleMsgs(ids, true);
      refreshSelection();
      return () => { toggleMsgs(ids, false); refreshSelection(); };
    },
    hubItems() {
      const at = (d, h, m = 0) => { const x = addDays(startOfDay(new Date()), d); x.setHours(h, m, 0, 0); return x; };
      const evs = shuffle([
        ["Pitch deck review with Alex", "Zoom", "Slack · #startup"], ["Office hours with Prof. Lee", "Room 204", "Canvas · ENTR 222"],
        ["Team dinner", "Luigi's Pizzeria", "Text · Jordan"], ["Study session for the midterm", "Library, 2nd floor", "Email · Priya Shah"],
        ["Customer interview", "Blue Bottle", "Email · Sam Chen"], ["Club meeting", "Student Union", "Slack · #general"],
      ]).slice(0, 3);
      const tks = shuffle([["Send slides to Priya", "Slack · #startup"], ["Reply to Sam about Friday", "Text · Sam"], ["Review the PR", "Email · GitHub"], ["Submit the reading response", "Canvas · ENTR 222"]]).slice(0, 2);
      const items = [
        ...evs.map(([title, location, from]) => {
          const s0 = at(1 + Math.floor(Math.random() * 5), 9 + Math.floor(Math.random() * 8), pick([0, 30]));
          return { type: "event", title, location, from, start: toISO(s0), end: toISO(new Date(s0.getTime() + pick([30, 60, 90]) * MIN)), allDay: false, cal: defaultCalId() };
        }),
        ...tks.map(([title, from]) => ({ type: "task", title, from, start: "", end: "", allDay: false, location: "", cal: defaultCalId() })),
      ].map((it, i) => ({ ...it, id: "tour-" + uid(), keep: i !== 2, demo: true }));
      hub.items = [...shuffle(items), ...hub.items];
      renderConstructList();
      return () => { hub.items = hub.items.filter(notDemo); if (!hub.items.some((x) => x.id === hub.editing)) hub.editing = null; renderConstructList(); };
    },
    hubEdit() {
      const it = hub.items.find((x) => x.demo && x.type === "event");
      if (!it) return null;
      hub.editing = it.id;
      renderConstructList();
      return () => { if (hub.editing === it.id) { hub.editing = null; renderConstructList(); } };
    },
  };
  // An example chat (and the file it "wrote") on an event, marked demo so it's never saved.
  function demoSession(id, msgs, lastActive = Date.now()) {
    const ev = eventById(id);
    const now = Date.now();
    sessions[id] = { eventId: id, title: ev ? ev.title : "", open: true, lastActive, demo: true,
      messages: msgs.map(([role, text, file]) => ({ role, text, files: file ? [file] : undefined, at: now })) };
    for (const [, , file] of msgs) {
      if (!file) continue;
      const title = ev ? ev.title : "this";
      (attachments[id] || (attachments[id] = [])).push({ id: "tour-" + uid(), name: file, source: "ai", createdAt: now, updatedAt: now, demo: true,
        content: `# ${file.replace(/\.md$/, "")} — ${title}\n\n- Goal: get the most out of ${title}\n- Bring: laptop, notes, questions\n- Follow up afterwards\n` });
    }
  }
  function dropDemoSessions(only = null) {
    for (const [id, x] of Object.entries(sessions)) {
      if (!x.demo || (only && id !== only)) continue;
      delete sessions[id];
      work.unread.delete(id);
      if (work.displayed === id) work.displayed = null;
    }
    for (const [id, list] of Object.entries(attachments)) {
      if (only && id !== only) continue;
      const keep = list.filter(notDemo);
      if (keep.length) attachments[id] = keep; else delete attachments[id];
    }
  }
  function runDemos(keys) {
    for (let i = tour.active.length - 1; i >= 0; i--) {
      const d = tour.active[i];
      if (keys.includes(d.key)) continue;
      tour.active.splice(i, 1);
      try { if (d.undo) d.undo(); } catch (err) { console.error(err); }
    }
    for (const key of keys) {
      if (tour.active.some((d) => d.key === key)) continue;
      let undo = null;
      try { undo = DEMOS[key](); } catch (err) { console.error(err); }
      tour.active.push({ key, undo });
    }
  }
  // Where things were before the tour (view, date, sidebar…), put back when it closes.
  function saveTourUI() {
    tour.ui = { mode, view, focus: new Date(focus), sidebarOpen: !sidebarClosed(), scroll: el.weekBody.scrollTop, meet: !!wtm.active,
      hubSide: hubEl.root.classList.contains("side-hidden") };
  }
  function restoreTourUI() {
    const u = tour.ui;
    if (!u) return;
    tour.ui = null;
    if (mode !== u.mode) setMode(u.mode);
    if (mode === "hub") hubEl.root.classList.toggle("side-hidden", u.hubSide);
    if (mode !== "calendar" || wtm.active) return;
    if (view !== u.view) { view = u.view; saveViewPref(); }
    goToDate(u.focus, false);
    setSidebar(u.sidebarOpen);
    render();
    if (view === "week") el.weekBody.scrollTop = u.scroll;
  }

  function tourTargets(st) {
    const list = typeof st.target === "function" ? st.target() : [].concat(st.target || []);
    return list.map((x) => (typeof x === "string" ? visibleTarget(x) : x)).filter((n) => n && shown(n));
  }
  // Spotlight the element(s) this step is about (when on screen); the card goes on the other half.
  function placeRing() {
    const st = tour.set[tour.sec].steps[tour.step];
    const ts = tourTargets(st);
    tour.root.classList.toggle("dim", !ts.length);
    tour.ring.hidden = !ts.length;
    const card = tour.card;
    card.classList.remove("at-top", "placed");
    Object.assign(card.style, { left: "", top: "", bottom: "", transform: "" });
    if (ts.length) {
      const rs = ts.map((t) => t.getBoundingClientRect());
      const r = { top: Math.min(...rs.map((x) => x.top)), left: Math.min(...rs.map((x) => x.left)),
        right: Math.max(...rs.map((x) => x.right)), bottom: Math.max(...rs.map((x) => x.bottom)) };
      const pad = 6;
      const top = Math.max(4, r.top - pad), left = Math.max(4, r.left - pad);
      const w = Math.min(innerWidth - 8, r.right + pad) - left, h = Math.min(innerHeight - 8, r.bottom + pad) - top;
      Object.assign(tour.ring.style, { top: `${top}px`, left: `${left}px`, width: `${w}px`, height: `${h}px` });
      placeCard({ top, left, right: left + w, bottom: top + h });
    }
    // Demos can move focus into what they opened; keep the keyboard on the tour.
    if (!tour.root.hidden && !tour.root.contains(document.activeElement)) tour.card.focus({ preventScroll: true });
  }
  // Put the card where it doesn't cover the spotlight: below or above it, else beside it.
  function placeCard(r) {
    const card = tour.card, cw = card.offsetWidth, ch = card.offsetHeight, gap = 14, m = 12;
    const midX = Math.max(m, (innerWidth - cw) / 2);
    const below = { left: midX, top: r.bottom + gap, ok: r.bottom + gap + ch <= innerHeight - m };
    const above = { left: midX, top: r.top - gap - ch, ok: r.top - gap - ch >= m };
    const sideTop = Math.min(Math.max(m, (r.top + r.bottom) / 2 - ch / 2), innerHeight - ch - m);
    const right = { left: r.right + gap, top: sideTop, ok: r.right + gap + cw <= innerWidth - m };
    const left = { left: r.left - gap - cw, top: sideTop, ok: r.left - gap - cw >= m };
    const order = (r.top + r.bottom) / 2 < innerHeight * 0.55 ? [below, above] : [above, below];
    const spot = [...order, right, left].find((x) => x.ok);
    if (!spot) { card.classList.toggle("at-top", (r.top + r.bottom) / 2 >= innerHeight * 0.55); return; }
    card.classList.add("placed");
    Object.assign(card.style, { left: `${spot.left}px`, top: `${spot.top}px`, bottom: "auto", transform: "none" });
  }
  function showTourStep() {
    const sec = tour.set[tour.sec], st = sec.steps[tour.step];
    runDemos(st.demo || []);
    tour.root.classList.toggle("light", !!st.light);
    tour.sections.innerHTML = "";
    // (The welcome has a single section: no chips to pick from.)
    if (tour.set.length > 1) tour.set.forEach((s, i) => {
      const b = document.createElement("button");
      b.type = "button";
      b.className = "tour-sec" + (i === tour.sec ? " on" : "");
      b.textContent = `${i + 1}. ${s.name}`;
      b.addEventListener("click", () => { tour.sec = i; tour.step = 0; showTourStep(); });
      tour.sections.appendChild(b);
    });
    tour.title.textContent = st.title;
    tour.body.textContent = st.body;
    tour.count.textContent = `${tour.step + 1} / ${sec.steps.length}`;
    const lastSec = tour.sec === tour.set.length - 1, lastStep = tour.step === sec.steps.length - 1;
    tour.skip.hidden = lastSec;
    tour.back.disabled = tour.sec === 0 && tour.step === 0;
    tour.next.textContent = lastStep ? (lastSec ? (tour.set === TOURS.welcome ? "Got it" : "Done") : `Next: ${tour.set[tour.sec + 1].name}`) : "Next";
    placeRing();
    // Again once sidebars and panels have finished sliding.
    clearTimeout(tour.timer);
    tour.timer = setTimeout(() => { if (!tour.root.hidden) placeRing(); }, 320);
  }
  const WELCOME_KEY = "nl-calendar-welcomed";
  function openTour(set = mode) {
    tour.set = TOURS[set] || TOURS.calendar;
    tour.sec = 0; tour.step = 0;
    hidePopover();
    saveTourUI();
    tour.root.hidden = false;
    showTourStep();
    tour.card.focus();
  }
  function closeTour() {
    tour.root.hidden = true;
    clearTimeout(tour.timer);
    if (tour.set === TOURS.welcome) {
      try { localStorage.setItem(WELCOME_KEY, "1"); } catch { /* ignore */ }
      openNotice();
    }
    runDemos([]);
    restoreTourUI();
  }
  function tourMove(dir) {
    const sec = tour.set[tour.sec];
    if (dir > 0) {
      if (tour.step < sec.steps.length - 1) tour.step++;
      else if (tour.sec < tour.set.length - 1) { tour.sec++; tour.step = 0; }
      else return closeTour();
    } else {
      if (tour.step > 0) tour.step--;
      else if (tour.sec > 0) { tour.sec--; tour.step = tour.set[tour.sec].steps.length - 1; }
    }
    showTourStep();
  }
  $("helpBtn").addEventListener("click", (e) => { e.stopPropagation(); openTour(); });
  // After the first-visit welcome: the AI is real, and please don't leak or burn through the key.
  const notice = { root: $("notice"), ok: $("noticeOk") };
  function openNotice() {
    notice.root.hidden = false;
    notice.ok.focus();
  }
  const closeNotice = () => { notice.root.hidden = true; };
  notice.ok.addEventListener("click", (e) => { e.stopPropagation(); closeNotice(); });
  notice.root.addEventListener("click", (e) => { e.stopPropagation(); if (e.target === notice.root) closeNotice(); });
  notice.root.addEventListener("keydown", (e) => { e.stopPropagation(); if (e.key === "Escape" || e.key === "Enter") { e.preventDefault(); closeNotice(); } });
  $("tourClose").addEventListener("click", closeTour);
  tour.next.addEventListener("click", () => tourMove(1));
  tour.back.addEventListener("click", () => tourMove(-1));
  tour.skip.addEventListener("click", () => { if (tour.sec < tour.set.length - 1) { tour.sec++; tour.step = 0; showTourStep(); } });
  // Clicks and keys on the tour stay in the tour (so they don't close what it opened, or undo things).
  tour.root.addEventListener("click", (e) => e.stopPropagation());
  tour.root.addEventListener("keydown", (e) => {
    e.stopPropagation();
    if (e.key === "Escape") { e.preventDefault(); closeTour(); }
    else if (e.key === "ArrowRight") { e.preventDefault(); tourMove(1); }
    else if (e.key === "ArrowLeft") { e.preventDefault(); tourMove(-1); }
  });
  window.addEventListener("resize", () => { if (!tour.root.hidden) placeRing(); });

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
    if (mode === "timeline") { setExpanded(!tlEl.root.classList.contains("expanded")); return; }
    if (mode === "hub") { hubEl.root.classList.toggle("side-hidden"); return; }
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
    if (!el.viewMenu.hidden && !el.viewMenu.contains(e.target)) {
      el.viewMenu.hidden = true;
      el.viewBtn.setAttribute("aria-expanded", "false");
    }
  });

  const isTyping = (t) => t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && !cf.root.hidden) { closeConfirm(); return; }
    if (e.key === "Escape" && !wk.viewer.hidden) { closeViewer(); return; }
    if (mode === "hub") return; // the hub has no calendar shortcuts
    if (mode === "timeline") {
      // View only: no undo/redo or calendar shortcuts here.
      if (isTyping(e.target) || e.ctrlKey || e.metaKey || e.altKey) return;
      if (e.key === "ArrowRight" || (tl.vertical && e.key === "ArrowDown")) { e.preventDefault(); tlGo(tl.focus + 1); }
      else if (e.key === "ArrowLeft" || (tl.vertical && e.key === "ArrowUp")) { e.preventDefault(); tlGo(tl.focus - 1); }
      return;
    }
    if (e.key === "Escape") {
      // Escape cancels an in-progress drag through the same paths as pointercancel.
      if (drag || tdrag || hdrag) {
        const fake = { pointerId: -1 };
        if (drag && ["mmove", "mmore", "mdate", "mcreate", "dismiss"].includes(drag.mode)) endMonthDrag(fake, true);
        else if (drag) endDrag(fake, true);
        if (tdrag) endTaskDrag(fake, true);
        if (hdrag) endHeadDrag(fake, true);
        return;
      }
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
  const dragging = () => drag || tdrag || hdrag || wtm.paint;
  window.addEventListener("resize", () => {
    syncQuickAdd();
    if (mode === "timeline") { if (!tl.drag) drawTimeline(); }
    else if (!dragging()) refreshMain();
  });
  setInterval(() => { if (!dragging() && view === "week") renderGrid(); }, 60000); // keep the red "now" line moving

  render();
  renderTasks();
  renderCalendars();
  renderMeetList();
  syncQuickAdd();
  setMode(mode);
  try { if (!localStorage.getItem(WELCOME_KEY)) setTimeout(() => openTour("welcome"), 300); } catch { /* storage blocked: skip it */ }
  el.weekBody.scrollTop = 48 * 7.5; // start around 7:30am like Google Calendar
})();

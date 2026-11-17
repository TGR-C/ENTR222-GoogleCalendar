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
  let events = loadEvents();
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
    const mk = (title, day, sh, sm, eh, em, color, location = "") =>
      ({ id: uid(), title, start: at(day, sh, sm), end: at(day, eh, em), color, location });
    return [
      mk("Team standup", 1, 9, 30, 10, 0, "peacock", "Zoom"),
      mk("ENTR 222 lecture", 1, 13, 0, 14, 30, "grape", "Room 104"),
      mk("Gym", 2, 7, 0, 8, 0, "sage"),
      mk("Project sync", 2, 11, 0, 12, 0, "peacock"),
      mk("Lunch with Alex", 3, 12, 0, 13, 0, "tangerine", "Campus café"),
      mk("ENTR 222 lecture", 3, 13, 0, 14, 30, "grape", "Room 104"),
      mk("Customer interview", 3, 13, 30, 14, 15, "tomato"),
      mk("Office hours", 4, 15, 0, 16, 30, "lavender"),
      mk("Pitch practice", 5, 10, 0, 11, 30, "banana"),
      mk("Dinner", 5, 19, 0, 20, 30, "flamingo"),
      mk("Hike", 6, 9, 0, 12, 0, "basil", "Trailhead"),
      { id: uid(), title: "Pitch deck due", ...allDaySpan(addDays(ws, 5)), color: "tomato", location: "" },
    ];
  }

  // ---------- rendering ----------
  function render() {
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
        .filter((ev) => !ev.allDay)
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
    div.style.background = COLORS[ev.color] || COLORS.peacock;
    if (ev.color === "banana") div.style.color = "#202124";
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
    div.style.background = COLORS.peacock;
    div.innerHTML = `<div class="etitle">(No title)</div><div class="etime"></div>`;
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
    const actions = data.actions || [], taskActions = data.task_actions || [];
    if (!actions.length && !taskActions.length) return data.reply || "I couldn’t work out a change — try rephrasing.";
    el.popover.hidden = true;
    if (draft) { draft.busy = false; draft = null; }
    const changed = applyActions(actions, taskActions);
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
      <div class="prow"><div class="swatch" style="background:${COLORS[ev.color] || COLORS.peacock}"></div>
        <div class="pinfo"><div class="ptitle"></div><div class="pwhen"></div><div class="ploc"></div></div></div>`;
    p.querySelector(".ptitle").textContent = ev.title || "(No title)";
    const days = Math.round((startOfDay(e) - startOfDay(s)) / 86400000);
    p.querySelector(".pwhen").textContent = !ev.allDay ? `${dayStr} · ${fmtRange(s, e)}`
      : days > 1 ? `${dayStr} – ${addDays(e, -1).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}`
      : `${dayStr} · All day`;
    p.querySelector(".ploc").textContent = ev.location || "";
    if (!ev.location) p.querySelector(".ploc").remove();
    p.querySelector("[data-close]").onclick = hidePopover;
    p.dataset.eventId = ev.id;
    const titleEl = p.querySelector(".ptitle");
    titleEl.title = "Double-click to edit";
    titleEl.addEventListener("dblclick", () => editPopoverTitle(ev, titleEl));
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
      p.querySelector(".pinfo").appendChild(b);
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
  function showCreatePopover() {
    const s = parseISO(draft.start), e = parseISO(draft.end);
    const dayStr = s.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
    const p = el.popover;
    p.innerHTML = `${CLOSE_BTN}<div class="pnew-when"></div>`;
    // Month view picks a day, not a time: the time comes from the description (default 9–10am).
    p.querySelector(".pnew-when").textContent = draft.dayOnly ? dayStr : `${dayStr} · ${fmtRange(s, e)}`;
    p.querySelector("[data-close]").onclick = () => { if (draft) draft.busy = false; hidePopover(); };
    const slot = { start: draft.start, end: draft.end };
    const bar = aiBar({
      placeholder: "Describe the event",
      hint: draft.dayOnly
        ? "Include a time, e.g. “Dinner with Sam at 7pm” (defaults to 9am)"
        : "e.g. “Coffee with Jordan at Blue Bottle” or “Dentist, 30 min”",
      busyText: "Creating…",
      onSubmit: async (text) => {
        if (draft) draft.busy = true; // keep the placeholder while the request runs
        try { return await popoverRequest(text, { slot }); }
        finally { if (draft) draft.busy = false; }
      },
    });
    p.appendChild(bar.wrap);
    p.hidden = false;
    const anchor = document.querySelector(".draft");
    if (anchor) placePopover(anchor);
    if (FINE_POINTER) bar.input.focus(); // don't pop the keyboard up on phones
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
      const changed = applyActions(data.actions || [], data.task_actions || []);
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

  function applyActions(actions, taskActions = []) {
    if (!actions.length && !taskActions.length) return [];
    pushUndo();
    const changed = [];
    for (const a of actions) {
      const fields = { title: a.title, start: a.start, end: a.end, color: a.color, location: a.location || "", allDay: !!a.all_day };
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
        if (task && t.title.trim()) { task.title = t.title.trim(); changed.push(task); }
      } else if (t.type === "complete") {
        const task = tasks.find((x) => x.id === t.id);
        if (task) { changed.push(task); setTaskDone(task.id, true, task.title); }
      }
    }
    saveEvents();
    saveTasks();
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
  const snapshot = () => JSON.stringify({ events, tasks });
  function pushUndo() {
    undoStack.push(snapshot());
    if (undoStack.length > HISTORY_LIMIT) undoStack.shift();
    redoStack = [];
  }
  function restore(snap) {
    const o = JSON.parse(snap);
    events = o.events;
    tasks = o.tasks;
    saveEvents();
    saveTasks();
    hidePopover();
    render();
    renderTasks();
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
      c.style.background = COLORS[ev.color] || COLORS.peacock;
      if (ev.color === "banana") c.style.color = "#202124";
      c.innerHTML = `<span class="mtitle"></span>`;
      c.querySelector(".mtitle").textContent = ev.title || "(No title)";
      if (ev.taskId) c.prepend(checkboxEl(ev));
      return c;
    }
    c.innerHTML = `<span class="mdot"></span><span class="mtime"></span><span class="mtitle"></span>`;
    c.querySelector(".mdot").style.background = COLORS[ev.color] || COLORS.peacock;
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
        dc.textContent = "(No title)";
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
    b.style.setProperty("--c", COLORS[ev.color] || COLORS.peacock);
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

  // Double-click the popover title to rename the event (and its task, if it came from one).
  function editPopoverTitle(ev, titleEl) {
    if (titleEl.querySelector("input")) return;
    const input = document.createElement("input");
    input.className = "ptitle-input";
    input.type = "text";
    input.maxLength = 200;
    input.value = ev.title || "";
    input.setAttribute("aria-label", "Title");
    titleEl.textContent = "";
    titleEl.appendChild(input);
    input.focus();
    input.select();

    let done = false;
    const finish = (save) => {
      if (done) return;
      done = true;
      const val = input.value.trim();
      if (!save || !val || val === ev.title) {
        titleEl.textContent = ev.title || "(No title)";
        return;
      }
      pushUndo();
      if (ev.taskId) {
        events.forEach((x) => { if (x.taskId === ev.taskId) x.title = val; });
        const task = tasks.find((t) => t.id === ev.taskId);
        if (task) task.title = val;
        saveTasks();
        renderTasks();
      } else {
        ev.title = val;
      }
      saveEvents();
      const popoverOpen = !el.popover.hidden && el.popover.dataset.eventId === ev.id;
      flashIds = new Set([ev.id]);
      render();
      flashIds = new Set();
      if (popoverOpen) {
        // Re-open on the freshly drawn event so the popover shows the new title.
        const anchor = document.querySelector(`[data-id="${ev.id}"]:not(.echeck)`);
        if (anchor) showPopover(ev, anchor); else titleEl.textContent = val;
      }
      setStatus(`Renamed to “${escapeHTML(val)}”. <button class="undo" type="button">Undo</button>`);
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

  // ---------- task list (sidebar) ----------
  const CHECK_SVG = `<svg viewBox="0 0 24 24" width="14" height="14"><path d="M9 16.17 4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>`;

  function renderTasks(flash = new Set()) {
    el.taskList.innerHTML = "";
    for (const t of tasks) {
      const li = document.createElement("li");
      li.className = "task" + (flash.has(t.id) ? " flash" : "");
      li.dataset.id = t.id;
      li.innerHTML = `<button class="tcheck" type="button" aria-label="Mark complete" title="Mark complete">${CHECK_SVG}</button><span class="ttitle"></span>`;
      li.querySelector(".ttitle").textContent = t.title;
      li.title = "Click to edit · drag onto the calendar to schedule";
      el.taskList.appendChild(li);
    }
    el.taskEmpty.hidden = tasks.length > 0;
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
        task.title = val;
        saveTasks();
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
    where.textContent = !t.target ? "Drop on the calendar"
      : t.target.allDay ? `All day · ${shortDate(t.target.date)}`
      : `${shortDate(t.target.start)}, ${fmtRange(t.target.start, new Date(t.target.start.getTime() + 3600000))}`;
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

    const ev = { id: uid(), title: t.task.title, color: "peacock", location: "", taskId: t.task.id, done: false };
    if (t.target.allDay) Object.assign(ev, allDaySpan(t.target.date));
    else Object.assign(ev, { start: toISO(t.target.start), end: toISO(new Date(t.target.start.getTime() + 3600000)) });
    pushUndo();
    events.push(ev);
    saveEvents();
    flashIds = new Set([ev.id]);
    render();
    flashIds = new Set();
    const when = t.target.allDay ? `${shortDate(t.target.date)} (all day)` : `${shortDate(t.target.start)} at ${fmtTime(t.target.start)}`;
    setStatus(`Scheduled “${escapeHTML(ev.title)}” for ${escapeHTML(when)}. <button class="undo" type="button">Undo</button>`);
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
    const mobile = window.matchMedia("(max-width: 800px)").matches;
    el.sidebar.classList.toggle(mobile ? "open" : "collapsed");
    setTimeout(refreshMain, 220);
  };

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
    if (!el.viewMenu.hidden && !el.viewMenu.contains(e.target)) {
      el.viewMenu.hidden = true;
      el.viewBtn.setAttribute("aria-expanded", "false");
    }
  });

  const isTyping = (t) => t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable);
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
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
  window.addEventListener("resize", () => { if (!dragging()) refreshMain(); });
  setInterval(() => { if (!dragging() && view === "week") renderGrid(); }, 60000); // keep the red "now" line moving

  render();
  renderTasks();
  el.weekBody.scrollTop = 48 * 7.5; // start around 7:30am like Google Calendar
})();

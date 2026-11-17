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
  };

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
  let weekStart = startOfWeek(new Date());
  let miniMonth = new Date(weekStart.getFullYear(), weekStart.getMonth(), 1);
  let undoStack = [];
  let flashIds = new Set();

  function loadEvents() {
    try {
      const raw = localStorage.getItem(STORE_KEY);
      if (raw) return JSON.parse(raw);
    } catch { /* ignore */ }
    return seedEvents();
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
    ];
  }

  // ---------- rendering ----------
  function render() {
    renderHeader();
    renderGrid();
    renderMini();
  }

  function renderHeader() {
    const end = addDays(weekStart, 6);
    const y1 = weekStart.getFullYear(), y2 = end.getFullYear();
    const m1 = weekStart.getMonth(), m2 = end.getMonth();
    let title;
    if (m1 === m2) title = `${MONTHS[m1]} ${y1}`;
    else if (y1 === y2) title = `${MONTHS[m1].slice(0, 3)} – ${MONTHS[m2].slice(0, 3)} ${y1}`;
    else title = `${MONTHS[m1].slice(0, 3)} ${y1} – ${MONTHS[m2].slice(0, 3)} ${y2}`;
    el.rangeTitle.textContent = title;
    el.logoDate.textContent = new Date().getDate();

    const today = new Date();
    const offset = -today.getTimezoneOffset() / 60;
    let html = `<div class="tz">GMT${offset >= 0 ? "+" : ""}${offset}</div>`;
    for (let i = 0; i < 7; i++) {
      const d = addDays(weekStart, i);
      html += `<div class="day-head${sameDay(d, today) ? " today" : ""}">
        <div class="dname">${DAY_SHORT[i]}</div><div class="dnum">${d.getDate()}</div></div>`;
    }
    el.weekHead.innerHTML = html;
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
        .map((ev) => ({ ev, s: parseISO(ev.start), e: parseISO(ev.end) }))
        .filter(({ s, e }) => s < dayEnd && e > dayStart)
        .map((it) => ({
          ...it,
          top: Math.max(0, (it.s - dayStart) / 60000),            // minutes from midnight
          bottom: Math.min(1440, (it.e - dayStart) / 60000),
        }))
        .sort((a, b) => a.top - b.top || b.bottom - a.bottom);

      layoutColumns(items).forEach((it) => col.appendChild(eventEl(it)));

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

  function eventEl({ ev, s, e, top, bottom, col, cols }) {
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
    div.addEventListener("click", (evt) => { evt.stopPropagation(); showPopover(ev, div); });
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
        sameDay(d, today) ? "today" : (d >= weekStart && d < weekEnd ? "in-week" : ""),
      ].join(" ");
      html += `<button class="${cls}" data-date="${dayKey(d)}">${d.getDate()}</button>`;
    }
    el.miniGrid.innerHTML = html;
  }

  // ---------- popover ----------
  function showPopover(ev, anchor) {
    const s = parseISO(ev.start), e = parseISO(ev.end);
    const dayStr = s.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });
    const p = el.popover;
    p.innerHTML = `
      <div class="ptop"><button class="icon-btn" aria-label="Close" data-close>
        <svg viewBox="0 0 24 24" width="20" height="20"><path d="M19 6.41 17.59 5 12 10.59 6.41 5 5 6.41 10.59 12 5 17.59 6.41 19 12 13.41 17.59 19 19 17.59 13.41 12z"/></svg>
      </button></div>
      <div class="prow"><div class="swatch" style="background:${COLORS[ev.color] || COLORS.peacock}"></div>
        <div><div class="ptitle"></div><div class="pwhen"></div><div class="ploc"></div></div></div>
      <div class="phint">To change this event, describe it in the box on the left — e.g. “move ${escapeQuotes(ev.title)} to 3pm”.</div>`;
    p.querySelector(".ptitle").textContent = ev.title || "(No title)";
    p.querySelector(".pwhen").textContent = `${dayStr} · ${fmtRange(s, e)}`;
    p.querySelector(".ploc").textContent = ev.location || "";
    p.querySelector("[data-close]").onclick = hidePopover;
    p.hidden = false;

    const r = anchor.getBoundingClientRect();
    const pw = p.offsetWidth, ph = p.offsetHeight;
    let left = r.right + 8;
    if (left + pw > window.innerWidth - 8) left = r.left - pw - 8;
    left = Math.max(8, left);
    const top = Math.min(Math.max(8, r.top), window.innerHeight - ph - 8);
    p.style.left = `${left}px`;
    p.style.top = `${top}px`;
  }
  const hidePopover = () => (el.popover.hidden = true);
  const escapeQuotes = (s) => String(s).replace(/[<>&"]/g, "");

  // ---------- AI command ----------
  async function submitCommand(text) {
    const command = text.trim();
    if (!command) return;
    setBusy(true);
    setStatus(`<span class="spinner"></span>Working on it…`);
    try {
      const res = await fetch("/api/schedule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          command,
          events,
          now: `${toISO(new Date())} (${new Date().toLocaleDateString(undefined, { weekday: "long" })})`,
          weekStart: dayKey(weekStart),
          weekEnd: dayKey(addDays(weekStart, 6)),
        }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || `Request failed (${res.status})`);

      const changed = applyActions(data.actions || []);
      el.aiInput.value = "";
      autosize();
      setStatus(escapeHTML(data.reply || "Done.") + (changed.length ? ` <button class="undo" type="button">Undo</button>` : ""));
    } catch (err) {
      setStatus(escapeHTML(err.message || "Something went wrong."), true);
    } finally {
      setBusy(false);
    }
  }

  function applyActions(actions) {
    if (!actions.length) return [];
    undoStack.push(JSON.stringify(events));
    const changed = [];
    for (const a of actions) {
      const fields = { title: a.title, start: a.start, end: a.end, color: a.color, location: a.location || "" };
      if (fields.end && fields.start && parseISO(fields.end) <= parseISO(fields.start)) {
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
    saveEvents();

    // Jump to the week of the first created/updated event if it's not visible.
    const target = actions.find((a) => a.type !== "delete");
    if (target) {
      const d = parseISO(target.start);
      if (d < weekStart || d >= addDays(weekStart, 7)) goToDate(d, false);
    }
    flashIds = new Set(changed.map((e) => e.id));
    render();
    flashIds = new Set();
    return changed;
  }

  function undo() {
    const prev = undoStack.pop();
    if (!prev) return;
    events = JSON.parse(prev);
    saveEvents();
    render();
    setStatus("Undone.");
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

  // ---------- navigation ----------
  function goToDate(d, doRender = true) {
    weekStart = startOfWeek(d);
    miniMonth = new Date(d.getFullYear(), d.getMonth(), 1);
    if (doRender) render();
  }

  // ---------- wiring ----------
  $("todayBtn").onclick = () => goToDate(new Date());
  $("prevBtn").onclick = () => goToDate(addDays(weekStart, -7));
  $("nextBtn").onclick = () => goToDate(addDays(weekStart, 7));
  $("miniPrev").onclick = () => { miniMonth = new Date(miniMonth.getFullYear(), miniMonth.getMonth() - 1, 1); renderMini(); };
  $("miniNext").onclick = () => { miniMonth = new Date(miniMonth.getFullYear(), miniMonth.getMonth() + 1, 1); renderMini(); };
  el.miniGrid.addEventListener("click", (e) => {
    const b = e.target.closest("button[data-date]");
    if (!b) return;
    const keepMonth = miniMonth;
    weekStart = startOfWeek(parseISO(b.dataset.date));
    miniMonth = keepMonth;
    render();
  });
  $("menuBtn").onclick = () => {
    const mobile = window.matchMedia("(max-width: 800px)").matches;
    el.sidebar.classList.toggle(mobile ? "open" : "collapsed");
    setTimeout(renderGrid, 220);
  };

  el.aiForm.addEventListener("submit", (e) => { e.preventDefault(); submitCommand(el.aiInput.value); });
  el.aiInput.addEventListener("keydown", (e) => {
    if (e.key === "Enter" && !e.shiftKey && !e.isComposing) { e.preventDefault(); submitCommand(el.aiInput.value); }
  });
  el.aiInput.addEventListener("input", autosize);
  el.aiHints.addEventListener("click", (e) => {
    const h = e.target.closest(".hint");
    if (h) { el.aiInput.value = h.textContent; el.aiInput.focus(); autosize(); }
  });
  el.aiStatus.addEventListener("click", (e) => { if (e.target.closest(".undo")) undo(); });

  document.addEventListener("click", (e) => { if (!el.popover.contains(e.target)) hidePopover(); });
  document.addEventListener("keydown", (e) => { if (e.key === "Escape") hidePopover(); });
  window.addEventListener("resize", renderGrid);
  setInterval(renderGrid, 60000); // keep the red "now" line moving

  render();
  el.weekBody.scrollTop = 48 * 7.5; // start around 7:30am like Google Calendar
})();

/* ============================================================
   Thought Sorter — the phone app

   Talk tab:      speech -> text (the browser's built-in speech
                  recognition), editable before sending.
   Organized tab: what Claude sorted it into, stored on this phone.
   ============================================================ */
(() => {
  "use strict";

  const $ = id => document.getElementById(id);
  const KEYS = { items: "ts.items", draft: "ts.draft", pass: "ts.passcode", seen: "ts.seen" };

  /* ---------- storage (never trust it to be there) ---------- */
  function load(key, fallback) {
    try { const v = localStorage.getItem(key); return v == null ? fallback : JSON.parse(v); }
    catch { return fallback; }
  }
  function save(key, value) {
    try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* private mode, full disk */ }
  }

  let items = load(KEYS.items, []);
  let filter = "all";
  const persist = () => save(KEYS.items, items);
  const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

  /* ---------- small helpers ---------- */
  function esc(s) {
    return String(s).replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  }
  function parseLocal(due) {
    const m = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})/.exec(due || "");
    return m ? new Date(+m[1], m[2] - 1, +m[3], +m[4], +m[5]) : null;
  }
  const pad = n => String(n).padStart(2, "0");
  function toLocalStamp(d) {
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
  }
  function friendlyDue(due) {
    const d = parseLocal(due);
    if (!d) return "";
    const today = new Date(); today.setHours(0, 0, 0, 0);
    const day = new Date(d); day.setHours(0, 0, 0, 0);
    const diff = Math.round((day - today) / 86400000);
    const time = d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
    if (diff === 0) return `Today, ${time}`;
    if (diff === 1) return `Tomorrow, ${time}`;
    if (diff === -1) return `Yesterday, ${time}`;
    if (diff > 1 && diff < 7) return `${d.toLocaleDateString([], { weekday: "long" })}, ${time}`;
    return d.toLocaleDateString([], { weekday: "short", month: "short", day: "numeric",
      year: d.getFullYear() === today.getFullYear() ? undefined : "numeric" }) + `, ${time}`;
  }

  let toastTimer;
  function toast(html, ms = 3500) {
    const t = $("toast");
    t.innerHTML = html; t.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(() => { t.hidden = true; }, ms);
  }

  /* ---------- tabs ---------- */
  function showTab(name) {
    $("tab-talk").hidden = name !== "talk";
    $("tab-organized").hidden = name !== "organized";
    document.querySelectorAll(".tabbtn").forEach(b => b.classList.toggle("active", b.dataset.tab === name));
    $("screen-title").textContent = name === "talk" ? "Talk" : "Organized";
    if (name === "organized") { save(KEYS.seen, items.length); updateBadge(); render(); }
    window.scrollTo(0, 0);
  }
  document.querySelectorAll(".tabbtn").forEach(b => b.addEventListener("click", () => showTab(b.dataset.tab)));
  $("toast").addEventListener("click", e => { if (e.target.dataset.go) { $("toast").hidden = true; showTab(e.target.dataset.go); } });

  function updateBadge() {
    const fresh = Math.max(0, items.length - load(KEYS.seen, 0));
    $("badge").hidden = fresh === 0;
    $("badge").textContent = fresh;
  }

  /* ---------- speech recognition ---------- */
  const transcript = $("transcript");
  const interim = $("interim");
  const micBtn = $("mic-btn");
  const micLabel = $("mic-label");
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;

  transcript.value = load(KEYS.draft, "");
  transcript.addEventListener("input", () => save(KEYS.draft, transcript.value));

  let rec = null, listening = false, base = "";

  function setListening(on) {
    listening = on;
    micBtn.classList.toggle("on", on);
    micBtn.setAttribute("aria-pressed", String(on));
    micBtn.setAttribute("aria-label", on ? "Stop talking" : "Start talking");
    micLabel.textContent = on ? "Listening… tap to stop" : "Tap to talk";
    if (!on) interim.textContent = "";
  }

  function joinText(a, b) {
    a = a.trimEnd(); b = b.trim();
    if (!a) return b;
    if (!b) return a;
    return a + (/[.!?]$/.test(a) ? " " : ". ") + b;
  }

  function startRec() {
    rec = new SR();
    rec.lang = navigator.language || "en-US";
    rec.continuous = true;
    rec.interimResults = true;
    base = transcript.value;

    rec.onresult = e => {
      let finals = "", live = "";
      for (let i = 0; i < e.results.length; i++) {
        const r = e.results[i];
        if (r.isFinal) finals += r[0].transcript + " ";
        else live += r[0].transcript;
      }
      transcript.value = joinText(base, finals);
      interim.textContent = live;
      save(KEYS.draft, transcript.value);
    };
    rec.onerror = e => {
      if (e.error === "not-allowed" || e.error === "service-not-allowed") {
        setListening(false);
        setStatus("Microphone access was blocked. Allow it in your browser settings, or type instead.", true);
      } else if (e.error !== "no-speech" && e.error !== "aborted") {
        setStatus(`Speech recognition stopped (${e.error}). Tap the mic to continue.`, true);
      }
    };
    // Phones end recognition after a pause. Keep going until the user taps stop.
    rec.onend = () => {
      if (listening) {
        try { startRec(); } catch { setListening(false); }
      }
    };
    rec.start();
  }

  micBtn.addEventListener("click", () => {
    if (!SR) {
      setStatus("This browser can't do speech-to-text. Use your keyboard's mic button to dictate into the box instead.", true);
      transcript.focus();
      return;
    }
    if (listening) {
      setListening(false);
      try { rec && rec.stop(); } catch {}
    } else {
      setStatus("");
      setListening(true);
      try { startRec(); } catch { setListening(false); setStatus("Couldn't start the microphone.", true); }
    }
  });
  if (!SR) $("talk-hint").textContent = "Speech-to-text isn't available in this browser. Tap the box and use your keyboard's mic button to dictate, then tap Organize.";

  $("clear-btn").addEventListener("click", () => {
    if (transcript.value && !confirm("Clear what you've said so far?")) return;
    transcript.value = ""; base = ""; save(KEYS.draft, "");
    if (listening) { setListening(false); try { rec.stop(); } catch {} }
  });

  function setStatus(msg, isError = false) {
    $("status").textContent = msg;
    $("status").classList.toggle("error", isError);
  }

  /* ---------- send to Claude ---------- */
  $("organize-btn").addEventListener("click", async () => {
    if (listening) { setListening(false); try { rec.stop(); } catch {} }
    const text = transcript.value.trim();
    if (!text) { setStatus("Say or type something first."); return; }

    const passcode = load(KEYS.pass, "");
    if (!passcode) { setStatus("Add your app passcode in Settings first.", true); $("settings").showModal(); return; }

    const btn = $("organize-btn");
    btn.disabled = true; btn.textContent = "Sorting…";
    setStatus("Claude is reading through your thoughts…");

    const now = new Date();
    const nowText = now.toLocaleString("en-US", { weekday: "long", year: "numeric", month: "long", day: "numeric", hour: "numeric", minute: "2-digit" });
    const topics = [...new Set(items.map(i => i.topic).filter(Boolean))];

    try {
      const res = await fetch("api/organize", {
        method: "POST",
        headers: { "content-type": "application/json", "x-passcode": passcode },
        body: JSON.stringify({
          text,
          now: `${nowText} (${toLocalStamp(now)})`,
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || "",
          topics
        })
      });
      let data = {};
      try { data = await res.json(); } catch {}
      if (!res.ok) throw new Error(data.error || `Server error (${res.status}).`);

      const added = (data.items || []).map(it => ({
        id: uid(), kind: it.kind, title: it.title, details: it.details || "",
        topic: it.topic || "General", due: it.due || null,
        done: false, notified: false, created: Date.now(), source: text
      }));

      if (!added.length) {
        setStatus("Nothing to save in that one. Try again with a bit more detail.");
        return;
      }
      items = added.concat(items);
      persist();
      transcript.value = ""; base = ""; save(KEYS.draft, "");
      updateBadge();

      const counts = ["reminder", "todo", "note"].map(k => {
        const n = added.filter(i => i.kind === k).length;
        return n ? `${n} ${k === "todo" ? "to-do" : k}${n > 1 ? "s" : ""}` : "";
      }).filter(Boolean).join(", ");
      setStatus("");
      toast(`Added ${esc(counts)} <button data-go="organized">View</button>`, 5000);
    } catch (err) {
      const offline = err instanceof TypeError;
      setStatus(offline ? "Couldn't reach the server. Your words are saved. Try again when you're online." : err.message, true);
    } finally {
      btn.disabled = false; btn.textContent = "Organize";
    }
  });

  /* ---------- organized list ---------- */
  const ICON = {
    check: '<svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg>',
    edit: '<svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="M13.5 6.5l4 4"/></svg>',
    trash: '<svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg>',
    cal: '<svg viewBox="0 0 24 24"><rect x="3.5" y="5" width="17" height="15" rx="2"/><path d="M3.5 10h17M8 3v4M16 3v4M12 13v4M10 15h4"/></svg>'
  };

  function itemHTML(it, showTopic = true) {
    const due = it.kind === "reminder" && it.due ? parseLocal(it.due) : null;
    const overdue = due && !it.done && due < new Date();
    const checkable = it.kind !== "note";
    return `<div class="item${it.done ? " done" : ""}" data-id="${esc(it.id)}">
      ${checkable ? `<button class="check" data-act="toggle" aria-label="${it.done ? "Mark not done" : "Mark done"}">${ICON.check}</button>` : ""}
      <div class="body">
        <div class="title">${esc(it.title)}</div>
        ${it.details ? `<div class="details">${esc(it.details)}</div>` : ""}
        <div class="meta">
          ${due ? `<span class="due${overdue ? " overdue" : ""}">${overdue ? "Overdue · " : ""}${esc(friendlyDue(it.due))}</span>` : ""}
          ${showTopic && it.topic ? `<span class="tag">${esc(it.topic)}</span>` : ""}
        </div>
      </div>
      <div class="tools">
        ${due ? `<button data-act="ics" aria-label="Add to calendar">${ICON.cal}</button>` : ""}
        <button data-act="edit" aria-label="Edit">${ICON.edit}</button>
        <button data-act="delete" aria-label="Delete">${ICON.trash}</button>
      </div>
    </div>`;
  }

  function section(kind, label, list, inner) {
    return `<section class="group"><h2><span class="dot k-${kind}"></span>${label} · ${list.length}</h2>${inner}</section>`;
  }

  function render() {
    const show = k => filter === "all" || filter === k;
    let html = "";

    const reminders = items.filter(i => i.kind === "reminder")
      .sort((a, b) => (a.done - b.done) || ((parseLocal(a.due) || Infinity) - (parseLocal(b.due) || Infinity)));
    if (show("reminder") && reminders.length) {
      html += section("reminder", "Reminders", reminders,
        `<div class="card">${reminders.map(i => itemHTML(i)).join("")}</div>`);
    }

    const todos = items.filter(i => i.kind === "todo").sort((a, b) => (a.done - b.done) || (b.created - a.created));
    if (show("todo") && todos.length) {
      const anyDone = todos.some(t => t.done);
      html += section("todo", "To-dos", todos,
        `<div class="card">${todos.map(i => itemHTML(i)).join("")}</div>` +
        (anyDone ? `<button class="clear-done" data-act="clear-done">Clear finished</button>` : ""));
    }

    const notes = items.filter(i => i.kind === "note");
    if (show("note") && notes.length) {
      const byTopic = {};
      notes.forEach(n => (byTopic[n.topic || "General"] ||= []).push(n));
      const inner = Object.keys(byTopic).sort().map(t =>
        `<h3>${esc(t)}</h3><div class="card">${byTopic[t].map(i => itemHTML(i, false)).join("")}</div>`).join("");
      html += section("note", "Notes", notes, inner);
    }

    $("lists").innerHTML = html;
    $("empty").hidden = html !== "";
    if (!html && items.length) {
      $("empty").hidden = false;
      $("empty").innerHTML = "<p>Nothing in this view.</p>";
    } else if (!items.length) {
      $("empty").innerHTML = "<p><strong>Nothing here yet.</strong></p><p>Talk out your thoughts on the Talk tab and they'll be sorted here.</p>";
    }
  }

  document.querySelectorAll(".chip").forEach(c => c.addEventListener("click", () => {
    filter = c.dataset.filter;
    document.querySelectorAll(".chip").forEach(x => x.classList.toggle("active", x === c));
    render();
  }));

  $("lists").addEventListener("click", e => {
    const btn = e.target.closest("button[data-act]");
    if (!btn) return;
    const act = btn.dataset.act;
    if (act === "clear-done") {
      items = items.filter(i => !(i.kind === "todo" && i.done)); persist(); render(); return;
    }
    const id = btn.closest(".item")?.dataset.id;
    const it = items.find(i => i.id === id);
    if (!it) return;

    if (act === "toggle") { it.done = !it.done; persist(); render(); }
    else if (act === "edit") openEditor(it);
    else if (act === "ics") downloadICS(it);
    else if (act === "delete") {
      const idx = items.indexOf(it);
      items.splice(idx, 1); persist(); render();
      toast(`Deleted <button id="undo">Undo</button>`, 5000);
      $("undo").onclick = () => { items.splice(idx, 0, it); persist(); render(); $("toast").hidden = true; };
    }
  });

  /* ---------- editor ---------- */
  let editing = null;
  function syncDueField() { $("ed-due-wrap").hidden = $("ed-kind").value !== "reminder"; }
  $("ed-kind").addEventListener("change", syncDueField);

  function openEditor(it) {
    editing = it;
    $("ed-kind").value = it.kind;
    $("ed-title").value = it.title;
    $("ed-details").value = it.details || "";
    $("ed-topic").value = it.topic || "";
    $("ed-due").value = it.due || "";
    syncDueField();
    $("editor").showModal();
  }
  $("editor").addEventListener("close", () => {
    if ($("editor").returnValue !== "save" || !editing) { editing = null; return; }
    const it = editing;
    it.kind = $("ed-kind").value;
    it.title = $("ed-title").value.trim() || it.title;
    it.details = $("ed-details").value.trim();
    it.topic = $("ed-topic").value.trim() || "General";
    const newDue = it.kind === "reminder" ? ($("ed-due").value || null) : null;
    if (newDue !== it.due) it.notified = false;
    it.due = newDue;
    editing = null;
    persist(); render();
  });

  /* ---------- calendar file: the reliable way to get an alert ---------- */
  function icsEscape(s) { return String(s).replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n"); }
  function downloadICS(it) {
    const d = parseLocal(it.due);
    if (!d) return;
    const stamp = x => `${x.getFullYear()}${pad(x.getMonth() + 1)}${pad(x.getDate())}T${pad(x.getHours())}${pad(x.getMinutes())}00`;
    const utc = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+/, "");
    const ics = [
      "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Thought Sorter//EN", "CALSCALE:GREGORIAN",
      "BEGIN:VEVENT",
      `UID:${it.id}@thought-sorter`,
      `DTSTAMP:${utc}`,
      `DTSTART:${stamp(d)}`,
      "DURATION:PT15M",
      `SUMMARY:${icsEscape(it.title)}`,
      it.details ? `DESCRIPTION:${icsEscape(it.details)}` : "",
      "BEGIN:VALARM", "ACTION:DISPLAY", `DESCRIPTION:${icsEscape(it.title)}`, "TRIGGER:PT0M", "END:VALARM",
      "END:VEVENT", "END:VCALENDAR"
    ].filter(Boolean).join("\r\n");
    const url = URL.createObjectURL(new Blob([ics], { type: "text/calendar" }));
    const a = document.createElement("a");
    a.href = url; a.download = (it.title.replace(/[^\w\- ]+/g, "").slice(0, 40) || "reminder") + ".ics";
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  }

  /* ---------- reminder notifications ---------- */
  const canNotify = "Notification" in window;
  function updateNotifyBtn() {
    const b = $("notify-btn");
    if (!canNotify) { b.disabled = true; b.textContent = "Not supported here"; $("notify-note").textContent = "On iPhone, add this app to your Home Screen first, then open it from there to turn on notifications."; return; }
    if (Notification.permission === "granted") { b.disabled = true; b.textContent = "Notifications are on"; }
    else if (Notification.permission === "denied") { b.disabled = true; b.textContent = "Blocked in browser settings"; }
  }
  $("notify-btn").addEventListener("click", async () => {
    try { await Notification.requestPermission(); } catch {}
    updateNotifyBtn();
  });

  async function checkDue() {
    const now = new Date();
    let changed = false;
    for (const it of items) {
      if (it.kind !== "reminder" || it.done || it.notified) continue;
      const d = parseLocal(it.due);
      if (!d || d > now) continue;
      it.notified = true; changed = true;
      if (canNotify && Notification.permission === "granted") {
        try {
          const reg = await navigator.serviceWorker?.getRegistration();
          const opts = { body: it.details || friendlyDue(it.due), tag: it.id, icon: "icon-192.png", badge: "icon-192.png" };
          if (reg) reg.showNotification(it.title, opts); else new Notification(it.title, opts);
        } catch {}
      }
    }
    if (changed) { persist(); if (!$("tab-organized").hidden) render(); }
  }
  setInterval(checkDue, 30000);
  document.addEventListener("visibilitychange", () => { if (!document.hidden) { checkDue(); if (!$("tab-organized").hidden) render(); } });

  /* ---------- settings ---------- */
  $("settings-btn").addEventListener("click", () => {
    $("passcode").value = load(KEYS.pass, "");
    updateNotifyBtn();
    $("settings").showModal();
  });
  $("settings").addEventListener("close", () => save(KEYS.pass, $("passcode").value.trim()));
  $("export-btn").addEventListener("click", () => {
    const url = URL.createObjectURL(new Blob([JSON.stringify(items, null, 2)], { type: "application/json" }));
    const a = document.createElement("a");
    a.href = url; a.download = `thoughts-backup-${toLocalStamp(new Date()).slice(0, 10)}.json`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 10000);
  });
  $("wipe-btn").addEventListener("click", () => {
    if (!confirm("Delete every note, to-do and reminder on this phone? This can't be undone.")) return;
    items = []; persist(); save(KEYS.seen, 0); updateBadge(); render();
    $("settings").close();
  });

  /* ---------- boot ---------- */
  if ("serviceWorker" in navigator) navigator.serviceWorker.register("sw.js").catch(() => {});
  updateBadge();
  render();
  checkDue();
})();

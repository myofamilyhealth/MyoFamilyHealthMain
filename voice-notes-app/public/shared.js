/* ============================================================
   Thought Sorter — shared lists

   Creating a share sends a copy of a list to the server and gives
   back a link. Everyone with the link (the sharer included) works on
   that one live copy: checking off, adding and removing sync every
   few seconds. The sharer keeps an owner key, which is needed to stop
   sharing.

   window.TSShare is used by app.js (to-dos, notes) and plan.js
   (party lists, deals).
   ============================================================ */
(() => {
  "use strict";
  const { toast, esc, load, save } = window.TS;
  const $ = id => document.getElementById(id);
  const K = "ts.shared";            // [{ id, title, kind, ownerKey?, saved }]
  const POLL_MS = 4000;

  let mine = load(K, []);
  const persist = () => save(K, mine);
  const linkFor = id => `${location.origin}${location.pathname}?list=${encodeURIComponent(id)}`;
  const entry = id => mine.find(m => m.id === id);

  /* ---------- talking to the server ---------- */
  async function api(path, opts = {}) {
    const res = await fetch("api/share" + path, opts);
    let data = {};
    try { data = await res.json(); } catch {}
    if (!res.ok) { const e = new Error(data.error || `Server error (${res.status}).`); e.status = res.status; throw e; }
    return data;
  }

  async function create(payload) {
    const data = await api("", {
      method: "POST",
      headers: { "content-type": "application/json", "x-passcode": window.TS.passcode() },
      body: JSON.stringify(payload)
    });
    mine = mine.filter(m => m.id !== data.id);
    mine.unshift({ id: data.id, title: payload.title, kind: payload.kind, ownerKey: data.ownerKey, saved: Date.now() });
    persist();
    return data;
  }
  const read = (id, v) => api(`/${encodeURIComponent(id)}${v ? `?v=${v}` : ""}`);
  const change = (id, op) => api(`/${encodeURIComponent(id)}`, {
    method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(op)
  });
  async function stop(id) {
    const e = entry(id);
    await api(`/${encodeURIComponent(id)}`, { method: "DELETE", headers: { "x-owner-key": e ? e.ownerKey || "" : "" } });
    forget(id);
  }
  function forget(id) { mine = mine.filter(m => m.id !== id); persist(); }

  /* Phone share sheet if there is one, otherwise copy the link. */
  async function sendLink(id, title) {
    const url = linkFor(id);
    if (navigator.share) {
      try { await navigator.share({ title, text: `${title} (shared list)`, url }); return; }
      catch (e) { if (e && e.name === "AbortError") return; }
    }
    try { await navigator.clipboard.writeText(url); toast("Link copied. Paste it in a text or email."); }
    catch { toast("Copy the link from the box below."); }
  }

  /* ---------- the shared list screen ---------- */
  let openId = null, current = null, timer = null, cameFrom = "plan";
  const checkable = () => current && (current.kind === "party" || current.kind === "todos");

  function showScreen() {
    ["talk", "organized", "plan"].forEach(t => { $("tab-" + t).hidden = true; });
    $("tab-shared").hidden = false;
    document.querySelectorAll(".tabbtn").forEach(b => b.classList.remove("active"));
    $("screen-title").textContent = "Shared list";
    window.scrollTo(0, 0);
  }
  function closeScreen() {
    openId = null; current = null; stopPolling();
    $("tab-shared").hidden = true;
    if (new URLSearchParams(location.search).has("list")) history.replaceState(null, "", location.pathname);
  }
  document.addEventListener("ts:tab", () => { if (openId) closeScreen(); });
  $("shared-back").addEventListener("click", () => {
    closeScreen();
    window.TS.showTab(cameFrom);
    if (cameFrom === "plan") document.querySelector('[data-plan="shared"]').click();
  });

  async function open(id, from = "plan") {
    cameFrom = from; openId = id; current = null;
    showScreen();
    $("shared-title").textContent = "Loading…";
    $("shared-meta").textContent = ""; $("shared-items").innerHTML = "";
    $("shared-link").value = linkFor(id);
    syncButtons();
    try {
      const data = await read(id);
      if (openId !== id) return;
      current = data.list; render();
      const e = entry(id);
      if (e && e.title !== current.title) { e.title = current.title; persist(); }
      startPolling();
    } catch (err) {
      if (openId !== id) return;
      $("shared-title").textContent = err.status === 404 ? "This list isn't shared anymore" : "Couldn't load this list";
      $("shared-meta").textContent = err.status === 404 ? "The person who shared it may have stopped sharing." : "Check your connection and try again.";
      $("shared-progress-wrap").hidden = true; $("shared-add-form").hidden = true;
      if (err.status === 404) $("shared-forget").hidden = !entry(id);
    }
  }

  function syncButtons() {
    const e = entry(openId);
    $("shared-save").hidden = !!e;
    $("shared-forget").hidden = !e || !!e.ownerKey;
    $("shared-stop").hidden = !e || !e.ownerKey;
    $("shared-add-form").hidden = false;
  }

  function startPolling() {
    stopPolling();
    timer = setInterval(async () => {
      if (!openId || !current || document.hidden) return;
      try {
        const data = await read(openId, current.version);
        if (!data.same && data.list && openId) { current = data.list; render(); }
      } catch (err) {
        if (err.status === 404) { stopPolling(); toast("This list was just unshared."); open(openId, cameFrom); }
      }
    }, POLL_MS);
  }
  function stopPolling() { clearInterval(timer); timer = null; }

  function itemHTML(it) {
    const sub = [];
    if (current.kind === "deals") {
      const line = [it.price, it.store].filter(Boolean).join(" · ");
      if (line) sub.push(`<div class="deal-line">${esc(line)}</div>`);
    }
    if (it.tip) sub.push(`<div class="details">${esc(it.tip)}</div>`);
    const meta = [];
    if (current.kind === "party" && it.stores && it.stores.length) meta.push(`<span class="where">${esc(it.stores.join(" or "))}</span>`);
    if (it.gift) meta.push(`<span class="tag gift">🎁 Gift${it.for ? " for " + esc(it.for) : " idea"}</span>`);
    if (it.due) {
      const [d, t] = it.due.split("T"); const [y, m, dd] = d.split("-").map(Number); const [h, mi] = t.split(":").map(Number);
      meta.push(`<span class="due">${esc(new Date(y, m - 1, dd, h, mi).toLocaleString([], { weekday: "short", month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }))}</span>`);
    }
    return `<div class="item${it.done ? " done" : ""}" data-id="${esc(it.id)}">
      ${checkable() ? `<button class="check" data-act="toggle" aria-label="${it.done ? "Mark not done" : "Mark done"}"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></button>` : ""}
      ${it.photo ? `<img class="shared-thumb" src="${esc(it.photo)}" alt="">` : ""}
      <div class="body">
        <div class="title">${esc(it.name)}${it.qty ? ` <span class="qty">${esc(it.qty)}</span>` : ""}</div>
        ${sub.join("")}
        ${meta.length ? `<div class="meta">${meta.join("")}</div>` : ""}
      </div>
      <div class="tools"><button data-act="remove" aria-label="Remove"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
    </div>`;
  }

  function render() {
    if (!current) return;
    $("shared-title").textContent = current.title;
    const kindLabel = { party: "Party list", todos: "To-dos", notes: "Notes", deals: "Deals & gift ideas" }[current.kind] || "List";
    $("shared-meta").textContent = [kindLabel, current.meta].filter(Boolean).join(" · ");
    let all = 0, done = 0;
    current.sections.forEach(s => s.items.forEach(i => { all++; if (i.done) done++; }));
    $("shared-progress-wrap").hidden = !checkable();
    $("shared-progress").style.width = (all ? Math.round(done / all * 100) : 0) + "%";
    const html = current.sections.filter(s => s.items.length).map(s =>
      `<section class="group"><h3>${esc(s.name)}</h3><div class="card">${s.items.map(itemHTML).join("")}</div></section>`).join("");
    $("shared-items").innerHTML = html || `<div class="empty"><p>This list is empty. Add something below.</p></div>`;
    syncButtons();
  }

  async function apply(op, optimistic) {
    if (!current) return;
    optimistic(); render();
    try {
      const data = await change(openId, op);
      if (data.list) { current = data.list; render(); }
    } catch (err) {
      toast(err instanceof TypeError ? "You're offline. That change didn't save." : err.message);
      try { const d = await read(openId); current = d.list; render(); } catch {}
    }
  }

  $("shared-items").addEventListener("click", e => {
    const b = e.target.closest("button[data-act]");
    if (!b || !current) return;
    const id = b.closest(".item").dataset.id;
    let it = null, sec = null;
    current.sections.forEach(s => s.items.forEach(i => { if (i.id === id) { it = i; sec = s; } }));
    if (!it) return;
    if (b.dataset.act === "toggle") apply({ op: "toggle", id, done: !it.done }, () => { it.done = !it.done; });
    else apply({ op: "remove", id }, () => { sec.items.splice(sec.items.indexOf(it), 1); });
  });

  $("shared-add-form").addEventListener("submit", e => {
    e.preventDefault();
    const name = $("shared-add").value.trim();
    if (!name || !current) return;
    $("shared-add").value = "";
    apply({ op: "add", section: "Added", item: { name } }, () => {
      let s = current.sections.find(x => x.name === "Added");
      if (!s) { s = { name: "Added", items: [] }; current.sections.push(s); }
      s.items.push({ id: "tmp" + Date.now(), name, done: false });
    });
  });

  $("shared-copy").addEventListener("click", async () => {
    try { await navigator.clipboard.writeText($("shared-link").value); toast("Link copied."); }
    catch { $("shared-link").select(); toast("Press and hold the link to copy it."); }
  });
  $("shared-save").addEventListener("click", () => {
    if (!current) return;
    mine.unshift({ id: openId, title: current.title, kind: current.kind, saved: Date.now() });
    persist(); syncButtons();
    toast("Saved. Find it any time in Plan › Shared.");
  });
  $("shared-forget").addEventListener("click", () => {
    forget(openId); syncButtons(); toast("Removed from your app. The list itself is unchanged.");
  });
  $("shared-stop").addEventListener("click", async () => {
    if (!confirm("Stop sharing? The link will stop working for everyone.")) return;
    try {
      await stop(openId);
      document.dispatchEvent(new CustomEvent("ts:unshared", { detail: openId }));
      toast("Stopped sharing.");
      $("shared-back").click();
    } catch (err) { toast(err.message); }
  });

  /* ---------- Plan › Shared ---------- */
  function renderMine() {
    const box = $("shared-list");
    if (!mine.length) {
      box.innerHTML = `<div class="empty"><p><strong>Nothing shared yet.</strong></p><p>Tap “Share” on a party list, your to-dos, notes or deals to send a live link.</p></div>`;
      return;
    }
    const icon = { party: "🎉", todos: "✅", notes: "📝", deals: "🏷️" };
    box.innerHTML = `<div class="card">` + mine.map(m => `<button class="party-row" data-shared="${esc(m.id)}">
      <span class="kind-icon">${icon[m.kind] || "📋"}</span>
      <div class="body"><div class="title">${esc(m.title)}</div><div class="details">${m.ownerKey ? "Shared by you" : "Shared with you"}</div></div>
      <span class="count">›</span></button>`).join("") + `</div>`;
  }
  $("shared-list").addEventListener("click", e => {
    const b = e.target.closest("[data-shared]");
    if (b) open(b.dataset.shared, "plan");
  });

  /* Share something and immediately offer to send the link. */
  async function shareNew(payload) {
    if (!window.TS.passcode()) { toast("Add your app passcode in Settings first."); window.TS.openSettings(); return null; }
    toast("Creating your link…", 8000);
    try {
      const data = await create(payload);
      toast("Shared. Anyone with the link can see and check off this list.", 4000);
      await sendLink(data.id, payload.title);
      return data;
    } catch (err) {
      toast(err instanceof TypeError ? "Couldn't reach the server. Check your connection." : err.message);
      return null;
    }
  }

  window.TSShare = { create, read, change, stop, forget, sendLink, shareNew, open, renderMine, linkFor, entry };

  /* Opened from a shared link? */
  const fromLink = new URLSearchParams(location.search).get("list");
  if (fromLink) setTimeout(() => open(fromLink, "talk"), 0);
})();

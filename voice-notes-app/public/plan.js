/* ============================================================
   Thought Sorter — Plan tab

   Party lists: the AI builds a "don't forget" list for an occasion,
   with stores people usually buy each item at.

   Where to buy (worked out here on the phone, no AI, no cost):
     1. a deal the user logged for that item, cheapest first
     2. one of the user's own stores the AI also suggested
     3. the AI's first suggestion

   Deals: things the user spotted (item, store, price, photo),
   optionally marked as gift ideas. Photos live in IndexedDB.
   ============================================================ */
(() => {
  "use strict";
  const { toast, esc, uid, load, save } = window.TS;
  const $ = id => document.getElementById(id);
  const K = { parties: "ts.parties", deals: "ts.deals", stores: "ts.stores" };

  let parties = load(K.parties, []);
  let deals = load(K.deals, []);
  let myStores = load(K.stores, []);
  let section = "parties";      // parties | deals
  let openId = null;            // party being viewed
  let view = "category";        // category | store
  let dealFilter = "all";

  const saveParties = () => save(K.parties, parties);
  const saveDeals = () => save(K.deals, deals);

  /* ---------- photos (IndexedDB; can be unavailable) ---------- */
  let dbp = null;
  function db() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      try {
        const req = indexedDB.open("ts-photos", 1);
        req.onupgradeneeded = () => req.result.createObjectStore("photos");
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error);
      } catch (e) { reject(e); }
    });
    return dbp;
  }
  async function photoPut(id, blob) {
    const d = await db();
    return new Promise((res, rej) => {
      const tx = d.transaction("photos", "readwrite");
      tx.objectStore("photos").put(blob, id);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  }
  async function photoGet(id) {
    const d = await db();
    return new Promise(res => {
      const r = d.transaction("photos").objectStore("photos").get(id);
      r.onsuccess = () => res(r.result || null); r.onerror = () => res(null);
    });
  }
  async function photoDel(id) {
    try {
      const d = await db();
      d.transaction("photos", "readwrite").objectStore("photos").delete(id);
    } catch {}
  }
  /* Shrink camera photos (often 3-5 MB) to about 100 KB. */
  function shrink(file, max = 1000) {
    return new Promise((resolve, reject) => {
      const img = new Image();
      const url = URL.createObjectURL(file);
      img.onload = () => {
        const scale = Math.min(1, max / Math.max(img.width, img.height));
        const c = document.createElement("canvas");
        c.width = Math.round(img.width * scale); c.height = Math.round(img.height * scale);
        c.getContext("2d").drawImage(img, 0, 0, c.width, c.height);
        URL.revokeObjectURL(url);
        c.toBlob(b => b ? resolve(b) : reject(new Error("photo")), "image/jpeg", 0.78);
      };
      img.onerror = () => { URL.revokeObjectURL(url); reject(new Error("photo")); };
      img.src = url;
    });
  }

  /* ---------- matching items to deals ---------- */
  const STOP = new Set(["a", "an", "the", "and", "or", "of", "for", "to", "with", "in", "on", "at", "some",
    "extra", "more", "set", "pack", "box", "bag", "bottle", "bottles", "large", "small", "big", "mini",
    "table", "party", "holiday", "outdoor", "outdoors", "indoor", "kids", "guest", "guests", "your"]);
  function words(s) {
    return String(s).toLowerCase().replace(/[^a-z0-9\s]/g, " ").split(/\s+/)
      .filter(w => w && !STOP.has(w))
      .map(w => w.length > 4 && w.endsWith("ies") ? w.slice(0, -3) + "y"
        : w.length > 3 && /(ch|sh|x|ss)es$/.test(w) ? w.slice(0, -2)
        : w.length > 3 && w.endsWith("s") && !w.endsWith("ss") ? w.slice(0, -1) : w);
  }
  function matchScore(a, b) {
    const A = new Set(words(a)), B = new Set(words(b));
    if (!A.size || !B.size) return 0;
    let n = 0; A.forEach(w => { if (B.has(w)) n++; });
    return n / Math.min(A.size, B.size);
  }
  const priceNum = p => { const m = /[\d,.]+/.exec(String(p || "")); return m ? parseFloat(m[0].replace(/,/g, "")) : Infinity; };

  function dealsFor(itemName) {
    return deals.filter(d => matchScore(itemName, d.item) >= 0.6)
      .sort((x, y) => priceNum(x.price) - priceNum(y.price) || y.created - x.created);
  }
  const norm = s => String(s).toLowerCase().replace(/[^a-z0-9]/g, "");
  function mine(store) {
    const n = norm(store);
    return n && myStores.some(m => { const k = norm(m); return k && (n.includes(k) || k.includes(n)); });
  }
  /* The single best place to get an item, and why. */
  function bestStore(it) {
    const d = dealsFor(it.name)[0];
    if (d) return { store: d.store, deal: d };
    const stores = it.stores || [];
    const own = stores.find(mine);
    if (own) return { store: own, own: true };
    if (stores[0]) return { store: stores[0] };
    return { store: "Anywhere" };
  }

  /* ---------- section switching ---------- */
  function showSection(name) {
    section = name;
    document.querySelectorAll("[data-plan]").forEach(c => c.classList.toggle("active", c.dataset.plan === name));
    $("plan-parties").hidden = name !== "parties" || !!openId;
    $("plan-party").hidden = name !== "parties" || !openId;
    $("plan-deals").hidden = name !== "deals";
    render();
  }
  document.querySelectorAll("[data-plan]").forEach(c => c.addEventListener("click", () => { openId = null; showSection(c.dataset.plan); }));
  document.addEventListener("ts:tab", e => { if (e.detail === "plan") render(); });

  function render() {
    if (section === "deals") return renderDeals();
    if (openId) return renderParty();
    renderParties();
  }

  /* ---------- party list overview ---------- */
  function counts(p) {
    let all = 0, done = 0;
    p.categories.forEach(c => c.items.forEach(i => { all++; if (i.done) done++; }));
    return { all, done };
  }
  function fmtDate(iso) {
    if (!iso) return "";
    const [y, m, d] = iso.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString([], { weekday: "short", month: "short", day: "numeric" });
  }
  function renderParties() {
    if (!parties.length) {
      $("party-list").innerHTML = `<div class="empty"><p><strong>No party lists yet.</strong></p><p>Hosting something? Tap “Plan a party” and you'll get everything you might forget, from napkins to extra water.</p></div>`;
      return;
    }
    $("party-list").innerHTML = `<div class="card">` + parties.map(p => {
      const c = counts(p);
      return `<button class="party-row" data-open="${esc(p.id)}">
        <div class="body">
          <div class="title">${esc(p.title)}</div>
          <div class="details">${esc([p.style, `${p.guests} guests`, fmtDate(p.date)].filter(Boolean).join(" · "))}</div>
          <div class="progress slim"><div style="width:${c.all ? Math.round(c.done / c.all * 100) : 0}%"></div></div>
        </div>
        <span class="count">${c.done}/${c.all}</span>
      </button>`;
    }).join("") + `</div>`;
  }
  $("party-list").addEventListener("click", e => {
    const b = e.target.closest("[data-open]");
    if (!b) return;
    openId = b.dataset.open; view = "category";
    document.querySelectorAll("[data-view]").forEach(x => x.classList.toggle("active", x.dataset.view === view));
    showSection("parties"); window.scrollTo(0, 0);
  });
  $("party-back").addEventListener("click", () => { openId = null; showSection("parties"); });

  /* ---------- one party ---------- */
  const current = () => parties.find(p => p.id === openId);
  document.querySelectorAll("[data-view]").forEach(c => c.addEventListener("click", () => {
    view = c.dataset.view;
    document.querySelectorAll("[data-view]").forEach(x => x.classList.toggle("active", x === c));
    renderParty();
  }));

  function itemRow(it, ci, ii, showStore) {
    const best = bestStore(it);
    const others = (it.stores || []).filter(s => norm(s) !== norm(best.store)).slice(0, 2);
    let where = "";
    if (best.deal) {
      const d = best.deal;
      where = `<span class="deal-hit">💲 Your deal: ${esc(d.price ? d.price + " at " : "")}${esc(d.store)}</span>`;
    } else if (showStore) {
      where = `<span class="where">${best.own ? "★ " : ""}${esc(best.store)}${others.length ? ` <span class="muted">or ${esc(others.join(", "))}</span>` : ""}</span>`;
    }
    return `<div class="item${it.done ? " done" : ""}" data-ci="${ci}" data-ii="${ii}">
      <button class="check" data-act="toggle" aria-label="${it.done ? "Mark not got" : "Mark got"}"><svg viewBox="0 0 24 24"><path d="M5 12.5l4.5 4.5L19 7.5"/></svg></button>
      <div class="body">
        <div class="title">${esc(it.name)}${it.qty ? ` <span class="qty">${esc(it.qty)}</span>` : ""}</div>
        ${it.tip ? `<div class="details">${esc(it.tip)}</div>` : ""}
        ${where ? `<div class="meta">${where}</div>` : ""}
      </div>
      <div class="tools"><button data-act="remove" aria-label="Remove"><svg viewBox="0 0 24 24"><path d="M6 6l12 12M18 6L6 18"/></svg></button></div>
    </div>`;
  }

  function renderParty() {
    const p = current();
    if (!p) { openId = null; return showSection("parties"); }
    const c = counts(p);
    $("party-title").textContent = p.title;
    $("party-sub").textContent = [p.style, `${p.guests} guests`, p.setting, fmtDate(p.date)].filter(Boolean).join(" · ");
    $("party-progress").style.width = (c.all ? Math.round(c.done / c.all * 100) : 0) + "%";

    let html = "";
    if (view === "category") {
      p.categories.forEach((cat, ci) => {
        if (!cat.items.length) return;
        html += `<section class="group"><h3>${esc(cat.name)}</h3><div class="card">${cat.items.map((it, ii) => itemRow(it, ci, ii, true)).join("")}</div></section>`;
      });
    } else {
      // Shop by store: everything still needed, grouped by the best place to get it.
      const byStore = {}, got = [];
      p.categories.forEach((cat, ci) => cat.items.forEach((it, ii) => {
        if (it.done) { got.push(itemRow(it, ci, ii, false)); return; }
        const s = bestStore(it).store;
        (byStore[s] ||= []).push(itemRow(it, ci, ii, false));
      }));
      const order = Object.keys(byStore).sort((a, b) => (mine(b) - mine(a)) || byStore[b].length - byStore[a].length);
      if (!order.length) html += `<div class="empty"><p><strong>You've got everything.</strong> 🎉</p></div>`;
      order.forEach(s => {
        html += `<section class="group"><h3>${mine(s) ? "★ " : ""}${esc(s)} <span class="muted">· ${byStore[s].length}</span></h3><div class="card">${byStore[s].join("")}</div></section>`;
      });
      if (got.length) html += `<section class="group"><h3 class="muted">Already got · ${got.length}</h3><div class="card">${got.join("")}</div></section>`;
      html = `<p class="hint">At the store? Here's what to grab there. ★ marks your stores. Store suggestions are general. Check what your local store actually carries.</p>` + html;
    }
    $("party-items").innerHTML = html;
  }

  $("party-items").addEventListener("click", e => {
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    const row = b.closest(".item"), p = current();
    const cat = p && p.categories[+row.dataset.ci];
    const it = cat && cat.items[+row.dataset.ii];
    if (!it) return;
    if (b.dataset.act === "toggle") it.done = !it.done;
    else if (b.dataset.act === "remove") cat.items.splice(+row.dataset.ii, 1);
    saveParties(); renderParty();
  });

  $("add-item-form").addEventListener("submit", e => {
    e.preventDefault();
    const name = $("add-item").value.trim(), p = current();
    if (!name || !p) return;
    let cat = p.categories.find(c => c.name === "Added by you");
    if (!cat) { cat = { name: "Added by you", items: [] }; p.categories.push(cat); }
    cat.items.push({ name, qty: "", tip: "", stores: [], done: false });
    $("add-item").value = "";
    saveParties(); renderParty();
  });

  $("party-to-todos").addEventListener("click", () => {
    const p = current();
    if (!p) return;
    const todos = [];
    p.categories.forEach(c => c.items.forEach(it => {
      if (it.done) return;
      const best = bestStore(it);
      todos.push({
        title: it.qty ? `${it.name} (${it.qty})` : it.name,
        details: best.deal ? `Your deal: ${best.deal.price || ""} at ${best.deal.store}`.replace(":  at", ": at") : `Try ${best.store}`,
        topic: p.title.slice(0, 40)
      });
    }));
    if (!todos.length) { toast("Nothing left to get."); return; }
    document.dispatchEvent(new CustomEvent("ts:add-todos", { detail: todos }));
    toast(`Added ${todos.length} to-dos <button data-go="organized">View</button>`, 5000);
  });

  $("party-delete").addEventListener("click", () => {
    const p = current();
    if (!p || !confirm(`Delete “${p.title}”?`)) return;
    parties = parties.filter(x => x !== p); saveParties();
    openId = null; showSection("parties");
  });

  /* ---------- new party ---------- */
  function seg(id) {
    const el = $(id);
    el.addEventListener("click", e => {
      const b = e.target.closest("button[data-v]");
      if (!b) return;
      el.querySelectorAll("button").forEach(x => x.classList.toggle("on", x === b));
    });
    return () => (el.querySelector("button.on") || el.querySelector("button")).dataset.v;
  }
  const getStyle = seg("pf-style"), getSetting = seg("pf-setting");

  $("new-party-btn").addEventListener("click", () => {
    $("pf-status").textContent = ""; $("pf-status").classList.remove("error");
    $("party-dialog").showModal();
  });

  // One-shot dictation for the notes box.
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) $("pf-mic").hidden = true;
  $("pf-mic").addEventListener("click", () => {
    const r = new SR();
    r.lang = navigator.language || "en-US"; r.interimResults = false;
    $("pf-mic").textContent = "⏺";
    r.onresult = e => {
      const t = Array.from(e.results).map(x => x[0].transcript).join(" ");
      $("pf-notes").value = ($("pf-notes").value.trim() + " " + t).trim();
    };
    r.onend = () => { $("pf-mic").textContent = "🎤"; };
    try { r.start(); } catch { $("pf-mic").textContent = "🎤"; }
  });

  let building = false;
  $("party-form").addEventListener("submit", async e => {
    if (e.submitter && e.submitter.value === "cancel") return;
    e.preventDefault();
    if (building) return;
    const passcode = window.TS.passcode();
    const status = $("pf-status");
    if (!passcode) { status.textContent = "Add your app passcode in Settings first."; status.classList.add("error"); return; }

    const req = {
      occasion: $("pf-occasion").value,
      guests: Math.max(1, Math.min(500, parseInt($("pf-guests").value, 10) || 10)),
      style: getStyle(), setting: getSetting(),
      date: $("pf-date").value || "",
      notes: $("pf-notes").value.trim()
    };
    building = true;
    $("pf-go").disabled = true; $("pf-go").textContent = "Building…";
    status.classList.remove("error");
    status.textContent = "Thinking of everything you might forget… (about 10–20 seconds)";
    try {
      const res = await fetch("api/party", {
        method: "POST",
        headers: { "content-type": "application/json", "x-passcode": passcode },
        body: JSON.stringify(req)
      });
      let data = {};
      try { data = await res.json(); } catch {}
      if (!res.ok) throw new Error(data.error || `Server error (${res.status}).`);
      if (!data.categories || !data.categories.length) throw new Error("The AI came back empty. Try again.");

      const party = {
        id: uid(), created: Date.now(),
        title: data.title || req.occasion, occasion: req.occasion, guests: req.guests,
        style: req.style, setting: req.setting, date: req.date, notes: req.notes,
        categories: data.categories.map(c => ({
          name: c.name,
          items: c.items.map(i => ({ name: i.name, qty: i.qty || "", tip: i.tip || "", stores: i.stores || [], done: false }))
        }))
      };
      parties.unshift(party); saveParties();
      $("party-dialog").close();
      $("pf-notes").value = "";
      openId = party.id; view = "category";
      document.querySelectorAll("[data-view]").forEach(x => x.classList.toggle("active", x.dataset.view === view));
      showSection("parties"); window.scrollTo(0, 0);
    } catch (err) {
      status.textContent = err instanceof TypeError ? "Couldn't reach the server. Check your connection and try again." : err.message;
      status.classList.add("error");
    } finally {
      building = false;
      $("pf-go").disabled = false; $("pf-go").textContent = "Make my list";
    }
  });

  /* ---------- deals ---------- */
  const photoURLs = new Map();
  async function photoURL(id) {
    if (photoURLs.has(id)) return photoURLs.get(id);
    let url = "";
    try { const b = await photoGet(id); if (b) url = URL.createObjectURL(b); } catch {}
    photoURLs.set(id, url);
    return url;
  }
  function daysAgo(t) {
    const d = Math.floor((Date.now() - t) / 86400000);
    return d <= 0 ? "today" : d === 1 ? "yesterday" : d < 30 ? `${d} days ago` : new Date(t).toLocaleDateString([], { month: "short", day: "numeric" });
  }
  function renderDeals() {
    const list = deals.filter(d => dealFilter === "all" || d.gift);
    $("store-options").innerHTML = [...new Set(myStores.concat(deals.map(d => d.store)))].map(s => `<option value="${esc(s)}">`).join("");
    if (!list.length) {
      $("deal-list").innerHTML = `<div class="empty"><p><strong>${dealFilter === "gift" ? "No gift ideas yet." : "No deals logged yet."}</strong></p><p>Snap a photo when you see a good price or a perfect gift.</p></div>`;
      return;
    }
    $("deal-list").innerHTML = list.map(d => `<div class="deal" data-id="${esc(d.id)}">
      <div class="thumb">${d.photo ? `<img data-photo="${esc(d.photo)}" alt="">` : "🏷️"}</div>
      <div class="body">
        <div class="title">${esc(d.item)}</div>
        <div class="price">${esc(d.price || "")}${d.price ? " · " : ""}${esc(d.store)}</div>
        ${d.notes ? `<div class="details">${esc(d.notes)}</div>` : ""}
        <div class="meta">${d.gift ? `<span class="tag gift">🎁 Gift${d.for ? " for " + esc(d.for) : " idea"}</span>` : ""}<span class="tag">${esc(daysAgo(d.created))}</span></div>
      </div>
      <div class="tools">
        <button data-act="edit" aria-label="Edit"><svg viewBox="0 0 24 24"><path d="M4 20h4L19 9l-4-4L4 16v4Z"/><path d="M13.5 6.5l4 4"/></svg></button>
        <button data-act="delete" aria-label="Delete"><svg viewBox="0 0 24 24"><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3"/></svg></button>
      </div>
    </div>`).join("");
    $("deal-list").querySelectorAll("img[data-photo]").forEach(async img => {
      const url = await photoURL(img.dataset.photo);
      if (url) img.src = url; else img.replaceWith("🏷️");
    });
  }
  document.querySelectorAll("[data-deals]").forEach(c => c.addEventListener("click", () => {
    dealFilter = c.dataset.deals;
    document.querySelectorAll("[data-deals]").forEach(x => x.classList.toggle("active", x === c));
    renderDeals();
  }));

  let editingDeal = null, pendingPhoto = null, removePhoto = false;
  $("df-gift").addEventListener("change", () => { $("df-for-wrap").hidden = !$("df-gift").checked; });

  async function openDeal(d) {
    editingDeal = d || null; pendingPhoto = null; removePhoto = false;
    $("deal-dialog-title").textContent = d ? "Edit deal" : "Log a deal";
    $("df-item").value = d ? d.item : "";
    $("df-store").value = d ? d.store : "";
    $("df-price").value = d ? d.price : "";
    $("df-notes").value = d ? d.notes : "";
    $("df-gift").checked = !!(d && d.gift);
    $("df-for").value = d ? d.for || "" : "";
    $("df-for-wrap").hidden = !$("df-gift").checked;
    $("df-photo").value = "";
    const url = d && d.photo ? await photoURL(d.photo) : "";
    $("df-preview").hidden = !url; if (url) $("df-preview").src = url;
    $("df-photo-text").textContent = url ? "Change photo" : "📷 Add a photo";
    $("deal-dialog").showModal();
  }
  $("new-deal-btn").addEventListener("click", () => openDeal(null));

  $("df-photo").addEventListener("change", async () => {
    const f = $("df-photo").files[0];
    if (!f) return;
    try {
      pendingPhoto = await shrink(f);
      $("df-preview").src = URL.createObjectURL(pendingPhoto);
      $("df-preview").hidden = false;
      $("df-photo-text").textContent = "Change photo";
    } catch { toast("Couldn't read that photo."); }
  });

  $("deal-dialog").addEventListener("close", async () => {
    if ($("deal-dialog").returnValue !== "save") { editingDeal = null; return; }
    const d = editingDeal || { id: uid(), created: Date.now(), photo: null };
    d.item = $("df-item").value.trim();
    d.store = $("df-store").value.trim();
    d.price = $("df-price").value.trim().replace(/^(\d)/, "$$$1");
    d.notes = $("df-notes").value.trim();
    d.gift = $("df-gift").checked;
    d.for = d.gift ? $("df-for").value.trim() : "";
    if (!d.item || !d.store) return;
    if (pendingPhoto) {
      const pid = "p_" + uid();
      try {
        await photoPut(pid, pendingPhoto);
        if (d.photo) { photoDel(d.photo); photoURLs.delete(d.photo); }
        d.photo = pid;
      } catch { toast("Saved without the photo. This browser blocked photo storage."); }
    }
    if (!editingDeal) deals.unshift(d);
    editingDeal = null;
    saveDeals(); renderDeals();
  });

  $("deal-list").addEventListener("click", e => {
    const b = e.target.closest("button[data-act]");
    if (!b) return;
    const d = deals.find(x => x.id === b.closest(".deal").dataset.id);
    if (!d) return;
    if (b.dataset.act === "edit") openDeal(d);
    else if (b.dataset.act === "delete") {
      const idx = deals.indexOf(d);
      deals.splice(idx, 1); saveDeals(); renderDeals();
      toast(`Deleted <button id="undo-deal">Undo</button>`, 5000);
      $("undo-deal").onclick = () => { deals.splice(idx, 0, d); saveDeals(); renderDeals(); $("toast").hidden = true; };
      // The photo is kept until the next delete so Undo can bring it back.
    }
  });

  /* ---------- settings: my stores ---------- */
  $("settings-btn").addEventListener("click", () => { $("my-stores").value = myStores.join(", "); });
  $("settings").addEventListener("close", () => {
    myStores = $("my-stores").value.split(",").map(s => s.trim()).filter(Boolean).slice(0, 15);
    save(K.stores, myStores);
    if (!$("tab-plan").hidden) render();
  });

  document.addEventListener("ts:wipe", () => {
    parties = []; deals = []; saveParties(); saveDeals();
    try { indexedDB.deleteDatabase("ts-photos"); dbp = null; } catch {}
    photoURLs.clear(); openId = null; render();
  });

  showSection("parties");
})();

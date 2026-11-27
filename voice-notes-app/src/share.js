/* ============================================================
   Shared lists

   Each shared list is its own Durable Object (a tiny database that
   lives on Cloudflare, free tier). The link holds a long random id,
   so only people who were sent the link can find it.

     POST   /api/share            create (needs the app passcode)
     GET    /api/share/:id        read   (?v=N returns {same:true} if unchanged)
     POST   /api/share/:id        change: toggle / add / remove an item
     DELETE /api/share/:id        stop sharing (needs the owner key)
   ============================================================ */

const MAX_ITEMS = 400;
const MAX_SECTIONS = 40;
const MAX_PHOTO = 200_000;      // characters of a data: URL, about 150 KB
const MAX_BODY = 3_000_000;
const KINDS = ["party", "todos", "notes", "deals"];

const clip = (v, n) => String(v ?? "").replace(/\s+/g, " ").trim().slice(0, n);
const randomId = bytes => {
  const a = crypto.getRandomValues(new Uint8Array(bytes));
  return btoa(String.fromCharCode(...a)).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
};

function cleanItem(it) {
  const photo = typeof it.photo === "string" && it.photo.startsWith("data:image/") && it.photo.length <= MAX_PHOTO ? it.photo : "";
  return {
    id: /^[\w-]{4,40}$/.test(it.id || "") ? it.id : randomId(9),
    name: clip(it.name, 200),
    qty: clip(it.qty, 40),
    tip: clip(it.tip, 300),
    stores: (Array.isArray(it.stores) ? it.stores : []).map(s => clip(s, 40)).filter(Boolean).slice(0, 3),
    store: clip(it.store, 60),
    price: clip(it.price, 20),
    gift: !!it.gift,
    for: clip(it.for, 40),
    due: /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(it.due || "") ? it.due : "",
    done: !!it.done,
    by: clip(it.by, 30),
    photo
  };
}

function cleanList(body) {
  const kind = KINDS.includes(body.kind) ? body.kind : "todos";
  let count = 0;
  const sections = (Array.isArray(body.sections) ? body.sections : []).slice(0, MAX_SECTIONS).map(s => ({
    name: clip(s && s.name, 60) || "List",
    items: (Array.isArray(s && s.items) ? s.items : []).filter(() => count++ < MAX_ITEMS).map(cleanItem).filter(i => i.name)
  }));
  return {
    kind,
    title: clip(body.title, 80) || "Shared list",
    meta: clip(body.meta, 120),
    sections
  };
}

function reply(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status, headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

/* ---------- the Durable Object: one per shared list ---------- */
export class SharedList {
  constructor(state) { this.state = state; }

  async load() { return (await this.state.storage.get("list")) || null; }

  async fetch(request) {
    const url = new URL(request.url);
    let list = await this.load();

    if (request.method === "PUT") {               // create (called by the Worker only)
      if (list) return reply({ error: "exists" }, 409);
      const { list: fresh, ownerKey } = await request.json();
      list = { ...fresh, version: 1, created: Date.now(), updated: Date.now() };
      await this.state.storage.put({ list, ownerKey });
      return reply({ ok: true });
    }

    if (!list) return reply({ error: "This list isn't shared anymore, or the link is wrong." }, 404);

    if (request.method === "GET") {
      const v = parseInt(url.searchParams.get("v") || "0", 10);
      return reply(v && v === list.version ? { same: true, version: v } : { list });
    }

    if (request.method === "DELETE") {
      const key = await this.state.storage.get("ownerKey");
      if (!key || request.headers.get("x-owner-key") !== key) return reply({ error: "Only the person who shared this list can stop sharing it." }, 403);
      await this.state.storage.deleteAll();
      return reply({ ok: true });
    }

    if (request.method === "POST") {
      let op;
      try { op = await request.json(); } catch { return reply({ error: "Bad request." }, 400); }
      const find = id => {
        for (const s of list.sections) {
          const i = s.items.findIndex(x => x.id === id);
          if (i >= 0) return { s, i };
        }
        return null;
      };

      if (op.op === "toggle") {
        const f = find(op.id);
        if (!f) return reply({ list });               // someone removed it; send the fresh list
        f.s.items[f.i].done = !!op.done;
      } else if (op.op === "add") {
        const total = list.sections.reduce((n, s) => n + s.items.length, 0);
        if (total >= MAX_ITEMS) return reply({ error: "This list is full." }, 413);
        const item = cleanItem({ ...op.item, id: undefined });
        if (!item.name) return reply({ error: "Add a name." }, 400);
        const name = clip(op.section, 60) || "Added";
        let sec = list.sections.find(s => s.name === name);
        if (!sec) { if (list.sections.length >= MAX_SECTIONS) sec = list.sections[list.sections.length - 1]; else { sec = { name, items: [] }; list.sections.push(sec); } }
        sec.items.push(item);
      } else if (op.op === "remove") {
        const f = find(op.id);
        if (f) f.s.items.splice(f.i, 1);
      } else {
        return reply({ error: "Unknown change." }, 400);
      }
      list.version += 1;
      list.updated = Date.now();
      await this.state.storage.put("list", list);
      return reply({ list });
    }

    return reply({ error: "Not allowed." }, 405);
  }
}

/* ---------- routing from the main Worker ---------- */
export async function handleShare(request, env, url, isOwner) {
  const parts = url.pathname.split("/").filter(Boolean);   // ["api","share",id?]
  const id = parts[2];

  if (!id) {
    if (request.method !== "POST") return reply({ error: "Use POST." }, 405);
    if (!isOwner) return reply({ error: "Wrong or missing passcode. Set it in the app's settings (gear icon)." }, 401);
    const len = parseInt(request.headers.get("content-length") || "0", 10);
    if (len > MAX_BODY) return reply({ error: "That list is too big to share (too many photos?)." }, 413);
    let body;
    try { body = await request.json(); } catch { return reply({ error: "Bad request." }, 400); }
    const list = cleanList(body);
    if (!list.sections.some(s => s.items.length)) return reply({ error: "There's nothing in that list to share." }, 400);
    const newId = randomId(16), ownerKey = randomId(18);
    const stub = env.LISTS.get(env.LISTS.idFromName(newId));
    const res = await stub.fetch("https://list/", { method: "PUT", body: JSON.stringify({ list, ownerKey }) });
    if (!res.ok) return reply({ error: "Couldn't create the shared list. Try again." }, 500);
    return reply({ id: newId, ownerKey });
  }

  if (!/^[\w-]{16,40}$/.test(id)) return reply({ error: "That link doesn't look right." }, 404);
  const stub = env.LISTS.get(env.LISTS.idFromName(id));
  const fwd = new Request(`https://list/?${url.searchParams}`, {
    method: request.method,
    headers: { "content-type": "application/json", "x-owner-key": request.headers.get("x-owner-key") || "" },
    body: request.method === "POST" ? await request.text() : undefined
  });
  return stub.fetch(fwd);
}

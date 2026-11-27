/* ============================================================
   Thought Sorter — the server half

   One Worker does two jobs:
     GET  /*              serves the app itself (public/, bundled in)
     POST /api/organize   sends what you said to Cloudflare's free AI
                          and returns it sorted into reminders,
                          to-dos and notes
     POST /api/party      builds a "don't forget" checklist for a
                          party, with stores to buy each item at
     /api/share/...       live shared lists (see share.js)

   The AI runs on Cloudflare's Workers AI free allowance, so there is
   no API key to manage. A passcode (a Worker secret) stops anyone who
   finds the URL from using up that allowance.
   ============================================================ */

import FILES from "./public.generated.js";
import { handleShare } from "./share.js";
export { SharedList } from "./share.js";

const MODEL = "@cf/meta/llama-3.3-70b-instruct-fp8-fast";
const MAX_TEXT = 8000;            // characters per recording
const MAX_TOPICS = 40;

const SYSTEM_PROMPT = `You turn someone's spoken, rambling thoughts into an organized list.

The text is a speech-to-text transcript, so expect run-on sentences, filler words, missing punctuation and the occasional misheard word. Work out what the person meant.

Split it into separate items. Each item is one of:
- "reminder": something tied to a specific day or time ("call the dentist Friday", "mom's birthday on the 12th"). Set "due".
- "todo": something to do with no specific time ("buy more printer paper").
- "note": an idea, fact, observation or anything worth keeping that isn't an action.

For each item:
- title: short and scannable, written as the person would write it on a list (under ~60 characters). Start actions with a verb, and keep the specifics that make it useful: "Buy printer paper", not "Buy paper"; "Email Sam the Q4 numbers", not "Email Sam".
- details: any useful extra context from what they said, or "" if there is none. Don't pad it.
- topic: one or two words grouping related items (e.g. "Work", "Family", "Health", "Errands", "Ideas"). Reuse one of the person's existing topics when it fits.
- due: for reminders, the local date and time as "YYYY-MM-DDTHH:MM", worked out from the current date and time you're given ("tomorrow", "next Tuesday", "in two hours"). Look dates up in the calendar you're given rather than counting days yourself. If they gave a day but no time, use 09:00. For todos and notes, "".

Merge repeated mentions of the same thing into one item. Leave out pure filler. If nothing worth keeping was said, return an empty list.

Reply with only a JSON object of the form {"items": [...]}.`;

const OUTPUT_SCHEMA = {
  type: "object",
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        required: ["kind", "title", "details", "topic", "due"],
        properties: {
          kind: { type: "string", enum: ["reminder", "todo", "note"] },
          title: { type: "string" },
          details: { type: "string" },
          topic: { type: "string" },
          due: { type: "string" }
        }
      }
    }
  }
};

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", "cache-control": "no-store" }
  });
}

/* Same time whether the first or last character is wrong. */
function safeEqual(a, b) {
  const enc = new TextEncoder();
  const x = enc.encode(String(a));
  const y = enc.encode(String(b));
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

/* The model's answer may arrive as an object or as text around a JSON object. */
function readItems(response) {
  let out = response && response.response;
  if (typeof out === "string") {
    const start = out.indexOf("{"), end = out.lastIndexOf("}");
    if (start < 0 || end < start) return null;
    try { out = JSON.parse(out.slice(start, end + 1)); } catch { return null; }
  }
  return out && Array.isArray(out.items) ? out.items : null;
}

/* A two-week calendar, so the model looks dates up instead of counting. */
function upcomingDays(now) {
  const m = /(\d{4})-(\d{2})-(\d{2})T\d{2}:\d{2}/.exec(now);
  if (!m) return "";
  const names = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
  const lines = [];
  for (let i = 0; i < 15; i++) {
    const d = new Date(Date.UTC(+m[1], m[2] - 1, +m[3] + i));
    const iso = d.toISOString().slice(0, 10);
    const label = i === 0 ? " (today)" : i === 1 ? " (tomorrow)" : i < 7 ? ` (this coming ${names[d.getUTCDay()]})` : "";
    lines.push(`${names[d.getUTCDay()]} ${iso}${label}`);
  }
  return lines.join("\n");
}

async function organize(request, env) {
  if (!env.APP_PASSCODE || !safeEqual(request.headers.get("x-passcode") || "", env.APP_PASSCODE)) {
    return json({ error: "Wrong or missing passcode. Set it in the app's settings (gear icon)." }, 401);
  }

  let body;
  try { body = await request.json(); } catch { return json({ error: "Bad request." }, 400); }

  const text = String(body.text || "").trim();
  if (!text) return json({ items: [] });
  if (text.length > MAX_TEXT) return json({ error: "That recording is too long. Try splitting it up." }, 413);

  const now = String(body.now || "").slice(0, 80);
  const timezone = String(body.timezone || "").slice(0, 60);
  const topics = (Array.isArray(body.topics) ? body.topics : [])
    .map(t => String(t).slice(0, 40)).filter(Boolean).slice(0, MAX_TOPICS);

  const messages = [
    { role: "system", content: SYSTEM_PROMPT },
    {
      role: "user",
      content:
        `Current local date and time: ${now}${timezone ? ` (${timezone})` : ""}\n` +
        (upcomingDays(now) ? `Calendar for the next two weeks:\n${upcomingDays(now)}\n` : "") +
        `Existing topics: ${topics.length ? topics.join(", ") : "(none yet)"}\n\n` +
        `<transcript>\n${text}\n</transcript>`
    }
  ];

  let raw = null;
  try {
    // JSON mode first; if the model can't meet the schema, ask again without it.
    try {
      const res = await env.AI.run(MODEL, {
        messages, max_tokens: 2048, temperature: 0.2,
        response_format: { type: "json_schema", json_schema: OUTPUT_SCHEMA }
      });
      raw = readItems(res);
    } catch (err) {
      console.warn("JSON mode failed, retrying without it:", err && err.message);
    }
    if (!raw) {
      const res = await env.AI.run(MODEL, { messages, max_tokens: 2048, temperature: 0.2 });
      raw = readItems(res);
    }
  } catch (err) {
    const msg = String(err && err.message || "");
    console.error("Workers AI error:", msg);
    if (/neuron|limit|quota|429|capacity/i.test(msg)) {
      return json({ error: "Today's free AI allowance is used up. It resets at midnight UTC. Your words are saved, so try again then." }, 429);
    }
    return json({ error: "The AI service had a problem. Try again in a moment." }, 502);
  }

  if (!raw) return json({ error: "The AI's answer couldn't be read. Try again." }, 502);

  const items = raw.map(it => {
    const kind = ["reminder", "todo", "note"].includes(it && it.kind) ? it.kind : "note";
    const due = String((it && it.due) || "");
    return {
      kind,
      title: String((it && it.title) || "").slice(0, 200),
      details: String((it && it.details) || "").slice(0, 2000),
      topic: String((it && it.topic) || "General").slice(0, 40),
      due: kind === "reminder" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(due) ? due.slice(0, 16) : null
    };
  }).filter(it => it.title);

  return json({ items });
}

/* ---------- shared: run the model, JSON mode first, plain text second ---------- */
async function runJSON(env, messages, schema, pick, maxTokens) {
  let out = null;
  try {
    const res = await env.AI.run(MODEL, {
      messages, max_tokens: maxTokens, temperature: 0.2,
      response_format: { type: "json_schema", json_schema: schema }
    });
    out = pick(res);
  } catch (err) {
    console.warn("JSON mode failed, retrying without it:", err && err.message);
  }
  if (!out) out = pick(await env.AI.run(MODEL, { messages, max_tokens: maxTokens, temperature: 0.2 }));
  return out;
}

function aiError(err) {
  const msg = String(err && err.message || "");
  console.error("Workers AI error:", msg);
  if (/neuron|limit|quota|429|capacity/i.test(msg)) {
    return json({ error: "Today's free AI allowance is used up. It resets at midnight UTC. Try again then." }, 429);
  }
  return json({ error: "The AI service had a problem. Try again in a moment." }, 502);
}

function parseObject(response) {
  let out = response && response.response;
  if (typeof out === "string") {
    const start = out.indexOf("{"), end = out.lastIndexOf("}");
    if (start < 0 || end < start) return null;
    try { out = JSON.parse(out.slice(start, end + 1)); } catch { return null; }
  }
  return out && typeof out === "object" ? out : null;
}

/* ---------- party checklists ---------- */
const PARTY_PROMPT = `You help someone host a party without forgetting anything. Build a practical "don't forget" shopping and prep checklist.

Think through the whole event the way an experienced host would: food and drinks, serving and tableware, seating and setup, decor, cleanup, comfort, and things for the specific occasion. Never leave out the heart of the occasion (the cake and candles for a birthday, the turkey or main dish for Thanksgiving, the countdown and champagne for New Year's Eve). Include the easy-to-forget things busy hosts kick themselves over: extra ice and water, trash bags, napkins, serving utensils, a tablecloth for the outdoor table, flowers for the table, toilet paper and hand soap for guests, foil and containers for leftovers, coffee for after dinner, candles and a lighter, buns and condiments and charcoal or propane for a cookout, towels for a pool party, birthday candles for the cake.

Scale it to the size given:
- Minimal: only the essentials.
- Standard: a well-prepared party.
- Elaborate: everything for a showpiece event, including centerpieces, placemats, signage, favors and a drinks station.
You'll be told how many items to include at minimum. Reach that number with genuinely useful items, never filler.

Use the guest count to set quantities ("2 bags", "40", "1 per guest"). Respect the person's notes: if they say they already have something, leave it out; if they mention dietary needs, kids or a potluck, plan for that.

Group items into 4-8 categories with short names (e.g. "Food & drinks", "Table & serving", "Decor", "Setup & comfort", "Cleanup"). For each item:
- name: what to get, specific enough to shop for ("Fresh flowers for the table", "Disposable foil roasting pan")
- qty: amount for this party, or ""
- tip: one short helpful note, or "" (most items need none)
- stores: 2-3 well-known US chains where people most commonly buy that specific item, best fit first. Match the store to the item: groceries at grocery stores (e.g. "Trader Joe's", "Kroger", "Costco"), party supplies at "Dollar Tree", "Target" or "Walmart", decor at "HomeGoods", "Michaels" or "Target", outdoor gear at "Home Depot", "Lowe's" or "Walmart", bulk drinks and paper goods at "Costco" or "Sam's Club". Only name chains that still have stores open (not Bed Bath & Beyond or Party City's closed locations; prefer "Target" or "Walmart" for party supplies). Never give prices.

Also give the list a short title like "Thanksgiving for 12".

Reply with only a JSON object of the form {"title": "...", "categories": [{"name": "...", "items": [{"name": "...", "qty": "...", "tip": "...", "stores": ["..."]}]}]}.`;

const PARTY_SCHEMA = {
  type: "object",
  required: ["title", "categories"],
  properties: {
    title: { type: "string" },
    categories: {
      type: "array",
      items: {
        type: "object",
        required: ["name", "items"],
        properties: {
          name: { type: "string" },
          items: {
            type: "array",
            items: {
              type: "object",
              required: ["name", "qty", "tip", "stores"],
              properties: {
                name: { type: "string" },
                qty: { type: "string" },
                tip: { type: "string" },
                stores: { type: "array", items: { type: "string" } }
              }
            }
          }
        }
      }
    }
  }
};

async function party(request, env) {
  if (!env.APP_PASSCODE || !safeEqual(request.headers.get("x-passcode") || "", env.APP_PASSCODE)) {
    return json({ error: "Wrong or missing passcode. Set it in the app's settings (gear icon)." }, 401);
  }
  let body;
  try { body = await request.json(); } catch { return json({ error: "Bad request." }, 400); }

  const clip = (v, n) => String(v || "").replace(/\s+/g, " ").trim().slice(0, n);
  const occasion = clip(body.occasion, 60) || "Party";
  const guests = Math.max(1, Math.min(500, parseInt(body.guests, 10) || 10));
  const style = ["Minimal", "Standard", "Elaborate"].includes(body.style) ? body.style : "Standard";
  const setting = clip(body.setting, 40) || "Indoors";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(body.date || "") ? body.date : "";
  const notes = clip(body.notes, 1500);

  const messages = [
    { role: "system", content: PARTY_PROMPT },
    {
      role: "user",
      content:
        `Occasion: ${occasion}\nGuests: ${guests}\nSize: ${style}\nWhere: ${setting}\n` +
        (date ? `Date: ${date}\n` : "") +
        `Include at least ${{ Minimal: 15, Standard: 30, Elaborate: 45 }[style]} items.\n` +
        `<notes>\n${notes || "(none)"}\n</notes>`
    }
  ];

  let out;
  try {
    out = await runJSON(env, messages, PARTY_SCHEMA,
      r => { const o = parseObject(r); return o && Array.isArray(o.categories) && o.categories.length ? o : null; },
      style === "Elaborate" ? 6000 : 4000);
  } catch (err) { return aiError(err); }
  if (!out) return json({ error: "The AI's list couldn't be read. Try again." }, 502);

  const seen = new Set();
  const categories = out.categories.slice(0, 12).map(c => ({
    name: clip(c && c.name, 40) || "Other",
    items: (Array.isArray(c && c.items) ? c.items : []).slice(0, 40).map(i => ({
      name: clip(i && i.name, 120),
      qty: clip(i && i.qty, 40),
      tip: clip(i && i.tip, 200),
      stores: (Array.isArray(i && i.stores) ? i.stores : []).map(s => clip(s, 40)).filter(Boolean).slice(0, 3)
    })).filter(i => {
      const k = i.name.toLowerCase();
      if (!i.name || seen.has(k)) return false;
      seen.add(k); return true;
    })
  })).filter(c => c.items.length);

  return json({ title: clip(out.title, 80) || `${occasion} for ${guests}`, categories });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    if (url.pathname === "/api/organize") {
      if (request.method !== "POST") return json({ error: "Use POST." }, 405);
      try {
        return await organize(request, env);
      } catch (err) {
        console.error(err);
        return json({ error: "Something went wrong on the server." }, 500);
      }
    }

    if (url.pathname === "/api/party") {
      if (request.method !== "POST") return json({ error: "Use POST." }, 405);
      try {
        return await party(request, env);
      } catch (err) {
        console.error(err);
        return json({ error: "Something went wrong on the server." }, 500);
      }
    }

    if (url.pathname === "/api/share" || url.pathname.startsWith("/api/share/")) {
      try {
        const isOwner = !!env.APP_PASSCODE && safeEqual(request.headers.get("x-passcode") || "", env.APP_PASSCODE);
        return await handleShare(request, env, url, isOwner);
      } catch (err) {
        console.error(err);
        return json({ error: "Something went wrong with sharing. Try again." }, 500);
      }
    }

    if (url.pathname.startsWith("/api/")) return json({ error: "Not found." }, 404);

    // Everything else is the app's own files (bundled from public/).
    const file = FILES[url.pathname === "/" ? "/index.html" : url.pathname] || FILES["/index.html"];
    const bytes = Uint8Array.from(atob(file.b64), c => c.charCodeAt(0));
    return new Response(bytes, {
      headers: { "content-type": file.type, "cache-control": "no-cache" }
    });
  }
};

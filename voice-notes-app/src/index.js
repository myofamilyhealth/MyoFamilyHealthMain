/* ============================================================
   Thought Sorter — the server half

   One Worker does two jobs:
     GET  /*              serves the app itself (public/, bundled in)
     POST /api/organize   sends what you said to Cloudflare's free AI
                          and returns it sorted into reminders,
                          to-dos and notes

   The AI runs on Cloudflare's Workers AI free allowance, so there is
   no API key to manage. A passcode (a Worker secret) stops anyone who
   finds the URL from using up that allowance.
   ============================================================ */

import FILES from "./public.generated.js";

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

    if (url.pathname.startsWith("/api/")) return json({ error: "Not found." }, 404);

    // Everything else is the app's own files (bundled from public/).
    const file = FILES[url.pathname === "/" ? "/index.html" : url.pathname] || FILES["/index.html"];
    const bytes = Uint8Array.from(atob(file.b64), c => c.charCodeAt(0));
    return new Response(bytes, {
      headers: { "content-type": file.type, "cache-control": "no-cache" }
    });
  }
};

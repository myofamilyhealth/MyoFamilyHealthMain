/* ============================================================
   Thought Sorter — the server half

   One Worker does two jobs:
     GET  /*              serves the app itself (public/ folder)
     POST /api/organize   sends what you said to Claude and returns
                          it sorted into reminders, to-dos and notes

   The Anthropic API key lives here as an encrypted Worker secret,
   never on the phone. A passcode (also a secret) stops anyone who
   finds the URL from spending your API credit.
   ============================================================ */

import Anthropic from "@anthropic-ai/sdk";

const MAX_TEXT = 8000;            // characters per recording
const MAX_TOPICS = 40;

const SYSTEM_PROMPT = `You turn someone's spoken, rambling thoughts into an organized list.

The text is a speech-to-text transcript, so expect run-on sentences, filler words, missing punctuation and the occasional misheard word. Work out what the person meant.

Split it into separate items. Each item is one of:
- "reminder": something tied to a specific day or time ("call the dentist Friday", "mom's birthday on the 12th"). Set "due".
- "todo": something to do with no specific time ("buy more printer paper").
- "note": an idea, fact, observation or anything worth keeping that isn't an action.

For each item:
- title: short and scannable, written as the person would write it on a list (under ~60 characters). Start actions with a verb.
- details: any useful extra context from what they said, or "" if there is none. Don't pad it.
- topic: one or two words grouping related items (e.g. "Work", "Family", "Health", "Errands", "Ideas"). Reuse one of the person's existing topics when it fits.
- due: for reminders, the local date and time as "YYYY-MM-DDTHH:MM", worked out from the current date and time you're given ("tomorrow", "next Tuesday", "in two hours"). If they gave a day but no time, use 09:00. For todos and notes, null.

Merge repeated mentions of the same thing into one item. Leave out pure filler. If nothing worth keeping was said, return an empty list.`;

const OUTPUT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["items"],
  properties: {
    items: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["kind", "title", "details", "topic", "due"],
        properties: {
          kind: { type: "string", enum: ["reminder", "todo", "note"] },
          title: { type: "string" },
          details: { type: "string" },
          topic: { type: "string" },
          due: { anyOf: [{ type: "string" }, { type: "null" }] }
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

async function organize(request, env) {
  if (!env.ANTHROPIC_API_KEY) {
    return json({ error: "The server has no Anthropic API key yet. Run: wrangler secret put ANTHROPIC_API_KEY" }, 500);
  }
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

  const userMessage =
    `Current local date and time: ${now}${timezone ? ` (${timezone})` : ""}\n` +
    `Existing topics: ${topics.length ? topics.join(", ") : "(none yet)"}\n\n` +
    `<transcript>\n${text}\n</transcript>`;

  const client = new Anthropic({ apiKey: env.ANTHROPIC_API_KEY });

  let response;
  try {
    response = await client.beta.messages.create({
      model: "claude-opus-5-5",
      max_tokens: 16000,
      betas: ["server-side-fallback-2026-07-01"],
      fallbacks: "default",
      output_config: {
        effort: "medium",
        format: { type: "json_schema", schema: OUTPUT_SCHEMA }
      },
      system: SYSTEM_PROMPT,
      messages: [{ role: "user", content: userMessage }]
    });
  } catch (err) {
    if (err instanceof Anthropic.RateLimitError) {
      return json({ error: "Too many requests right now. Wait a minute and try again." }, 429);
    }
    if (err instanceof Anthropic.AuthenticationError) {
      return json({ error: "The server's Anthropic API key was rejected. Check the ANTHROPIC_API_KEY secret." }, 502);
    }
    if (err instanceof Anthropic.APIError) {
      return json({ error: `The AI service returned an error (${err.status ?? "network"}). Try again.` }, 502);
    }
    throw err;
  }

  if (response.stop_reason === "refusal") {
    return json({ error: "The AI declined to process that recording." }, 422);
  }
  if (response.stop_reason === "max_tokens") {
    return json({ error: "That recording produced too much to sort in one go. Try a shorter one." }, 422);
  }

  const textBlock = response.content.find(b => b.type === "text");
  let parsed;
  try { parsed = JSON.parse(textBlock ? textBlock.text : ""); }
  catch { return json({ error: "The AI's answer couldn't be read. Try again." }, 502); }

  const items = (Array.isArray(parsed.items) ? parsed.items : []).map(it => ({
    kind: ["reminder", "todo", "note"].includes(it.kind) ? it.kind : "note",
    title: String(it.title || "").slice(0, 200),
    details: String(it.details || "").slice(0, 2000),
    topic: String(it.topic || "General").slice(0, 40),
    due: it.kind === "reminder" && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(it.due || "") ? it.due.slice(0, 16) : null
  })).filter(it => it.title);

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

    // Everything else is the app's static files.
    return env.ASSETS.fetch(request);
  }
};

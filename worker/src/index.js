/* ============================================================
   Myo Family Health — assessment collection + owner dashboard

   Two jobs, one Worker:
     POST /api/submit   the site sends a result here, opt-in only
     GET  /admin        Amy reads them here, behind a real login

   The login matters. This holds health information about people
   and their children, so the password is checked here on the
   server against an encrypted secret — never in anything a
   visitor can view-source. A password compared in browser
   JavaScript would be readable by everyone it was meant to keep
   out, which is why the dashboard lives in the Worker rather
   than on the static site.
   ============================================================ */

const SESSION_HOURS = 12;
const MAX_FAILED_LOGINS = 8;      // per hour, before the door closes
const LOCKOUT_MINUTES = 30;

/* ---------- small helpers ---------- */

const enc = new TextEncoder();

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { "content-type": "application/json; charset=utf-8", ...extra }
  });
}

function allowedOrigins(env) {
  return String(env.ALLOWED_ORIGINS || "")
    .split(",").map(s => s.trim()).filter(Boolean);
}

function corsHeaders(request, env) {
  const origin = request.headers.get("Origin") || "";
  if (!allowedOrigins(env).includes(origin)) return null;
  return {
    "access-control-allow-origin": origin,
    "access-control-allow-methods": "POST, OPTIONS",
    "access-control-allow-headers": "content-type",
    "access-control-max-age": "86400",
    "vary": "Origin"
  };
}

/* Comparison that takes the same time whether the first byte is
   wrong or the last one is. */
function safeEqual(a, b) {
  const x = enc.encode(String(a));
  const y = enc.encode(String(b));
  if (x.length !== y.length) return false;
  let diff = 0;
  for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
  return diff === 0;
}

async function hmac(secret, message) {
  const key = await crypto.subtle.importKey(
    "raw", enc.encode(secret), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]
  );
  const sig = await crypto.subtle.sign("HMAC", key, enc.encode(message));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, "0")).join("");
}

/* ---------- sessions ----------
   A cookie the browser cannot forge: an expiry plus an HMAC of it.
   Nothing about the user is stored in it, and nothing is stored
   server-side either, so there is no session table to leak. */

async function issueSession(env) {
  const exp = Date.now() + SESSION_HOURS * 3600 * 1000;
  const sig = await hmac(env.SESSION_SECRET, String(exp));
  return `${exp}.${sig}`;
}

async function validSession(env, token) {
  if (!token || token.indexOf(".") < 0) return false;
  const [exp, sig] = token.split(".");
  if (!/^\d+$/.test(exp) || Number(exp) < Date.now()) return false;
  return safeEqual(sig, await hmac(env.SESSION_SECRET, exp));
}

function readCookie(request, name) {
  const raw = request.headers.get("Cookie") || "";
  for (const part of raw.split(";")) {
    const [k, ...v] = part.trim().split("=");
    if (k === name) return decodeURIComponent(v.join("="));
  }
  return "";
}

async function isAuthed(request, env) {
  return validSession(env, readCookie(request, "mfh_session"));
}

/* ---------- brute-force brake ---------- */

async function recentFailures(env) {
  const since = new Date(Date.now() - 3600 * 1000).toISOString();
  const row = await env.DB.prepare(
    "SELECT COUNT(*) AS n FROM login_attempts WHERE ok = 0 AND at > ?"
  ).bind(since).first();
  return row ? Number(row.n) : 0;
}

async function noteAttempt(env, ok) {
  await env.DB.prepare("INSERT INTO login_attempts (at, ok) VALUES (?, ?)")
    .bind(new Date().toISOString(), ok ? 1 : 0).run();
}

/* ---------- validation ----------
   Everything below arrives from a public endpoint, so nothing is
   trusted: lengths are capped, types are checked, and the row is
   built field by field rather than spread from the body. */

const EMAIL_RE = /^[^\s@,;]+@[^\s@,;.]+(\.[^\s@,;.]+)+$/;

function clean(v, max) {
  return String(v === undefined || v === null ? "" : v).slice(0, max);
}

function validate(b) {
  if (!b || typeof b !== "object") return "malformed body";

  const email = clean(b.email, 254).trim();
  if (!EMAIL_RE.test(email)) return "invalid email";

  if (b.subject !== "self" && b.subject !== "child") return "invalid subject";

  const nums = ["total", "max", "pct"];
  for (const k of nums) {
    if (typeof b[k] !== "number" || !isFinite(b[k]) || b[k] < 0 || b[k] > 1000) {
      return "invalid " + k;
    }
  }
  if (!["low", "mod", "high"].includes(b.tier)) return "invalid tier";
  if (!Array.isArray(b.answers) || b.answers.length > 60) return "invalid answers";
  if (!Array.isArray(b.flags) || b.flags.length > 40) return "invalid flags";
  return null;
}

/* ---------- POST /api/submit ---------- */

async function submit(request, env) {
  const cors = corsHeaders(request, env);
  if (!cors) return json({ error: "origin not allowed" }, 403);

  let body;
  try { body = await request.json(); }
  catch (e) { return json({ error: "malformed json" }, 400, cors); }

  const bad = validate(body);
  if (bad) return json({ error: bad }, 400, cors);

  const answers = body.answers.slice(0, 60).map(a => ({
    n: Number(a && a.n) || 0,
    section: clean(a && a.section, 60),
    question: clean(a && a.question, 300),
    label: clean(a && a.label, 40)
  }));
  const flags = body.flags.slice(0, 40).map(f => clean(f, 40));
  const cats = Array.isArray(body.cats) ? body.cats.slice(0, 20).map(c => clean(c, 80)) : [];

  await env.DB.prepare(
    `INSERT INTO responses
       (created_at, email, name, subject, total, max_total, pct, band, band_label,
        flag_count, flags, cats, answers)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
  ).bind(
    new Date().toISOString(),
    clean(body.email, 254).trim(),
    clean(body.name, 80).trim() || null,
    body.subject,
    Math.round(body.total),
    Math.round(body.max),
    Math.round(body.pct),
    body.tier,
    clean(body.bandLabel, 40),
    flags.length,
    JSON.stringify(flags),
    JSON.stringify(cats),
    JSON.stringify(answers)
  ).run();

  return json({ ok: true }, 200, cors);
}

/* ---------- reading them back ---------- */

async function listResponses(request, env) {
  if (!(await isAuthed(request, env))) return json({ error: "unauthorised" }, 401);

  const url = new URL(request.url);
  const q = clean(url.searchParams.get("q"), 80).trim();
  const limit = Math.min(Math.max(Number(url.searchParams.get("limit")) || 200, 1), 500);

  let sql = `SELECT id, created_at, email, name, subject, total, max_total, pct,
                    band, band_label, flag_count, flags, cats, answers
             FROM responses`;
  const binds = [];
  if (q) { sql += " WHERE email LIKE ? OR name LIKE ?"; binds.push(`%${q}%`, `%${q}%`); }
  sql += " ORDER BY created_at DESC LIMIT ?";
  binds.push(limit);

  const { results } = await env.DB.prepare(sql).bind(...binds).all();
  const stats = await env.DB.prepare(
    `SELECT COUNT(*) AS total,
            SUM(CASE WHEN band = 'high' THEN 1 ELSE 0 END) AS high,
            SUM(CASE WHEN flag_count > 0 THEN 1 ELSE 0 END) AS flagged,
            SUM(CASE WHEN created_at > ? THEN 1 ELSE 0 END) AS week
     FROM responses`
  ).bind(new Date(Date.now() - 7 * 864e5).toISOString()).first();

  return json({ rows: results || [], stats: stats || {} });
}

async function exportCsv(request, env) {
  if (!(await isAuthed(request, env))) return new Response("unauthorised", { status: 401 });

  const { results } = await env.DB.prepare(
    "SELECT * FROM responses ORDER BY created_at DESC"
  ).all();

  const cell = v => {
    const s = String(v === null || v === undefined ? "" : v);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const head = ["Date", "Email", "Name", "For", "Score", "Out of", "Percent", "Band", "Flags"];
  const maxQ = (results || []).reduce((n, r) => {
    try { return Math.max(n, JSON.parse(r.answers).length); } catch (e) { return n; }
  }, 0);
  for (let i = 1; i <= maxQ; i++) head.push("Q" + i);

  const lines = [head.map(cell).join(",")];
  for (const r of results || []) {
    let answers = [];
    try { answers = JSON.parse(r.answers); } catch (e) { /* skip */ }
    const row = [
      r.created_at, r.email, r.name || "",
      r.subject === "child" ? "Their child" : "Themselves",
      r.total, r.max_total, r.pct + "%", r.band_label,
      (JSON.parse(r.flags || "[]") || []).length
    ];
    for (let i = 0; i < maxQ; i++) row.push(answers[i] ? answers[i].label : "");
    lines.push(row.map(cell).join(","));
  }

  return new Response(lines.join("\n"), {
    headers: {
      "content-type": "text/csv; charset=utf-8",
      "content-disposition": `attachment; filename="myo-assessments-${new Date().toISOString().slice(0, 10)}.csv"`
    }
  });
}

/* ---------- login ---------- */

async function login(request, env) {
  const form = await request.formData();
  const given = form.get("password") || "";

  if (await recentFailures(env) >= MAX_FAILED_LOGINS) {
    return html(loginPage(`Too many attempts. Try again in ${LOCKOUT_MINUTES} minutes.`), 429);
  }

  if (!env.ADMIN_PASSWORD || !safeEqual(given, env.ADMIN_PASSWORD)) {
    await noteAttempt(env, false);
    // Blunt the guessing rate a little without holding the request open.
    await new Promise(r => setTimeout(r, 600));
    return html(loginPage("That password is not right."), 401);
  }

  await noteAttempt(env, true);
  const token = await issueSession(env);
  return new Response(null, {
    status: 302,
    headers: {
      "location": "/admin",
      "set-cookie": `mfh_session=${token}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${SESSION_HOURS * 3600}`
    }
  });
}

function logout() {
  return new Response(null, {
    status: 302,
    headers: {
      "location": "/admin",
      "set-cookie": "mfh_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0"
    }
  });
}

function html(body, status = 200) {
  return new Response(body, {
    status,
    headers: {
      "content-type": "text/html; charset=utf-8",
      "x-frame-options": "DENY",
      "referrer-policy": "no-referrer",
      "cache-control": "no-store"
    }
  });
}

/* ---------- router ---------- */

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "") || "/";

    if (request.method === "OPTIONS") {
      const cors = corsHeaders(request, env);
      return cors ? new Response(null, { status: 204, headers: cors })
                  : new Response(null, { status: 403 });
    }

    try {
      if (path === "/api/submit" && request.method === "POST") return submit(request, env);
      if (path === "/api/responses") return listResponses(request, env);
      if (path === "/api/export.csv") return exportCsv(request, env);
      if (path === "/admin/login" && request.method === "POST") return login(request, env);
      if (path === "/admin/logout") return logout();

      if (path === "/admin" || path === "/") {
        return (await isAuthed(request, env)) ? html(dashboardPage()) : html(loginPage());
      }
      return new Response("Not found", { status: 404 });
    } catch (err) {
      // Never leak internals to the caller.
      console.error(err && err.stack || err);
      return json({ error: "server error" }, 500);
    }
  }
};

/* ---------- pages ----------
   Inlined so the dashboard has no assets to fetch and nothing to
   cache. Brand tokens match the public site. */

const SHELL = `
:root{--teal-deep:#457F7C;--teal-ink:#35625F;--teal-text:#3E7370;--mint:#EAF4F3;
--mint-deep:#DCECEA;--slate:#3C4242;--slate-soft:#64706F;--offwhite:#F8FAF9;
--clay-deep:#A8613F;--line:rgba(60,66,66,.12);--r:14px}
*{box-sizing:border-box}
body{margin:0;background:var(--offwhite);color:var(--slate);line-height:1.55;
font:16px/1.55 "DM Sans",system-ui,-apple-system,sans-serif}
h1,h2,h3{margin:0;line-height:1.15;letter-spacing:-.02em}
button,input{font:inherit}
.wrap{max-width:1180px;margin:0 auto;padding:clamp(18px,3vw,34px)}
.btn{display:inline-flex;align-items:center;gap:8px;padding:11px 20px;border:0;
border-radius:999px;background:var(--teal-deep);color:#fff;font-weight:600;cursor:pointer}
.btn:hover{background:var(--teal-ink)}
.btn-ghost{background:#fff;color:var(--teal-text);border:1px solid var(--line)}
.btn-ghost:hover{background:var(--mint)}
`;

function loginPage(error = "") {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Sign in — Myo Family Health</title><style>${SHELL}
.box{max-width:380px;margin:12vh auto;padding:34px 30px;background:#fff;
border:1px solid var(--line);border-radius:22px;text-align:center;
box-shadow:0 20px 50px -30px rgba(53,98,95,.4)}
input{width:100%;padding:14px 16px;margin:16px 0 12px;border:1.5px solid var(--line);
border-radius:999px;text-align:center}
input:focus{outline:0;border-color:var(--teal-deep)}
.err{color:var(--clay-deep);font-size:14px;font-weight:600;min-height:20px}
p{color:var(--slate-soft);font-size:14.5px;margin:8px 0 0}
</style></head><body>
<form class="box" method="POST" action="/admin/login">
  <h1 style="font-size:23px">Assessment results</h1>
  <p>Myo Family Health — owners only.</p>
  <input type="password" name="password" placeholder="Password" autofocus
         autocomplete="current-password" required>
  <div class="err">${error.replace(/[<>&]/g, "")}</div>
  <button class="btn" type="submit" style="width:100%;justify-content:center">Sign in</button>
</form></body></html>`;
}

function dashboardPage() {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="robots" content="noindex,nofollow">
<title>Assessment results — Myo Family Health</title><style>${SHELL}
header{display:flex;flex-wrap:wrap;gap:14px;align-items:center;margin-bottom:22px}
header h1{font-size:clamp(21px,2.4vw,27px);margin-right:auto}
.tiles{display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));
gap:12px;margin-bottom:22px}
.tile{background:#fff;border:1px solid var(--line);border-radius:var(--r);padding:16px 18px}
.tile b{display:block;font-size:27px;line-height:1.1;font-variant-numeric:tabular-nums}
.tile span{font-size:13px;color:var(--slate-soft)}
.bar{display:flex;gap:10px;margin-bottom:14px;flex-wrap:wrap}
.bar input{flex:1;min-width:200px;padding:11px 16px;border:1px solid var(--line);
border-radius:999px;background:#fff}
.bar input:focus{outline:0;border-color:var(--teal-deep)}
table{width:100%;border-collapse:collapse;background:#fff;border:1px solid var(--line);
border-radius:var(--r);overflow:hidden}
th,td{padding:11px 13px;text-align:left;font-size:14.5px;border-bottom:1px solid var(--line)}
th{background:var(--mint);font-size:12.5px;text-transform:uppercase;letter-spacing:.08em;
color:var(--teal-text)}
tbody tr{cursor:pointer}
tbody tr:hover{background:var(--mint)}
td.num{font-variant-numeric:tabular-nums;white-space:nowrap}
.pill{display:inline-block;padding:3px 10px;border-radius:999px;font-size:12.5px;font-weight:700}
.low{background:var(--mint-deep);color:var(--teal-ink)}
.mod{background:#F6E6D4;color:#8A5A2B}
.high{background:#F5D9CE;color:#8C3F22}
.flagdot{color:var(--clay-deep);font-weight:700}
.detail td{background:var(--offwhite);font-size:14px}
.qs{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:6px 22px;margin-top:8px}
.qs div{display:flex;gap:8px;padding:4px 0;border-bottom:1px dotted var(--line)}
.qs i{font-style:normal;color:var(--slate-soft);flex:1}
.qs b{white-space:nowrap}
.yes{color:var(--clay-deep)}
.empty{padding:40px;text-align:center;color:var(--slate-soft)}
.scroll{overflow-x:auto}
@media(max-width:620px){.hide-sm{display:none}}
</style></head><body><div class="wrap">
<header>
  <h1>Assessment results</h1>
  <a class="btn btn-ghost" href="/api/export.csv">Download CSV</a>
  <a class="btn btn-ghost" href="/admin/logout">Sign out</a>
</header>
<div class="tiles" id="tiles"></div>
<div class="bar"><input id="q" placeholder="Search by email or name…" autocomplete="off"></div>
<div class="scroll"><table>
  <thead><tr>
    <th>When</th><th>Email</th><th class="hide-sm">For</th>
    <th>Score</th><th>Result</th><th class="hide-sm">Flags</th>
  </tr></thead>
  <tbody id="rows"><tr><td colspan="6" class="empty">Loading…</td></tr></tbody>
</table></div>
<script>
var esc = function (s) { return String(s == null ? "" : s).replace(/[<>&"]/g,
  function (c) { return ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]; }); };
var when = function (iso) {
  var d = new Date(iso);
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" }) + " " +
         d.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
};
function load(q) {
  fetch("/api/responses?limit=500&q=" + encodeURIComponent(q || ""))
    .then(function (r) { if (r.status === 401) { location.href = "/admin"; throw 0; } return r.json(); })
    .then(render).catch(function () {});
}
function render(data) {
  var s = data.stats || {};
  document.getElementById("tiles").innerHTML =
    tile(s.total || 0, "responses in total") +
    tile(s.week || 0, "in the last 7 days") +
    tile(s.high || 0, "scored “many signs”") +
    tile(s.flagged || 0, "raised a provider flag");

  var rows = data.rows || [];
  if (!rows.length) {
    document.getElementById("rows").innerHTML =
      '<tr><td colspan="6" class="empty">Nothing yet. Results appear here when someone chooses to send one.</td></tr>';
    return;
  }
  document.getElementById("rows").innerHTML = rows.map(function (r, i) {
    var flags = [];
    try { flags = JSON.parse(r.flags || "[]"); } catch (e) {}
    return '<tr onclick="toggle(' + i + ')">' +
      '<td class="num">' + esc(when(r.created_at)) + '</td>' +
      '<td>' + esc(r.email) + (r.name ? ' <span style="color:var(--slate-soft)">· ' + esc(r.name) + '</span>' : '') + '</td>' +
      '<td class="hide-sm">' + (r.subject === "child" ? "Their child" : "Themselves") + '</td>' +
      '<td class="num">' + r.total + '/' + r.max_total + ' · ' + r.pct + '%</td>' +
      '<td><span class="pill ' + esc(r.band) + '">' + esc(r.band_label) + '</span></td>' +
      '<td class="hide-sm">' + (flags.length ? '<span class="flagdot">● ' + flags.length + '</span>' : '—') + '</td>' +
    '</tr><tr class="detail" id="d' + i + '" hidden><td colspan="6">' + detail(r) + '</td></tr>';
  }).join("");
}
function tile(n, label) {
  return '<div class="tile"><b>' + n + '</b><span>' + label + '</span></div>';
}
function detail(r) {
  var a = [], c = [];
  try { a = JSON.parse(r.answers || "[]"); } catch (e) {}
  try { c = JSON.parse(r.cats || "[]"); } catch (e) {}
  return (c.length ? '<div><b>By section:</b> ' + c.map(esc).join(" &nbsp;·&nbsp; ") + '</div>' : '') +
    '<div class="qs">' + a.map(function (x) {
      var cls = x.label === "Yes" ? "yes" : "";
      return '<div><i>' + x.n + '. ' + esc(x.question) + '</i><b class="' + cls + '">' + esc(x.label) + '</b></div>';
    }).join("") + '</div>';
}
function toggle(i) {
  var el = document.getElementById("d" + i);
  if (el) el.hidden = !el.hidden;
}
var t;
document.getElementById("q").addEventListener("input", function (e) {
  clearTimeout(t); t = setTimeout(function () { load(e.target.value); }, 220);
});
load("");
</script></div></body></html>`;
}

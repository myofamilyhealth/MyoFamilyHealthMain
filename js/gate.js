/* ============================================================
   Myo Family Health — email access gate

   Visitors give an email address before the hub unlocks. The
   address is submitted straight to the Brevo newsletter list
   (the same list the on-page signup form feeds), so a gate
   unlock and a newsletter subscription are one and the same.

   IMPORTANT — this is a lead-capture gate, not access control.
   The site is a public static site: the HTML, CSS and JS are all
   readable by anyone who views source, and the gate can be
   bypassed by turning JavaScript off. Never put anything
   confidential behind it.

   To change how much of the site is gated, edit CONFIG.scope
   below. To switch the gate off entirely, set enabled to false.
   ============================================================ */
(function () {
  "use strict";

  var CONFIG = {
    enabled: true,

    // "site"   — gate everything (hub + assessment)
    // "assess" — leave the hub open, gate only the assessment
    //            (higher-converting: visitors see the value first)
    scope: "site",

    // How long an unlocked visitor stays unlocked.
    rememberDays: 365,

    storageKey: "mfh_access_v1",

    // Brevo embedded-form endpoint. The hub no longer has an on-page
    // signup section, so this gate is now the only way onto the list.
    action: "https://e3961feb.sibforms.com/v2/serve/MUIFAIp6RUy17cEz4RshfnfNGuq1fh4h4dR952P97BU-q72mx8NAH0Cw_ri4DzhxhMjd0BeXWM6INiNIwuXmWGAV_DkUjAnCOFtfaAo2WQhZUHN4Zj8p8l7jmq8Ht-sWyTnLOAs1nYwwg73AiX6yu7EeQ5ta5xoa2FZ3LvWUM3il6nmgCsEfgw1dTeAhVOdYfY7S52lTYAW9Tti1cA=="
  };

  var html = document.documentElement;

  /* gate.js is running, so the head-script failsafe has done its job and must
     not fire later and drop the overlay mid-visit. */
  try { window.clearTimeout(window.__mfhGateFailsafe); } catch (e) { /* no-op */ }

  /* Fail open: if anything below throws, the visitor still gets in. */
  function openUp() { html.classList.remove("gated"); }

  function isAssessPage() {
    return /assess\.html$/i.test(window.location.pathname);
  }

  /* This page isn't in scope — nothing to gate. */
  if (!CONFIG.enabled || (CONFIG.scope === "assess" && !isAssessPage())) {
    openUp();
    return;
  }

  /* ---------- Remembering an unlocked visitor ---------- */
  function alreadyUnlocked() {
    try {
      var raw = window.localStorage.getItem(CONFIG.storageKey);
      if (!raw) return false;
      var rec = JSON.parse(raw);
      if (!rec || !rec.ok) return false;
      var age = Date.now() - (rec.at || 0);
      return age < CONFIG.rememberDays * 864e5;
    } catch (e) {
      // Private browsing, storage disabled, corrupt value — let them in.
      return true;
    }
  }

  function remember(email) {
    try {
      window.localStorage.setItem(CONFIG.storageKey, JSON.stringify({
        ok: true,
        at: Date.now(),
        email: email
      }));
    } catch (e) { /* nothing we can do, and nothing that should block them */ }
  }

  if (alreadyUnlocked()) { openUp(); return; }

  /* ---------- Validation ----------
     Deliberately permissive: shape only. Brevo answers
     {"success":true} to anything, including malformed input, so
     this check is the only thing standing between a typo and a
     dead address on the list. */
  var EMAIL_RE = /^[^\s@,;]+@[^\s@,;.]+(\.[^\s@,;.]+)+$/;

  function validEmail(v) {
    v = String(v || "").trim();
    return v.length >= 6 && v.length <= 254 && EMAIL_RE.test(v);
  }

  /* ---------- Build the overlay ---------- */
  function build() {
    var gate = document.createElement("div");
    gate.className = "gate";
    gate.id = "gate";
    gate.setAttribute("role", "dialog");
    gate.setAttribute("aria-modal", "true");
    gate.setAttribute("aria-labelledby", "gateTitle");

    gate.innerHTML = [
      '<div class="gate-card">',
        '<div class="gate-mark"><img src="assets/mfh-tree.png" alt="" aria-hidden="true" width="186" height="189" /></div>',
        '<span class="eyebrow center">Free Access</span>',
        '<h1 id="gateTitle">Enter your email to <span class="serif-accent">unlock the hub</span></h1>',
        '<p class="gate-sub">One step, and everything opens up — free, and free to stay.</p>',

        '<div class="gate-perks">',
          '<div><svg aria-hidden="true"><use href="#ic-check"/></svg>The 2-minute myofunctional self-assessment</div>',
          '<div><svg aria-hidden="true"><use href="#ic-check"/></svg>Sleep Lab and MyoLand — both games, free to play</div>',
          '<div><svg aria-hidden="true"><use href="#ic-check"/></svg>The full research library, plus new courses as they land</div>',
        '</div>',

        '<form class="gate-form" id="gateForm" novalidate>',
          '<label for="gateEmail" class="sr-only" style="position:absolute;left:-9999px">Your email address</label>',
          '<input class="gate-field" id="gateEmail" name="EMAIL" type="email" inputmode="email" ',
            'autocomplete="email" autocapitalize="off" spellcheck="false" placeholder="you@example.com" required />',
          '<input class="gate-hp" type="text" name="email_address_check" tabindex="-1" autocomplete="off" aria-hidden="true" />',
          '<button class="btn btn-primary btn-lg" type="submit" id="gateBtn">',
            '<span id="gateBtnText">Unlock Free Access</span> <svg aria-hidden="true"><use href="#ic-arrow"/></svg>',
          '</button>',
          '<p class="gate-msg" id="gateMsg" role="alert" aria-live="assertive"></p>',
        '</form>',

        '<p class="gate-fine">By entering your email you\'ll also join the free Myo Family Health newsletter — new courses, games and fresh information on breathing and sleep. We use your address for that and nothing else, we never sell or share it, and you can unsubscribe from any email.</p>',

        '<p class="gate-contact">Would rather just reach out? Text or call <a href="tel:+17076311550">707.631.1550</a> — we\'re happy to answer questions without any of this.</p>',
      '</div>'
    ].join("");

    document.body.appendChild(gate);
    return gate;
  }

  /* The icon sprite lives further down the page; the gate needs
     <use> targets available the moment it paints, so give it its own. */
  function ensureIcons() {
    if (document.getElementById("ic-check")) return;
    var sprite = document.createElement("div");
    sprite.style.cssText = "position:absolute;width:0;height:0;overflow:hidden";
    sprite.setAttribute("aria-hidden", "true");
    sprite.innerHTML =
      '<svg xmlns="http://www.w3.org/2000/svg">' +
      '<symbol id="ic-check" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12.5l4.5 4.5L19 7"/></symbol>' +
      '<symbol id="ic-arrow" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14M13 6l6 6-6 6"/></symbol>' +
      "</svg>";
    document.body.insertBefore(sprite, document.body.firstChild);
  }

  /* ---------- Submit ---------- */
  /* Analytics may not have loaded yet; never let a missing hook break the gate. */
  function track(name) {
    try { if (window.mfhTrack) window.mfhTrack(name); } catch (e) { /* ignore */ }
  }

  function start() {
    ensureIcons();
    track("gate-shown");

    var gate  = build();
    var form  = document.getElementById("gateForm");
    var field = document.getElementById("gateEmail");
    var btn   = document.getElementById("gateBtn");
    var text  = document.getElementById("gateBtnText");
    var msg   = document.getElementById("gateMsg");
    var busy  = false;

    field.focus({ preventScroll: true });

    // Keep focus inside the overlay while it's up.
    gate.addEventListener("keydown", function (e) {
      if (e.key !== "Tab") return;
      var f = gate.querySelectorAll('input:not([tabindex="-1"]), button, a[href]');
      if (!f.length) return;
      var first = f[0], last = f[f.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    });

    field.addEventListener("input", function () {
      field.classList.remove("invalid");
      msg.textContent = "";
    });

    function fail(message) {
      busy = false;
      btn.classList.remove("loading");
      text.textContent = "Unlock Free Access";
      field.classList.add("invalid");
      msg.textContent = message;
      field.focus();
    }

    function unlock(email) {
      track("gate-unlocked");   // the address itself is never sent
      remember(email);
      gate.classList.add("closing");
      openUp();
      window.setTimeout(function () {
        if (gate.parentNode) gate.parentNode.removeChild(gate);
      }, 500);
    }

    form.addEventListener("submit", function (e) {
      e.preventDefault();
      if (busy) return;

      var email = field.value.trim();
      if (!validEmail(email)) {
        fail("Please enter a valid email address.");
        return;
      }

      // A filled honeypot means a bot; don't bother the network.
      if (form.elements.email_address_check.value) return;

      busy = true;
      btn.classList.add("loading");
      text.textContent = "Unlocking…";
      msg.textContent = "";

      var body = new URLSearchParams();
      body.set("EMAIL", email);
      body.set("email_address_check", "");
      body.set("locale", "en");

      var timeout = window.setTimeout(function () {
        // Brevo is slow or unreachable. The visitor did their part —
        // let them in rather than punishing them for our outage.
        if (busy) unlock(email);
      }, 6000);

      fetch(CONFIG.action, {
        method: "POST",
        body: body,
        headers: { "Content-Type": "application/x-www-form-urlencoded" }
      })
        .then(function (res) { return res.ok ? res.json().catch(function () { return { success: true }; }) : Promise.reject(res.status); })
        .then(function (data) {
          window.clearTimeout(timeout);
          if (data && data.success === false) { fail("That didn't go through. Please check the address and try again."); return; }
          unlock(email);
        })
        .catch(function () {
          window.clearTimeout(timeout);
          // Network or CORS failure — same reasoning as the timeout.
          unlock(email);
        });
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();

/* ============================================================
   Myo Family Health — analytics (GoatCounter, cookieless)

   Same account as the free guides site, so everything lands on one
   dashboard: https://nathanrondoni.goatcounter.com

   Page views are automatic. Click events are named and sent for the
   games, the assessment, every guide PDF, booking, the phone number,
   social, the email gate, and any other outbound link — including
   links added later, which are picked up automatically.

   ---------------------------------------------------------------
   EVENT NAMES

   Every event from this site is prefixed "hub-" so it stays separate
   from the guides site, which posts bare "guide-<slug>" events to the
   same account.

     hub-assessment-open        the Free Self-Assessment tile
     hub-assess-start-self      started, answering for themselves
     hub-assess-start-child     started, answering for a child
     hub-assess-complete-low    finished — few signs
     hub-assess-complete-mod    finished — some signs
     hub-assess-complete-high   finished — many signs
     hub-game-sleep-lab         opened Sleep Lab
     hub-game-myoland           opened MyoLand
     hub-guide-breathing        opened a guide PDF (one per topic)
     hub-guides-site            opened the guides landing page
     hub-booking                opened the booking page
     hub-call                   tapped the phone number
     hub-social-instagram       social links (one per network)
     hub-gate-shown             the email gate was displayed
     hub-gate-unlocked          unlocked by entering an email
     hub-gate-bypassed          unlocked via "I already submitted"
     hub-out-<host><path>       any other outbound link
   ---------------------------------------------------------------

   WHAT THIS CAN AND CANNOT TELL YOU

   GoatCounter gives COUNTS, not people. "23 opened Sleep Lab today",
   never "this visitor opened Sleep Lab". It sets no cookies and
   assigns no identifier, so there is no way to follow one person
   between events or sessions. On a site that collects email addresses
   and asks health questions, that is the right trade — being able to
   identify visitors here would be a liability, not a feature.

   Never sent, by design:
     - the email address entered at the gate
     - any assessment answer
     - anything typed into any field

   The assessment reports only its outcome band (few / some / many
   signs). Set CONFIG.trackResultBand to false to stop even that.
   ============================================================ */

window.GC_CODE = "nathanrondoni";

(function () {
  "use strict";

  var CONFIG = {
    /* Namespace for this site's events. Keeps hub numbers separate
       from the guides site on the shared dashboard. */
    prefix: "hub-",

    /* Report the assessment outcome band (never the answers). */
    trackResultBand: true,

    /* Mirror every event to the console so you can confirm what fires. */
    debug: false
  };

  var code = window.GC_CODE;

  function log() {
    if (CONFIG.debug && window.console) {
      console.log.apply(console, ["[mfh-analytics]"].concat([].slice.call(arguments)));
    }
  }

  /* ---------- Load GoatCounter ----------
     Matches the guides site: set the endpoint first, then load count.js,
     which reads window.goatcounter and counts the page view itself. */
  if (code) {
    window.goatcounter = window.goatcounter || {};
    window.goatcounter.endpoint = "https://" + code + ".goatcounter.com/count";

    var s = document.createElement("script");
    s.async = true;
    s.src = "https://gc.zgo.at/count.js";
    s.onerror = function () { log("count.js failed to load — the site is unaffected"); };
    document.head.appendChild(s);
  }

  /* Events raised before count.js finishes loading are held here. */
  var queue = [];

  function flush() {
    if (!window.goatcounter || typeof window.goatcounter.count !== "function") return;
    while (queue.length) {
      try { window.goatcounter.count(queue.shift()); } catch (e) { /* never break the page */ }
    }
  }

  function send(name, title) {
    if (!name) return;
    var full = name.indexOf(CONFIG.prefix) === 0 ? name : CONFIG.prefix + name;
    log("event:", full, title || "");
    if (!code) return;

    var payload = { path: full, title: title || full, event: true };
    if (window.goatcounter && typeof window.goatcounter.count === "function") {
      try { window.goatcounter.count(payload); } catch (e) { /* ignore */ }
    } else {
      queue.push(payload);
      window.setTimeout(flush, 800);
    }
  }

  /* Public hook for gate.js and assess.js. */
  window.mfhTrack = send;
  window.mfhTrackConfig = CONFIG;

  /* ---------- Name a clicked link ----------
     An explicit data-track wins; everything else is derived, so a link
     added later is still counted without anyone remembering to tag it. */
  function nameFor(a) {
    var explicit = a.getAttribute("data-track");
    if (explicit) return explicit;

    var href = a.getAttribute("href") || "";
    if (/^tel:/i.test(href))    return "call";
    if (/^mailto:/i.test(href)) return "email-link";
    if (!href || href.charAt(0) === "#") return null;      // in-page nav

    var url;
    try { url = new URL(a.href, window.location.href); } catch (e) { return null; }

    if (/\.pdf$/i.test(url.pathname)) {
      return "guide-" + url.pathname.split("/").pop().replace(/\.pdf$/i, "");
    }
    if (url.origin === window.location.origin) return null; // already a page view

    var host = url.hostname.replace(/^www\./, "");
    var path = url.pathname.replace(/\/$/, "");
    return "out-" + host + path;
  }

  function labelFor(el) {
    var explicit = el.getAttribute("data-track-title");
    if (explicit) return explicit;
    var strong = el.querySelector && el.querySelector("strong");
    if (strong) return strong.textContent.trim().slice(0, 60);
    return (el.textContent || "").replace(/\s+/g, " ").trim().slice(0, 60);
  }

  function start() {
    /* One delegated listener covers every link, including any the page
       adds later. Capture phase, so it still runs if something else
       stops propagation. */
    document.addEventListener("click", function (e) {
      var a = e.target && e.target.closest ? e.target.closest("a[href]") : null;
      if (a) {
        var name = nameFor(a);
        if (name) send(name, labelFor(a));
        return;
      }
      var b = e.target && e.target.closest ? e.target.closest("button[data-track]") : null;
      if (b) send(b.getAttribute("data-track"), labelFor(b));
    }, true);

    log("ready — code:", code || "(none)");
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", start);
  } else {
    start();
  }
})();

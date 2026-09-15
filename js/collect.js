/* ============================================================
   Myo Family Health — assessment result sharing

   The assessment is private by default and stays that way. This
   module adds one thing: a card on the result screen offering to
   send that result to Amy, and it only ever sends when the
   visitor taps it.

   Nothing here runs until CONFIG.action is filled in. With it
   empty the module reports itself disabled, no card is rendered,
   and assess.html's "stays on your device" copy stands unaltered
   and true. That is deliberate — the promise on the page and the
   behaviour of the code are driven by the same switch, so they
   cannot drift apart.

   WHERE IT GOES
   A Cloudflare Worker you own (see worker/), which writes to a
   database you own and serves Amy a dashboard behind a real
   login. This file holds only the public submit URL — no key, no
   password, nothing secret. That is the point: anything secret
   put here would be readable by anyone viewing source.

   SETUP  (see README, "Collecting assessment results")
     1. Deploy worker/ — the README has the five commands.
     2. Paste the Worker's /api/submit URL below.
   ============================================================ */
(function () {
  "use strict";

  var CONFIG = {
    /* The Worker's submit endpoint. Looks like:
       https://myo-assessments.<subdomain>.workers.dev/api/submit
       Leave empty to keep result sharing switched off entirely. */
    action: "",

    /* Offer an optional name box alongside the email. */
    askName: false,

    storageKey: "mfh_access_v1"
  };

  function ready() {
    return !!CONFIG.action;
  }

  function track(name) {
    try { if (window.mfhTrack) window.mfhTrack(name); } catch (e) { /* ignore */ }
  }

  /* The gate already asked for an address; don't ask twice. */
  function knownEmail() {
    try {
      var rec = JSON.parse(window.localStorage.getItem(CONFIG.storageKey) || "null");
      return (rec && rec.email) ? String(rec.email) : "";
    } catch (e) { return ""; }
  }

  var EMAIL_RE = /^[^\s@,;]+@[^\s@,;.]+(\.[^\s@,;.]+)+$/;
  function validEmail(v) {
    v = String(v || "").trim();
    return v.length >= 6 && v.length <= 254 && EMAIL_RE.test(v);
  }

  /* The Worker answers with CORS headers, so unlike a third-party
     form endpoint the reply is readable and the card can tell the
     truth about whether the result actually saved. */
  function post(payload, email, name) {
    var b = {
      email: email,
      subject: payload.subject,
      total: payload.total,
      max: payload.max,
      pct: payload.pct,
      tier: payload.tier,
      bandLabel: payload.bandLabel,
      flags: payload.flags,
      cats: payload.cats,
      answers: payload.answers.map(function (a) {
        return { n: a.n, section: a.section, question: a.question, label: a.label };
      })
    };
    if (name) b.name = name;

    return fetch(CONFIG.action, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(b)
    }).then(function (res) {
      if (!res.ok) throw new Error("save failed");
      return res.json();
    });
  }

  /* ---------- The opt-in card ---------- */
  function offer(host, payload) {
    if (!host || !ready()) return;

    var email = knownEmail();
    var card = document.createElement("div");
    card.className = "qz-share";

    card.innerHTML = [
      '<h3>Want Amy to see this?</h3>',
      '<p>Send your result so she can read it before your free consultation. ',
        'Nothing is sent unless you tap the button.</p>',
      '<div class="qz-share-form">',
        (email
          ? '<p class="qz-share-as">Sending as <strong>' + email.replace(/[<>&]/g, "") + '</strong></p>'
          : '<label class="qz-share-label" for="qzShareEmail">Your email</label>' +
            '<input class="gate-field" id="qzShareEmail" type="email" inputmode="email" ' +
              'autocomplete="email" autocapitalize="off" spellcheck="false" placeholder="you@example.com" />'),
        (CONFIG.askName
          ? '<label class="qz-share-label" for="qzShareName">Your name (optional)</label>' +
            '<input class="gate-field" id="qzShareName" type="text" autocomplete="name" placeholder="First name" />'
          : ''),
        '<button class="btn btn-primary btn-lg" type="button" id="qzShareBtn">',
          '<span id="qzShareBtnText">Send my answers to Amy</span> ',
          '<svg aria-hidden="true"><use href="#ic-arrow"/></svg>',
        '</button>',
        '<p class="qz-share-msg" id="qzShareMsg" role="status" aria-live="polite"></p>',
      '</div>',
      '<p class="qz-share-fine">You are sending the answers shown on this page, your score, and your email address, ',
        'so Amy can follow up. She is the only person who sees it.</p>'
    ].join("");

    host.innerHTML = "";
    host.appendChild(card);
    host.hidden = false;

    var btn   = document.getElementById("qzShareBtn");
    var btnT  = document.getElementById("qzShareBtnText");
    var msg   = document.getElementById("qzShareMsg");
    var field = document.getElementById("qzShareEmail");
    var nameF = document.getElementById("qzShareName");
    var sent  = false;

    btn.addEventListener("click", function () {
      if (sent) return;

      var addr = email || (field ? field.value.trim() : "");
      if (!validEmail(addr)) {
        msg.textContent = "Please enter a valid email address so Amy can reply.";
        card.classList.add("invalid");
        if (field) field.focus();
        return;
      }
      card.classList.remove("invalid");

      sent = true;
      btn.disabled = true;
      btnT.textContent = "Sending…";

      post(payload, addr, nameF ? nameF.value.trim() : "")
        .then(function () {
          track("assess-sent");
          card.classList.add("done");
          btnT.textContent = "Sent to Amy";
          msg.textContent = "Thank you — Amy has your result. She'll bring it to your consultation.";
        })
        .catch(function () {
          /* Say so rather than claiming a save that did not happen —
             the visitor can retry, and their result is still on screen. */
          sent = false;
          btn.disabled = false;
          card.classList.add("invalid");
          btnT.textContent = "Try again";
          msg.textContent = "That didn't go through. Please try again, or bring your result to your consultation.";
        });
    });
  }

  /* ---------- Keep the page's promise accurate ----------
     assess.html says answers stay on the device. That is true while
     this module is off, and needs one word of qualification once it
     is on. Doing it here means the copy can never claim more privacy
     than the code actually provides. */
  function correctCopy() {
    if (!ready()) return;

    var intro = document.querySelector("#qzIntro .qz-panel-head p");
    if (intro) {
      intro.textContent = "We'll word the questions to match. Your answers stay in this browser — " +
        "at the end you can choose to send them to Amy, and nothing is sent unless you do.";
    }

    var badges = document.querySelectorAll(".qz-meta .badge");
    for (var i = 0; i < badges.length; i++) {
      if (/stays on your device/i.test(badges[i].textContent)) {
        var label = badges[i].lastChild;
        if (label && label.nodeType === 3) label.nodeValue = "Private — you choose what to send";
      }
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", correctCopy);
  } else {
    correctCopy();
  }

  window.mfhCollect = { ready: ready, offer: offer, config: CONFIG };
})();

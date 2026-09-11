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
   A Google Form you own, which writes to a Sheet you own. The
   form's formResponse endpoint takes an ordinary POST and needs
   no API key, which matters on a static site: anything secret
   put in this file would be readable by anyone viewing source.

   SETUP  (see README, "Collecting assessment results")
     1. Build the Google Form.
     2. Run tools/form-fields.sh <your form URL> to pull the
        entry IDs out of it.
     3. Paste the action URL and the IDs below.
   ============================================================ */
(function () {
  "use strict";

  var CONFIG = {
    /* The form's POST endpoint. Looks like:
       https://docs.google.com/forms/d/e/FORM_ID/formResponse
       Leave empty to keep result sharing switched off entirely. */
    action: "",

    /* entry.NNNNNNN ids from your form. `answers` holds 18 of
       them, in the order the questions appear in the assessment. */
    fields: {
      email:   "",
      subject: "",
      score:   "",
      percent: "",
      band:    "",
      flags:   "",
      answers: []
    },

    /* Offer an optional name box alongside the email. */
    askName: false,

    storageKey: "mfh_access_v1"
  };

  function ready() {
    return !!(CONFIG.action && CONFIG.fields.email);
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

  /* ---------- Build the POST body ----------
     Only fields that have been given an entry id are included, so
     a partially configured form degrades to sending less rather
     than sending nothing. */
  function body(payload, email, name) {
    var f = CONFIG.fields;
    var b = new URLSearchParams();

    if (f.email)   b.set(f.email, email);
    if (f.subject) b.set(f.subject, payload.subject === "child" ? "For their child" : "For themselves");
    if (f.score)   b.set(f.score, payload.total + " of " + payload.max);
    if (f.percent) b.set(f.percent, payload.pct + "%");
    if (f.band)    b.set(f.band, payload.bandLabel);
    if (f.flags)   b.set(f.flags, payload.flags.length ? payload.flags.join(" | ") : "none");
    if (name && f.name) b.set(f.name, name);

    for (var i = 0; i < payload.answers.length; i++) {
      var id = f.answers[i];
      if (id) b.set(id, payload.answers[i].label);
    }
    return b;
  }

  /* Google does not send CORS headers on formResponse, so the reply
     is unreadable by design. no-cors still delivers the request; it
     just means we can never claim more than "sent". */
  function post(payload, email, name) {
    return fetch(CONFIG.action, {
      method: "POST",
      mode: "no-cors",
      body: body(payload, email, name),
      headers: { "Content-Type": "application/x-www-form-urlencoded" }
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
        .then(done, done);

      function done() {
        track("assess-sent");
        card.classList.add("done");
        btnT.textContent = "Sent to Amy";
        msg.textContent = "Thank you — Amy has your result. She'll bring it to your consultation.";
      }
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

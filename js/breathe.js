/* ============================================================
   Myo Family Health — guided nasal breathing pacer

   A circle that grows for four seconds while you breathe in
   through the nose, then shrinks for six while you breathe out.
   The long exhale is the point: it is the half that settles the
   nervous system, and it is the half people skip.

   Mounted in two places, from one definition:
     - inside the email gate, compact, as the first thing a
       visitor can actually do before being asked for anything
     - on the hub as a full section, as a reason to come back

   Everything here is presentation. Nothing is timed against a
   clock the visitor cannot see, nothing is stored, nothing is
   sent. It is a metronome for breathing, not a measurement.
   ============================================================ */
(function () {
  "use strict";

  /* Four in, six out. No breath-holds: this site's audience
     includes people being screened for sleep-disordered
     breathing, and a hold is the one phase that can make air
     hunger worse rather than better. */
  var PHASES = [
    { key: "in",  label: "Breathe in",  hint: "through your nose", ms: 4000 },
    { key: "out", label: "Breathe out", hint: "slow and gentle",   ms: 6000 }
  ];

  /* Enough to feel a difference, few enough to finish. */
  var MILESTONE = 3;

  function track(name) {
    try { if (window.mfhTrack) window.mfhTrack(name); } catch (e) { /* never break the page */ }
  }

  function reducedMotion() {
    try { return window.matchMedia("(prefers-reduced-motion: reduce)").matches; }
    catch (e) { return false; }
  }

  /* ---------- One pacer ---------- */
  function mount(host, opts) {
    if (!host) return null;
    opts = opts || {};

    var root = document.createElement("div");
    root.className = "bx" + (opts.compact ? " bx-compact" : "");
    root.setAttribute("data-state", "idle");

    root.innerHTML = [
      '<div class="bx-stage">',
        '<span class="bx-ripple" aria-hidden="true"></span>',
        '<span class="bx-orb" aria-hidden="true">',
          '<span class="bx-phase">Ready</span>',
          '<span class="bx-secs"></span>',
        '</span>',
      '</div>',
      '<p class="bx-cue" role="status" aria-live="polite"></p>',
      '<button class="bx-btn" type="button">',
        '<span class="bx-btn-text">' + (opts.startLabel || "Start breathing") + '</span>',
      '</button>',
      '<p class="bx-tally" aria-live="polite"></p>',
      '<p class="bx-safety">Breathe gently — never force it. If you feel light-headed, stop and breathe normally.</p>'
    ].join("");

    host.appendChild(root);

    var orb    = root.querySelector(".bx-orb");
    var phaseE = root.querySelector(".bx-phase");
    var secsE  = root.querySelector(".bx-secs");
    var cue    = root.querySelector(".bx-cue");
    var btn    = root.querySelector(".bx-btn");
    var btnT   = root.querySelector(".bx-btn-text");
    var tally  = root.querySelector(".bx-tally");

    var running = false;
    var phase = 0;
    var breaths = 0;
    var milestoneHit = false;
    var phaseTimer = null;
    var tickTimer = null;
    var phaseEndsAt = 0;

    function clearTimers() {
      window.clearTimeout(phaseTimer);
      window.clearInterval(tickTimer);
      phaseTimer = null;
      tickTimer = null;
    }

    /* The seconds readout is the only cue a reduced-motion visitor
       gets, so it is driven independently of the animation. */
    function paintSeconds() {
      var left = Math.max(0, Math.ceil((phaseEndsAt - Date.now()) / 1000));
      secsE.textContent = left > 0 ? String(left) : "";
    }

    function runPhase(i) {
      phase = i;
      var p = PHASES[i];

      /* Drive the CSS transition from the phase itself so the
         circle and the words can never disagree. */
      orb.style.transitionDuration = p.ms + "ms";
      root.setAttribute("data-phase", p.key);

      phaseE.textContent = p.label;
      cue.textContent = p.label + " " + p.hint + ".";

      phaseEndsAt = Date.now() + p.ms;
      paintSeconds();
      tickTimer = window.setInterval(paintSeconds, 200);

      phaseTimer = window.setTimeout(function () {
        window.clearInterval(tickTimer);
        if (!running) return;

        var next = i + 1;
        if (next >= PHASES.length) {
          next = 0;
          breaths += 1;
          paintTally();
          if (breaths === MILESTONE && !milestoneHit) {
            milestoneHit = true;
            track("breathe-" + MILESTONE);
          }
        }
        runPhase(next);
      }, p.ms);
    }

    function paintTally() {
      if (!breaths) { tally.textContent = ""; return; }
      var noun = breaths === 1 ? "breath" : "breaths";
      tally.textContent = breaths + " " + noun +
        (breaths >= MILESTONE ? " — that's the pattern. Same thing, five minutes, twice a day." : "");
    }

    function start() {
      if (running) return;
      running = true;
      root.setAttribute("data-state", "running");
      btnT.textContent = "Stop";
      track("breathe-start");
      runPhase(0);
    }

    function stop() {
      running = false;
      clearTimers();
      root.setAttribute("data-state", "idle");
      root.removeAttribute("data-phase");
      orb.style.transitionDuration = "";
      btnT.textContent = opts.startLabel || "Start breathing";
      phaseE.textContent = "Ready";
      secsE.textContent = "";
      cue.textContent = "";
    }

    btn.addEventListener("click", function () {
      if (running) stop(); else start();
    });

    /* A pacer running in a tab nobody is looking at is just a
       timer drifting out of sync with a person. */
    document.addEventListener("visibilitychange", function () {
      if (document.hidden && running) stop();
    });

    if (reducedMotion()) root.setAttribute("data-reduced", "true");

    return { start: start, stop: stop, el: root };
  }

  window.mfhBreathe = { mount: mount };

  /* Any .breathe-panel on the page gets one, so the hub section is
     markup-only and the gate can mount its own copy by hand. */
  function autoMount() {
    var hosts = document.querySelectorAll(".breathe-panel");
    for (var i = 0; i < hosts.length; i++) {
      if (hosts[i].getAttribute("data-mounted")) continue;
      hosts[i].setAttribute("data-mounted", "1");
      mount(hosts[i], {});
    }
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", autoMount);
  } else {
    autoMount();
  }
})();

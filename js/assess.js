/* ============================================================
   Myo Family Health — Myofunctional self-assessment
   Educational screening tool. Everything runs client-side;
   nothing is transmitted or stored beyond the page session.
   ============================================================ */
(function () {
  "use strict";

  /* ---------- Wording tokens ---------------------------------
     Questions are authored once and re-worded for "myself" vs
     "my child" so the whole quiz reads naturally either way.  */
  var TOKENS = {
    self:  { DO: "Do you",           HAVE: "Have you",      ARE: "Are you",        P: "your",  S: "you" },
    child: { DO: "Does your child",  HAVE: "Has your child", ARE: "Is your child", P: "their", S: "your child" }
  };

  var SECTIONS = [
    {
      key: "breathing",
      name: "Breathing & Airway",
      intro: "How the air actually gets in. Nasal breathing is the foundation everything else in myofunctional therapy is built on.",
      questions: [
        "{DO} breathe through {P} mouth during the day?",
        "{ARE} often sitting or resting with {P} lips apart?",
        "{DO} often have a stuffy, blocked or runny nose?",
        "{DO} wake up with a dry mouth, chapped lips, or feeling thirsty?",
        "{DO} switch to mouth breathing during exercise or after talking a lot?",
        "{HAVE} had ongoing allergies, sinus problems, or enlarged tonsils or adenoids?"
      ]
    },
    {
      key: "sleep",
      name: "Sleep & Rest",
      intro: "What happens overnight tells us a great deal. Noisy, restless sleep is one of the clearest signals of an airway that is working too hard.",
      questions: [
        "{DO} snore, breathe noisily, or make sounds while asleep?",
        "Has anyone ever noticed {S} gasping, choking, or pausing breathing during sleep?",
        "{DO} wake up tired even after a full night in bed?",
        "{DO} toss and turn, sleep in unusual positions, or kick off the covers?",
        "{DO} grind or clench {P} teeth at night?",
        "{ARE} noticeably sleepy, irritable, or unfocused during the day?"
      ]
    },
    {
      key: "mouth",
      name: "Tongue & Mouth",
      intro: "Where the tongue rests shapes the teeth and the bite over time — and restricted tongue movement makes everything harder.",
      questions: [
        "Has a provider ever mentioned that {S} may have a tongue tie or restricted tongue movement?",
        "With the mouth open wide, is it hard for {S} to lift the tongue up to the roof of the mouth?"
      ]
    },
    {
      key: "habits",
      name: "Eating & Habits",
      intro: "Chewing and swallowing use the same muscles as breathing. Long-standing oral habits keep those muscles working in the wrong pattern.",
      questions: [
        "{ARE} a messy or picky eater — eating quickly, taking big bites, or gagging on certain food textures?",
        "{DO} make noise while eating or drinking, or lose food or liquid from the mouth?",
        "{DO} suck a thumb, finger, pacifier, nails, lips or cheeks?",
        "As a baby, was feeding difficult for {S} — a poor latch, very long feeds, reflux or heavy colic?"
      ]
    }
  ];

  var OPTIONS = [
    { label: "Yes", value: 2 },
    { label: "Sometimes", value: 1 },
    { label: "No", value: 0 }
  ];

  /* Sections no longer hold the same number of questions, so every count is
     derived from the data rather than assumed. */
  function countOf(si) { return SECTIONS[si].questions.length; }
  function maxOf(si) { return countOf(si) * 2; }

  var TOTAL_QUESTIONS = SECTIONS.reduce(function (n, s) { return n + s.questions.length; }, 0);
  var MAX_TOTAL = TOTAL_QUESTIONS * 2;

  /* Red flags reference questions by "sectionIndex.questionIndex". */
  var FLAGS = [
    {
      at: "1.1", min: 1,
      text: "Pauses, gasping or choking during sleep were noticed. Of everything on this list, this is the one most worth raising with a physician or sleep specialist — it can point to sleep-disordered breathing."
    },
    {
      at: "1.0", min: 2,
      text: "Regular snoring. Snoring is not normal at any age, and in children especially it deserves a proper look rather than a wait-and-see."
    },
    {
      at: "1.5", min: 2,
      text: "Daytime sleepiness, irritability or trouble focusing. In children this often shows up as hyperactivity rather than tiredness — sleep breathing is worth ruling out before anything else."
    },
    {
      at: "2.0", min: 2,
      text: "A tongue tie or restricted tongue movement has already been mentioned by a provider. A functional assessment can confirm how much it is limiting things."
    },
    {
      at: "2.1", min: 2,
      text: "The tongue cannot reach the roof of the mouth with the mouth open wide. That restriction affects swallowing, speech and how the jaw grows."
    }
  ];

  /* Category notes, keyed by section then band (0 = few, 1 = some, 2 = many). */
  var CAT_NOTES = {
    breathing: [
      "Breathing looks to be going through the nose most of the time — exactly what we want.",
      "There are some signs of mouth breathing or nasal congestion. Restoring nasal breathing is usually the first thing we work on.",
      "Strong signs of habitual mouth breathing. This is the highest-value area to address, because nasal breathing changes sleep, focus and facial growth."
    ],
    sleep: [
      "Sleep sounds quiet and restorative, with few of the signs we screen for.",
      "A few signs of disturbed or unrefreshing sleep. Worth watching, and worth mentioning at a consultation.",
      "Several signs of sleep-disordered breathing. Please bring these to a physician or sleep specialist as well as a myofunctional therapist."
    ],
    mouth: [
      "Tongue movement looks free and unrestricted.",
      "Some signs that tongue movement may be restricted. Worth having looked at properly.",
      "Clear signs of restricted tongue movement — the core of what myofunctional therapy retrains."
    ],
    habits: [
      "Eating and oral habits look settled.",
      "A few habit and feeding signs. Small, consistent changes often clear these up.",
      "Several long-standing oral habits or feeding difficulties, which tend to keep the wrong muscle pattern in place."
    ]
  };

  var VERDICTS = {
    low: {
      cls: "low",
      label: "Few signs",
      color: "#457F7C",
      headline: "Few signs of a myofunctional disorder",
      copy: function (t) {
        return "Good news — very few of the signs we screen for came up for " + t.S + ". Keep an eye on nasal breathing and lip seal, since those are the habits that quietly drift. If something specific still worries you, a free consultation costs nothing but the conversation.";
      },
      nextTitle: "Keep it that way",
      nextCopy: "Nothing here suggests an urgent problem. If anything changes, or you would simply like a second opinion, a free consultation costs nothing but the conversation."
    },
    mod: {
      cls: "mod",
      label: "Some signs",
      color: "#E0A76F",
      headline: "Some signs worth looking into",
      copy: function (t) {
        return "Several of the signs of an orofacial myofunctional disorder came up for " + t.S + ". None of this is a diagnosis, but this is the pattern we see most often in people who go on to benefit from therapy — and these things rarely resolve on their own.";
      },
      nextTitle: "Book a free consultation",
      nextCopy: "The most useful next step is a short, free conversation with Amy. Bring this result with you — the breakdown above is a good starting point for the discussion."
    },
    high: {
      cls: "high",
      label: "Many signs",
      color: "#D2795C",
      headline: "Many signs of a myofunctional disorder",
      copy: function (t) {
        return "A large number of the signs we screen for came up for " + t.S + ". That does not diagnose anything — but it does mean a professional assessment is genuinely worthwhile, and the sooner the better, since these patterns tend to become more entrenched over time.";
      },
      nextTitle: "Please book an assessment",
      nextCopy: "We'd encourage you to book a free consultation with Amy, and to mention any sleep and breathing concerns to your physician or dentist too. Myofunctional therapy is exercise-based — most people practise five minutes, twice a day."
    }
  };

  /* ---------- State ---------- */
  var subject = "self";
  var answers = {};        // "s.q" -> 0 | 1 | 2
  var current = -1;        // -1 = intro, 0..3 = sections, 4 = result

  /* ---------- Elements ---------- */
  var elIntro    = document.getElementById("qzIntro");
  var elSections = document.getElementById("qzSections");
  var elResult   = document.getElementById("qzResult");
  var elProgress = document.getElementById("qzProgress");
  var elStepName = document.getElementById("qzStepName");
  var elStepCount= document.getElementById("qzStepCount");
  var elBar      = document.getElementById("qzBar");
  var elBarFill  = elBar ? elBar.querySelector("i") : null;
  var card       = document.querySelector(".qz-card");

  if (!elIntro || !elSections || !elResult) return;

  var RING_C = 2 * Math.PI * 76;

  function tok() { return TOKENS[subject]; }

  function phrase(str) {
    var t = tok();
    return str.replace(/\{(DO|HAVE|ARE|P|S)\}/g, function (_, k) { return t[k]; });
  }

  /* ---------- Build the question panels ---------- */
  function buildSections() {
    elSections.innerHTML = "";
    var n = 0;

    SECTIONS.forEach(function (sec, si) {
      var panel = document.createElement("div");
      panel.className = "qz-panel";
      panel.dataset.section = String(si);

      var html = '<div class="qz-panel-head"><h2>' + sec.name + "</h2><p>" + sec.intro + "</p></div>";

      sec.questions.forEach(function (q, qi) {
        n += 1;
        var name = "q" + si + "_" + qi;
        html += '<div class="qz-q"><fieldset style="border:0;margin:0;padding:0">';
        html += '<legend class="qz-q-text">' + n + ". " + phrase(q) + "</legend>";
        html += '<div class="qz-opts">';
        OPTIONS.forEach(function (opt) {
          html += '<label class="qz-opt"><input type="radio" name="' + name + '" value="' + opt.value +
                  '" data-key="' + si + "." + qi + '" /><svg class="tick" aria-hidden="true"><use href="#ic-check"/></svg><span>' +
                  opt.label + "</span></label>";
        });
        html += "</div></fieldset></div>";
      });

      var isLast = si === SECTIONS.length - 1;
      html += '<div class="qz-nav">' +
                '<button class="btn btn-ghost" type="button" data-act="back"><svg aria-hidden="true"><use href="#ic-back"/></svg> Back</button>' +
                '<span class="spacer"></span>' +
                '<button class="btn btn-primary" type="button" data-act="next" disabled>' +
                  (isLast ? "See My Result" : "Continue") +
                  ' <svg aria-hidden="true"><use href="#ic-arrow"/></svg></button>' +
              "</div>" +
              '<p class="qz-hint" data-hint>Answer all ' + sec.questions.length + " questions to continue.</p>";

      panel.innerHTML = html;
      elSections.appendChild(panel);
    });
  }

  // Delegated once, so rebuilding the panels never stacks listeners.
  elSections.addEventListener("change", onAnswer);
  elSections.addEventListener("click", onPanelClick);

  function onAnswer(e) {
    var input = e.target;
    if (!input.matches('input[type="radio"]')) return;

    answers[input.dataset.key] = Number(input.value);

    // Repaint the checked state for this question's option row.
    var opts = input.closest(".qz-opts");
    opts.querySelectorAll(".qz-opt").forEach(function (lab) {
      lab.classList.toggle("checked", lab.querySelector("input").checked);
    });

    refreshSectionState(Number(input.closest(".qz-panel").dataset.section));
  }

  function sectionAnsweredCount(si) {
    var c = 0;
    for (var qi = 0; qi < countOf(si); qi++) {
      if (answers[si + "." + qi] !== undefined) c++;
    }
    return c;
  }

  function refreshSectionState(si) {
    var panel = elSections.children[si];
    if (!panel) return;
    var done = sectionAnsweredCount(si);
    var complete = done === countOf(si);

    panel.querySelector('[data-act="next"]').disabled = !complete;

    var hint = panel.querySelector("[data-hint]");
    if (complete) {
      hint.textContent = "All set — continue when you're ready.";
      hint.classList.remove("warn");
    } else {
      hint.textContent = done + " of " + countOf(si) + " answered.";
      hint.classList.remove("warn");
    }
    updateProgress();
  }

  function onPanelClick(e) {
    var btn = e.target.closest("button[data-act]");
    if (!btn) return;
    if (btn.dataset.act === "back") {
      goTo(current - 1);
    } else {
      if (current === SECTIONS.length - 1) {
        showResult();
      } else {
        goTo(current + 1);
      }
    }
  }

  /* ---------- Navigation ---------- */
  function goTo(index) {
    current = index;

    elIntro.classList.toggle("active", index === -1);
    elResult.classList.remove("active");
    Array.prototype.forEach.call(elSections.children, function (p, i) {
      p.classList.toggle("active", i === index);
    });

    if (elProgress) elProgress.hidden = index < 0;

    if (index >= 0) {
      elStepName.textContent = SECTIONS[index].name;
      elStepCount.textContent = "Section " + (index + 1) + " of " + SECTIONS.length;
      refreshSectionState(index);
    }
    updateProgress();
    scrollToCard();
  }

  function updateProgress() {
    if (!elBarFill) return;
    var answered = Object.keys(answers).length;
    var pct = current < 0 ? 0 : Math.round((answered / TOTAL_QUESTIONS) * 100);
    elBarFill.style.width = pct + "%";
    elBar.setAttribute("aria-valuenow", String(pct));
  }

  function scrollToCard() {
    if (!card) return;
    var top = card.getBoundingClientRect().top + window.scrollY - 100;
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    window.scrollTo({ top: top, behavior: reduce ? "auto" : "smooth" });
  }

  /* ---------- Scoring ---------- */
  function score() {
    var total = 0;
    var cats = SECTIONS.map(function (sec, si) {
      var sum = 0;
      for (var qi = 0; qi < countOf(si); qi++) sum += answers[si + "." + qi] || 0;
      total += sum;
      return {
        key: sec.key,
        name: sec.name,
        sum: sum,
        max: maxOf(si),
        pct: Math.round((sum / maxOf(si)) * 100)
      };
    });

    var pct = Math.round((total / MAX_TOTAL) * 100);
    var tier = pct >= 45 ? "high" : (pct >= 20 ? "mod" : "low");

    var flags = FLAGS.filter(function (f) {
      var parts = f.at.split(".");
      var v = answers[parts[0] + "." + parts[1]];
      return v !== undefined && v >= f.min;
    });

    return { total: total, pct: pct, tier: tier, cats: cats, flags: flags };
  }

  function band(pct) { return pct >= 50 ? 2 : (pct >= 25 ? 1 : 0); }

  /* ---------- Result ---------- */
  function showResult() {
    var r = score();
    var v = VERDICTS[r.tier];
    var t = tok();

    current = SECTIONS.length;
    elIntro.classList.remove("active");
    Array.prototype.forEach.call(elSections.children, function (p) { p.classList.remove("active"); });
    elResult.classList.add("active");
    if (elProgress) elProgress.hidden = true;

    // Headline + verdict chip
    var chip = document.getElementById("qzVerdict");
    chip.className = "qz-verdict " + v.cls;
    chip.textContent = v.label;
    document.getElementById("qzHeadline").textContent = v.headline;
    document.getElementById("qzVerdictCopy").textContent = v.copy(t);

    // Ring
    var ring = document.getElementById("qzRingProg");
    var pctEl = document.getElementById("qzScorePct");
    ring.style.stroke = v.color;
    ring.setAttribute("stroke-dasharray", RING_C.toFixed(1));
    ring.setAttribute("stroke-dashoffset", RING_C.toFixed(1));
    pctEl.textContent = "0%";
    requestAnimationFrame(function () {
      ring.setAttribute("stroke-dashoffset", (RING_C * (1 - r.pct / 100)).toFixed(1));
    });
    countUp(pctEl, r.pct);

    // Category breakdown
    var catsEl = document.getElementById("qzCats");
    catsEl.innerHTML = "";
    r.cats.forEach(function (c) {
      var b = band(c.pct);
      var div = document.createElement("div");
      div.className = "qz-cat";
      div.innerHTML =
        '<div class="qz-cat-top"><strong>' + c.name + "</strong><span>" + c.sum + " of " + c.max + "</span></div>" +
        '<div class="qz-cat-bar"><i class="' + (b === 2 ? "hot" : b === 1 ? "mid" : "") + '"></i></div>' +
        '<p class="qz-cat-note">' + CAT_NOTES[c.key][b] + "</p>";
      catsEl.appendChild(div);
      requestAnimationFrame(function () {
        div.querySelector(".qz-cat-bar i").style.width = Math.max(c.pct, 2) + "%";
      });
    });

    // Red flags
    var flagsBox = document.getElementById("qzFlags");
    var flagList = document.getElementById("qzFlagList");
    flagList.innerHTML = "";
    if (r.flags.length) {
      r.flags.forEach(function (f) {
        var li = document.createElement("li");
        li.textContent = f.text;
        flagList.appendChild(li);
      });
      flagsBox.hidden = false;
    } else {
      flagsBox.hidden = true;
    }

    // Next step
    document.getElementById("qzNextTitle").textContent = v.nextTitle;
    document.getElementById("qzNextCopy").textContent = v.nextCopy;

    scrollToCard();
  }

  function countUp(el, target) {
    var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if (reduce || target === 0) { el.textContent = target + "%"; return; }
    var start = performance.now();
    var dur = 1000;
    (function tick(now) {
      var p = Math.min((now - start) / dur, 1);
      var eased = 1 - Math.pow(1 - p, 3);
      el.textContent = Math.round(target * eased) + "%";
      if (p < 1) requestAnimationFrame(tick);
    })(start);
  }

  /* ---------- Wiring ---------- */
  elIntro.querySelectorAll("[data-subject]").forEach(function (btn) {
    btn.addEventListener("click", function () {
      subject = btn.dataset.subject;
      answers = {};
      buildSections();
      goTo(0);
    });
  });

  document.getElementById("qzPrint").addEventListener("click", function () { window.print(); });

  document.getElementById("qzRestart").addEventListener("click", function () {
    answers = {};
    elSections.innerHTML = "";
    elResult.classList.remove("active");
    goTo(-1);
  });

  updateProgress();
})();

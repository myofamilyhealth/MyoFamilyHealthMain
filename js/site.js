/* ============================================================
   Myo Family Health — Hub
   Nav shadow, mobile drawer, reveal-on-scroll.
   Shared by index.html and assess.html.
   ============================================================ */
(function () {
  "use strict";

  /* ---- Nav shadow on scroll ---- */
  var nav = document.getElementById("nav");
  if (nav) {
    var onScroll = function () {
      nav.classList.toggle("scrolled", window.scrollY > 8);
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
  }

  /* ---- Mobile drawer ---- */
  var drawer = document.getElementById("drawer");
  var toggle = document.getElementById("navToggle");
  var close = document.getElementById("drawerClose");

  if (drawer && toggle) {
    var lastFocused = null;

    var openDrawer = function () {
      lastFocused = document.activeElement;
      drawer.hidden = false;
      // Next frame so the transition actually runs.
      requestAnimationFrame(function () { drawer.classList.add("open"); });
      toggle.setAttribute("aria-expanded", "true");
      document.body.style.overflow = "hidden";
      if (close) close.focus();
    };

    var closeDrawer = function () {
      drawer.classList.remove("open");
      toggle.setAttribute("aria-expanded", "false");
      document.body.style.overflow = "";
      window.setTimeout(function () { drawer.hidden = true; }, 340);
      if (lastFocused) lastFocused.focus();
    };

    toggle.addEventListener("click", openDrawer);
    if (close) close.addEventListener("click", closeDrawer);

    // Click the scrim (but not the panel) to dismiss.
    drawer.addEventListener("click", function (e) {
      if (e.target === drawer) closeDrawer();
    });

    // Any link inside closes the drawer so anchors land on the section.
    drawer.querySelectorAll("a").forEach(function (a) {
      a.addEventListener("click", closeDrawer);
    });

    document.addEventListener("keydown", function (e) {
      if (e.key === "Escape" && drawer.classList.contains("open")) closeDrawer();
    });
  }

  /* ---- Reveal on scroll ---- */
  var reveals = document.querySelectorAll(".reveal");
  if (!reveals.length) return;

  if (!("IntersectionObserver" in window)) {
    reveals.forEach(function (el) { el.classList.add("in"); });
    return;
  }

  var observer = new IntersectionObserver(function (entries) {
    entries.forEach(function (entry) {
      if (entry.isIntersecting) {
        entry.target.classList.add("in");
        observer.unobserve(entry.target);
      }
    });
  }, { threshold: 0.12 });

  reveals.forEach(function (el) { observer.observe(el); });
})();

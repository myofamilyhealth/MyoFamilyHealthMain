/* ============================================================
   Thought Sorter — "Add to Home Screen" welcome

   Shown the first time someone opens the link in a browser, with
   steps for their phone. Never shown inside the installed app.
   ============================================================ */
(() => {
  "use strict";
  const $ = id => document.getElementById(id);
  const SEEN = "ts.installSeen";

  const ua = navigator.userAgent || "";
  const standalone = window.matchMedia("(display-mode: standalone)").matches || navigator.standalone === true;
  const isIOS = /iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1);
  const isAndroid = /Android/.test(ua);
  const inApp = /FBAN|FBAV|FB_IAB|Instagram|Line\/|BytedanceWebview|musical_ly|Snapchat|Pinterest|LinkedInApp|Twitter/i.test(ua);
  const iosNotSafari = isIOS && /CriOS|FxiOS|EdgiOS|OPiOS|GSA\//.test(ua);

  let deferred = null;   // Android Chrome's own install prompt, when offered
  window.addEventListener("beforeinstallprompt", e => {
    e.preventDefault();
    deferred = e;
    const btn = $("install-now");
    if (btn) btn.hidden = false;
  });
  window.addEventListener("appinstalled", () => {
    try { localStorage.setItem(SEEN, "1"); } catch {}
    if ($("install").open) $("install").close();
  });

  const SHARE_ICON = '<svg class="inline-icon" viewBox="0 0 24 24" aria-label="Share icon"><path d="M12 3v12M8 7l4-4 4 4"/><path d="M6 11v9h12v-9"/></svg>';
  const DOTS_ICON = '<b class="kbd">⋮</b>';

  function steps() {
    if (inApp) {
      return {
        lead: "You're viewing this inside another app, which can't add it to your home screen.",
        list: [
          `Tap the <b>⋯</b> or <b>⋮</b> menu in the corner of this screen.`,
          `Choose <b>Open in ${isIOS ? "Safari" : "browser"}</b> (or “Open in external browser”).`,
          `Then follow the steps that appear there.`
        ]
      };
    }
    if (isIOS) {
      return {
        lead: iosNotSafari
          ? "Works best from Safari, but this browser can do it too."
          : "Takes 10 seconds, then it opens like a regular app.",
        list: [
          `Tap the <b>Share</b> button ${SHARE_ICON} ${iosNotSafari ? "(top right or bottom, depending on the browser)" : "at the bottom of Safari"}.`,
          `Scroll down and tap <b>Add to Home Screen</b>. If you don't see it, tap <b>Edit Actions</b> to add it.`,
          `Tap <b>Add</b>, then open <b>Thoughts</b> from your home screen.`
        ]
      };
    }
    if (isAndroid) {
      return {
        lead: "Takes 10 seconds, then it opens like a regular app.",
        list: [
          `Tap the menu ${DOTS_ICON} at the top right of Chrome.`,
          `Tap <b>Add to Home screen</b> or <b>Install app</b>.`,
          `Tap <b>Install</b>, then open <b>Thoughts</b> from your home screen.`
        ]
      };
    }
    return {
      lead: "This app is made for your phone.",
      list: [
        `Open this link on your phone: <b class="link">${location.host}</b>`,
        `On iPhone, use Safari's <b>Share</b> ${SHARE_ICON} then <b>Add to Home Screen</b>.`,
        `On Android, use Chrome's menu ${DOTS_ICON} then <b>Install app</b>.`
      ]
    };
  }

  function open() {
    const s = steps();
    $("install-lead").textContent = s.lead;
    $("install-steps").innerHTML = s.list.map(li => `<li>${li}</li>`).join("");
    $("install-now").hidden = !deferred;
    $("install-why").hidden = false;
    $("install").showModal();
  }

  $("install-now").addEventListener("click", async () => {
    if (!deferred) return;
    deferred.prompt();
    try { await deferred.userChoice; } catch {}
    deferred = null;
    $("install-now").hidden = true;
  });
  $("install").addEventListener("close", () => { try { localStorage.setItem(SEEN, "1"); } catch {} });
  $("install-help").addEventListener("click", () => { $("settings").close(); open(); });
  if (standalone) $("install-help").hidden = true;

  let seen = false;
  try { seen = localStorage.getItem(SEEN) === "1"; } catch {}
  if (!standalone && !seen) setTimeout(open, 400);
})();

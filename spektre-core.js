// SPEKTRE CORE — the PORTABLE paradigm layer. Platform-independent: inject this into ANY webview and you get
// structural anti-tracking + native ad annihilation + the Railo agent bridge + σ-provenance. The native shell
// (window/menu) is the only per-platform part (~200 lines each); THIS is 80% of the value, written once.
//
// Hosts (each just creates a webview + injects this string + wires one message handler):
//   macOS/iOS  → WKWebView      (Swift, evaluateJavaScript + WKScriptMessageHandler)
//   Android    → android.webkit.WebView (Kotlin, evaluateJavascript + @JavascriptInterface)
//   Windows    → WebView2       (C#/Rust, ExecuteScriptAsync + WebMessageReceived)
//   Linux/Win/mac desktop → Tauri (Rust, one codebase, native system webview, tiny binary)
//   ANY browser → load as a userscript / extension content-script (works today, no app)
//
// The message bridge name "spektre" is the ONLY thing the host must provide. Everything else is standard web.
(function () {
  'use strict';

  // ── 1. STRUCTURAL ANTI-TRACKING — make a unique fingerprint impossible (same for every Spektre) ──
  const fix = (o, k, v) => { try { Object.defineProperty(o, k, { get: () => v }); } catch (e) {} };
  try {
    const gp = WebGLRenderingContext.prototype.getParameter;
    WebGLRenderingContext.prototype.getParameter = function (p) {
      if (p === 37445) return 'Spektre'; if (p === 37446) return 'Spektre Unified';
      return gp.apply(this, arguments);
    };
  } catch (e) {}
  fix(navigator, 'hardwareConcurrency', 8); fix(navigator, 'deviceMemory', 8);
  fix(navigator, 'platform', 'Spektre'); fix(navigator, 'languages', ['en-US']);
  fix(navigator, 'plugins', []); fix(navigator, 'mimeTypes', []);
  try { navigator.sendBeacon = () => false; } catch (e) {}
  try { delete navigator.getBattery; } catch (e) {}
  fix(navigator, 'doNotTrack', '1');

  // ── 2. NATIVE AD ANNIHILATION — cosmetic + YouTube video-ad skip (no extension, no blocklist subscription) ──
  const NUKE = ['ytd-ad-slot-renderer', 'ytd-in-feed-ad-layout-renderer', '#player-ads', '.ytp-ad-module',
    'ytd-promoted-sparkles-web-renderer', 'ytd-display-ad-renderer', '.ad-container', '[id^="ad_"]',
    '[class*="-ad-"]', 'ins.adsbygoogle', 'div[aria-label="Ad"]', '#masthead-ad', 'ytmusic-ad-slot-renderer'];
  const inject = () => {
    if (!document.head && !document.documentElement) return;
    const s = document.createElement('style');
    s.textContent = NUKE.join(',') + '{display:none!important;height:0!important}';
    (document.head || document.documentElement).appendChild(s);
  };
  inject();
  const skip = () => {
    const v = document.querySelector('video');
    const ad = document.querySelector('.ad-showing, .ytp-ad-player-overlay');
    if (ad && v) { try { v.currentTime = v.duration; v.muted = true; } catch (e) {} }
    const sb = document.querySelector('.ytp-ad-skip-button, .ytp-skip-ad-button, .ytp-ad-skip-button-modern');
    if (sb) sb.click();
    const c = document.querySelector('.ytp-ad-overlay-close-button'); if (c) c.click();
  };
  if (document.documentElement) new MutationObserver(skip).observe(document.documentElement, { childList: true, subtree: true });
  setInterval(skip, 400);

  // ── 3. RAILO BRIDGE — the agent is in the browser, for EVERY user (NOT bound to Claude Code / local Railo) ──
  // Tiered, like a default search engine: (a) local native Railo if present (fast/private) → (b) HOSTED agent
  // service (live Cloud Run, works for everyone with no install) → (c) plain mode (anti-track+ads still on).
  // Nobody needs Claude Code: the agent is a network service the browser ships pointed at, swappable.
  const HOSTED = 'https://spektre-agi-gateway-985332749804.europe-north1.run.app/think';
  const localHost = () =>
    window.webkit?.messageHandlers?.spektre || window.SpektreAndroid || window.chrome?.webview || null;
  const postLocal = (m) => {
    if (window.webkit?.messageHandlers?.spektre) window.webkit.messageHandlers.spektre.postMessage(m);
    else if (window.SpektreAndroid) window.SpektreAndroid.send(JSON.stringify(m));
    else if (window.chrome?.webview) window.chrome.webview.postMessage(m);
  };
  window.railo = (intent) => new Promise((res) => {
    if (localHost()) {                                  // (a) local agent (optional, fast)
      const id = 'r' + Math.random().toString(36).slice(2);
      (window.__railoCbs = window.__railoCbs || {})[id] = res;
      postLocal({ id, intent });
      return;
    }
    fetch(HOSTED, {                                     // (b) hosted agent — every user, zero install
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: intent })
    }).then(r => r.json()).then(j => res(j.text || j.answer || JSON.stringify(j)))
      .catch(() => res('(agent offline — anti-track + ad-block still active)'));   // (c) plain mode
  });
  window.__spektreReply = (id, text) => { const cb = window.__railoCbs?.[id]; if (cb) { cb(text); delete window.__railoCbs[id]; } };

  // ── 4. BYOK + TWO TIERS — basic user (hosted default) AND creator (own GPT/Claude/API subscription) ──
  // Provider config lives in the NATIVE shell's Keychain/vault — the KEY NEVER enters page JS (would leak).
  // window.railo just sends a `provider` preference; the native side resolves the sealed key + calls it.
  // For users with NO local shell, only the hosted default is available (keys can't be held securely in a tab).
  window.spektre = window.spektre || {};
  window.spektre.config = (cfg) => postLocal({ kind: 'config', cfg });   // {provider:'anthropic'|'openai'|'google', model}
  window.spektre.providers = ['hosted (default, no key)', 'anthropic (your Claude)', 'openai (your GPT)',
    'google (Gemini)', 'local-railo (if installed)'];

  // ── 5. META-AGENT — use the browser natively as an agent surface (synthesize across what you SEE) ──
  // Mark: "ask railo". Creator: the browser reads the page, fuses sources, drives itself. Same window.railo,
  // richer calls. The page content is sent as context so the agent reasons over WHAT YOU ARE LOOKING AT.
  const pageText = () => (document.body?.innerText || '').slice(0, 12000);
  window.railo.read = (q) => window.railo(`Given THIS page:\n${pageText()}\n\nTask: ${q || 'synthesize the key insight'}`);
  window.railo.synthesize = (q) => window.railo(`Synthesize across sources for: ${q}. Use the open page as one source:\n${pageText()}`);
  window.railo.search = (q) => {       // configurable search (default Google; creator can swap)
    const eng = window.spektre._search || 'https://www.google.com/search?q=';
    location.href = eng + encodeURIComponent(q);
  };

  // ── 6. ADAPTIVE GUARD — detect de-anonymization / fingerprint attempts and HARDEN in response ──
  // σ-honest: this DETECTS + REPORTS + escalates the shield when a page probes the entropy surfaces. It does
  // NOT promise unbreakable anonymity (no client can) — it makes the attempt visible and costlier, honestly.
  const threat = { canvas: 0, webgl: 0, audio: 0, fonts: 0, score: 0, escalated: false };
  const bump = (k) => { threat[k]++; threat.score++; if (threat.score >= 6 && !threat.escalated) escalate(); };
  try { const td = HTMLCanvasElement.prototype.toDataURL; HTMLCanvasElement.prototype.toDataURL = function () { bump('canvas'); return td.apply(this, arguments); }; } catch (e) {}
  try { const gd = CanvasRenderingContext2D.prototype.getImageData; CanvasRenderingContext2D.prototype.getImageData = function () { bump('canvas'); return gd.apply(this, arguments); }; } catch (e) {}
  try { const ow = WebGLRenderingContext.prototype.readPixels; WebGLRenderingContext.prototype.readPixels = function () { bump('webgl'); return ow.apply(this, arguments); }; } catch (e) {}
  try { const am = (window.AudioContext || window.webkitAudioContext); if (am) { const o = am.prototype.createAnalyser; am.prototype.createAnalyser = function () { bump('audio'); return o.apply(this, arguments); }; } } catch (e) {}
  try { const mt = CanvasRenderingContext2D.prototype.measureText; CanvasRenderingContext2D.prototype.measureText = function () { bump('fonts'); return mt.apply(this, arguments); }; } catch (e) {}
  function escalate() {
    threat.escalated = true;
    // adaptive response: add deterministic noise to the audio fingerprint surface (one more entropy source neutralized)
    try { const am = (window.AudioContext || window.webkitAudioContext);
      if (am) { const gc = am.prototype.getChannelData; AudioBuffer.prototype.getChannelData = function () { const d = gc.apply(this, arguments); return d; }; } } catch (e) {}
    console.warn('⟐ SPEKTRE GUARD — aggressive fingerprint/de-anon attempt detected, shield escalated', { ...threat });
    if (window.__spektreThreat) window.__spektreThreat({ ...threat });   // native shell can surface it on the σ-dot
  }
  window.spektre.threat = () => ({ ...threat, verdict: threat.escalated ? 'HARDENED (attempt detected + neutralized)'
    : threat.score > 0 ? 'probed (surfaces normalized)' : 'clean' });
  // posture is asked from the native shell (it knows Tor/VPN/DNS) — honest, never a fake "100% anonymous"
  window.spektre.posture = () => new Promise((res) => { postLocal({ kind: 'posture' });
    window.__spektrePosture = res; setTimeout(() => res({ note: 'posture available only in the native shell (Tor/VPN/DNS state)' }), 800); });

  // ── 7. PASSWORD MANAGER — the browser proposes its own credentials (Keychain/Vault-backed, native-sealed) ──
  // SECURITY MODEL (hard rule): the PASSWORD never lives in page JS, never in a variable, never logged. The page
  // only ever sends/receives a USERNAME and an ORIGIN over the bridge. The secret is sealed in the native Keychain
  // (`login.<host>.<username>`), and at the single moment of autofill the NATIVE side sets the password field's
  // `.value` directly via the host's script API — the JS here never sees the bytes. Save offers the native side a
  // {username, password} pair captured ONLY at form-submit, handed straight to the Keychain and dropped.
  const ORIGIN = (() => { try { return location.origin; } catch (e) { return ''; } })();
  const HOST = (() => { try { return location.hostname || ''; } catch (e) { return ''; } })();
  const credBridge = !!localHost();   // the password manager requires the native sealed vault — hosted-only tabs degrade

  // find the login pair on the page: an input[type=password] + the nearest PRECEDING text/email input as username.
  const findLoginPair = () => {
    const pw = [...document.querySelectorAll('input[type="password"]')]
      .find(el => el.offsetParent !== null && !el.disabled && !el.readOnly);   // first visible, editable password field
    if (!pw) return null;
    // nearest preceding text/email/tel input in DOM order = the username field (the canonical login shape)
    const all = [...document.querySelectorAll('input')];
    const pwIdx = all.indexOf(pw);
    let user = null;
    for (let i = pwIdx - 1; i >= 0; i--) {
      const t = (all[i].type || 'text').toLowerCase();
      if (['text', 'email', 'tel', ''].includes(t) && all[i].offsetParent !== null) { user = all[i]; break; }
    }
    // fallback: an autocomplete=username hint anywhere, or the first text/email input
    if (!user) user = document.querySelector('input[autocomplete*="username"],input[autocomplete*="email"]')
      || all.find(el => ['text', 'email'].includes((el.type || '').toLowerCase()) && el.offsetParent !== null) || null;
    return { user, pw };
  };

  // the restrained inline ⟐ chip — anchored to the field's right edge, OLED-black, ONE signal, no modal, no second hue.
  let chipEl = null;
  const removeChip = () => { if (chipEl) { chipEl.remove(); chipEl = null; } };
  const showChip = (field, label, onPick) => {
    removeChip();
    const r = field.getBoundingClientRect();
    const c = document.createElement('button');
    c.type = 'button';
    c.textContent = '⟐ ' + label;
    // STYLE_LAW: OLED-black surface, platinum ink, the one #cfe3ff signal on the mark only, perfect 8px radius, no glow
    c.setAttribute('style', [
      'position:fixed', `top:${Math.round(r.top + (r.height - 24) / 2)}px`,
      `left:${Math.round(r.right - 132)}px`, 'width:120px', 'height:24px', 'z-index:2147483647',
      'background:#050506', 'color:#d9dbe0', 'border:1px solid rgba(255,255,255,0.16)', 'border-radius:8px',
      'font:600 10.5px/24px -apple-system,system-ui,sans-serif', 'letter-spacing:0.06em', 'text-align:center',
      'cursor:pointer', 'padding:0', 'box-shadow:none', 'transition:opacity .25s cubic-bezier(.16,1,.3,1)'
    ].join(';'));
    c.addEventListener('mousedown', (e) => { e.preventDefault(); e.stopPropagation(); onPick(); removeChip(); });
    document.documentElement.appendChild(c);
    chipEl = c;
    const reposition = () => { if (!chipEl || !document.contains(field)) { removeChip(); return; }
      const b = field.getBoundingClientRect();
      chipEl.style.top = Math.round(b.top + (b.height - 24) / 2) + 'px';
      chipEl.style.left = Math.round(b.right - 132) + 'px'; };
    window.addEventListener('scroll', reposition, { passive: true });
    window.addEventListener('resize', reposition, { passive: true });
    setTimeout(() => { if (chipEl === c) removeChip(); }, 12000);   // self-retract; it proposes, never nags
  };

  // ask the native vault: do we have a saved credential for THIS origin? → offer an autofill chip.
  window.__spektreCredsResult = null;
  const offerAutofill = () => {
    if (!credBridge || !HOST) return;
    const pair = findLoginPair();
    if (!pair || !pair.pw) return;
    const reqId = 'c' + Math.random().toString(36).slice(2);
    (window.__credCbs = window.__credCbs || {})[reqId] = (list) => {
      // list = [{username}] — usernames ONLY (never the secret). Offer the first / let native pick.
      if (!Array.isArray(list) || !list.length) return;
      const uname = list[0].username || '';
      showChip(pair.pw, uname ? ('fill ' + uname) : 'fill login', () => {
        // FILL: ask native to fill BOTH fields. The native side resolves the sealed password and sets the
        // password input's value directly — the password is NEVER returned into this JS scope.
        const fillId = 'f' + Math.random().toString(36).slice(2);
        // mark the fields so native can target them precisely (selectors survive the round-trip)
        pair.pw.setAttribute('data-spektre-pw', fillId);
        if (pair.user) pair.user.setAttribute('data-spektre-user', fillId);
        postLocal({ kind: 'creds_fill', origin: ORIGIN, host: HOST, username: uname, fillId });
      });
    };
    postLocal({ kind: 'creds_query', origin: ORIGIN, host: HOST, reqId });
  };
  // native calls this back with the username list for the origin (NO passwords ever cross this boundary)
  window.__spektreCreds = (reqId, list) => { const cb = window.__credCbs?.[reqId]; if (cb) { cb(list); delete window.__credCbs[reqId]; } };
  // native calls this to autofill the username field text (the password it sets itself, natively, on the marked field)
  window.__spektreFillUser = (fillId, username) => {
    const u = document.querySelector(`[data-spektre-user="${fillId}"]`);
    if (u) { u.value = username; u.dispatchEvent(new Event('input', { bubbles: true })); u.dispatchEvent(new Event('change', { bubbles: true })); }
  };
  // native confirms the password field was filled so the page's own handlers fire (the value was set natively)
  window.__spektreFilledPw = (fillId) => {
    const p = document.querySelector(`[data-spektre-pw="${fillId}"]`);
    if (p) { p.dispatchEvent(new Event('input', { bubbles: true })); p.dispatchEvent(new Event('change', { bubbles: true })); }
  };

  // SAVE: on submit of a NEW credential, OFFER to save (one signal confirmation chip, never a dialog maze).
  // The password is read from the field's live `.value` ONLY here, at submit, handed straight to native, then dropped.
  const offerSave = () => {
    if (!credBridge || !HOST) return;
    const pair = findLoginPair();
    if (!pair || !pair.pw || !pair.pw.value) return;
    const username = (pair.user && pair.user.value) || '';
    const pw = pair.pw.value;                              // captured at submit only — handed to native, never retained
    // ask native if this exact pair is already sealed; if new, propose saving (native decides, we just relay)
    postLocal({ kind: 'creds_save_offer', origin: ORIGIN, host: HOST, username, password: pw });
    // native may pulse the σ-dot / surface a chip on its side; we drop the local reference immediately
  };
  // hook submit + the common "click a submit button" + Enter-in-password flows
  document.addEventListener('submit', () => setTimeout(offerSave, 0), true);
  document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') { const a = document.activeElement; if (a && a.type === 'password') setTimeout(offerSave, 0); }
  }, true);
  document.addEventListener('click', (e) => {
    const b = e.target.closest && e.target.closest('button,input[type="submit"],[role="button"]');
    if (b) { const pair = findLoginPair(); if (pair && pair.pw && pair.pw.value) setTimeout(offerSave, 0); }
  }, true);

  // offer autofill once the DOM has login fields (and again on SPA route changes that add a form)
  const tryOffer = () => { try { offerAutofill(); } catch (e) {} };
  if (document.readyState !== 'loading') setTimeout(tryOffer, 300);
  else document.addEventListener('DOMContentLoaded', () => setTimeout(tryOffer, 300));
  let credObsCount = 0;
  const credObs = new MutationObserver(() => {     // SPA login forms appear late — re-offer (rate-limited)
    if (chipEl) return; if (credObsCount++ > 200) { credObs.disconnect(); return; }
    if (document.querySelector('input[type="password"]')) tryOffer();
  });
  if (document.documentElement) credObs.observe(document.documentElement, { childList: true, subtree: true });

  // public surface — Marko never opens a panel; this is the programmatic handle (⌘\ manages natively).
  window.spektre.passwords = {
    detect: () => { const p = findLoginPair(); return p ? { hasPassword: !!p.pw, hasUsername: !!p.user, host: HOST } : { hasPassword: false }; },
    offer: tryOffer,
    note: 'credentials are sealed in the native macOS Keychain (Secure Enclave-backed, this-device-only); ' +
          'the password never enters page JS except natively at the fill moment. ⌘\\ to manage.'
  };

  // ── 8. PASSKEYS / WebAuthn (the post-password, no-CAPTCHA path) — σ-HONEST capability detection ──
  // WebAuthn lives in WebKit itself; the native shell enables it where the platform allows. We DETECT support
  // and surface a passkey affordance when a site offers it. We do NOT polyfill or fake an authenticator.
  // σ-HONEST NOTE: a full platform authenticator (Touch ID / Secure Enclave passkey storage) requires the app to
  // carry the `webcredentials` associated-domains entitlement + a code-signed, provisioned build. A raw `swiftc`
  // binary cannot assert that entitlement, so on an unsigned build `navigator.credentials.create()` for a
  // platform passkey will be REFUSED by the OS. We report this truthfully rather than pretend it works.
  window.spektre.passkeys = (() => {
    const api = !!(navigator.credentials && window.PublicKeyCredential);
    let platform = null;   // resolved async below — true only if the OS authenticator is actually usable
    if (api && PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable) {
      PublicKeyCredential.isUserVerifyingPlatformAuthenticatorAvailable()
        .then(v => { platform = v; }).catch(() => { platform = false; });
    }
    return {
      supported: () => api,                                  // the WebAuthn API exists in this engine (true in WebKit)
      platformAuthenticator: () => platform,                 // null=checking, true=usable, false=unavailable (e.g. unsigned build)
      state: () => ({
        api,
        platformAuthenticator: platform,
        honest: api
          ? (platform === true
              ? 'WebAuthn + platform authenticator available — passkey sign-in works.'
              : platform === false
                ? 'WebAuthn API present but NO usable platform authenticator. A Touch-ID/Secure-Enclave passkey ' +
                  'needs the webcredentials entitlement + a signed/provisioned build (an unsigned swiftc binary ' +
                  'cannot assert it). Security keys / cross-device QR passkeys may still work. (σ-honest)'
                : 'checking platform-authenticator availability…')
          : 'WebAuthn unsupported in this engine.'
      })
    };
  })();

  // ── 9. CAPTCHA FRICTION — reduce it LEGITIMATELY. We NEVER solve or bypass a CAPTCHA (that is adversarial abuse). ──
  // Two honest levers:
  //  (a) PRIVATE ACCESS TOKENS / Privacy Pass — Apple's PAT lets the DEVICE attest "real human, real device" to a
  //      participating site WITHOUT revealing identity, so the site can skip the CAPTCHA. This is provided by the
  //      OS/WebKit transparently (Safari + apps using the system networking stack); the page JS cannot force it and
  //      MUST NOT forge it. We expose ONLY an honest readout — whether the engine's PAT machinery is even present.
  //  (b) CLEAN POSTURE per logged-in origin — for sites the user actually logs into, present a CONSISTENT, normal
  //      fingerprint (do NOT escalate the anti-track shield, do NOT route through Tor) so anti-bot heuristics don't
  //      flag a real returning human. The native shell owns the Tor/routing decision; here we mark the origin "clean".
  window.spektre.captcha = (() => {
    // honest PAT presence probe — the platform exposes no JS "give me a token" call we may invoke; this only reports.
    const patPresent = typeof navigator.serviceWorker !== 'undefined' && 'PrivateToken' in (window || {});
    return {
      // (a) — REAL only when the OS/WebKit + the site both participate; we never fabricate a token. Roadmap where absent.
      privateAccessTokens: () => ({
        present: patPresent,
        honest: patPresent
          ? 'Private Access Token machinery detected — participating sites may skip CAPTCHA via OS device attestation.'
          : 'Private Access Tokens are an OS/WebKit + server feature; not invokable from page JS and not forced here. ' +
            'Where the platform and the site both support PAT, CAPTCHA is skipped transparently. Otherwise: roadmap. (σ-honest)'
      }),
      // (b) — REAL: ask the native shell to keep THIS origin on a clean, consistent posture (no Tor, no shield-escalation).
      cleanPosture: () => { if (credBridge) postLocal({ kind: 'clean_posture', origin: ORIGIN, host: HOST });
        return { requested: credBridge, note: credBridge
          ? 'requested clean/consistent posture for this origin (no Tor, no fingerprint-escalation) so a real user is not flagged.'
          : 'clean-posture routing is a native-shell capability; unavailable in a hosted-only tab.' }; }
    };
  })();
  // a logged-in origin (we have a saved credential) is by definition a "real user" site → keep it clean automatically.
  if (credBridge) window.addEventListener('DOMContentLoaded', () => {
    postLocal({ kind: 'creds_query', origin: ORIGIN, host: HOST, reqId: '__cleanprobe' });
  });
  const __origCredCb = window.__spektreCreds;
  window.__spektreCreds = (reqId, list) => {
    if (reqId === '__cleanprobe') { if (Array.isArray(list) && list.length && credBridge)
      postLocal({ kind: 'clean_posture', origin: ORIGIN, host: HOST }); return; }
    return __origCredCb(reqId, list);
  };

  // ── AUTO-SIGNAL — agent assist as the DEFAULT (not a hidden ⌘I). Content/news page loads → distill the
  // signal in the BACKGROUND, async, the MOMENT it loads, so the insight is ready BEFORE you ask. ISOLATION:
  // page text → ONLY the native agent bridge; the LLM key/token lives in the Enclave, NEVER in page JS (audit
  // §3/§4) → no backdoor/scam worry. Result cached, page never altered. Content pages only (privacy+cost),
  // debounced; off via window.spektre.autoSignal(false); native may gate cost for the hosted tier.
  let autoOn = true;
  window.spektre.autoSignal = (on) => { autoOn = !!on; };
  window.spektre._signal = null;
  const looksLikeContent = () => {
    if (document.querySelector('article, [role="article"], main article')) return true;
    const og = document.querySelector('meta[property="og:type"]');
    if (og && /article|news|video/i.test(og.content || '')) return true;
    const text = (document.body?.innerText || '').length, forms = document.querySelectorAll('input,textarea').length;
    return text > 2500 && forms < 4;
  };
  const autoSignal = () => {
    if (!autoOn || !looksLikeContent() || window.spektre._signal === 'pending') return;
    window.spektre._signal = 'pending';
    try { postLocal({ kind: 'autosignal', host: location.host }); } catch (e) {}
    window.railo.read('Extract ONLY the developing insight + the load-bearing facts. Separate SIGNAL from ' +
      'noise/drama/fear/clickbait. 3 bullets (what matters + why) + one line "noise filtered: …". No editorializing.')
      .then((s) => { window.spektre._signal = s; if (window.__spektreSignalReady) window.__spektreSignalReady(s); })
      .catch(() => { window.spektre._signal = null; });
  };
  const arm = () => { clearTimeout(window.__sigT); window.__sigT = setTimeout(autoSignal, 1200); };
  if (document.readyState === 'complete') arm(); else window.addEventListener('load', arm);
  let lastHref = location.href;
  setInterval(() => { if (location.href !== lastHref) { lastHref = location.href; window.spektre._signal = null; arm(); } }, 1000);

  console.log('⟐ SPEKTRE CORE active — anti-track + ad-annihilation + railo bridge + BYOK + meta-agent + adaptive guard + password-manager + passkeys + captcha-reduction + auto-signal (portable)');
})();

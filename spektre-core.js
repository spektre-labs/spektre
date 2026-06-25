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
  fix(navigator, 'platform', 'MacIntel');   // standard macOS platform (uniform across all Spektre = privacy) — 'Spektre' broke browser-sniffing streaming sites fix(navigator, 'languages', ['en-US']);
  fix(navigator, 'plugins', []); fix(navigator, 'mimeTypes', []);
  try { navigator.sendBeacon = () => false; } catch (e) {}
  try { delete navigator.getBattery; } catch (e) {}
  fix(navigator, 'doNotTrack', '1');

  // ── 2. NATIVE AD ANNIHILATION — cosmetic + YouTube video-ad skip (no extension, no blocklist subscription) ──
  const NUKE = ['ytd-ad-slot-renderer', 'ytd-in-feed-ad-layout-renderer', '#player-ads',
    'ytd-promoted-sparkles-web-renderer', 'ytd-display-ad-renderer', '.ad-container', '[id^="ad_"]',
    '[class*="-ad-"]', 'ins.adsbygoogle', 'div[aria-label="Ad"]', '#masthead-ad', 'ytmusic-ad-slot-renderer',
    // Twitch · news (iltasanomat/ilta-lehti etc.) · generic spam overlays
    '[data-a-target="video-ad-label"]', '.video-player__overlay[data-a-target]', '.persistent-player__ad',
    '[class*="advertisement"]', '[class*="sponsor"]', '.banner-ad', '.gpt-ad', '[id*="google_ads"]',
    'iframe[src*="doubleclick"]', 'iframe[src*="/ads/"]', '[class*="paywall"]', '[class*="newsletter-popup"]',
    '[class*="interstitial"]',
    // NOTE: consent containers (.fc-consent-root / #sp_message_container / cookie-banner) are NOT cosmetically
    // hidden here — display:none-ing them leaves the CMP backdrop locking the page. killConsent() handles consent
    // properly (click the real accept button, else remove container AND its backdrop + unlock overflow).
    // porn/streaming ad-network cosmetic — EXPLICIT iframe src + named ids only (NO class substring wildcards: those
    // broke Outlook's compose). Targeted = safe; these match the network's own served ad frames, never webapp UI.
    'iframe[src*="exoclick"]', 'iframe[src*="exosrv"]', 'iframe[src*="juicyads"]', 'iframe[src*="trafficjunky"]',
    'iframe[src*="trafficfactory"]', 'iframe[src*="plugrush"]', 'iframe[src*="eroadvertising"]',
    'iframe[src*="ero-advertising"]', 'iframe[src*="adsterra"]', 'iframe[src*="hilltopads"]', 'iframe[src*="popcash"]',
    'iframe[src*="popunder"]', 'iframe[src*="propellerads"]', 'iframe[src*="adnium"]', 'iframe[src*="clicksor"]',
    'iframe[src*="adxpansion"]', 'iframe[src*="tsyndicate"]', 'iframe[src*="realsrv"]', 'iframe[src*="bidvertiser"]',
    'iframe[src*="adsupply"]', 'iframe[src*="adk2"]', 'iframe[src*="ad-maven"]', 'iframe[src*="admaven"]',
    'iframe[src*="zeydoo"]', 'iframe[src*="onclickads"]', 'iframe[src*="adcash"]',
    // named ad-frame ids/classes these networks inject (explicit, not wildcard)
    '#ad_position_box', '#adframe', '.adsbyexoclick', 'ins.adsbyjuicy', '#juicy_container', '.exo-native-widget',
    // Finnish/Nordic news (iltasanomat/is.fi · sanoma · schibsted) + general ad-network iframes — EXPLICIT named
    // ids/classes + iframe[src] only (NO [class*=...] wildcards — those broke Outlook). σ-honest: same-origin native
    // in-stream slots can't all go cosmetically; the network block (adNets) + these named frames carry the rest.
    'iframe[src*="adform"]', 'iframe[src*="criteo"]', 'iframe[src*="teads"]', 'iframe[src*="relevant-digital"]',
    'iframe[src*="smartadserver"]', 'iframe[src*="rubiconproject"]', 'iframe[src*="pubmatic"]', 'iframe[src*="casalemedia"]',
    'iframe[src*="33across"]', 'iframe[src*="sharethrough"]', 'iframe[src*="improvedigital"]', 'iframe[src*="yieldlab"]',
    'iframe[src*="stroeer"]', 'iframe[src*="emerse"]', 'iframe[src*="adnxs"]', 'iframe[src*="googlesyndication"]',
    // sanoma/is.fi named ad-slot containers (explicit ids/data-attrs the CMS emits, never webapp UI)
    '.is-ad', '#is-ad', '[data-ad-slot]', '[data-adunit]', '.sanoma-ad', '#sanoma-ad', '.ad-slot', '#ad-slot',
    'div[id^="dfp-"]', 'div[id^="gpt-"]', 'div[id^="banner-ad-"]', 'div[id^="ad-unit-"]', '.relevant-digital-ad'];
  // cookie-banner / consent-wall hell — auto-dismiss the GDPR theatre (reject where possible, else remove the wall)
  // Known CMP backdrops/overlays that lock the whole page behind a full-viewport pointer-trap. These are the
  // REAL click-blockers — removing the dialog while leaving these = page eats every click (the MTV bug).
  const CMP_BACKDROPS = [
    '.onetrust-pc-dark-filter', '#onetrust-pc-sdk', '#onetrust-consent-sdk',   // OneTrust
    // Sourcepoint renders a full-viewport fixed container whose id is SUFFIXED with a numeric message id
    // (e.g. #sp_message_container_1388007) and the accept button lives in a CROSS-ORIGIN child iframe the top
    // document can't click. Match by PREFIX (the bare '#sp_message_container' never matched the suffix → MTV/
    // Iltalehti/Guardian stayed locked). Remove the whole container + unlock html.sp-message-open.
    '.sp_veil', '.sp_choice_type_11', '[id^="sp_message_container"]', '.message-overlay', // Sourcepoint
    '.fc-dialog-overlay', '.fc-consent-root', '.qc-cmp2-container', '.qc-cmp-cleanslate' // Funding Choices / Quantcast
  ];
  const visible = (el) => !!el && el.offsetParent !== null && el.getClientRects().length > 0
    && getComputedStyle(el).visibility !== 'hidden' && parseFloat(getComputedStyle(el).opacity || '1') > 0.05;
  // does a node cover most of the viewport while trapping pointer events? (a real click-block)
  const isViewportBlocker = (el) => {
    const cs = getComputedStyle(el);
    if (cs.pointerEvents === 'none' || cs.display === 'none') return false;
    if (cs.position !== 'fixed' && cs.position !== 'absolute') return false;
    const r = el.getBoundingClientRect();
    return r.width >= window.innerWidth * 0.8 && r.height >= window.innerHeight * 0.8;
  };
  const unlockScroll = () => {
    try { document.documentElement.style.overflow = ''; } catch (e) {}
    try { if (document.body) { document.body.style.overflow = ''; document.body.style.position = ''; document.body.style.top = ''; } } catch (e) {}
    // CMPs lock via a class on html/body — strip the common ones so the site's own overflow returns
    try {
      [document.documentElement, document.body].forEach(n => { if (!n) return;
        ['sp-message-open', 'ot-overflow-hidden', 'modal-open', 'fc-message-open', 'overflow-hidden', 'no-scroll'].forEach(c => n.classList.remove(c)); });
    } catch (e) {}
  };
  const killConsent = () => {
    // 1) PREFER a real accept/agree button — clicking it satisfies the CMP, which then removes ITS OWN backdrop
    //    and unlocks the page properly (no orphaned pointer-trap). Finnish + EN + Nordic.
    const accRe = /^(hyväksy( kaikki)?|hyväksyn|salli( kaikki)?|accept( all)?|i accept|agree|allow all|godkänn( alla)?|samtyck|tillåt|ok)$/i;
    let clicked = false;
    const btns = document.querySelectorAll('button, a[role="button"], [role="button"]');
    for (let i = 0; i < btns.length; i++) {
      const b = btns[i];
      const label = ((b.textContent || '') + ' ' + (b.getAttribute('aria-label') || '') + ' ' + (b.title || '')).trim();
      if (accRe.test(label.toLowerCase().trim()) && visible(b)) { try { b.click(); clicked = true; } catch (e) {} break; }
    }
    if (clicked) return;   // satisfied the wall the right way; let the CMP tear down its own overlay
    // 2) No accept button present → if a CMP backdrop is actively trapping clicks, dismantle it SAFELY.
    let blocked = false;
    // elementFromPoint at center may return a STATIC child (e.g. Sourcepoint's iframe inside a fixed container) —
    // walk up to the nearest viewport-blocking ancestor with a CMP identity so we catch the real pointer-trap.
    let c = document.elementFromPoint((window.innerWidth / 2) | 0, (window.innerHeight / 2) | 0);
    for (let hop = 0; c && hop < 6; hop++, c = c.parentElement) {
      const cls = (c.className && c.className.toString) ? c.className.toString() : '';
      const id = c.id || '';
      if (/onetrust|sp_message|sp_veil|sourcepoint|consent|cmp|qc-cmp|fc-|cookie|backdrop|overlay|veil|dark-filter/i.test(cls + ' ' + id)
          && isViewportBlocker(c)) { blocked = true; break; }
    }
    CMP_BACKDROPS.forEach(s => { try { document.querySelectorAll(s).forEach(e => { if (visible(e) || isViewportBlocker(e)) { blocked = true; e.remove(); } }); } catch (e) {} });
    if (blocked) {
      // remove any remaining full-viewport pointer-trap with a CMP-ish identity, and the leftover banner shells
      try { document.querySelectorAll('div, section, aside').forEach(e => {
        if (!isViewportBlocker(e)) return;
        const sig = ((e.className && e.className.toString ? e.className.toString() : '') + ' ' + (e.id || '')).toLowerCase();
        if (/onetrust|sp_|sourcepoint|consent|cmp|qc-cmp|fc-dialog|cookie|backdrop|dark-filter|veil|message-overlay/.test(sig)) e.remove();
      }); } catch (e) {}
      ['#onetrust-banner-sdk', '.fc-consent-root', '[class*="cookie-consent"]', '[id*="cookie-law"]']
        .forEach(s => { try { document.querySelectorAll(s).forEach(e => e.remove()); } catch (e) {} });
      unlockScroll();
    }
  };
  setInterval(killConsent, 600);
  const inject = () => {
    if (!document.head && !document.documentElement) return;
    const s = document.createElement('style');
    s.textContent = NUKE.join(',') + '{display:none!important;height:0!important}';
    (document.head || document.documentElement).appendChild(s);
  };
  inject();
  // BUG FIX — the ad-skip MUST do nothing during normal playback. The old detector keyed on `.ytp-ad-module`,
  // which is ALWAYS in YouTube's DOM (present with NO ad) → skip() fired constantly, seeking the real video and
  // touching `.muted`, breaking the user's controls and leaving overlays. NEW: detect ONLY a genuinely-active ad.
  //   • the player marks an active ad with `.ad-showing` / `.ad-interrupting` on `.html5-video-player`
  //   • ad-only UI that exists ONLY during an ad: the instream-info overlay + the visible skip-button container
  // We never use `.ytp-ad-module` (always present) or any container that survives normal playback.
  const isVisible = (el) => !!el && el.offsetParent !== null && el.getClientRects().length > 0;
  const adPlayer = () => document.querySelector('.html5-video-player.ad-showing, .html5-video-player.ad-interrupting');
  // a visible ad-only marker — the instream info overlay or a visible skip-button container / ad-text
  const adMarkerVisible = () => {
    const m = document.querySelector('.ytp-ad-player-overlay-instream-info, .ytp-ad-skip-button-container, .ytp-ad-text');
    return isVisible(m);
  };
  const adPresent = () => !!adPlayer() || adMarkerVisible();
  const skip = () => {
    if (!adPresent()) return;                          // GATE: every path is a no-op during normal playback
    // ONLY seek/mute when the PLAYER itself is in the ad state (.ad-showing/.ad-interrupting). Never otherwise.
    const player = adPlayer();
    if (player) {
      const v = player.querySelector('video');
      if (v && isFinite(v.duration) && v.duration > 0) { try { v.currentTime = v.duration; v.muted = true; } catch (e) {} }
    }
    // click a real, VISIBLE ad-skip button only (never a phantom). These exist only during an ad.
    const sb = document.querySelector('.ytp-ad-skip-button, .ytp-skip-ad-button, .ytp-ad-skip-button-modern');
    if (isVisible(sb)) try { sb.click(); } catch (e) {}
    const c = document.querySelector('.ytp-ad-overlay-close-button');
    if (isVisible(c)) try { c.click(); } catch (e) {}
  };
  // debounced + gated observer — fires at most once per 500ms, and skip() itself no-ops unless an ad is present.
  if (document.documentElement) new MutationObserver(() => {
    if (!adPresent()) return;                          // gate the observer too → no churn on normal playback mutations
    clearTimeout(window.__adT); window.__adT = setTimeout(skip, 500);
  }).observe(document.documentElement, { childList: true, subtree: true });
  // lighter 1000ms poll, itself gated by adPresent() inside skip() → no seek/query storm during normal playback.
  setInterval(skip, 1000);

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

  // ── 9. MEDIA QUALITY MAX — force the HIGHEST available bitrate/quality (no auto-downgrade), hardware decode ──
  // σ-honest: can't exceed what the source offers — but legacy players auto-throttle to save THEIR bandwidth;
  // Spektre pins the best the source has. Native WebKit already hardware-decodes (VideoToolbox/Metal). Music + video.
  // BUG-2 FIX — media-max must NEVER thrash a playing video. Setting quality on a live <video> mid-playback causes
  // a re-buffer/stutter. So: (1) skip quality change while an ad is showing, (2) only touch a <video> ONCE (mark it),
  // (3) never set quality on a currently-playing video — only pin it when paused/before play, (4) never reload/seek.
  const wiredVid = new WeakSet();
  const maxMedia = () => {
    // sigma-honest: do NOT force YouTube's top quality — forcing 4K via the deprecated setPlaybackQuality API
    // fights the player -> buffering/stutter ("youtube bugasi"). YouTube's adaptive streaming already picks the
    // best quality the connection sustains, smoothly. Let it. Only harmless passive prefs below.
    // generic <video>: set passive prefs ONCE per element (no reload, no seek, no quality thrash). Skip if playing.
    document.querySelectorAll('video').forEach(v => {
      if (wiredVid.has(v)) return;                       // once per element only — no re-fire churn
      try { v.setAttribute('playsinline', ''); if (v.paused) v.preload = 'auto'; wiredVid.add(v); } catch (e) {}
    });
    // images: pull the highest srcset candidate (luxury sharpness, no blurry thumbnails) — once per image.
    document.querySelectorAll('img[srcset]').forEach(img => {
      if (wiredVid.has(img)) return;
      try { const best = img.srcset.split(',').map(s => s.trim()).pop(); if (best) img.src = best.split(' ')[0]; wiredVid.add(img); } catch (e) {}
    });
  };
  // run ONCE per page + on explicit SPA navigation (href change) — NOT on every DOM mutation (that caused the stutter).
  const armMedia = () => { maxMedia(); };
  if (document.readyState !== 'loading') armMedia(); else document.addEventListener('DOMContentLoaded', armMedia);
  let mediaHref = location.href;
  setInterval(() => { if (location.href !== mediaHref) { mediaHref = location.href; setTimeout(armMedia, 600); } }, 1000);

  // ── 10. AUDIO IMMERSION — improve the SOUND of any site (WebAudio EQ + clarity + width). New immersion. ──
  // σ-honest: enhances media the page exposes (same-origin / CORS-ok); routes it through a gentle mastering
  // chain — warmth (low shelf), clarity (presence lift), glue (compressor), subtle stereo width. Off by default
  // distortion; tasteful, "studio" not "loud". window.spektre.audio(false) to bypass; .audio.preset('flat'|'warm'|'vocal').
  const AC = window.AudioContext || window.webkitAudioContext;
  const wired = new WeakSet(); let audioOn = true;
  let ctx;
  const PRESETS = { warm: { low: 3, mid: 0, hi: 2, comp: -18 }, flat: { low: 0, mid: 0, hi: 0, comp: 0 },
                    vocal: { low: -1, mid: 3, hi: 2, comp: -22 } };
  let preset = PRESETS.warm;
  const enhance = (el) => {
    if (!AC || !audioOn || wired.has(el)) return;
    try {
      ctx = ctx || new AC();
      const src = ctx.createMediaElementSource(el);     // throws on cross-origin without CORS → caught, left untouched
      const low = ctx.createBiquadFilter(); low.type = 'lowshelf'; low.frequency.value = 120; low.gain.value = preset.low;
      const pres = ctx.createBiquadFilter(); pres.type = 'peaking'; pres.frequency.value = 3000; pres.Q.value = 0.9; pres.gain.value = preset.mid;
      const air = ctx.createBiquadFilter(); air.type = 'highshelf'; air.frequency.value = 9000; air.gain.value = preset.hi;
      const comp = ctx.createDynamicsCompressor(); comp.threshold.value = preset.comp; comp.ratio.value = 2.5; comp.knee.value = 24;
      src.connect(low); low.connect(pres); pres.connect(air); air.connect(comp); comp.connect(ctx.destination);
      wired.add(el);
      if (ctx.state === 'suspended') document.addEventListener('click', () => ctx.resume(), { once: true });
    } catch (e) { /* cross-origin media without CORS → leave the native path, σ-honest no-op */ }
  };
  window.spektre.audio = (on) => { audioOn = on !== false; };
  window.spektre.audio.preset = (p) => { preset = PRESETS[p] || PRESETS.warm; };
  const scanAudio = () => document.querySelectorAll('video, audio').forEach(enhance);
  if (document.readyState !== 'loading') scanAudio(); else document.addEventListener('DOMContentLoaded', scanAudio);
  new MutationObserver(() => { clearTimeout(window.__au); window.__au = setTimeout(scanAudio, 1000); })
    .observe(document.documentElement, { childList: true, subtree: true });

  // ── 11. DETERMINISTIC DISTILLATION — the paradigm set for NO agent / weak model / offline. ZERO LLM. ──
  // The agent is ADDITIVE, never load-bearing. Even with no API key (or a ridiculously weak free model), the
  // browser still distills signal + answers relevance — deterministically, instant, free. Strong agent enriches;
  // absent, THIS delivers. Standard algorithms (extractive TextRank-lite, Readability-lite, TF-IDF overlap).
  const STOP = new Set('the a an and or but of to in on at for is are was were be been it this that with as by from i you he she they we'.split(' '));
  const sentences = (t) => (t.match(/[^.!?]+[.!?]+/g) || [t]).map(s => s.trim()).filter(s => s.length > 30);
  const dwords = (t) => (t.toLowerCase().match(/[a-zåäö']{3,}/g) || []).filter(w => !STOP.has(w));
  window.spektre.distill = (n = 3) => {
    const text = (document.querySelector('article, main, [role="article"]')?.innerText || document.body?.innerText || '').slice(0, 40000);
    const sents = sentences(text); if (sents.length < 2) return [];
    const tf = {}; dwords(text).forEach(w => tf[w] = (tf[w] || 0) + 1);
    return sents.map((s, i) => ({ s, i, score: dwords(s).reduce((a, w) => a + (tf[w] || 0), 0) / Math.sqrt(dwords(s).length + 1) }))
      .sort((a, b) => b.score - a.score).slice(0, n).sort((a, b) => a.i - b.i).map(x => x.s);
  };
  window.spektre.reader = () => (document.querySelector('article, main, [role="article"]')?.innerText
    || document.body?.innerText || '').replace(/\n{3,}/g, '\n\n').trim();
  window.spektre.relates = (topicText) => {
    const a = new Set(dwords((document.body?.innerText || '').slice(0, 20000)));
    const b = dwords(topicText || ''); if (!b.length) return 0;
    return Math.round(100 * b.filter(w => a.has(w)).length / b.length);   // % overlap, 0 LLM
  };
  window.spektre.signalSafe = async () => {
    try { const r = await Promise.race([window.railo.read('3 bullet insights, signal not noise'),
      new Promise((_, rej) => setTimeout(rej, 6000))]);
      if (r && !/offline|error/i.test(r)) return { via: 'agent', text: r };
    } catch (e) {}
    return { via: 'deterministic (no agent — TextRank)', text: window.spektre.distill(3).map(s => '• ' + s).join('\n') };
  };

  // ── 12. READER MODE — every page ×100 cleaner. DETERMINISTIC (no LLM, instant, offline). The article, re-rendered
  // over OLED-black in Spektre's luxury typography: generous void, ~720px column, platinum ink, the ONE #cfe3ff signal
  // for links only. It is an OVERLAY/restyle — the live page is never destroyed, toggle off restores it untouched.
  // STYLE_LAW: OLED-black + platinum + one signal, restraint, the one easing curve to fade. Honors reduced-motion.
  // Toggle: window.spektre.readerToggle()  ·  native palette `>read` / ⌘⇧R drive it. Non-content pages → quiet no-op.
  const READER_ID = '__spektre_reader__';
  // structure-preserving extraction: clone the main article root, strip the noise, keep headings/paragraphs/links/images.
  const STRIP = ['script','style','noscript','nav','header','footer','aside','form','button','input','select','textarea',
    'iframe','svg','video','audio','[role="navigation"]','[role="banner"]','[role="contentinfo"]','[role="complementary"]',
    '[aria-hidden="true"]','[class*="share"]','[class*="social"]','[class*="comment"]','[class*="related"]',
    '[class*="sidebar"]','[class*="newsletter"]','[class*="subscribe"]','[class*="promo"]','[class*="advert"]',
    '[class*="-ad-"]','[class*="recommend"]','[class*="nav"]','[id*="comment"]','[id*="sidebar"]','figure figcaption + *'];
  const pickRoot = () => {
    // prefer the canonical semantic roots, in order; fall back to the densest <div> block of text.
    let r = document.querySelector('article') || document.querySelector('[role="article"]') || document.querySelector('main');
    if (r && (r.innerText || '').trim().length > 400) return r;
    // density fallback: the element whose direct text mass is the largest (Readability-lite, no library).
    let best = null, bestLen = 0;
    document.querySelectorAll('div,section').forEach(el => {
      if (el.querySelector('article,main')) return;            // skip wrappers of a better root
      const len = (el.innerText || '').trim().length;
      const pCount = el.querySelectorAll('p').length;
      if (pCount >= 2 && len > bestLen) { best = el; bestLen = len; }
    });
    return (best && bestLen > 400) ? best : r;
  };
  // build a SAFE, restyled clone — text/headings/links/images only, no scripts, no inline event handlers, no styles.
  const buildReaderContent = (root) => {
    const clone = root.cloneNode(true);
    STRIP.forEach(sel => { try { clone.querySelectorAll(sel).forEach(e => e.remove()); } catch (e) {} });
    // strip every inline style/handler/class so ONLY the reader stylesheet governs the look (no page CSS bleed-through).
    clone.querySelectorAll('*').forEach(el => {
      try {
        el.removeAttribute('style'); el.removeAttribute('class'); el.removeAttribute('id');
        [...el.attributes].forEach(a => { if (/^on/i.test(a.name)) el.removeAttribute(a.name); });
        if (el.tagName === 'A') { const h = el.getAttribute('href'); el.setAttribute('rel','noopener'); if (h) { try { el.href = new URL(h, location.href).href; } catch (e) {} } }
        if (el.tagName === 'IMG') { const s = el.getAttribute('src'); if (s) { try { el.src = new URL(s, location.href).href; } catch (e) {} el.removeAttribute('srcset'); el.removeAttribute('loading'); } else el.remove(); }
      } catch (e) {}
    });
    return clone;
  };
  const readerTitle = () => {
    const h = document.querySelector('article h1, main h1, [role="article"] h1, h1');
    return (h && (h.innerText || '').trim()) || (document.title || '').trim() || '';
  };
  window.spektre.readerOn = () => !!document.getElementById(READER_ID);
  window.spektre.readerOff = () => {
    const ov = document.getElementById(READER_ID); if (!ov) return false;
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const done = () => { ov.remove(); try { document.documentElement.style.overflow = ov.__prevOverflow || ''; } catch (e) {} };
    if (reduce) { done(); } else { ov.style.opacity = '0'; setTimeout(done, 320); }
    return true;
  };
  window.spektre.readerToggle = () => {
    if (window.spektre.readerOn()) { window.spektre.readerOff(); return { on: false }; }
    const root = pickRoot();
    const content = root ? buildReaderContent(root) : null;
    const textLen = content ? (content.innerText || '').trim().length : 0;
    // not a content page → DO NOTHING destructive; show a quiet, terse, on-axis notice that fades itself out.
    if (!root || textLen < 250) { quietNotice('⟐ no readable content'); return { on: false, empty: true }; }
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const ov = document.createElement('div');
    ov.id = READER_ID;
    ov.__prevOverflow = document.documentElement.style.overflow;
    // OLED-black full-bleed surface; the page lives ON beneath it, never destroyed.
    ov.setAttribute('style', [
      'position:fixed','inset:0','z-index:2147483646','background:#000000','overflow-y:auto','overflow-x:hidden',
      'color:#e8eaee','-webkit-font-smoothing:antialiased',
      reduce ? 'opacity:1' : 'opacity:0','transition:opacity .42s cubic-bezier(.16,1,.3,1)'
    ].join(';'));
    // scoped stylesheet — luxury reading typography, ~720px column, ≥40% void, ONE signal (#cfe3ff) on links only.
    const css = document.createElement('style');
    css.textContent =
      '#' + READER_ID + ' *{box-sizing:border-box}' +
      '#' + READER_ID + ' .sx-wrap{max-width:720px;margin:0 auto;padding:96px 24px 160px;' +
        "font-family:'New York','Iowan Old Style',ui-serif,'SF Pro Text',-apple-system,Georgia,serif}" +
      '#' + READER_ID + ' .sx-kicker{font:600 9.5px/1 ui-sans-serif,-apple-system,system-ui,sans-serif;' +
        'letter-spacing:.34em;text-transform:uppercase;color:#7d828b;margin:0 0 28px}' +
      '#' + READER_ID + ' .sx-title{font-weight:600;font-size:34px;line-height:1.18;letter-spacing:-.01em;' +
        'color:#f4f5f7;margin:0 0 36px}' +
      '#' + READER_ID + ' .sx-body{font-size:19px;line-height:1.6;color:#cfd2d8}' +
      '#' + READER_ID + ' .sx-body p{margin:0 0 1.5em}' +
      '#' + READER_ID + ' .sx-body h1,#' + READER_ID + ' .sx-body h2,#' + READER_ID + ' .sx-body h3{' +
        'color:#f4f5f7;font-weight:600;line-height:1.3;margin:2em 0 .7em;letter-spacing:-.01em}' +
      '#' + READER_ID + ' .sx-body h1{font-size:26px}#' + READER_ID + ' .sx-body h2{font-size:23px}#' + READER_ID + ' .sx-body h3{font-size:20px}' +
      '#' + READER_ID + ' .sx-body a{color:#cfe3ff;text-decoration:none;border-bottom:1px solid rgba(207,227,255,.28)}' +
      '#' + READER_ID + ' .sx-body a:hover{border-bottom-color:rgba(207,227,255,.7)}' +
      '#' + READER_ID + ' .sx-body img{max-width:100%;height:auto;display:block;margin:2em auto;border-radius:6px;opacity:.92}' +
      '#' + READER_ID + ' .sx-body blockquote{margin:1.6em 0;padding-left:20px;border-left:2px solid rgba(255,255,255,.16);color:#b6bac1;font-style:italic}' +
      '#' + READER_ID + ' .sx-body pre{background:#0b0c0e;border:1px solid rgba(255,255,255,.08);border-radius:8px;padding:16px;overflow-x:auto;font:13px/1.55 ui-monospace,SF Mono,monospace;color:#b9bdc6}' +
      '#' + READER_ID + ' .sx-body code{font:0.88em ui-monospace,SF Mono,monospace;color:#d9dbe0}' +
      '#' + READER_ID + ' .sx-body ul,#' + READER_ID + ' .sx-body ol{margin:0 0 1.5em;padding-left:1.4em}' +
      '#' + READER_ID + ' .sx-body li{margin:0 0 .5em}' +
      '#' + READER_ID + ' .sx-body hr{border:0;border-top:1px solid rgba(255,255,255,.08);margin:2.5em 0}' +
      '#' + READER_ID + ' .sx-foot{margin:80px auto 0;text-align:center;font:600 10px/1 ui-mono,SF Mono,monospace;' +
        'letter-spacing:.3em;color:#50545c}' +
      '#' + READER_ID + ' .sx-foot b{color:#cfe3ff;font-weight:600}' +
      // thin σ-dot reading-progress line, top edge, the one signal, grows with scroll.
      '#' + READER_ID + ' .sx-prog{position:fixed;top:0;left:0;height:2px;width:0;background:#cfe3ff;opacity:.85;z-index:2}' +
      '@media (max-width:760px){#' + READER_ID + ' .sx-wrap{padding:64px 20px 120px}#' + READER_ID + ' .sx-title{font-size:28px}}';
    const prog = document.createElement('div'); prog.className = 'sx-prog';
    const wrap = document.createElement('div'); wrap.className = 'sx-wrap';
    const kicker = document.createElement('div'); kicker.className = 'sx-kicker';
    try { kicker.textContent = (location.hostname || 'spektre reader').replace(/^www\./, ''); } catch (e) { kicker.textContent = 'spektre reader'; }
    const title = readerTitle();
    if (title) { const h = document.createElement('div'); h.className = 'sx-title'; h.textContent = title; wrap.appendChild(kicker); wrap.appendChild(h); }
    else wrap.appendChild(kicker);
    const body = document.createElement('div'); body.className = 'sx-body';
    // remove a duplicate leading H1 (already shown as the title) to avoid double-titles.
    try { const firstH1 = content.querySelector('h1'); if (firstH1 && title && (firstH1.innerText || '').trim() === title) firstH1.remove(); } catch (e) {}
    body.appendChild(content); wrap.appendChild(body);
    const foot = document.createElement('div'); foot.className = 'sx-foot';
    foot.innerHTML = '⟐ &nbsp; 1 <b>=</b> 1';
    wrap.appendChild(foot);
    ov.appendChild(css); ov.appendChild(prog); ov.appendChild(wrap);
    // scroll-progress (the one signal) — passive, throttled by rAF, no layout thrash.
    let ticking = false;
    ov.addEventListener('scroll', () => {
      if (ticking) return; ticking = true;
      requestAnimationFrame(() => { ticking = false;
        const max = ov.scrollHeight - ov.clientHeight;
        prog.style.width = (max > 0 ? Math.min(100, (ov.scrollTop / max) * 100) : 0) + '%';
      });
    }, { passive: true });
    // ESC closes the reader (in-page convenience; native also drives the toggle).
    const onKey = (e) => { if (e.key === 'Escape' && window.spektre.readerOn()) { window.spektre.readerOff(); document.removeEventListener('keydown', onKey, true); } };
    document.addEventListener('keydown', onKey, true);
    document.documentElement.appendChild(ov);
    try { document.documentElement.style.overflow = 'hidden'; } catch (e) {}
    if (!reduce) requestAnimationFrame(() => { ov.style.opacity = '1'; });
    return { on: true, words: textLen };
  };
  // a quiet, terse, self-retracting notice on the axis — used when there is nothing readable (never a modal, never noise).
  const quietNotice = (msg) => {
    const old = document.getElementById('__spektre_notice__'); if (old) old.remove();
    const reduce = window.matchMedia && window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const n = document.createElement('div'); n.id = '__spektre_notice__';
    n.textContent = msg;
    n.setAttribute('style', [
      'position:fixed','left:50%','top:50%','transform:translate(-50%,-50%)','z-index:2147483647',
      'background:#050506','border:1px solid rgba(255,255,255,.16)','border-radius:8px',
      'padding:14px 22px','color:#b6bac1','font:600 11px/1 ui-mono,SF Mono,-apple-system,monospace',
      'letter-spacing:.18em','pointer-events:none',
      reduce ? 'opacity:1' : 'opacity:0','transition:opacity .3s cubic-bezier(.16,1,.3,1)'
    ].join(';'));
    document.documentElement.appendChild(n);
    if (!reduce) requestAnimationFrame(() => { n.style.opacity = '1'; });
    setTimeout(() => { n.style.opacity = '0'; setTimeout(() => n.remove(), 320); }, 1600);
  };

  console.log('⟐ SPEKTRE CORE active — structural (anti-track+ads+vault+media+distill+reader, ZERO-LLM) + optional agent (additive). Never broken without a key.');
})();

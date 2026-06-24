// SPEKTRE VAULT — zero-knowledge credential crypto. PUBLIC + auditable on purpose: this is the code that
// EARNS trust (no backdoor can hide in 90 lines of standard WebCrypto). The paradigm, stated plainly:
//
//   ONE master (never leaves the device — unlocked by the Secure Enclave / Touch ID on each device) →
//   a key DERIVED from it (PBKDF2, 600k iters) → every credential AES-GCM encrypted CLIENT-SIDE.
//   Only CIPHERTEXT ever syncs. Spektre, the server, a breach — none can read it without the master.
//   "Impossible to generate elsewhere" = literally true: without the master, the ciphertext is noise.
//   Best on every device = the encrypted blob is portable to ANY dumb store (iCloud, a server, a file);
//   the master unlocks it locally. No-backdoor-by-design + open code = no one has to TRUST us, they can READ us.
//
// σ-honest: this is the standard zero-knowledge E2E construction (same class as 1Password/Bitwarden), not a
// novel crypto claim — the paradigm is the HONESTY + the Enclave master + the open auditability, not new math.
// Audit it: every secret op is below. No network. No key escrow. No telemetry. No second path.

const SpektreVault = (() => {
  'use strict';
  const enc = new TextEncoder(), dec = new TextDecoder();
  const b64 = (buf) => btoa(String.fromCharCode(...new Uint8Array(buf)));
  const unb64 = (s) => Uint8Array.from(atob(s), c => c.charCodeAt(0));

  // master (string from Enclave-unlocked passphrase/key) → AES-GCM key. Per-vault random salt, 600k PBKDF2.
  async function deriveKey(master, saltB64) {
    const salt = saltB64 ? unb64(saltB64) : crypto.getRandomValues(new Uint8Array(16));
    const base = await crypto.subtle.importKey('raw', enc.encode(master), 'PBKDF2', false, ['deriveKey']);
    const key = await crypto.subtle.deriveKey(
      { name: 'PBKDF2', salt, iterations: 600000, hash: 'SHA-256' },
      base, { name: 'AES-GCM', length: 256 }, false, ['encrypt', 'decrypt']);
    return { key, salt: b64(salt) };
  }

  // encrypt a credential object → {iv, ct} (the ONLY thing that ever leaves the device, as ciphertext)
  async function seal(key, obj) {
    const iv = crypto.getRandomValues(new Uint8Array(12));
    const ct = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, key, enc.encode(JSON.stringify(obj)));
    return { iv: b64(iv), ct: b64(ct) };
  }
  async function open(key, blob) {
    const pt = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(blob.iv) }, key, unb64(blob.ct));
    return JSON.parse(dec.decode(pt));
  }

  // strong generator — for "impossible on other devices": high-entropy, no ambiguous chars
  function generate(len = 24) {
    const A = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz23456789-_=+!?@#%';
    const r = crypto.getRandomValues(new Uint32Array(len));
    return Array.from(r, x => A[x % A.length]).join('');
  }

  // a whole vault: {salt, version, items:{host: cipherBlob}} — items are sealed individually, master in Enclave
  async function newVault(master) { const { salt } = await deriveKey(master); return { v: 1, salt, items: {} }; }
  async function put(vault, master, host, cred) {
    const { key } = await deriveKey(master, vault.salt);
    vault.items[host] = await seal(key, cred); return vault;
  }
  async function get(vault, master, host) {
    if (!vault.items[host]) return null;
    const { key } = await deriveKey(master, vault.salt);
    return open(key, vault.items[host]);
  }

  // self-test: round-trip proves zero-knowledge correctness (run in any JS env, audit the result yourself)
  async function selftest() {
    const m = 'master-' + generate(8);
    let v = await newVault(m);
    v = await put(v, m, 'example.com', { user: 'marko', pass: generate() });
    const got = await get(v, m, 'example.com');
    const wrong = await get(await put(await newVault('OTHER'), 'OTHER', 'example.com', { user: 'x', pass: 'y' }), m, 'example.com')
      .catch(() => null);   // wrong master → cannot decrypt (the whole point)
    return got.user === 'marko' && wrong === null;
  }

  return { deriveKey, seal, open, generate, newVault, put, get, selftest };
})();

if (typeof module !== 'undefined') module.exports = SpektreVault;   // node audit + tests

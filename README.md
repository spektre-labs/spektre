# ⟐ Spektre — the σ-membrane browser core (auditable)

**This is the public, auditable core that earns trust.** No backdoor can hide in code you can read.

- `spektre-vault.js` — **zero-knowledge credential crypto** (WebCrypto, PBKDF2 600k + AES-GCM). One master, never
  leaves your device; only ciphertext ever syncs; wrong master = noise. Run `node -e "require('./spektre-vault.js').selftest().then(console.log)"` → `true`.
- `spektre-core.js` — the **portable browser layer** any webview injects: structural anti-tracking (fingerprint
  normalized), native ad annihilation (no blocklist), the agent bridge (free-first hosted, or bring your own
  OpenAI/Claude/Gemini/Perplexity key — sealed in your OS keychain, **never** in page JS), adaptive guard, auto-signal.

**σ-honest:** we don't bundle our own paid LLM licenses — the default runs on free models; you plug your own if you
want. We promise nothing we can't prove. The crypto is here so you verify it, not trust us. 1=1.

Designed by Lauri Elias Rainio · Spektre Labs · Helsinki · AGPL-3.0

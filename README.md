# Depot Dictation Notes (Free + Pro)

Voice-notes capture tool for depot/site surveys. Free mode keeps everything in the browser via Web Speech API, while the Pro unlock adds a Cloudflare Worker bridge to OpenAI for fast, accurate transcripts plus “Copy ALL”.

## Features

- Structured note sections with installer hints
- Free local dictation using the browser Web Speech API
- Pro unlock via signed Ed25519 license tokens (local + Worker verification)
- 20 second Pro recording limit with MediaRecorder capture
- Cloudflare Worker proxy to OpenAI `gpt-4o-mini-transcribe`

## Quick start

1. **Generate keys locally**
   ```bash
   node gen_license.mjs keygen
   ```
   - `public_key.jwk` → copy the `x` value into `index.html` (`PUBLIC_KEY_JWK.x`).
   - Add the same `x` into `wrangler.toml` (`PUBLIC_KEY_JWK_X`).

2. **Issue unlock codes**
   ```bash
   node gen_license.mjs issue --email user@example.com --days 30
   ```
   Send the printed `CODE` to the user.

3. **Configure and deploy the Worker**
   ```bash
   wrangler secret put OPENAI_API_KEY
   wrangler deploy
   ```
   Update `ALLOWED_ORIGIN` (and optional additional origins) plus `PUBLIC_KEY_JWK_X` in `wrangler.toml`.

4. **Host the web app**
   Serve `index.html` from GitHub Pages or your domain. Update in-file constants:
   - `PUBLIC_KEY_JWK.x` (matches `public_key.jwk`)
   - `BUY_PRO_URL` (Stripe/PayPal link)
   - `CLOUDFLARE_BASE` if the Worker is on a different hostname

5. **Using the app**
   - Free users rely on Web Speech per section.
   - Pro users paste the issued unlock code. They gain “Copy ALL” and cloud transcription (`/transcribe`).
   - Badge shows remaining days (refresh as needed).


# Depot Dictation Notes (Free + Pro)

Voice-notes capture tool for depot/site surveys. Free mode keeps everything in the browser via Web Speech API, while the Pro unlock adds a Cloudflare Worker bridge to OpenAI for fast, accurate transcripts plus “Copy ALL”.

## Features

- Structured note sections with installer hints
- Free local dictation using the browser Web Speech API
- Pro unlock via signed Ed25519 license tokens (local + Worker verification)
- 20 second Pro recording limit with MediaRecorder capture
- Cloudflare Worker proxy to OpenAI or Anthropic for AI processing
- Automatic fallback to Anthropic Claude if OpenAI fails
- Integrated bug reporting system with email notifications via Mailchannels

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
   wrangler secret put ANTHROPIC_API_KEY  # Optional: for fallback support
   wrangler deploy
   ```
   Update `ALLOWED_ORIGIN` (and optional additional origins) plus `PUBLIC_KEY_JWK_X` in `wrangler.toml`.

   **Note:** You can configure either or both API keys:
   - `OPENAI_API_KEY` only: Uses OpenAI exclusively
   - `ANTHROPIC_API_KEY` only: Uses Anthropic Claude exclusively
   - Both keys: Uses OpenAI by default, falls back to Anthropic if OpenAI fails

4. **Host the web app**
   Serve `index.html` from GitHub Pages or your domain. Update in-file constants:
   - `PUBLIC_KEY_JWK.x` (matches `public_key.jwk`)
   - `BUY_PRO_URL` (Stripe/PayPal link)
   - `CLOUDFLARE_BASE` if the Worker is on a different hostname

5. **Using the app**
   - Free users rely on Web Speech per section.
   - Pro users paste the issued unlock code. They gain "Copy ALL" and cloud transcription (`/transcribe`).
   - Badge shows remaining days (refresh as needed).

## Bug Reporting

The app includes a built-in bug reporting system that automatically collects diagnostic information and sends it via email using Mailchannels.

**How it works:**
- Users click the "Report Bug" button in the app
- They describe the issue and optionally attach screenshots
- The system automatically collects:
  - Browser and environment information
  - Recent error logs
  - App state and localStorage data
  - Performance metrics
- All data is formatted into a comprehensive HTML email and sent to the configured email address

**Email Configuration:**
- Bug reports are sent via Mailchannels (free email service for Cloudflare Workers)
- Default recipient: `martinbibb@gmail.com`
- To change the recipient, edit the email address in `brain-worker.js` (line ~197)

**Note:** Mailchannels doesn't require API keys or additional configuration when used with Cloudflare Workers.


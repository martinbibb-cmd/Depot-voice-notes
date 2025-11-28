# Deployment Guide - Depot Voice Notes

This app requires **two components** to work properly:

## 1. Static Files (HTML, JS, CSS, Service Worker)

The static files need to be served from a web server. You have several options:

### Option A: Cloudflare Pages (Recommended)

1. Deploy the static files to Cloudflare Pages
2. Make sure these files are in the root or build output:
   - `index.html`
   - `sw.js` (service worker)
   - `manifest.json`
   - All files in `/js/`, `/css/`, `/src/`

3. Configure Pages to serve these files

### Option B: Local Development

For local testing, use a static file server:

```bash
# Using Python
python -m http.server 8000

# Using Node.js
npx serve .

# Using PHP
php -S localhost:8000
```

### Option C: Any Static Host

Deploy to any static hosting service:
- GitHub Pages
- Netlify
- Vercel
- AWS S3 + CloudFront
- etc.

## 2. Cloudflare Worker (API Backend)

The backend API is a Cloudflare Worker defined in `brain-worker.js`.

### Deploy the Worker

```bash
# Install Wrangler CLI
npm install -g wrangler

# Login to Cloudflare
wrangler login

# Deploy the worker
wrangler deploy
```

### Configure Secrets

Set required environment variables:

```bash
wrangler secret put JWT_SECRET
wrangler secret put OPENAI_API_KEY
wrangler secret put ANTHROPIC_API_KEY
```

### Update CORS

In `brain-worker.js`, update the `ALLOWED_ORIGIN` to match your domain:

```javascript
const ALLOWED_ORIGIN = "https://your-domain.com";
```

## 3. Connect Frontend to Backend

Update the Worker URL in your deployed app:

1. Open Settings in the app
2. Set "Worker Endpoint" to your Cloudflare Worker URL
3. Save settings

## Troubleshooting

### Service Worker Not Registered

**Error**: "Service Worker file not found"

**Solution**: Make sure `sw.js` is deployed at the root of your domain:
- ✅ `https://your-domain.com/sw.js`
- ❌ `https://your-domain.com/public/sw.js`

The app will work without the service worker, but offline mode won't be available.

### API Calls Failing

**Check**:
1. Worker is deployed and accessible
2. CORS is configured correctly in `brain-worker.js`
3. Worker URL is correct in app settings
4. JWT_SECRET is set in Worker secrets

### Photos Not Showing GPS

**Solution**: Fixed in latest version. GPS coordinates are now extracted correctly from JPEG EXIF data.

## Development vs Production

### Development
- Run static files locally: `python -m http.server 8000`
- Use `wrangler dev` for local Worker testing
- Set Worker URL to `http://localhost:8787`

### Production
- Deploy static files to Cloudflare Pages
- Deploy Worker with `wrangler deploy`
- Set Worker URL to your production Worker
- Enable HTTPS (automatic with Cloudflare)

## File Structure

```
depot-voice-notes/
├── index.html           # Main app (deploy this)
├── sw.js               # Service worker (deploy this)
├── manifest.json       # PWA manifest (deploy this)
├── brain-worker.js     # Cloudflare Worker (deploy separately)
├── js/                 # App JavaScript (deploy this)
├── css/                # Styles (deploy this)
├── src/                # Additional modules (deploy this)
└── public/             # Minimal version (optional)
```

## Quick Start

**For Cloudflare Pages + Workers:**

1. Create a new Pages project
2. Connect your GitHub repository
3. Build settings: None (no build step)
4. Deploy
5. Deploy Worker separately with `wrangler deploy`
6. Configure Worker URL in app settings

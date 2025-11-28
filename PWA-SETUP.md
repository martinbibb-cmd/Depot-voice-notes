# PWA Setup Guide

This application is now configured as a Progressive Web App (PWA) with the following features:

## ✅ Completed Setup

### 1. Manifest File
- **Location**: `/manifest.json`
- **Features**:
  - App name and branding
  - Theme colors (#2563eb blue)
  - Display mode: standalone
  - App shortcuts (New Survey, Load from Cloud, Settings)
  - Share target integration

### 2. Service Worker
- **Location**: `/sw.js`
- **Features**:
  - Offline caching for static assets
  - Cache-first strategy for performance
  - Network-first for API calls
  - Automatic cache management
  - Update notifications
  - Cache size limits (50 dynamic, 20 API)

### 3. HTML Integration
All HTML files updated with:
- Manifest link (`<link rel="manifest">`)
- Theme color meta tags
- Apple PWA meta tags
- Icon references
- Service worker registration

### 4. Settings Page Features
New "App Updates & Installation" section includes:
- **Check for Updates** button - Manually check for new versions
- **Install App** button - Install as standalone app (when available)
- **Clear Cache** button - Free up space and resolve issues
- Service worker status indicator

## 📱 App Icons

### Required Icons
The app needs the following icon files in the root directory:
- `icon-192.png` (192x192 pixels)
- `icon-512.png` (512x512 pixels)

### Generating Icons

#### Option 1: Use the Icon Generator (Recommended)
1. Open `/generate-icons.html` in your browser
2. Click "Generate Icons"
3. Download both icons using the buttons provided
4. Save them to the root directory as `icon-192.png` and `icon-512.png`

#### Option 2: Create Custom Icons
Create your own icons with these specifications:
- **Size**: 192x192 and 512x512 pixels
- **Format**: PNG with transparency
- **Design**: Blue theme (#2563eb), microphone or voice note symbolism
- **Safe area**: Keep important elements within 80% of the canvas
- **Background**: Can be transparent or use app theme colors

#### Option 3: Use Existing Logo
If you have an existing logo:
1. Resize to 192x192 and 512x512
2. Ensure adequate padding (10-15% on all sides)
3. Save as PNG
4. Name as `icon-192.png` and `icon-512.png`

### Screenshot Assets (Optional)
For enhanced app store presentation, add:
- `screenshot-wide.png` (1280x720) - Desktop/tablet view
- `screenshot-narrow.png` (750x1334) - Mobile view

## 🚀 Installation

### Desktop (Chrome/Edge)
1. Open the app in Chrome or Edge
2. Look for the install icon in the address bar (⊕)
3. Click "Install" in the prompt
4. Or go to Settings → "App Updates & Installation" → "Install App"

### Mobile (iOS)
1. Open the app in Safari
2. Tap the Share button
3. Scroll down and tap "Add to Home Screen"
4. Confirm installation

### Mobile (Android)
1. Open the app in Chrome
2. Tap the menu (⋮)
3. Tap "Add to Home Screen"
4. Or wait for the automatic install prompt

## 🔄 Updates

### Automatic Updates
- Service worker checks for updates every minute
- Users are prompted when new versions are available
- Accepts update → app reloads with new version

### Manual Updates
1. Go to Settings → "App Updates & Installation"
2. Click "Check for Updates"
3. If available, confirm reload to update

### Clearing Cache
If experiencing issues:
1. Go to Settings → "App Updates & Installation"
2. Click "Clear Cache"
3. App will reload with fresh data

## 🧪 Testing PWA Features

### Test Installation
1. Open app in browser
2. Check DevTools → Application → Manifest
3. Verify manifest is loaded correctly
4. Check "Service Workers" tab for active worker

### Test Offline
1. Install the app
2. Open DevTools → Network
3. Enable "Offline" mode
4. Refresh - app should still load (cached version)

### Test Updates
1. Make a change to a file
2. Deploy the change
3. Wait or manually check for updates
4. Confirm update prompt appears

## 🐛 Troubleshooting

### Icons Not Showing
- Ensure `icon-192.png` and `icon-512.png` exist in root directory
- Clear browser cache
- Uninstall and reinstall the app

### Service Worker Not Registering
- Check browser console for errors
- Ensure HTTPS is enabled (required for PWA)
- Try hard refresh (Ctrl+Shift+R / Cmd+Shift+R)

### Install Prompt Not Showing
- PWA criteria must be met (manifest, service worker, HTTPS)
- Icons must be present
- May not show if already installed
- Some browsers (Firefox) don't support install prompts

### Updates Not Applying
- Clear cache using Settings → "Clear Cache"
- Force reload (Ctrl+Shift+R)
- Unregister service worker in DevTools → Application → Service Workers

## 📊 PWA Audit

Use Lighthouse to verify PWA setup:
1. Open DevTools → Lighthouse
2. Select "Progressive Web App" category
3. Click "Generate report"
4. Address any failing audits

Target scores:
- ✅ PWA badge
- ✅ 100% on PWA category
- ✅ Installable
- ✅ Works offline

## 🔐 Security

- Service worker requires HTTPS in production
- `localhost` is exempt for development
- Cloudflare Workers automatically provide HTTPS

## 📝 Notes

- Service worker caches are versioned (depot-v1.0.0)
- Update `CACHE_VERSION` in `/sw.js` when deploying major changes
- Cache limits prevent unbounded growth
- API requests use network-first for fresh data
- Static assets use cache-first for performance

---

**Last Updated**: 2025-11-28
**PWA Version**: 1.0.0

# Cleanup X Slop

A Chromium web extension that cleans junk out of your **X / Twitter** home timeline:

- Promoted posts and ads  
- “Suggested for you” algorithmic posts  
- “Who to follow” modules  
- Premium / verified upsell nags  
- Grok promo UI  
- In-feed trends modules  
- Engagement-bait phrasing (“like if you agree”, “RT to save”, …)  
- Optional custom keyword blocks  

Settings live in the extension popup. Changes apply immediately on open X tabs.

## How to run (you need a local copy)

This repo is **source code only**. Opening the GitHub page does **not** install the extension. Browsers cannot load extensions from a GitHub URL — you must download or clone the project, then load it from a folder on your machine (or convert it for Safari with Xcode).

It is **not** on the Chrome Web Store or Mac App Store yet.

### 1. Get the files on your computer

**Option A — git clone**

```bash
git clone https://github.com/codergirlx/cleanup_x_slop.git
cd cleanup_x_slop
```

**Option B — ZIP download**

1. Open [https://github.com/codergirlx/cleanup_x_slop](https://github.com/codergirlx/cleanup_x_slop)
2. Click **Code → Download ZIP**
3. Unzip the archive and open the folder in Terminal (or remember its path for “Load unpacked”)

You only need the `extension/` folder for Chrome-based browsers. Safari needs the full repo (for the convert script) plus Xcode.

---

## Chrome / Edge / Brave (easiest)

1. Get a local copy (steps above).
2. Open the browser’s extensions page:
   - Chrome: `chrome://extensions`
   - Edge: `edge://extensions`
   - Brave: `brave://extensions`
3. Turn on **Developer mode** (usually top-right).
4. Click **Load unpacked**.
5. Select the **`extension/`** folder inside this project (the folder that contains `manifest.json` — not the repo root).
6. Open [https://x.com/home](https://x.com/home) and refresh.
7. Pin **Remove X Slop** from the extensions menu if you want the popup handy.

To update later: `git pull` (or re-download the ZIP), then on the extensions page click **Reload** on this extension.

---

## Project layout

```
extension/          ← WebExtension source (load this in Chrome/Edge/Brave)
  manifest.json
  content.js        ← feed scanner + MutationObserver
  content.css
  background.js
  popup.html / .js / .css
  icons/
scripts/
  convert-to-safari.sh
safari/             ← generated Xcode project (after convert; not in git)
```

## What it hides (heuristics)

| Filter | How it’s detected |
|--------|-------------------|
| Promoted | `placementTracking`, “Promoted” labels |
| Suggested | “Suggested for you”, “Recommended for you”, etc. |
| Who to follow | In-feed recommendation modules |
| Premium nags | Subscribe / Get verified promo copy |
| Grok nags | Short Grok upsell modules (not normal tweets that merely mention Grok) |
| Trends in feed | “What’s happening” / “Trending now” modules on Home |
| Engagement bait | Regexes on tweet text |
| Custom keywords | Case-insensitive substring match |

X changes their DOM often. If something stops hiding, hit **Rescan page** in the popup, or tweak labels in `extension/content.js`.

## Privacy

- Runs only on `x.com` / `twitter.com` (and mobile hosts).
- No network calls, no analytics, no remote lists.
- Settings and a simple “hidden count” are stored in `chrome.storage.local` on your device.

## License

MIT — do what you want.

# Kcal

Personal calorie + protein tracker. Scan a barcode and the whole pack is logged at once.
Plain static files, no build step, no backend. All data lives in the phone's localStorage.

## Files

- `index.html`, `style.css`, `app.js`: the app
- `sw.js`: service worker (offline app shell, refreshes in the background)
- `manifest.webmanifest`, `icons/`: home-screen install
- `vendor/zxing.min.js`: barcode decoder for browsers without `BarcodeDetector` (iPhone). `@zxing/library` 0.21.3, Apache-2.0
- `vendor/anthropic-sdk.mjs` (+ `otel-api.mjs`, `standardwebhooks.mjs`, `stablelib-base64.mjs`, `fast-sha256.mjs`): `@anthropic-ai/sdk` 0.135.0 browser bundle from jsDelivr, imports rewritten to the local files. Loaded only when Photo AI is used.

## Photo AI

"Photo AI" sends 1–3 photos (downscaled to 1568 px) to Claude and gets back structured JSON:
a nutrition label is read exactly (and saved under its barcode if the digits are visible), a meal gets an estimate you can adjust.
The new-product form also has a "Photo of the label" button that fills in its fields.

Needs an Anthropic API key, pasted into Settings → Photo AI. It is stored in localStorage only and left out of backups.
Model is selectable there (Opus 5.5 default, Sonnet 5.5, Haiku 5.5); Settings shows this month's spend.
With "Search the web" on (default), Claude may look up official nutrition pages for branded or restaurant food ($0.01 per search, max 3 per photo). The answer comes back through a strict `log_food` tool call because web search citations cannot be combined with `output_config.format`; if the API rejects search, the app retries once without it.

## Run locally

```
py -m http.server 8347
```

Then open http://localhost:8347. The camera only works on localhost or HTTPS, so test on the phone through the deployed site.

## Deploy (GitHub Pages)

```
git init -b main
git add .
git commit -m "Kcal tracker"
gh repo create kcal-tracker --public --source . --push
gh api -X POST repos/{owner}/kcal-tracker/pages -f "source[branch]=main" -f "source[path]=/"
```

The site appears at `https://<user>.github.io/kcal-tracker/` after a minute.
Open it on the phone, then:

- iPhone (Safari): Share → Add to Home Screen
- Android (Chrome): menu → Install app

After changing files, push again. Bump `CACHE` in `sw.js` so installed copies pick up the change on the next launch.

## Notes

- A day runs 04:00 to 03:59.
- Lookup order: saved products → Open Food Facts → manual form (saved for next time).
- Export a backup now and then from Settings; clearing Safari website data wipes localStorage.

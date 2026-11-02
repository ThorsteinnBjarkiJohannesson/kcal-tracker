# Kcal

Personal calorie + protein tracker. Scan a barcode and the whole pack is logged at once.
Plain static files, no build step, no backend. All data lives in the phone's localStorage.

## Files

- `index.html`, `style.css`, `app.js`: the app
- `sw.js`: service worker (offline app shell, refreshes in the background)
- `manifest.webmanifest`, `icons/`: home-screen install
- `vendor/zxing.min.js`: barcode decoder for browsers without `BarcodeDetector` (iPhone). `@zxing/library` 0.21.3, Apache-2.0

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

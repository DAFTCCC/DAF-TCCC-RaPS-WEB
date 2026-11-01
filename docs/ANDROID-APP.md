# RaPS Android app

The Android app (APK) is built in its own repository,
[DAF-TCCC-RaPS](https://github.com/DAFTCCC/DAF-TCCC-RaPS). It packages this
web app with Capacitor, at the web commit pinned in its `web-app.lock`.
Installing, signing-key setup and releases are documented there in
`docs/ANDROID-APP.md`.

## What stays in this repository

The web code still contains the app-only behavior that runs when RaPS is
installed as an APK (`isNativeApp()` and the `window.Capacitor` checks in
`app.js`): bundled files instead of the service worker, Offline Ready, saving
exports to Documents, and the Android back button. Keep these when changing
`app.js`.

The APK bundle requires `index.html` to keep the exact CSP fragment
`script-src 'self';`; the Android build relaxes it for Capacitor's inline
bridge in the APK only and fails if the fragment is missing.

## Releasing a web change as an APK

Merge here first, then in DAF-TCCC-RaPS run `bash scripts/pin-web.sh main`,
open a pull request, and merge it.

## Server note

The app calls the RaPS server from the origin `https://localhost`. If sign-in
fails in the app but works in the browser, the gateway's CORS settings must
allow that origin.

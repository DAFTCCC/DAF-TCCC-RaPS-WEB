# v3.4.13-web.6 — Android wrapper removed

- **Removed the Capacitor Android wrapper** added in web.5: `android-app/`, `.github/workflows/android.yml`, and `docs/ANDROID-APP.md`. The Android app is maintained in its own repository.
- **Removed the web.5 in-app checks.** The service worker is registered on every platform again, and Offline Ready reports the same items on every platform. This matters if an Android wrapper loads the hosted site: with the web.5 check, offline caching would have been switched off inside it.
- The older Capacitor hooks that predate web.5 (saving exports to Documents and the Android back button) are unchanged. They do nothing in a normal browser.
- No database or server change.

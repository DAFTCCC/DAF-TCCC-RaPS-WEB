# v3.4.13-web.5 — Android app

- **Android app (Capacitor).** `android-app/` packages the web app unchanged into an APK. CI builds it on every pull request (attached to the run) and, once a signing key is stored in GitHub, publishes a signed APK as a GitHub Release on every merge to `main`.
- **Updates keep records.** Signed releases use one stable key, so a new APK installs over the old one without losing data. Without the key, CI produces clearly labeled TEST BUILDs and warns that moving between them requires uninstalling.
- **App behavior.** Inside the app, the web service worker is skipped because files are bundled in the APK, and Offline Ready treats the app as saved for offline use with storage that is never evicted. The existing Filesystem export and Android back-button support now have their Capacitor plugins installed.
- **Security policy.** Only the Android bundle allows Capacitor's inline bridge script. The web deployment keeps `script-src 'self'`. The bundle script fails the build if any script the page loads is missing.
- Setup guide, including creating the signing key on the NUC with Docker: `docs/ANDROID-APP.md`.

Requires 3.4.13-web.4 (PR #64). No server change.

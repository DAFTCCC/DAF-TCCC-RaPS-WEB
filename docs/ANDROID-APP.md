# RaPS Android app

The Android app is the RaPS web app packaged with Capacitor
(`android-app/`), with the same code, server, and sign-in. Benefits over the
browser:

- **Storage:** app data is never evicted by the browser.
- **Offline:** the app's files are inside the APK, so it opens offline without
  relying on a browser cache.
- **Native features:** exports are saved to Documents, and the Android back
  button navigates inside RaPS.

GitHub Actions (`.github/workflows/android.yml`) builds the APK on every pull
request and on every merge to `main`.

## Installing (instructors)

1. Open the repository's **Releases** page on the phone and download the latest
   `RaPS-<version>.apk`.
2. Open the file. Android asks you to allow installs from this source once.
3. Open RaPS and sign in while connected. Sync Classes, then confirm the class
   shows **OFFLINE READY**.

**Updating:** install the newer APK over the existing app. Records are kept.
Sync Classes first anyway.

**Never uninstall with unsynced records.** Uninstalling deletes everything on
the phone that has not synced.

## One-time setup: the signing key (owner)

Android installs an update only when it is signed with the same key as the
installed app. Until a signing key is stored in GitHub, CI produces
**TEST BUILD** APKs. Each test build has a different key, so moving between
test builds requires uninstalling. Use test builds only for trials with no real
records.

**1. Create the key on the NUC** (uses Docker; nothing is installed):

```bash
mkdir -p ~/raps-signing && cd ~/raps-signing
docker run --rm -it -v "$PWD":/out eclipse-temurin:21-jdk keytool -genkeypair -v \
  -keystore /out/raps-release.keystore -alias raps -keyalg RSA -keysize 4096 -validity 10000 \
  -dname "CN=RaPS, O=DAF TCCC, C=US"
base64 -w0 raps-release.keystore > raps-release.keystore.b64
```

`keytool` asks for a keystore password. Use a long one and record it in your
password manager. Press Enter to reuse it as the key password.

**2. Store the key in GitHub.** Go to **Settings → Secrets and variables →
Actions → New repository secret** and add four secrets:

| Secret | Value |
|---|---|
| `ANDROID_KEYSTORE_B64` | the contents of `raps-release.keystore.b64` |
| `ANDROID_KEYSTORE_PASSWORD` | the keystore password |
| `ANDROID_KEY_ALIAS` | `raps` |
| `ANDROID_KEY_PASSWORD` | the key password (same as the keystore password if you pressed Enter) |

**3. Keep an offline backup** of `raps-release.keystore` and its password, for
example on an encrypted USB drive stored separately. If the key is lost, no
future update can install over existing apps. Then delete the `.b64` copy from
the NUC.

From then on, every merge to `main` publishes a signed release named
`android-v<version>` on the Releases page.

## How the build works

- `android-app/prepare-web.sh` copies the shipped web files into
  `android-app/www`. It fails if any script the page loads is missing. In this
  bundle only, it allows Capacitor's inline bridge script in the security
  policy; the web deployment keeps `script-src 'self'`.
- The Android version name matches RaPS (for example `3.4.13-web.5`). The
  version code is `versionCode × 100 + web number`, so it always increases.
- In the app, the web service worker is skipped (files are bundled), and
  Offline Ready treats the app as saved for offline use.

## Server note

The app calls the RaPS server from the origin `https://localhost`. If sign-in
fails in the app but works in the browser, the gateway's CORS settings must
allow that origin.

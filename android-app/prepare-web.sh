#!/usr/bin/env bash
# Copy exactly the files the web app ships into android-app/www.
set -euo pipefail
REPO=$(cd "$(dirname "$0")/.." && pwd)
OUT="$REPO/android-app/www"
rm -rf "$OUT" && mkdir -p "$OUT"
cp "$REPO/index.html" "$REPO/styles.css" "$REPO/manifest.webmanifest" "$OUT/"
for f in "$REPO"/*.js; do cp "$f" "$OUT/"; done
cp -r "$REPO/assets" "$REPO/vendor" "$OUT/"
[ -d "$REPO/briefing" ] && cp -r "$REPO/briefing" "$OUT/"
# Capacitor injects its native bridge as an inline script into the page. Allow
# inline scripts in the Android bundle only; the APK serves just these local
# files, and the web deployment keeps the strict script-src 'self' policy.
grep -q "script-src 'self';" "$OUT/index.html" || { echo "Expected CSP not found in index.html"; exit 1; }
sed -i "s/script-src 'self';/script-src 'self' 'unsafe-inline';/" "$OUT/index.html"
# Every script the page loads must be present in the bundle.
missing=0
for src in $(grep -o 'src="[^"]*\.js' "$OUT/index.html" | sed 's/src="//; s/\?.*//'); do
  [ -f "$OUT/$src" ] || { echo "MISSING from bundle: $src"; missing=1; }
done
[ $missing -eq 0 ] && echo "Web bundle ready: $(find "$OUT" -type f | wc -l) files"
exit $missing

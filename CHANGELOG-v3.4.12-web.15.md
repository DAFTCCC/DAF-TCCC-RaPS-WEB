# v3.4.12-web.15

- **Ship the cloud authentication library with the app.** Previously, `index.html` loaded the unpinned `@supabase/supabase-js@2` from cdn.jsdelivr.net. That URL silently picked up whatever 2.x release was newest, and because it was cross-origin the service worker never cached it. On a network that blocks public CDNs, nobody could sign in. The app now loads a pinned copy, `vendor/supabase-js-2.118.0.min.js`. This is the exact version the CDN served on 2026-10-31, so client behavior is unchanged. The service worker precaches it, and its hashes and update procedure are in `vendor/README.md`.
- **Tighten the Content Security Policy.** Scripts may now load only from the app itself, with no third-party script host. The CSP also drops the retired hosted Supabase project; only the RaPS server remains for API traffic.
- **Fix layout overflow under enlarged text.** At 200% text size, the evaluator workflow tiles on the home screen overflowed their card on phone-width screens. The tiles now shrink and wrap.
- **Expand CI.** In addition to the unit suite, CI now runs all 11 isolated Chromium suites on every pull request.

Validation on 2026-10-31: all 791 Node tests passed. All 11 Chromium suites passed, with no page errors and no unexpected requests. The new `tests/browser-offline-startup.py` serves the real app with every third-party host blocked. It confirms that sign-in loads, that the service worker precaches all 16 page scripts, and that an offline reload starts from the cache. The same test fails on web.14 because the library could not load without the CDN. `browser-responsive.py` now passes at all eight viewports, including 200% text, after failing on web.13 and web.14.

JTS criteria, scoring, timing standards, grading algorithms, and synchronization behavior are unchanged.

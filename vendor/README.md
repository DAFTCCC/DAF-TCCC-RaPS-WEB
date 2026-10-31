# Vendored browser libraries

The app ships its own copy of these libraries. That way a previously prepared
device can start without reaching a CDN, and networks that block public CDNs
can still sign in. The service worker precaches the copy.

## supabase-js 2.118.0

| | |
|---|---|
| File | `supabase-js-2.118.0.min.js` (the package's `dist/umd/supabase.js`) |
| Package | `@supabase/supabase-js@2.118.0` from registry.npmjs.org |
| SHA-256 | `ee3be8de192b97cb1d73d1e95d6b82bb1f6b658c0f97c4ef757fc331996ed3d3` |
| npm tarball integrity | `sha512-FxI8UXMVC2UG7IkeiI8fuQZqq2oI3JeSuN8MPIC2RLVaoEAxKS0nqE6kii9Ewpq8f9gNPM6git1Y8f0vN/QLFw==` |
| npm tarball shasum | `a590a3a0b301cb336c771a81c8d37a4bbc2647cf` |
| License | MIT, see `LICENSE-supabase-js.txt` |
| Fetched | 2026-10-31, by `npm pack` on a GitHub-hosted runner |

This is the version `cdn.jsdelivr.net/npm/@supabase/supabase-js@2` served on
2026-10-31, so pinning it did not change the client the app already ran.

Verify the file with:

```bash
sha256sum vendor/supabase-js-2.118.0.min.js
```

## Updating

Update deliberately. An unpinned upgrade was the reason for vendoring.

1. Run `npm pack @supabase/supabase-js@<version>` and copy `package/dist/umd/supabase.js` to
   `vendor/supabase-js-<version>.min.js`.
2. Update the `<script>` tag in `index.html` and the `SHELL` entry in `sw.js`. Delete the old file.
3. Bump the build version, record the new hashes here, and run the full test suite.

"""Cold start without any third-party host, then reopen fully offline.

Run: python tests/browser-offline-startup.py
Requires Python Playwright and Chromium (or set CHROMIUM_EXECUTABLE).

Serves this checkout from a local HTTP server with the real index.html and
service worker. Every request to another host is aborted, as on a network that
blocks public CDNs. Nothing contacts the RaPS server.

Checks:
1. The cloud authentication library loads from the app itself, so the sign-in
   screen appears instead of the "could not load the cloud authentication
   library" error.
2. The service worker precaches every script the page uses, including the
   library.
3. With the network disconnected, a reload starts from the cache with the
   library available and no page errors.
"""

import functools
import http.server
import json
import os
from pathlib import Path
import threading
from urllib.parse import urlsplit

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parents[1]
PORT = 8767
ORIGIN = f'http://127.0.0.1:{PORT}'


class QuietHandler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args):
        pass


def main():
    handler = functools.partial(QuietHandler, directory=str(ROOT))
    server = http.server.ThreadingHTTPServer(('127.0.0.1', PORT), handler)
    threading.Thread(target=server.serve_forever, daemon=True).start()
    checks, errors, blocked = [], [], []
    try:
        with sync_playwright() as playwright:
            browser = playwright.chromium.launch(
                executable_path=os.environ.get('CHROMIUM_EXECUTABLE', '/usr/bin/chromium'), headless=True)
            context = browser.new_context(service_workers='allow', viewport={'width': 390, 'height': 844})

            def guard(route):
                url = urlsplit(route.request.url)
                if url.hostname == '127.0.0.1' and url.port == PORT:
                    return route.continue_()
                blocked.append(route.request.url)
                return route.abort()

            context.route('**/*', guard)
            page = context.new_page()
            page.on('pageerror', lambda error: errors.append(str(error)))
            page.goto(ORIGIN + '/', wait_until='networkidle')

            assert page.evaluate('typeof window.supabase?.createClient') == 'function', \
                'Authentication library must load without any CDN'
            page.wait_for_function('!!document.querySelector(".cloudAuthGate")')
            gate = page.evaluate('document.querySelector(".cloudAuthGate")?.textContent || ""')
            assert 'could not load the cloud authentication library' not in gate, gate
            checks.append('authentication library loads from the app with every third-party host blocked')

            page.wait_for_function('navigator.serviceWorker.controller !== null || navigator.serviceWorker.ready.then(()=>true)')
            page.evaluate('navigator.serviceWorker.ready')
            page.reload(wait_until='networkidle')
            cached = page.evaluate("""async () => {
              const names = (await caches.keys()).filter(n => n.startsWith('tccc-eval-web-'));
              const urls = [];
              for (const n of names) for (const r of await (await caches.open(n)).keys()) urls.push(new URL(r.url).pathname + new URL(r.url).search);
              return {names, urls};
            }""")
            scripts = page.evaluate('[...document.scripts].map(s => s.getAttribute("src")).filter(Boolean)')
            assert len(cached['names']) == 1, cached['names']
            for src in scripts:
                assert any(u.endswith(src.lstrip('./')) for u in cached['urls']), f'not precached: {src}'
            checks.append(f'service worker precached all {len(scripts)} page scripts, including the library')

            context.set_offline(True)
            page.reload(wait_until='load')
            assert page.evaluate('navigator.onLine') is False
            assert page.evaluate('typeof window.supabase?.createClient') == 'function', \
                'Library must be available offline from the cache'
            assert page.evaluate('!!window.TCCC_BUILD?.versionName'), 'App scripts must start offline'
            checks.append('offline reload starts from the cache with the library and app scripts available')
            browser.close()
    finally:
        server.shutdown()

    assert not errors, errors
    print(json.dumps({'checks': checks, 'blocked_third_party_requests': len(blocked), 'page_errors': len(errors)}, indent=2))


if __name__ == '__main__':
    main()

# v3.4.12-web.2

Fixes an intermittent evaluator-header layout loop discovered during post-merge browser verification. Browser scroll anchoring could move the page across the same collapse threshold whenever the sticky header changed height, repeatedly expanding/collapsing the header and interfering with ordinary review-control clicks.

The header now uses its expanded height when choosing the collapse threshold and a separate near-top expansion threshold. The existing browser regression adds checks for stable scrolling at phone and desktop widths. PWA asset/cache versions are refreshed.

Validation: 275 Node checks and 16 browser workflow groups pass. Twelve fresh contexts completed the previously unstable NT/review interaction without header flips. Grading criteria, timing standards, scoring, NT handling, and server lifecycle behavior are unchanged.

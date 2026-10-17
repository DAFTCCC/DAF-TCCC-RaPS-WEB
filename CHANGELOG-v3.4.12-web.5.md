# v3.4.12-web.5

Improves phone, tablet, desktop, landscape, and enlarged-text usability while preserving the standardized grading instrument.

- Aligns shared-row fields, labels, class/roster actions, and navigation controls. Long names and headings wrap without squeezing Back or Close buttons. Operational status labels are readable, primary-action text has stronger contrast, and editable fields use at least 16px text to avoid mobile focus zoom.
- Makes touch targets at least 44px, keeps roster filters readable, and adds a shortcut from class details to the student roster. Enlarged timer text reflows with its controls.
- Keeps sticky timer surfaces opaque and makes room for the checklist in landscape. Next Unresolved places its criterion below the header and active timer panel, then focuses the grade control.
- Adds persistent signoff labels, descriptive phase/timer/note names, keyboard focus recovery, dialog focus containment, Escape handling, and background isolation. Authentication forms remain scrollable on short windows and keep keyboard focus within the active gate.
- Preserves intrinsically disabled timer and grading controls when refreshing an editable assessment. The existing policy guards remain unchanged.

No schema migration, grading criterion, timing standard, scoring rule, or authoritative claim/finalize/void function changes are included. Shared class-deletion fixes from web.4 remain in place. PWA cache and asset versions are refreshed.

Browser validation uses isolated synthetic fixtures without production authentication or data writes. Physical-device and field validation remain part of the evaluator pilot.

Validation: 325 automated regression checks, 87 responsive layouts at eight viewport sizes with additional 200% text cases, 24 evaluator workflow groups, 11 accessibility groups, and 317 authentication layout/keyboard checks pass. Primary, timer, and critical-label contrast checks pass at 4.5:1 or above. Browser suites report zero page errors and unexpected external requests.

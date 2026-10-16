# v3.4.12-web.4

Fixes two additional ways a class could remain in Home/My Classes with a misleading SYNCED label: an overlapping parent upload could cause the class pull to skip a server deletion, and another browser tab could overwrite a pending deletion in the shared local database.

Class pulls now wait for an overlapping upload and read its server lifecycle again. Delete/restore requests are saved independently of the class database and replayed for the same authenticated Enterprise user until the matching request is acknowledged. Newer requests survive older acknowledgements and stale database writes. Legacy local Trash is reconciled regardless of its old enabled/status flags, and all pages of classes are read even when the server imposes a smaller response limit.

A class already removed from both My Classes and Trash on the original device has no surviving deletion request to upload. Its remaining cloud copy must be deleted once from a device that still shows it. Missing rows are never treated as proof of deletion.

PWA versions are refreshed. No database migration, curriculum, scoring, timing, or authoritative assessment lifecycle changes are included. Closed-class retention controls remain in force. Validation uses isolated server and browser fixtures; production database records were not accessed or modified.

Validation: 325 automated checks and 24 real-browser workflow groups pass. Regressions cover the stale-parent-response race, capped class reads and terminal range responses, cross-tab delete/restore recovery, account ownership, newer requests arriving before acknowledgements, and storage failures. Browser checks report zero external requests and page errors.

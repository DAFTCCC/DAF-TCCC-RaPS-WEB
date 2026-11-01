# v3.4.13-web.3 — student assignment

- **Assign Students.** A Program Manager (or the class owner) enters instructor names or lanes, splits the roster evenly or adjusts each student, and saves. Assignments sync to every phone with the class, as part of the class record.
- **My students.** Each phone picks its group. It defaults to the group named like the signed-in instructor and remembers the choice per class. That group lists first, every row shows its instructor, and a **Mine** filter shows only that group.
- **Fewer duplicates.** Starting a student assigned to another instructor asks for confirmation first. Nothing is blocked, because instructors can still cover for each other, and if a duplicate does happen, the existing conflict protection still applies.
- **Corrected roster notice.** It previously said starting and finalizing require a connection, which has not been true since 3.4.13.
- Classes without assignments keep their existing sync signature, so the upgrade causes no false class conflicts.

Requires 3.4.13-web.2 (PR #62). No server change. Validation: 815/815 Node tests (6 new). 14/14 Chromium suites, including the new `browser-student-assignment.py`.

# v3.4.13-web.4 — Missed Trends analytics

A new **Missed Trends** section appears on the Program Manager, MAJCOM, and Enterprise dashboards. All three compute it with the same shared module, from rows each dashboard already loads under its own access scope.

- **Most-missed criteria.** The top 10 criteria by miss rate, with critical criteria marked and the curriculum text shown. A criterion needs at least 5 PASS/FAIL grades from finalized evaluations to be ranked.
- **Why students miss.** Each top criterion shows its main recorded contributor and a suggestion: knowledge → review the content; skill or psychomotor → add hands-on practice; equipment → check setup; sequencing → drill decisions.
- **First-attempt pass rate, retest recovery, and students awaiting retest,** plus the first-attempt pass rate by month.
- **Grading consistency.** Each evaluator's miss rate is compared with what their peers' rates on the same criteria predict, excluding the evaluator's own grades. A gap of 10 or more points is flagged for calibration review. An evaluator needs at least 20 shared grades. This is descriptive only, and most meaningful with five or more instructors.

Dashboards now load graded results (PASS and FAIL) with their criterion and attempt number, using a stable sort order across pages. The existing failure panels use the same FAIL rows as before.

Requires 3.4.13-web.3 (PR #63). No server change. Validation: 825/825 Node tests, including 7 new analytics tests on data with known answers and 3 dashboard tests that render Missed Trends in each dashboard. 14/14 Chromium suites.

# RaPS instructor break-it beta kit

Use this kit to brief leadership/MAJCOM managers, nominate instructors, and run a
controlled TEST pilot. The recommendation is a small supervised beta after the
owner dry run, with instructors actively interrupting and challenging the normal
workflow. The outcome is a reproducible improvement list and a scoped decision
to hold, extend or expand.

## Ready-to-use files

- [Editable leadership presentation](RaPS-Leadership-Beta-Brief.pptx): 14 slides;
  brief slides 1–12 in about 10 minutes. Slides 13–14 are reference appendices.
  Speaker notes include talking points and source/limitation context.
- [Presentation PDF](RaPS-Leadership-Beta-Brief.pdf): the same slides for sharing.
- [Instructor challenge card](RaPS-Instructor-Challenge-Card.pdf): two pages,
  eight missions. Assign four per tester, including free exploration, during a
  40-minute challenge period. Cover the remaining missions across the cohort.
- [Fillable feedback PDF](RaPS-Beta-Feedback-Form.pdf) and
  [editable Word form](RaPS-Beta-Feedback-Form.docx): one finding per form,
  including useful features and requests. Return to the nominated site PM.
- [Facilitator guide](RaPS-Facilitator-Guide.pdf): three pages with preflight,
  support, retention, recovery and expansion criteria.
- [Blank issue log](RaPS-Beta-Issue-Log.csv): PM consolidation and fix/retest
  tracking. It contains headers only, not invented test results.
- [Owner readiness register](RaPS-Beta-Readiness-Register.csv): distinguishes
  the supplied deployment evidence from field checks still to perform.

The proposed cohort is 2–3 sites, one PM and two instructors per site, over one
week. Use their normal phones/tablets and browsers/PWAs. The proposal is local
planning guidance, not an approved tasking or a clinical-validation study.

Before presenting, name the pilot owner, site PMs, Enterprise/NUC support, SME,
actual dates and return channel. The support route in the materials is
**instructor → site PM → pilot owner → Enterprise/NUC support**. These files do
not create a new in-app feedback endpoint or send reports automatically.

## Evidence and remaining gates

The backend/source baseline is web.8, merged in main at
[`104aaae`](https://github.com/DAFTCCC/DAF-TCCC-RaPS-WEB/commit/104aaae9031cbe4c361022ebd380ff169bfca2c9).
The owner supplied a successful NUC rollout for backend `8a9d138`. A subsequent
assessment-start failure was reproduced for both ordinary and TEST classes.
Web.9 corrects the shared first-upload insert/read sequence and returns TEST to
the ordinary supported-command/physical-installation workflow. All 718 Node
checks pass, along with isolated PostgreSQL and browser checks. Existing grading
definitions, scoring rules and server lifecycle functions remain protected.

**Hold the cohort until web.9 is published and the reported class starts and
synchronizes successfully on the NUC.** See [publication and retest](../../WEB9-DEPLOYMENT.md).

That evidence does not establish real account setup/recovery, physical-device
behavior, deployed two-evaluator synchronization or completed retention/restore
workflows. The owner register leaves those checks unverified. Confirm web.9 on
every actual device, a scoped account/recovery path, and a known two-device case
before the cohort starts. Confirm both retention workers separately. Off-NUC
backup and an isolated restore need proof before meaningful record retention or
expansion. The current official assessment process remains authoritative during
the TEST beta.

TEST is a supported-MAJCOM choice in the ordinary environment on the same NUC.
Use fictitious learners and clearly named beta classes at authorized ordinary
installations. All MAJCOMs includes TEST; the label does not grant access or
create a separate data domain. MAJCOM cloud reports follow the normal base-parent
scope. Previously deployed duplicate-base records and memberships are retained,
not silently moved or deleted. An administrator must review any physical-base
grant for a legacy TEST-only account.

An actual reload of an active timer requires VOID/restart recovery. Offline
recording applies to a previously claimed assessment with valid cached authority;
new starts, finalization, void and close require the server. These are expected
boundaries, not automatic bug findings. Lost evidence, wrong-record changes,
unexpected access or false save/finalization are reasons to pause the affected
lane and preserve state for support.

The sample report on slide 8 is explicitly illustrative, not an observed defect.
No test outcomes, satisfaction scores or clinical validation results are invented
in this kit. Proposed decision gates are local operational criteria.

## Rebuild and edit

The PowerPoint and Word files are editable directly. To regenerate the masters
from a repository checkout, edit `build_materials.py` and the two Markdown guides,
then run from the repository root:

```sh
python3 briefing/field-beta/build_materials.py
soffice --headless --convert-to pdf --outdir briefing/field-beta \
  briefing/field-beta/RaPS-Leadership-Beta-Brief.pptx
```

The builder uses python-pptx, ReportLab, Pillow and python-docx, plus the existing
app icon. LibreOffice converts the presentation PDF. Rebuilding replaces generated
files; edits made only to a generated PowerPoint/Word file are not imported into
the source builder. These dependencies are for briefing production, not the app.

Inspect slide rendering, text completeness, handout pagination, PDF field
fill/save behavior and links before distributing a revised kit. The ready-to-use
documents have been rendered and checked; they do not change application code,
accounts, server configuration or training records.

Source references: [web.9 correction](../../WEB9-DEPLOYMENT.md),
[development and field evaluation](../../DEVELOPMENT.md),
[permissions](../../PERMISSIONS.md), [web.8 rollout](../../WEB8-DEPLOYMENT.md),
[instructor card source](instructor-challenge-card.md),
[facilitator guide source](facilitator-guide.md).

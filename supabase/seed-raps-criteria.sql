-- RaPS criteria catalog seed generated from tiers.js
-- Idempotent. Source of truth for criterion codes/text/criticality is the deployed RaPS tier catalog.
begin;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'ASM-001',
  'ASM',
  1,
  'Verbalized appropriate scene safety precautions to address immediate life threats.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'ASM'
  and cv.version = 'TCCC-ASM-11-01 · 1 AUG 19'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'ASM-002',
  'ASM',
  2,
  'Assessed the casualty for responsiveness.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'ASM'
  and cv.version = 'TCCC-ASM-11-01 · 1 AUG 19'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'ASM-003',
  'ASM',
  3,
  'Identified options for casualty movement, if necessary.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'ASM'
  and cv.version = 'TCCC-ASM-11-01 · 1 AUG 19'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'ASM-004',
  'ASM',
  4,
  'Performed a blood sweep on the casualty to identify life-threatening bleeding.',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'ASM'
  and cv.version = 'TCCC-ASM-11-01 · 1 AUG 19'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'ASM-005',
  'ASM',
  5,
  'Verbalized the meaning of MARCH and used the sequence to perform a casualty assessment.',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'ASM'
  and cv.version = 'TCCC-ASM-11-01 · 1 AUG 19'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'ASM-006',
  'ASM',
  6,
  'Verbalized the necessary lifesaving interventions in the correct order based on the casualty assessment scenario.',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'ASM'
  and cv.version = 'TCCC-ASM-11-01 · 1 AUG 19'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'ASM-007',
  'ASM',
  7,
  'Slid the injured arm or leg through the loop of the self-adhering band or wrapped the band around the extremity and pulled the free end through the routing buckle to control life-threatening bleeding from a wound in a location where a tourniquet can be applied.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'ASM'
  and cv.version = 'TCCC-ASM-11-01 · 1 AUG 19'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'ASM-008',
  'ASM',
  8,
  'Positioned a tourniquet above a severely bleeding wound; either leaving at least 2-3 inches of uninjured skin between the tourniquet and the wound site or placing the tourniquet high and tight.',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'ASM'
  and cv.version = 'TCCC-ASM-11-01 · 1 AUG 19'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'ASM-009',
  'ASM',
  9,
  'Pulled the self-adhering band TIGHT, fastening it back on itself, and twisted the windlass rod until the tourniquet stopped the bleeding within 1 minute.',
  true,
  true,
  60000,
  true
from public.curriculum_versions cv
where cv.course_type = 'ASM'
  and cv.version = 'TCCC-ASM-11-01 · 1 AUG 19'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'ASM-010',
  'ASM',
  10,
  'Checked for a pulse in the arm/leg after the tourniquet had been applied.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'ASM'
  and cv.version = 'TCCC-ASM-11-01 · 1 AUG 19'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'ASM-011',
  'ASM',
  11,
  'Locked the windlass rod inside the windlass clip securing it; ensured that the band did not untwist.',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'ASM'
  and cv.version = 'TCCC-ASM-11-01 · 1 AUG 19'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'ASM-012',
  'ASM',
  12,
  'Re-checked the tourniquet to make sure that the bleeding has not started again and the pulse is still absent.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'ASM'
  and cv.version = 'TCCC-ASM-11-01 · 1 AUG 19'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'ASM-013',
  'ASM',
  13,
  'Routed the self-adhering band between the clips and over the rod.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'ASM'
  and cv.version = 'TCCC-ASM-11-01 · 1 AUG 19'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'ASM-014',
  'ASM',
  14,
  'Secured the windlass rod and self-adhering band under the windlass safety strap.',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'ASM'
  and cv.version = 'TCCC-ASM-11-01 · 1 AUG 19'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'ASM-015',
  'ASM',
  15,
  'Wrote the time of tourniquet application on the windlass safety strap (and on the DD Form 1380 Tactical Combat Casualty Care (TCCC) Card or forehead).',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'ASM'
  and cv.version = 'TCCC-ASM-11-01 · 1 AUG 19'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'ASM-016',
  'ASM',
  16,
  'Packed a wound located in a place where a tourniquet cannot be effectively applied with a hemostatic dressing.',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'ASM'
  and cv.version = 'TCCC-ASM-11-01 · 1 AUG 19'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'ASM-017',
  'ASM',
  17,
  'Maintained pressure for 3 minutes.',
  true,
  true,
  180000,
  true
from public.curriculum_versions cv
where cv.course_type = 'ASM'
  and cv.version = 'TCCC-ASM-11-01 · 1 AUG 19'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'ASM-018',
  'ASM',
  18,
  'Reassessed the wound to ensure the bleeding had stopped.',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'ASM'
  and cv.version = 'TCCC-ASM-11-01 · 1 AUG 19'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'ASM-019',
  'ASM',
  19,
  'Applied a sterile dressing and wrapped an elastic pressure bandage over a hemostatic dressing to secure it in place.',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'ASM'
  and cv.version = 'TCCC-ASM-11-01 · 1 AUG 19'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'ASM-020',
  'ASM',
  20,
  'Wrapped the elastic pressure bandage evenly around the wound or over the hemostatic dressing, if present.',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'ASM'
  and cv.version = 'TCCC-ASM-11-01 · 1 AUG 19'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'ASM-021',
  'ASM',
  21,
  'Secured the elastic pressure bandage.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'ASM'
  and cv.version = 'TCCC-ASM-11-01 · 1 AUG 19'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'ASM-022',
  'ASM',
  22,
  'Assessed for circulation below the dressed wound.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'ASM'
  and cv.version = 'TCCC-ASM-11-01 · 1 AUG 19'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'ASM-023',
  'ASM',
  23,
  'Opened the casualty’s mouth and looked for anything blocking the airway.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'ASM'
  and cv.version = 'TCCC-ASM-11-01 · 1 AUG 19'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'ASM-024',
  'ASM',
  24,
  'Stated the correct maneuver to open the airway, if there was a suspicion of a neck or spinal injury.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'ASM'
  and cv.version = 'TCCC-ASM-11-01 · 1 AUG 19'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'ASM-025',
  'ASM',
  25,
  'Performed the head-tilt/chin-lift maneuver.',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'ASM'
  and cv.version = 'TCCC-ASM-11-01 · 1 AUG 19'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'ASM-026',
  'ASM',
  26,
  'Performed the jaw-thrust maneuver.',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'ASM'
  and cv.version = 'TCCC-ASM-11-01 · 1 AUG 19'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'ASM-027',
  'ASM',
  27,
  'Reassessed the casualty’s airway status and respiratory rate/effort and determined whether or not the airway was open (Look, Listen, and Feel).',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'ASM'
  and cv.version = 'TCCC-ASM-11-01 · 1 AUG 19'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'ASM-028',
  'ASM',
  28,
  'Examined the casualty’s chest and abdomen, and rolled them to expose their back, looking for signs or symptoms of penetrating or open chest wounds.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'ASM'
  and cv.version = 'TCCC-ASM-11-01 · 1 AUG 19'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'ASM-029',
  'ASM',
  29,
  'Placed a conscious casualty in a sitting or recovery position OR an unconscious casualty in the recovery position.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'ASM'
  and cv.version = 'TCCC-ASM-11-01 · 1 AUG 19'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'ASM-030',
  'ASM',
  30,
  'Described secondary injuries that may be present (eye trauma, head injury, burns, or fractures) and identified the appropriate interventions.',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'ASM'
  and cv.version = 'TCCC-ASM-11-01 · 1 AUG 19'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'ASM-031',
  'COMMS',
  31,
  'Communicated findings and medical aid provided to medical responders.',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'ASM'
  and cv.version = 'TCCC-ASM-11-01 · 1 AUG 19'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'ASM-032',
  'DOC',
  32,
  'Documented medical aid rendered on a DD Form 1380, TCCC Card or on the casualty’s forehead if the DD 1380 is not available.',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'ASM'
  and cv.version = 'TCCC-ASM-11-01 · 1 AUG 19'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'ASM-L-EVAC-01',
  'EVAC',
  33,
  'Prepared the casualty for evacuation/transfer to medical responders while ensuring lifesaving interventions, dressings, and equipment remained secure.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'ASM'
  and cv.version = 'TCCC-ASM-11-01 · 1 AUG 19'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-001',
  'CUF',
  1,
  'Performed Care Under Fire (CUF).',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-001A',
  'CUF',
  2,
  'Returned fire and took cover.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-001B',
  'CUF',
  3,
  'Directed the casualty to remain engaged as a combatant, if appropriate.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-001C',
  'CUF',
  4,
  'Directed the casualty to move to cover and apply self-aid, if able.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-001D',
  'CUF',
  5,
  'Performed a casualty drag/carry to move an unresponsive or immobile casualty to cover or to a secure site as the tactical situation permitted.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-001E',
  'CUF',
  6,
  'Extracted casualties from sources of burning and moved them to safety.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-001F',
  'CUF',
  7,
  'Stopped the burning process as necessary.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-001G',
  'CUF',
  8,
  'Applied a high & tight limb tourniquet over the uniform and proximal (above) to the bleeding site(s) using the casualty’s JFAK and supplies.',
  true,
  true,
  60000,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-002',
  'TFC',
  9,
  'Performed Tactical Field Care (TFC).',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-002A',
  'TFC',
  10,
  'Established security perimeter/maintained tactical situational awareness.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-002B',
  'TFC',
  11,
  'Triaged casualties as required.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-002C',
  'TFC',
  12,
  'Took weapons/communication equipment from casualties with altered mental status.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-003',
  'TFC',
  13,
  'Verbalized the meaning of MARCH PAWS and used the sequence to perform a casualty assessment.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-004',
  'M',
  14,
  'Assessed and treated Massive hemorrhage. Assessed for unrecognized hemorrhage and controlled all sources of bleeding.',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-004A',
  'M',
  15,
  'Applied a tourniquet directly to the skin, 2–3 inches above the bleeding site if not previously done in CUF, or applied a second tourniquet side-by-side if bleeding was not controlled with the first tourniquet.',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-004B',
  'M',
  16,
  'Applied improvised junctional hemorrhage control techniques using hemostatic dressing(s) to hemorrhage not amenable to a tourniquet.',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-004C',
  'M',
  17,
  'Packed any wounds not amenable to TQs use with Combat Gauze or another CoTCCC-recommended hemostatic dressing/adjuncts (held pressure for 3 minutes) and applied pressure bandage.',
  true,
  true,
  180000,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-005',
  'A',
  18,
  'Assessed and secured the Airway.',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-005A',
  'A',
  19,
  'Allowed conscious casualty to assume any position of comfort that facilitates breathing and protects the airway.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-005B',
  'A',
  20,
  'Used head-tilt/chin-lift or jaw-thrust maneuver to open airway, if needed.',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-005C',
  'A',
  21,
  'Inserted a nasopharyngeal airway (NPA) in an unconscious or semiconscious casualty.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-006',
  'R',
  22,
  'Assessed Respiration.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-006A',
  'R',
  23,
  'Looked for chest wounds.',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-006B',
  'R',
  24,
  'Applied a chest seal in the presence of an open chest wound.',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-006C',
  'R',
  25,
  'Assessed for tension pneumothorax.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-006D',
  'R',
  26,
  'Burped the chest seal.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-006E',
  'R',
  27,
  'Performed needle decompression in the presence of tension pneumothorax.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-006F',
  'R',
  28,
  'Reassessed to confirm needle decompression was successful.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-007',
  'C',
  29,
  'Assessed Circulation.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-007A',
  'C',
  30,
  'Reassessed tourniquets and/or wound packings after each movement.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-007B',
  'C',
  31,
  'Assessed for pelvic fracture and informed medical personnel.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-007C',
  'C',
  32,
  'Assessed for hemorrhagic shock (altered mental status in the absence of brain injury and/or weak or absent radial pulse).',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-008',
  'H',
  33,
  'Prevented and treated Hypothermia (active/passive).',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-008A',
  'H',
  34,
  'Minimized casualty exposure to the environment.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-008B',
  'H',
  35,
  'Employed active warming measures, if available.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-008C',
  'H',
  36,
  'Used passive warming measures if active warming device was unavailable.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-009',
  'H2',
  37,
  'Assessed for Head injury.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-009A',
  'H2',
  38,
  'Checked for signs and symptoms of a head injury.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-009B',
  'H2',
  39,
  'Reported observations to medical personnel.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-L-H2-IED-01',
  'H2',
  40,
  'IED — Injury: Determined whether the Service Member sustained physical injury during the event.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-L-H2-IED-02',
  'H2',
  41,
  'HEADS — H: Assessed for headache and/or vomiting.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-L-H2-IED-03',
  'H2',
  42,
  'HEADS — E: Assessed for ear ringing.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-L-H2-IED-04',
  'H2',
  43,
  'HEADS — A: Assessed for amnesia, altered consciousness, and/or loss of consciousness.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-L-H2-IED-05',
  'H2',
  44,
  'HEADS — D: Assessed for double vision and/or dizziness.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-L-H2-IED-06',
  'H2',
  45,
  'HEADS — S: Asked whether something feels wrong or is not right.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-L-H2-IED-07',
  'H2',
  46,
  'IED — Distance: Determined whether the Service Member was within 50 meters of the blast and recorded the estimated distance.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-L-H2-IED-08',
  'H2',
  47,
  'If the IED/HEADS screen was positive or TBI was suspected, referred/escalated for medical evaluation and MACE 2 by Tier 3/4 personnel when able.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-010',
  'SEQ',
  48,
  'Performed the MARCH sequence in the correct order.',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-011',
  'SEQ',
  49,
  'Covered the eye with a rigid eye shield and administered the Combat Wound Medication Pack (CWMP) for suspected penetrating eye injury.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-012',
  'P',
  50,
  'Controlled Pain.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-012A',
  'P',
  51,
  'Administered the CWMP to conscious casualty who could swallow.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-012B',
  'P',
  52,
  'Referred to medical personnel if pain was severe.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-013',
  'ABX',
  53,
  'Administered Antibiotic(s).',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-013A',
  'ABX',
  54,
  'Administered the CWMP for any open wounds to conscious casualty who could swallow.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-013B',
  'ABX',
  55,
  'Referred to medic if the casualty could not swallow (in shock/unconscious).',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-014',
  'W',
  56,
  'Treated additional Wounds.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-014A',
  'W',
  57,
  'Inspected and dressed additional wounds (e.g., lacerations), as necessary.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-014B',
  'W',
  58,
  'Assessed/treated burns with dry, sterile dressings and hypothermia prevention.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-015',
  'S',
  59,
  'Splinted any fractures without disrupting any impaled objects.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-016',
  'COMMS',
  60,
  'Communicated: Transmitted the 9-Line MEDEVAC information.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-016A',
  'COMMS',
  61,
  'Communicated with the casualty, if possible.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-016B',
  'COMMS',
  62,
  'Communicated with tactical leadership and reported ASAP lines 3, 4, and 5.',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-016C',
  'COMMS',
  63,
  'Communicated with the evacuation system to arrange for Technical Evaluation Care (TACEVAC).',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-016D',
  'COMMS',
  64,
  'Communicated with medical providers and relayed MIST report.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-017',
  'DOC',
  65,
  'Document: Recorded all treatment on a DD Form 1380 TCCC Casualty Card and attached it to the casualty.',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-018',
  'EVAC',
  66,
  'Prepared for evacuation.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-018A',
  'EVAC',
  67,
  'Secured all loose bandages, equipment, blankets, etc.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-018B',
  'EVAC',
  68,
  'Secured litter straps as required; considered additional padding, as needed.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-018C',
  'EVAC',
  69,
  'Provided instructions to ambulatory patients as needed.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-018D',
  'EVAC',
  70,
  'Staged casualties for evacuation and identified litter team(s).',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CLS-018E',
  'EVAC',
  71,
  'Maintained security/safety at the evacuation point.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CLS'
  and cv.version = 'TCCC-CLS-02-12 · 30 JUN 20'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-001',
  'CUF',
  1,
  'Returned fire to gain fire superiority and took cover',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-002',
  'CUF',
  2,
  'Directed casualty to remain engaged as a combatant, if appropriate; or to move to cover and apply self-aid, if able',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-003',
  'CUF',
  3,
  'Performed casualty drag/carry to move casualty as tactical situation permitted',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-004',
  'CUF',
  4,
  'Extracted casualty from sources of burning and stopped burning process if needed',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-005',
  'CUF',
  5,
  'Addressed Life-threatening Extremity Bleeding: applied a CoTCCC-recommended limb tourniquet over the uniform, clearly proximal to the bleeding site, or high and tight if the bleeding site was not readily apparent using the casualty’s JFAK and supplies',
  true,
  true,
  60000,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-006',
  'TFC',
  6,
  'Established security perimeter/maintained tactical situational awareness',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-007',
  'TFC',
  7,
  'Took body substance isolation precautions, if tactical situation permitted',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-008',
  'TFC',
  8,
  'Triaged casualties as required',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-009',
  'TFC',
  9,
  'Verbalized the meaning of MARCH PAWS and used the sequence to perform the tactical trauma assessment',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-010',
  'M',
  10,
  'Performed blood sweep of: Neck, Axillary, Inguinal, Anterior, Posterior, and Extremities',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-011',
  'M',
  11,
  'Assessed effectiveness of TQs placed in CUF, if ineffective applied deliberate TQ',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-012',
  'M',
  12,
  'Applied a deliberate TQ directly to skin, 2–3 inches above bleed site, if not done in CUF (or applied 2nd TQ side-by-side if bleeding not controlled with the 1st TQ)',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-013',
  'M',
  13,
  'Applied a second tourniquet side-by-side if bleeding was not controlled with the first tourniquet',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-014',
  'M',
  14,
  'Packed any wounds not amenable to TQs use with Combat Gauze or another CoTCCC-recommended hemostatic dressing/adjuncts (held pressure for 3 minutes) and applied pressure bandages',
  false,
  true,
  180000,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-015',
  'M',
  15,
  'Packed and dressed junctional wounds with a CoTCCC-recommended hemostatic dressing or adjunct and applied junctional TQ(s), without delay when indicated and available',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-016',
  'M',
  16,
  'Performed initial hemorrhagic shock assessment',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-017',
  'A',
  17,
  'Assessed for unobstructed airway',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-018',
  'A',
  18,
  'Identified traumatic airway obstruction or impending traumatic airway obstruction',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-019',
  'A',
  19,
  'Allowed conscious casualty to sit up, lean forward, or assume the position that best protected the airway',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-020',
  'A',
  20,
  'Placed unconscious casualty in the recovery position with head tilted back and chin away from chest',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-021',
  'A',
  21,
  'Used suction, if available and appropriate',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-022',
  'A',
  22,
  'Cleared excess secretions using mechanical or manual suctioning, if indicated',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-023',
  'A',
  23,
  'If previous measures unsuccessful or airway obstruction is unmanageable, perform cricothyroidotomy. NOTE: Use lidocaine on conscious casualties',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-024',
  'A',
  24,
  'Confirmed airway placement with continuous EtCO2 capnography, if available',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-025',
  'A',
  25,
  'Frequently reassess airway patency, SpO2, and EtCO2, as airway status changed over time',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-026',
  'A',
  26,
  'Did not perform cervical spine stabilization for casualty with only penetrating trauma',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-027',
  'R',
  27,
  'Removed and opened body armor as tactically feasible and inspected torso wounds (front and back)',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-028',
  'R',
  28,
  'Assessed breathing and initiated pulsed oximetry, if available',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-029',
  'R',
  29,
  'Suspected for tension pneumothorax with significant torso trauma or primary blast injury with respiratory distress, unilateral decreased breath sounds, hypoxia, shock, or traumatic arrest',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-030',
  'R',
  30,
  'Applied vented chest seal to all open or sucking chest wounds',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-031',
  'R',
  31,
  'Used a non-vented chest seal if vented seal was unavailable',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-032',
  'R',
  32,
  'Burped or removed chest seal if increasing hypoxia, respiratory distress, hypotension, or suspected tension pneumothorax developed',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-033',
  'R',
  33,
  'Performed needle decompression (NDC) for suspected tension pneumothorax; used a 10-gauge or 14-gauge, 3.25-inch needle/catheter; used the 5th ICS in the AAL or the 2nd ICS in the MCL',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-034',
  'R',
  34,
  'Held catheter in place for 5 to 10 seconds, removed needle, and left catheter in place',
  false,
  true,
  10000,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-035',
  'R',
  35,
  'Reassessed NDC effectiveness using respiratory improvement, air release, SpO₂ response, return of consciousness, or radial pulse',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-036',
  'R',
  36,
  'Repeated NDC at alternate approved site if initial NDC failed',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-037',
  'R',
  37,
  'Considered decompression of the opposite side based on mechanism of injury and physical findings',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-038',
  'R',
  38,
  'Monitored for increasing hypoxia, respiratory distress, hypotension, or subsequent tension pneumothorax',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-039',
  'R',
  39,
  'Support inadequate ventilation with properly sized NPA and a 1000mL resuscitator BVM, when indicated',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-040',
  'R',
  40,
  'Used continuous SpO₂ and EtCO₂ monitoring, when available',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-041',
  'R',
  41,
  'Reassessed response after NDC and repeated NDC as indicated',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-042',
  'C',
  42,
  'Assessed for suspected pelvic fracture after severe blunt force or blast injury with one or more of the following: pelvic pain, major lower limb amputation or near amputation, physical exam findings suggestive of pelvic fracture, unconsciousness, or shock',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-043',
  'C',
  43,
  'Applied pelvic compression device',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-044',
  'C',
  44,
  'Reassessed all prior tourniquets',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-045',
  'C',
  45,
  'Exposed wound and determined if tourniquet was still needed',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-046',
  'C',
  46,
  'If a limb tourniquet over the uniform was still needed, applied a second tourniquet directly to the skin, 2 to 3 inches above the bleeding site, then loosened the first tourniquet',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-047',
  'C',
  47,
  'Confirmed bleeding control',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-048',
  'C',
  48,
  'Checked distal pulse, if no traumatic amputation was present',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-049',
  'C',
  49,
  'Tightened tourniquet or applied second tourniquet side-by-side if bleeding continued or distal pulse remained',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-050',
  'C',
  50,
  'Converted limb or junctional tourniquet to hemostatic or pressure dressing only if casualty was not in shock, the wound could be closely monitored, and the tourniquet was not controlling bleeding from an amputated extremity',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-051',
  'C',
  51,
  'Marked all tourniquets with time of application',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-052',
  'C',
  52,
  'Documented tourniquet application, re-application, conversion, and removal times on DD Form 1380',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-053',
  'C',
  53,
  'Assessed for hemorrhagic shock',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-054',
  'C',
  54,
  'Established IV/IO access when casualty was in hemorrhagic shock, at significant risk of shock, or required medications but could not take them by mouth',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-055',
  'C',
  55,
  'Administered TXA 2 g slow IV/IO push as soon as possible, but not later than 3 hours after injury, when indicated',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-056',
  'C',
  56,
  'Administered blood products for hemorrhagic shock under approved protocol, using a fluid warming device when available',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-057',
  'C',
  57,
  'Administered 1 g calcium after the first transfused blood product',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-058',
  'C',
  58,
  'Reassessed casualty after each unit of blood products and discontinued resuscitation when radial pulse, mental status, or systolic BP target was met',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-059',
  'C',
  59,
  'Assessed refractory shock for possible untreated tension pneumothorax and treated with repeated NDC, or finger thoracostomy/chest tube if trained and authorized',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-060',
  'C',
  60,
  'Repositioned tourniquet directly to the skin once effective reposition tourniquet is applied; confirm no bleeding and no distal pulse, if there is no traumatic amputation',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-061',
  'C',
  61,
  'Tightened the tourniquet or applied a second tourniquet side-by-side, if bleeding persists or distal pulse remains',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-062',
  'C',
  62,
  'Convert limb or junctional tourniquet to hemostatic or pressure dressing only if: a) Casualty was not in shock; b) Wound could be closely monitored; c) Tourniquet was not controlling bleeding from an amputated extremity. NOTE: Do not remove a tourniquet in place more than 6 hours unless close monitoring and lab capability are available',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-063',
  'C',
  63,
  'Notified tactical leader if casualty required evacuation (from the MEDEVAC Request)',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-064',
  'H',
  64,
  'Initiated early hypothermia prevention',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-065',
  'H',
  65,
  'Minimized casualty exposure and insulated casualty from cold surfaces',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-066',
  'H',
  66,
  'Replace wet clothing, if feasible',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-067',
  'H',
  67,
  'Applied active warming without placing active heat directly on skin',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-068',
  'H',
  68,
  'Enclosed casualty in impermeable enclosure system, when available',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-069',
  'H',
  69,
  'Warmed IV/IO fluids when equipment was available',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-086',
  'H',
  70,
  'Employed active warming measures, applied exterior impermeable enclosure bag, if available',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-070',
  'H2',
  71,
  'Assessed for suspected head injury',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-071',
  'H2',
  72,
  'Identified suspected moderate/severe TBI: inability to follow simple instructions beyond 10 minutes after injury with suspected head injury and no alternate cause',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-072',
  'H2',
  73,
  'Prevented hypoxemia and hypotension in suspected moderate/severe TBI',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-073',
  'H2',
  74,
  'Maintained SpO₂ ≥ 92% when oxygen was available',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-074',
  'H2',
  75,
  'Targeted SBP >100 mmHg or normal radial pulse if BP monitoring was unavailable',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-075',
  'H2',
  76,
  'If hemorrhagic shock was present, prioritized hemorrhagic shock resuscitation',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-076',
  'H2',
  77,
  'If suspected moderate/severe TBI was present with no evidence of hemorrhage, administered 1 – 2 units of plasma when available and authorized',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-077',
  'H2',
  78,
  'If EtCO₂ monitoring was unavailable, ventilated at 10 breaths per minute using low tidal volume',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-078',
  'H2',
  79,
  'Elevated head and torso greater than 30 degrees if casualty was not in shock and tactically feasible',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-079',
  'H2',
  80,
  'Identified signs of herniation, including asymmetric or fixed/dilated pupils or posturing',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-080',
  'H2',
  81,
  'Administered hypertonic saline when herniation was suspected: 250 mL of 3% or 5% hypertonic saline IV/IO over at least 10 minutes OR 30 mL of 23.4% hypertonic saline IV/IO over at least 10 minutes',
  false,
  true,
  600000,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-081',
  'H2',
  82,
  'Repeated hypertonic saline once in 20 minutes if no response. NOTE: Did not use hypertonic saline prophylactically',
  false,
  true,
  1200000,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-082',
  'H2',
  83,
  'Managed penetrating TBI or open skull fracture as treatable injury, not automatically expectant',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-083',
  'H2',
  84,
  'Applied hemostatic gauze with gentle pressure for active bleeding from wound or wound edges. NOTE: Did not pack wound cavity. Did not close wound with staples or sutures.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-084',
  'H2',
  85,
  'Reassessed neurologic status every 5 to 10 minutes',
  false,
  true,
  600000,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-085',
  'H2',
  86,
  'Reassessed prior interventions using (M/A/R/C/H)',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-087',
  'H2',
  87,
  'Assessed for head injury (altered mental status, wounds, visual changes)',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-088',
  'H2',
  88,
  'Assessed for penetrating eye trauma',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-089',
  'H2',
  89,
  'Performed rapid visual acuity test and documented findings',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-090',
  'H2',
  90,
  'Covered injured eye with rigid eye shield, not a pressure patch',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-091',
  'H2',
  91,
  'Administered Ceftriaxone 2 g IV/IM or Cefadroxil 1 g PO as soon as possible',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-092',
  'H2',
  92,
  'Reassess prior interventions (M/A/R/C/H)',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-093',
  'H2',
  93,
  'Initiated electronic monitoring if indicated and equipment was available',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-DAF-MACE2',
  'H2',
  94,
  'Administered MACE 2 examination.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-094',
  'P',
  95,
  'Checked for drug allergies before medication administration',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-095',
  'P',
  96,
  'Documented mental status using AVPU before ketamine',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-096',
  'P',
  97,
  'Disarmed casualty and considered disconnecting communications equipment when ketamine was administered',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-097',
  'P',
  98,
  'Administered analgesia appropriate to casualty status: CWMP if casualty was mission capable and able to take PO medications OR Ketamine or esketamine for non-mission-capable casualty when indicated',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-098',
  'P',
  99,
  'Monitored airway, breathing, circulation, mentation, and pain response after potent analgesics',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-099',
  'P',
  100,
  'Avoided benzodiazepine co-administration with ketamine or esketamine',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-100',
  'ABX',
  101,
  'Checked for drug allergies before administration of any medications',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-101',
  'ABX',
  102,
  'Administered for all open combat wounds and invasive procedures',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-102',
  'ABX',
  103,
  'If casualty could take PO medications: Cefadroxil 1 g PO once daily (preferred) or Cephalexin 500 mg PO every 6 hours (alternative)',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-103',
  'ABX',
  104,
  'If casualty could not take PO medications due to shock, unconsciousness, or other clinical limitation: Ceftriaxone 2 g IV/IO/IM once daily',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-104',
  'W',
  105,
  'Reassessed any and all medical interventions',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-105',
  'W',
  106,
  'Reassessed known wounds and identify additional wounds',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-106',
  'W',
  107,
  'Assessed for other wounds and, if indicated, apply dressing(s) for abdominal evisceration(s), dressing(s) to stump(s), dressing(s) to any impaled object(s)',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-107',
  'W',
  108,
  'Monitored facial burns for inhalation injury and consider early airway intervention',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-108',
  'W',
  109,
  'Estimated TBSA using Rule of Nines',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-109',
  'W',
  110,
  'Covered burns with dry sterile dressings and prevent hypothermia',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-110',
  'W',
  111,
  'If burns are >20% TBSA, start fluid resuscitation when IV/IO access is established',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-111',
  'W',
  112,
  'Treated as trauma casualty with burns. NOTE: Do not give antibiotics for burns alone',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-112',
  'W',
  113,
  'Used procedural sedation for severe injury, casualty safety, mission success, or invasive procedure: a) Ketamine 1 - 2mg/kg slow IV/IO push initial dose; b) Ketamine 300mg IM or 2 - 3mg/kg IM initial dose',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-113',
  'S',
  114,
  'Splinted any fractures without disrupting any impaled objects',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-114',
  'S',
  115,
  'Rechecked distal pulse, motor, and sensation after splinting when feasible',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-115',
  'CPR',
  116,
  'Considered bilateral NDC for casualty with torso trauma or polytrauma who had no pulse and no respirations before discontinuing care',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-116',
  'COMMS',
  117,
  'Communicated with the casualty, if possible',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-117',
  'COMMS',
  118,
  'Communicated with tactical leadership and reported lines 3, 4, and 5 from the MEDEVAC Request report',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-118',
  'COMMS',
  119,
  'Communicated with medical evacuation personnel and relayed MIST report',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-119',
  'DOC',
  120,
  'Documented all findings and treatments on a DD Form 1380 and attached it to the casualty',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-120',
  'EVAC',
  121,
  'Placed and secured casualty on litter for evacuation, if not completed already',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-121',
  'EVAC',
  122,
  'Secured all loose bandages, equipment, hypothermia wraps, and litter straps, etc , as needed',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-122',
  'EVAC',
  123,
  'Staged casualties for evacuation and identified litter team(s)',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CMC-123',
  'EVAC',
  124,
  'Maintained security/safety at the evacuation point',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CMC'
  and cv.version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-001',
  'CUF',
  1,
  'Returned fire to gain fire superiority and took cover',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-002',
  'CUF',
  2,
  'Directed casualty to remain engaged as a combatant, if appropriate; or to move to cover and apply self-aid, if able',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-003',
  'CUF',
  3,
  'Performed casualty drag/carry to move casualty as tactical situation permitted',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-004',
  'CUF',
  4,
  'Extracted casualty from sources of burning and stopped burning process if needed',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-005',
  'CUF',
  5,
  'Addressed life-threatening extremity hemorrhage using a CoTCCC-recommended limb tourniquet over the uniform, clearly proximal to the bleeding site, or high and tight if the bleeding site was not readily apparent',
  true,
  true,
  60000,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-006',
  'TFC',
  6,
  'Established security perimeter/maintained tactical situational awareness',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-007',
  'TFC',
  7,
  'If tactical situation permitted, took body substance isolation precautions',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-008',
  'TFC',
  8,
  'Triaged casualties as required',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-009',
  'TFC',
  9,
  'Verbalized the meaning of MARCH PAWS and used the sequence to perform the tactical trauma assessment',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-010',
  'M',
  10,
  'Assessed effectiveness of TQs placed in CUF, if ineffective applied deliberate TQ',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-011',
  'M',
  11,
  'Applied a deliberate TQ directly to skin, 2–3 inches above bleed site, if not done in CUF (or applied 2nd TQ side-by-side if bleeding not controlled with the 1st TQ)',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-012',
  'M',
  12,
  'Applied a second tourniquet side-by-side if bleeding was not controlled with the first tourniquet.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-013',
  'M',
  13,
  'Packed any wounds not amenable to TQs use with Combat Gauze or another CoTCCC-recommended hemostatic dressing/adjuncts (held pressure for 3 minutes) and applied pressure bandages',
  false,
  true,
  180000,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-014',
  'M',
  14,
  'Performed blood sweep of: Neck, Axillary, Inguinal, Anterior, Posterior, and Extremities',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-015',
  'M',
  15,
  'Packed and dressed junctional wounds with a CoTCCC-recommended hemostatic dressing or adjunct and applied junctional TQ(s), without delay when indicated and available',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-016',
  'M',
  16,
  'Performed initial hemorrhagic shock assessment',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-017',
  'A',
  17,
  'Assessed for unobstructed airway',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-018',
  'A',
  18,
  'Identified traumatic airway obstruction or impending traumatic airway obstruction',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-019',
  'A',
  19,
  'Allowed conscious casualty to sit up, lean forward, or assume the position that best protected the airway',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-020',
  'A',
  20,
  'Placed unconscious casualty in the recovery position with head tilted back and chin away from chest',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-021',
  'A',
  21,
  'Used suction, if available and appropriate',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-022',
  'A',
  22,
  'Cleared excess secretions using mechanical or manual suctioning, if indicated',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-023',
  'A',
  23,
  'If previous measures unsuccessful or airway obstruction is unmanageable, performed cricothyroidotomy. NOTE: Used lidocaine on conscious casualties',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-024',
  'A',
  24,
  'Confirmed airway placement with continuous EtCO2 capnography, if available',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-025',
  'A',
  25,
  'Frequently reassess airway patency, SpO, and EtCO2, as airway status changed over time',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-026',
  'A',
  26,
  'Did not perform cervical spine stabilization for casualty with only penetrating trauma',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-027',
  'R',
  27,
  'Removed and opened body armor as tactically feasible and inspected torso wounds (front and back)',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-028',
  'R',
  28,
  'Assessed breathing and confirmed pulsed oximetry, if available',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-029',
  'R',
  29,
  'Suspected for tension pneumothorax with significant torso trauma or primary blast injury with respiratory distress, unilateral decreased breath sounds, hypoxia, shock, or traumatic arrest',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-030',
  'R',
  30,
  'Applied vented chest seal to all open or sucking chest wounds',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-031',
  'R',
  31,
  'Used a non-vented chest seal if vented seal was unavailable',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-032',
  'R',
  32,
  'Burped or removed chest seal if increasing hypoxia, respiratory distress, hypotension, or suspected tension pneumothorax developed',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-033',
  'R',
  33,
  'Performed needle decompression (NDC) for suspected tension pneumothorax; used a 10-gauge or 14-gauge, 3.25-inch needle/catheter; used the 5th ICS in the AAL or the 2nd ICS in the MCL',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-034',
  'R',
  34,
  'Held catheter in place for 5 to 10 seconds, removed needle, and left catheter in place',
  false,
  true,
  10000,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-035',
  'R',
  35,
  'Reassessed NDC effectiveness using respiratory improvement, air release, SpO₂ response, return of consciousness, or radial pulse',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-036',
  'R',
  36,
  'Repeated NDC at alternate approved site if initial NDC failed',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-037',
  'R',
  37,
  'Considered decompression of the opposite side based on mechanism of injury and physical findings',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-038',
  'R',
  38,
  'Monitored for increasing hypoxia, respiratory distress, hypotension, or subsequent tension pneumothorax',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-039',
  'R',
  39,
  'Supported inadequate ventilation with properly sized NPA and a 1000mL resuscitator BVM, when indicated',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-040',
  'R',
  40,
  'Used continuous SpO2 and EtCO2 monitoring when available',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-041',
  'R',
  41,
  'Reassessed response after NDC and repeated NDC as indicated',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-042',
  'C',
  42,
  'Assessed for suspected pelvic fracture after severe blunt force or blast injury with one or more of the following: pelvic pain, major lower limb amputation or near amputation, physical exam findings suggestive of pelvic fracture, unconsciousness, or shock',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-043',
  'C',
  43,
  'Applied pelvic compression device',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-044',
  'C',
  44,
  'Reassessed all prior tourniquets',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-045',
  'C',
  45,
  'Exposed wound and determined if tourniquet was still needed',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-046',
  'C',
  46,
  'If a limb tourniquet over the uniform was still needed, applied a second tourniquet directly to the skin, 2 to 3 inches above the bleeding site, then loosened the first tourniquet',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-047',
  'C',
  47,
  'Confirmed bleeding control',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-048',
  'C',
  48,
  'Checked distal pulse, if no traumatic amputation was present',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-049',
  'C',
  49,
  'Tightened tourniquet or applied second tourniquet side-by-side if bleeding continued or distal pulse remained',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-050',
  'C',
  50,
  'Converted limb or junctional tourniquet to hemostatic or pressure dressing only if casualty was not in shock, the wound could be closely monitored, and the tourniquet was not controlling bleeding from an amputated extremity',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-051',
  'C',
  51,
  'Marked all tourniquets with time of application',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-052',
  'C',
  52,
  'Documented tourniquet application, re-application, conversion, and removal times on DD Form 1380',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-053',
  'C',
  53,
  'Assessed for hemorrhagic shock',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-054',
  'C',
  54,
  'Established IV/IO access when casualty was in hemorrhagic shock, at significant risk of shock, or required medications but could not take them by mouth',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-055',
  'C',
  55,
  'Administered TXA 2 g slow IV/IO push as soon as possible, but not later than 3 hours after injury, when indicated',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-056',
  'C',
  56,
  'Administered blood products for hemorrhagic shock under approved protocol, using a fluid warming device when available',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-057',
  'C',
  57,
  'Administered 1 g calcium after the first transfused blood product',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-058',
  'C',
  58,
  'Reassessed casualty after each unit of blood products and discontinued resuscitation when radial pulse, mental status, or systolic BP target was met',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-059',
  'C',
  59,
  'Assessed refractory shock for possible untreated tension pneumothorax and treated with repeated NDC, or finger thoracostomy/chest tube if trained and authorized',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-060',
  'C',
  60,
  'Repositioned tourniquet directly to the skin once effective reposition tourniquet is applied; confirm no bleeding and no distal pulse, if there is no traumatic amputation',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-061',
  'C',
  61,
  'Tightened the tourniquet or applied a second tourniquet side-by-side, if bleeding persists or distal pulse remains',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-062',
  'C',
  62,
  'Convert limb or junctional tourniquet to hemostatic or pressure dressing only if: a) Casualty was not in shock; b) Wound could be closely monitored; c) Tourniquet was not controlling bleeding from an amputated extremity. NOTE: Do not remove a tourniquet in place more than 6 hours unless close monitoring and lab capability are available',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-063',
  'C',
  63,
  'Notified tactical leader if casualty required evacuation (lines 3, 4, and 5 from the 9-Line at a minimum)',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-064',
  'H',
  64,
  'Initiated early hypothermia prevention',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-065',
  'H',
  65,
  'Minimized casualty exposure and insulated casualty from cold surfaces',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-066',
  'H',
  66,
  'Replace wet clothing, if feasible',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-067',
  'H',
  67,
  'Applied active warming without placing active heat directly on skin',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-068',
  'H',
  68,
  'Enclosed casualty in impermeable enclosure system, when available',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-069',
  'H',
  69,
  'Warmed IV/IO fluids when equipment was available',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-070',
  'H2',
  70,
  'Assessed for suspected head injury: unable to follow simple instructions beyond 10 minutes after injury with suspected head injury and no alternate cause',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-071',
  'H2',
  71,
  'Prevented hypoxemia and hypotension in suspected moderate/severe TBI',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-072',
  'H2',
  72,
  'Maintained SpO₂ ≥ 92% when oxygen was available',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-073',
  'H2',
  73,
  'Targeted SBP >100 mmHg or normal radial pulse if BP monitoring was unavailable',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-074',
  'H2',
  74,
  'If hemorrhagic shock was present, prioritized hemorrhagic shock resuscitation',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-075',
  'H2',
  75,
  'If suspected moderate/severe TBI was present with no evidence of hemorrhage, administer 1–2 units of plasma when available and authorized',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-076',
  'H2',
  76,
  'If EtCO₂ monitoring was unavailable, ventilated at 10 breaths per minute using low tidal volume',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-077',
  'H2',
  77,
  'Elevated head and torso greater than 30 degrees if casualty was not in shock and tactically feasible',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-078',
  'H2',
  78,
  'Identified signs of herniation, including asymmetric or fixed/dilated pupils or posturing',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-079',
  'H2',
  79,
  'Administered hypertonic saline when herniation was suspected: 250 mL of 3% or 5% hypertonic saline IV/IO over at least 10 minutes OR 30 mL of 23.4% hypertonic saline IV/IO over at least 10 minutes',
  false,
  true,
  600000,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-080',
  'H2',
  80,
  'Repeated hypertonic saline once in 20 minutes if no response. NOTE: Did not use hypertonic saline prophylactically',
  false,
  true,
  1200000,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-081',
  'H2',
  81,
  'Managed penetrating TBI or open skull fracture as treatable injury, not automatically expectant',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-082',
  'H2',
  82,
  'Applied hemostatic gauze with gentle pressure for active bleeding from wound or wound edges. NOTE: Did not pack wound cavity. Did not close wound with staples or sutures.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-083',
  'H2',
  83,
  'Reassessed neurologic status every 5 to 10 minutes',
  false,
  true,
  600000,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-084',
  'H2',
  84,
  'Reassessed prior interventions using (M/A/R/C/H)',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-085',
  'H2',
  85,
  'Assessed for penetrating eye trauma',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-086',
  'H2',
  86,
  'Performed rapid visual acuity test and documented findings',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-087',
  'H2',
  87,
  'Covered injured eye with rigid eye shield, not a pressure patch',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-088',
  'H2',
  88,
  'Administered ceftriaxone 2 g IV/IM or cefadroxil 1 g PO as soon as possible',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-089',
  'H2',
  89,
  'Reassess prior interventions (M/A/R/C/H)',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-090',
  'H2',
  90,
  'Initiated electronic monitoring if indicated and equipment was available',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-DAF-MACE2',
  'H2',
  91,
  'Administered MACE 2 examination.',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-091',
  'P',
  92,
  'Checked for drug allergies before medication administration',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-092',
  'P',
  93,
  'Documented mental status using AVPU before ketamine',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-093',
  'P',
  94,
  'Disarmed casualty and considered disconnecting communications equipment when ketamine was administered',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-094',
  'P',
  95,
  'Administered CWMP for mission-capable casualty who could take PO medications: Acetaminophen 1000 to 1300 mg PO every 8 hours; Meloxicam 15 mg PO once daily; Suzetrigine 100 mg PO once, then 50 mg PO every 12 hours',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-095',
  'P',
  96,
  'Administered ketamine or esketamine for non-mission-capable casualty when indicated: Ketamine 100 mg IM, or Ketamine 50 mg IN, or Ketamine 25 mg or 0.2 to 0.3 mg/kg IV/IO over 1 minute, or Esketamine 14 mg (1 spray) or 28 mg (2 sprays) IN x1',
  false,
  true,
  60000,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-096',
  'P',
  97,
  'Repeated analgesia every 30 minutes PRN based on guideline endpoints',
  false,
  true,
  1800000,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-097',
  'P',
  98,
  'Used analgesia endpoints of reduced pain or development of nystagmus',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-098',
  'P',
  99,
  'Monitored airway, breathing, circulation, mentation, and pain response after potent analgesics',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-099',
  'P',
  100,
  'Avoided benzodiazepine co-administration with ketamine or esketamine',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-100',
  'ABX',
  101,
  'Checked for drug allergies before administration of any medications',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-101',
  'ABX',
  102,
  'Administered antibiotics for all open combat wounds and invasive procedures',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-102',
  'ABX',
  103,
  'If casualty could take PO medications: Cefadroxil 1 g PO once daily (preferred) or Cephalexin 500 mg PO every 6 hours (alternative)',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-103',
  'ABX',
  104,
  'If casualty could not take PO medications due to shock, unconsciousness, or other clinical limitation: Ceftriaxone 2 g IV/IO/IM once daily',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-104',
  'W',
  105,
  'Reassessed any and all medical interventions',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-105',
  'W',
  106,
  'Reassessed known wounds and identify additional wounds',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-106',
  'W',
  107,
  'Assessed for other wounds and, if indicated, apply dressing(s) for abdominal evisceration(s), dressing(s) to stump(s), dressing(s) to any impaled object(s)',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-107',
  'W',
  108,
  'Monitored facial burns for inhalation injury and consider early airway intervention',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-108',
  'W',
  109,
  'Estimated TBSA using Rule of Nines',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-109',
  'W',
  110,
  'Covered burns with dry sterile dressings and prevent hypothermia',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-110',
  'W',
  111,
  'If burns are >20% TBSA, start fluid resuscitation when IV/IO access is established',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-111',
  'W',
  112,
  'Treated as trauma casualty with burns. NOTE: Do not give antibiotics for burns alone',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-112',
  'W',
  113,
  'Used procedural sedation for severe injury, casualty safety, mission success, or invasive procedure: a) Ketamine 1–2 mg/kg slow IV/IO push initial dose; b) Ketamine 300 mg IM or 2–3 mg/kg IM initial dose',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-113',
  'S',
  114,
  'Splinted any fractures without disrupting any impaled objects',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-114',
  'S',
  115,
  'Rechecked distal pulse, motor, and sensation after splinting when feasible',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-115',
  'CPR',
  116,
  'Considered bilateral needle decompression for casualty with torso trauma or polytrauma, who had no pulse or respirations',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-116',
  'COMMS',
  117,
  'Communicated with the casualty, if possible',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-117',
  'COMMS',
  118,
  'Communicated with tactical leadership and reported lines 3, 4, and 5 from the MEDEVAC Request report',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-118',
  'COMMS',
  119,
  'Communicated with medical evacuation personnel and relayed MIST report',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-119',
  'DOC',
  120,
  'Documented all findings and treatments on a DD Form 1380 and attached it to the casualty',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-120',
  'EVAC',
  121,
  'Placed and secured casualty on litter for evacuation, if not completed already',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-121',
  'EVAC',
  122,
  'Secured all loose bandages, equipment, hypothermia wraps, and litter straps, etc., as needed',
  true,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-122',
  'EVAC',
  123,
  'Staged casualties for evacuation and identified litter team(s)',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

insert into public.criteria (
  curriculum_version_id,
  criterion_code,
  section_name,
  sequence_number,
  criterion_text,
  critical,
  timer_required,
  timer_standard_ms,
  active
)
select
  cv.id,
  'CPP-123',
  'EVAC',
  124,
  'Maintained security/safety at the evacuation point',
  false,
  false,
  null,
  true
from public.curriculum_versions cv
where cv.course_type = 'CPP'
  and cv.version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
on conflict (curriculum_version_id, criterion_code)
do update set
  section_name = excluded.section_name,
  sequence_number = excluded.sequence_number,
  criterion_text = excluded.criterion_text,
  critical = excluded.critical,
  timer_required = excluded.timer_required,
  timer_standard_ms = excluded.timer_standard_ms,
  active = true;

commit;

-- Verification
select
  cv.course_type,
  cv.version,
  count(c.id) as criterion_count,
  count(*) filter (where c.critical) as critical_count,
  count(*) filter (where c.timer_required) as timer_linked_count
from public.curriculum_versions cv
left join public.criteria c on c.curriculum_version_id = cv.id and c.active = true
where cv.published = true
group by cv.course_type, cv.version
order by cv.course_type, cv.version;

select count(*) as total_active_criteria
from public.criteria
where active = true;

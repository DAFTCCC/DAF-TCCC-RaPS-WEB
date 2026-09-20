-- RaPS Supabase catalog seed
-- Idempotent and safe with pre-existing catalog rows.
-- IMPORTANT: this script does not rely on UNIQUE constraints for its upserts.
-- It matches MAJCOMs and bases by stable code, and curriculum versions by
-- (course_type, version). Existing rows are updated; missing rows are inserted.
begin;

-- MAJCOM / command catalog
update public.majcoms
set name = 'Air Combat Command (ACC)',
    active = true
where code = 'ACC';

insert into public.majcoms (code, name, active)
select 'ACC', 'Air Combat Command (ACC)', true
where not exists (
  select 1 from public.majcoms where code = 'ACC'
);

update public.majcoms
set name = 'Air Education and Training Command (AETC)',
    active = true
where code = 'AETC';

insert into public.majcoms (code, name, active)
select 'AETC', 'Air Education and Training Command (AETC)', true
where not exists (
  select 1 from public.majcoms where code = 'AETC'
);

update public.majcoms
set name = 'Air Force Global Strike Command (AFGSC)',
    active = true
where code = 'AFGSC';

insert into public.majcoms (code, name, active)
select 'AFGSC', 'Air Force Global Strike Command (AFGSC)', true
where not exists (
  select 1 from public.majcoms where code = 'AFGSC'
);

update public.majcoms
set name = 'Air Force Materiel Command (AFMC)',
    active = true
where code = 'AFMC';

insert into public.majcoms (code, name, active)
select 'AFMC', 'Air Force Materiel Command (AFMC)', true
where not exists (
  select 1 from public.majcoms where code = 'AFMC'
);

update public.majcoms
set name = 'Air Mobility Command (AMC)',
    active = true
where code = 'AMC';

insert into public.majcoms (code, name, active)
select 'AMC', 'Air Mobility Command (AMC)', true
where not exists (
  select 1 from public.majcoms where code = 'AMC'
);

update public.majcoms
set name = 'Air Force Special Operations Command (AFSOC)',
    active = true
where code = 'AFSOC';

insert into public.majcoms (code, name, active)
select 'AFSOC', 'Air Force Special Operations Command (AFSOC)', true
where not exists (
  select 1 from public.majcoms where code = 'AFSOC'
);

update public.majcoms
set name = 'Pacific Air Forces (PACAF)',
    active = true
where code = 'PACAF';

insert into public.majcoms (code, name, active)
select 'PACAF', 'Pacific Air Forces (PACAF)', true
where not exists (
  select 1 from public.majcoms where code = 'PACAF'
);

update public.majcoms
set name = 'U.S. Air Forces in Europe – Air Forces Africa (USAFE-AFAFRICA)',
    active = true
where code = 'USAFE-AFAFRICA';

insert into public.majcoms (code, name, active)
select 'USAFE-AFAFRICA', 'U.S. Air Forces in Europe – Air Forces Africa (USAFE-AFAFRICA)', true
where not exists (
  select 1 from public.majcoms where code = 'USAFE-AFAFRICA'
);

update public.majcoms
set name = 'Air Force District of Washington (AFDW)',
    active = true
where code = 'AFDW';

insert into public.majcoms (code, name, active)
select 'AFDW', 'Air Force District of Washington (AFDW)', true
where not exists (
  select 1 from public.majcoms where code = 'AFDW'
);

update public.majcoms
set name = 'U.S. Air Force Academy / DRU',
    active = true
where code = 'USAFA';

insert into public.majcoms (code, name, active)
select 'USAFA', 'U.S. Air Force Academy / DRU', true
where not exists (
  select 1 from public.majcoms where code = 'USAFA'
);

update public.majcoms
set name = 'Other / Joint / DRU',
    active = true
where code = 'OTHER';

insert into public.majcoms (code, name, active)
select 'OTHER', 'Other / Joint / DRU', true
where not exists (
  select 1 from public.majcoms where code = 'OTHER'
);

-- Installation catalog
update public.bases b
set majcom_id = m.id,
    name = 'Beale AFB',
    active = true
from public.majcoms m
where b.code = 'BEALE'
  and m.code = 'ACC';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'BEALE', 'Beale AFB', true
from public.majcoms m
where m.code = 'ACC'
  and not exists (
    select 1 from public.bases b where b.code = 'BEALE'
  );

update public.bases b
set majcom_id = m.id,
    name = 'Creech AFB',
    active = true
from public.majcoms m
where b.code = 'CREECH'
  and m.code = 'ACC';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'CREECH', 'Creech AFB', true
from public.majcoms m
where m.code = 'ACC'
  and not exists (
    select 1 from public.bases b where b.code = 'CREECH'
  );

update public.bases b
set majcom_id = m.id,
    name = 'Davis-Monthan AFB',
    active = true
from public.majcoms m
where b.code = 'DAVIS-MONTHAN'
  and m.code = 'ACC';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'DAVIS-MONTHAN', 'Davis-Monthan AFB', true
from public.majcoms m
where m.code = 'ACC'
  and not exists (
    select 1 from public.bases b where b.code = 'DAVIS-MONTHAN'
  );

update public.bases b
set majcom_id = m.id,
    name = 'Grand Forks AFB',
    active = true
from public.majcoms m
where b.code = 'GRAND-FORKS'
  and m.code = 'ACC';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'GRAND-FORKS', 'Grand Forks AFB', true
from public.majcoms m
where m.code = 'ACC'
  and not exists (
    select 1 from public.bases b where b.code = 'GRAND-FORKS'
  );

update public.bases b
set majcom_id = m.id,
    name = 'Holloman AFB',
    active = true
from public.majcoms m
where b.code = 'HOLLOMAN'
  and m.code = 'ACC';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'HOLLOMAN', 'Holloman AFB', true
from public.majcoms m
where m.code = 'ACC'
  and not exists (
    select 1 from public.bases b where b.code = 'HOLLOMAN'
  );

update public.bases b
set majcom_id = m.id,
    name = 'Joint Base Langley-Eustis (Langley)',
    active = true
from public.majcoms m
where b.code = 'JBLE'
  and m.code = 'ACC';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'JBLE', 'Joint Base Langley-Eustis (Langley)', true
from public.majcoms m
where m.code = 'ACC'
  and not exists (
    select 1 from public.bases b where b.code = 'JBLE'
  );

update public.bases b
set majcom_id = m.id,
    name = 'Luke AFB',
    active = true
from public.majcoms m
where b.code = 'LUKE'
  and m.code = 'ACC';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'LUKE', 'Luke AFB', true
from public.majcoms m
where m.code = 'ACC'
  and not exists (
    select 1 from public.bases b where b.code = 'LUKE'
  );

update public.bases b
set majcom_id = m.id,
    name = 'Moody AFB',
    active = true
from public.majcoms m
where b.code = 'MOODY'
  and m.code = 'ACC';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'MOODY', 'Moody AFB', true
from public.majcoms m
where m.code = 'ACC'
  and not exists (
    select 1 from public.bases b where b.code = 'MOODY'
  );

update public.bases b
set majcom_id = m.id,
    name = 'Mountain Home AFB',
    active = true
from public.majcoms m
where b.code = 'MOUNTAIN-HOME'
  and m.code = 'ACC';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'MOUNTAIN-HOME', 'Mountain Home AFB', true
from public.majcoms m
where m.code = 'ACC'
  and not exists (
    select 1 from public.bases b where b.code = 'MOUNTAIN-HOME'
  );

update public.bases b
set majcom_id = m.id,
    name = 'Nellis AFB',
    active = true
from public.majcoms m
where b.code = 'NELLIS'
  and m.code = 'ACC';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'NELLIS', 'Nellis AFB', true
from public.majcoms m
where m.code = 'ACC'
  and not exists (
    select 1 from public.bases b where b.code = 'NELLIS'
  );

update public.bases b
set majcom_id = m.id,
    name = 'Offutt AFB',
    active = true
from public.majcoms m
where b.code = 'OFFUTT'
  and m.code = 'ACC';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'OFFUTT', 'Offutt AFB', true
from public.majcoms m
where m.code = 'ACC'
  and not exists (
    select 1 from public.bases b where b.code = 'OFFUTT'
  );

update public.bases b
set majcom_id = m.id,
    name = 'Seymour Johnson AFB',
    active = true
from public.majcoms m
where b.code = 'SEYMOUR-JOHNSON'
  and m.code = 'ACC';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'SEYMOUR-JOHNSON', 'Seymour Johnson AFB', true
from public.majcoms m
where m.code = 'ACC'
  and not exists (
    select 1 from public.bases b where b.code = 'SEYMOUR-JOHNSON'
  );

update public.bases b
set majcom_id = m.id,
    name = 'Shaw AFB',
    active = true
from public.majcoms m
where b.code = 'SHAW'
  and m.code = 'ACC';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'SHAW', 'Shaw AFB', true
from public.majcoms m
where m.code = 'ACC'
  and not exists (
    select 1 from public.bases b where b.code = 'SHAW'
  );

update public.bases b
set majcom_id = m.id,
    name = 'Tyndall AFB',
    active = true
from public.majcoms m
where b.code = 'TYNDALL'
  and m.code = 'ACC';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'TYNDALL', 'Tyndall AFB', true
from public.majcoms m
where m.code = 'ACC'
  and not exists (
    select 1 from public.bases b where b.code = 'TYNDALL'
  );

update public.bases b
set majcom_id = m.id,
    name = 'Altus AFB',
    active = true
from public.majcoms m
where b.code = 'ALTUS'
  and m.code = 'AETC';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'ALTUS', 'Altus AFB', true
from public.majcoms m
where m.code = 'AETC'
  and not exists (
    select 1 from public.bases b where b.code = 'ALTUS'
  );

update public.bases b
set majcom_id = m.id,
    name = 'Columbus AFB',
    active = true
from public.majcoms m
where b.code = 'COLUMBUS'
  and m.code = 'AETC';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'COLUMBUS', 'Columbus AFB', true
from public.majcoms m
where m.code = 'AETC'
  and not exists (
    select 1 from public.bases b where b.code = 'COLUMBUS'
  );

update public.bases b
set majcom_id = m.id,
    name = 'Goodfellow AFB',
    active = true
from public.majcoms m
where b.code = 'GOODFELLOW'
  and m.code = 'AETC';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'GOODFELLOW', 'Goodfellow AFB', true
from public.majcoms m
where m.code = 'AETC'
  and not exists (
    select 1 from public.bases b where b.code = 'GOODFELLOW'
  );

update public.bases b
set majcom_id = m.id,
    name = 'Joint Base San Antonio–Lackland',
    active = true
from public.majcoms m
where b.code = 'JBSA-LACKLAND'
  and m.code = 'AETC';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'JBSA-LACKLAND', 'Joint Base San Antonio–Lackland', true
from public.majcoms m
where m.code = 'AETC'
  and not exists (
    select 1 from public.bases b where b.code = 'JBSA-LACKLAND'
  );

update public.bases b
set majcom_id = m.id,
    name = 'Joint Base San Antonio–Fort Sam Houston',
    active = true
from public.majcoms m
where b.code = 'JBSA-FORT-SAM'
  and m.code = 'AETC';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'JBSA-FORT-SAM', 'Joint Base San Antonio–Fort Sam Houston', true
from public.majcoms m
where m.code = 'AETC'
  and not exists (
    select 1 from public.bases b where b.code = 'JBSA-FORT-SAM'
  );

update public.bases b
set majcom_id = m.id,
    name = 'Joint Base San Antonio–Randolph',
    active = true
from public.majcoms m
where b.code = 'JBSA-RANDOLPH'
  and m.code = 'AETC';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'JBSA-RANDOLPH', 'Joint Base San Antonio–Randolph', true
from public.majcoms m
where m.code = 'AETC'
  and not exists (
    select 1 from public.bases b where b.code = 'JBSA-RANDOLPH'
  );

update public.bases b
set majcom_id = m.id,
    name = 'Keesler AFB',
    active = true
from public.majcoms m
where b.code = 'KEESLER'
  and m.code = 'AETC';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'KEESLER', 'Keesler AFB', true
from public.majcoms m
where m.code = 'AETC'
  and not exists (
    select 1 from public.bases b where b.code = 'KEESLER'
  );

update public.bases b
set majcom_id = m.id,
    name = 'Laughlin AFB',
    active = true
from public.majcoms m
where b.code = 'LAUGHLIN'
  and m.code = 'AETC';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'LAUGHLIN', 'Laughlin AFB', true
from public.majcoms m
where m.code = 'AETC'
  and not exists (
    select 1 from public.bases b where b.code = 'LAUGHLIN'
  );

update public.bases b
set majcom_id = m.id,
    name = 'Maxwell AFB',
    active = true
from public.majcoms m
where b.code = 'MAXWELL'
  and m.code = 'AETC';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'MAXWELL', 'Maxwell AFB', true
from public.majcoms m
where m.code = 'AETC'
  and not exists (
    select 1 from public.bases b where b.code = 'MAXWELL'
  );

update public.bases b
set majcom_id = m.id,
    name = 'Sheppard AFB',
    active = true
from public.majcoms m
where b.code = 'SHEPPARD'
  and m.code = 'AETC';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'SHEPPARD', 'Sheppard AFB', true
from public.majcoms m
where m.code = 'AETC'
  and not exists (
    select 1 from public.bases b where b.code = 'SHEPPARD'
  );

update public.bases b
set majcom_id = m.id,
    name = 'Vance AFB',
    active = true
from public.majcoms m
where b.code = 'VANCE'
  and m.code = 'AETC';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'VANCE', 'Vance AFB', true
from public.majcoms m
where m.code = 'AETC'
  and not exists (
    select 1 from public.bases b where b.code = 'VANCE'
  );

update public.bases b
set majcom_id = m.id,
    name = 'Barksdale AFB',
    active = true
from public.majcoms m
where b.code = 'BARKSDALE'
  and m.code = 'AFGSC';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'BARKSDALE', 'Barksdale AFB', true
from public.majcoms m
where m.code = 'AFGSC'
  and not exists (
    select 1 from public.bases b where b.code = 'BARKSDALE'
  );

update public.bases b
set majcom_id = m.id,
    name = 'Dyess AFB',
    active = true
from public.majcoms m
where b.code = 'DYESS'
  and m.code = 'AFGSC';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'DYESS', 'Dyess AFB', true
from public.majcoms m
where m.code = 'AFGSC'
  and not exists (
    select 1 from public.bases b where b.code = 'DYESS'
  );

update public.bases b
set majcom_id = m.id,
    name = 'Ellsworth AFB',
    active = true
from public.majcoms m
where b.code = 'ELLSWORTH'
  and m.code = 'AFGSC';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'ELLSWORTH', 'Ellsworth AFB', true
from public.majcoms m
where m.code = 'AFGSC'
  and not exists (
    select 1 from public.bases b where b.code = 'ELLSWORTH'
  );

update public.bases b
set majcom_id = m.id,
    name = 'F.E. Warren AFB',
    active = true
from public.majcoms m
where b.code = 'FE-WARREN'
  and m.code = 'AFGSC';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'FE-WARREN', 'F.E. Warren AFB', true
from public.majcoms m
where m.code = 'AFGSC'
  and not exists (
    select 1 from public.bases b where b.code = 'FE-WARREN'
  );

update public.bases b
set majcom_id = m.id,
    name = 'Kirtland AFB',
    active = true
from public.majcoms m
where b.code = 'KIRTLAND'
  and m.code = 'AFGSC';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'KIRTLAND', 'Kirtland AFB', true
from public.majcoms m
where m.code = 'AFGSC'
  and not exists (
    select 1 from public.bases b where b.code = 'KIRTLAND'
  );

update public.bases b
set majcom_id = m.id,
    name = 'Malmstrom AFB',
    active = true
from public.majcoms m
where b.code = 'MALMSTROM'
  and m.code = 'AFGSC';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'MALMSTROM', 'Malmstrom AFB', true
from public.majcoms m
where m.code = 'AFGSC'
  and not exists (
    select 1 from public.bases b where b.code = 'MALMSTROM'
  );

update public.bases b
set majcom_id = m.id,
    name = 'Minot AFB',
    active = true
from public.majcoms m
where b.code = 'MINOT'
  and m.code = 'AFGSC';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'MINOT', 'Minot AFB', true
from public.majcoms m
where m.code = 'AFGSC'
  and not exists (
    select 1 from public.bases b where b.code = 'MINOT'
  );

update public.bases b
set majcom_id = m.id,
    name = 'Whiteman AFB',
    active = true
from public.majcoms m
where b.code = 'WHITEMAN'
  and m.code = 'AFGSC';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'WHITEMAN', 'Whiteman AFB', true
from public.majcoms m
where m.code = 'AFGSC'
  and not exists (
    select 1 from public.bases b where b.code = 'WHITEMAN'
  );

update public.bases b
set majcom_id = m.id,
    name = 'Arnold AFB',
    active = true
from public.majcoms m
where b.code = 'ARNOLD'
  and m.code = 'AFMC';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'ARNOLD', 'Arnold AFB', true
from public.majcoms m
where m.code = 'AFMC'
  and not exists (
    select 1 from public.bases b where b.code = 'ARNOLD'
  );

update public.bases b
set majcom_id = m.id,
    name = 'Edwards AFB',
    active = true
from public.majcoms m
where b.code = 'EDWARDS'
  and m.code = 'AFMC';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'EDWARDS', 'Edwards AFB', true
from public.majcoms m
where m.code = 'AFMC'
  and not exists (
    select 1 from public.bases b where b.code = 'EDWARDS'
  );

update public.bases b
set majcom_id = m.id,
    name = 'Eglin AFB',
    active = true
from public.majcoms m
where b.code = 'EGLIN'
  and m.code = 'AFMC';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'EGLIN', 'Eglin AFB', true
from public.majcoms m
where m.code = 'AFMC'
  and not exists (
    select 1 from public.bases b where b.code = 'EGLIN'
  );

update public.bases b
set majcom_id = m.id,
    name = 'Hanscom AFB',
    active = true
from public.majcoms m
where b.code = 'HANSCOM'
  and m.code = 'AFMC';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'HANSCOM', 'Hanscom AFB', true
from public.majcoms m
where m.code = 'AFMC'
  and not exists (
    select 1 from public.bases b where b.code = 'HANSCOM'
  );

update public.bases b
set majcom_id = m.id,
    name = 'Hill AFB',
    active = true
from public.majcoms m
where b.code = 'HILL'
  and m.code = 'AFMC';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'HILL', 'Hill AFB', true
from public.majcoms m
where m.code = 'AFMC'
  and not exists (
    select 1 from public.bases b where b.code = 'HILL'
  );

update public.bases b
set majcom_id = m.id,
    name = 'Robins AFB',
    active = true
from public.majcoms m
where b.code = 'ROBINS'
  and m.code = 'AFMC';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'ROBINS', 'Robins AFB', true
from public.majcoms m
where m.code = 'AFMC'
  and not exists (
    select 1 from public.bases b where b.code = 'ROBINS'
  );

update public.bases b
set majcom_id = m.id,
    name = 'Tinker AFB',
    active = true
from public.majcoms m
where b.code = 'TINKER'
  and m.code = 'AFMC';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'TINKER', 'Tinker AFB', true
from public.majcoms m
where m.code = 'AFMC'
  and not exists (
    select 1 from public.bases b where b.code = 'TINKER'
  );

update public.bases b
set majcom_id = m.id,
    name = 'Wright-Patterson AFB',
    active = true
from public.majcoms m
where b.code = 'WRIGHT-PATTERSON'
  and m.code = 'AFMC';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'WRIGHT-PATTERSON', 'Wright-Patterson AFB', true
from public.majcoms m
where m.code = 'AFMC'
  and not exists (
    select 1 from public.bases b where b.code = 'WRIGHT-PATTERSON'
  );

update public.bases b
set majcom_id = m.id,
    name = 'Joint Base Lindsey Graham',
    active = true
from public.majcoms m
where b.code = 'JB-LINDSEY-GRAHAM'
  and m.code = 'AMC';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'JB-LINDSEY-GRAHAM', 'Joint Base Lindsey Graham', true
from public.majcoms m
where m.code = 'AMC'
  and not exists (
    select 1 from public.bases b where b.code = 'JB-LINDSEY-GRAHAM'
  );

update public.bases b
set majcom_id = m.id,
    name = 'Dover AFB',
    active = true
from public.majcoms m
where b.code = 'DOVER'
  and m.code = 'AMC';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'DOVER', 'Dover AFB', true
from public.majcoms m
where m.code = 'AMC'
  and not exists (
    select 1 from public.bases b where b.code = 'DOVER'
  );

update public.bases b
set majcom_id = m.id,
    name = 'Fairchild AFB',
    active = true
from public.majcoms m
where b.code = 'FAIRCHILD'
  and m.code = 'AMC';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'FAIRCHILD', 'Fairchild AFB', true
from public.majcoms m
where m.code = 'AMC'
  and not exists (
    select 1 from public.bases b where b.code = 'FAIRCHILD'
  );

update public.bases b
set majcom_id = m.id,
    name = 'Little Rock AFB',
    active = true
from public.majcoms m
where b.code = 'LITTLE-ROCK'
  and m.code = 'AMC';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'LITTLE-ROCK', 'Little Rock AFB', true
from public.majcoms m
where m.code = 'AMC'
  and not exists (
    select 1 from public.bases b where b.code = 'LITTLE-ROCK'
  );

update public.bases b
set majcom_id = m.id,
    name = 'MacDill AFB',
    active = true
from public.majcoms m
where b.code = 'MACDILL'
  and m.code = 'AMC';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'MACDILL', 'MacDill AFB', true
from public.majcoms m
where m.code = 'AMC'
  and not exists (
    select 1 from public.bases b where b.code = 'MACDILL'
  );

update public.bases b
set majcom_id = m.id,
    name = 'Joint Base McGuire-Dix-Lakehurst',
    active = true
from public.majcoms m
where b.code = 'JBMDL'
  and m.code = 'AMC';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'JBMDL', 'Joint Base McGuire-Dix-Lakehurst', true
from public.majcoms m
where m.code = 'AMC'
  and not exists (
    select 1 from public.bases b where b.code = 'JBMDL'
  );

update public.bases b
set majcom_id = m.id,
    name = 'McConnell AFB',
    active = true
from public.majcoms m
where b.code = 'MCCONNELL'
  and m.code = 'AMC';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'MCCONNELL', 'McConnell AFB', true
from public.majcoms m
where m.code = 'AMC'
  and not exists (
    select 1 from public.bases b where b.code = 'MCCONNELL'
  );

update public.bases b
set majcom_id = m.id,
    name = 'Scott AFB',
    active = true
from public.majcoms m
where b.code = 'SCOTT'
  and m.code = 'AMC';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'SCOTT', 'Scott AFB', true
from public.majcoms m
where m.code = 'AMC'
  and not exists (
    select 1 from public.bases b where b.code = 'SCOTT'
  );

update public.bases b
set majcom_id = m.id,
    name = 'Travis AFB',
    active = true
from public.majcoms m
where b.code = 'TRAVIS'
  and m.code = 'AMC';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'TRAVIS', 'Travis AFB', true
from public.majcoms m
where m.code = 'AMC'
  and not exists (
    select 1 from public.bases b where b.code = 'TRAVIS'
  );

update public.bases b
set majcom_id = m.id,
    name = 'Joint Base Lewis-McChord (McChord Field)',
    active = true
from public.majcoms m
where b.code = 'JBLM'
  and m.code = 'AMC';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'JBLM', 'Joint Base Lewis-McChord (McChord Field)', true
from public.majcoms m
where m.code = 'AMC'
  and not exists (
    select 1 from public.bases b where b.code = 'JBLM'
  );

update public.bases b
set majcom_id = m.id,
    name = 'Pope Army Airfield',
    active = true
from public.majcoms m
where b.code = 'POPE'
  and m.code = 'AMC';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'POPE', 'Pope Army Airfield', true
from public.majcoms m
where m.code = 'AMC'
  and not exists (
    select 1 from public.bases b where b.code = 'POPE'
  );

update public.bases b
set majcom_id = m.id,
    name = 'Hurlburt Field',
    active = true
from public.majcoms m
where b.code = 'HURLBURT'
  and m.code = 'AFSOC';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'HURLBURT', 'Hurlburt Field', true
from public.majcoms m
where m.code = 'AFSOC'
  and not exists (
    select 1 from public.bases b where b.code = 'HURLBURT'
  );

update public.bases b
set majcom_id = m.id,
    name = 'Cannon AFB',
    active = true
from public.majcoms m
where b.code = 'CANNON'
  and m.code = 'AFSOC';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'CANNON', 'Cannon AFB', true
from public.majcoms m
where m.code = 'AFSOC'
  and not exists (
    select 1 from public.bases b where b.code = 'CANNON'
  );

update public.bases b
set majcom_id = m.id,
    name = 'Andersen AFB',
    active = true
from public.majcoms m
where b.code = 'ANDERSEN'
  and m.code = 'PACAF';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'ANDERSEN', 'Andersen AFB', true
from public.majcoms m
where m.code = 'PACAF'
  and not exists (
    select 1 from public.bases b where b.code = 'ANDERSEN'
  );

update public.bases b
set majcom_id = m.id,
    name = 'Eielson AFB',
    active = true
from public.majcoms m
where b.code = 'EIELSON'
  and m.code = 'PACAF';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'EIELSON', 'Eielson AFB', true
from public.majcoms m
where m.code = 'PACAF'
  and not exists (
    select 1 from public.bases b where b.code = 'EIELSON'
  );

update public.bases b
set majcom_id = m.id,
    name = 'Joint Base Elmendorf-Richardson',
    active = true
from public.majcoms m
where b.code = 'JBER'
  and m.code = 'PACAF';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'JBER', 'Joint Base Elmendorf-Richardson', true
from public.majcoms m
where m.code = 'PACAF'
  and not exists (
    select 1 from public.bases b where b.code = 'JBER'
  );

update public.bases b
set majcom_id = m.id,
    name = 'Joint Base Pearl Harbor-Hickam (Hickam)',
    active = true
from public.majcoms m
where b.code = 'JBPHH'
  and m.code = 'PACAF';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'JBPHH', 'Joint Base Pearl Harbor-Hickam (Hickam)', true
from public.majcoms m
where m.code = 'PACAF'
  and not exists (
    select 1 from public.bases b where b.code = 'JBPHH'
  );

update public.bases b
set majcom_id = m.id,
    name = 'Kadena AB',
    active = true
from public.majcoms m
where b.code = 'KADENA'
  and m.code = 'PACAF';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'KADENA', 'Kadena AB', true
from public.majcoms m
where m.code = 'PACAF'
  and not exists (
    select 1 from public.bases b where b.code = 'KADENA'
  );

update public.bases b
set majcom_id = m.id,
    name = 'Kunsan AB',
    active = true
from public.majcoms m
where b.code = 'KUNSAN'
  and m.code = 'PACAF';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'KUNSAN', 'Kunsan AB', true
from public.majcoms m
where m.code = 'PACAF'
  and not exists (
    select 1 from public.bases b where b.code = 'KUNSAN'
  );

update public.bases b
set majcom_id = m.id,
    name = 'Misawa AB',
    active = true
from public.majcoms m
where b.code = 'MISAWA'
  and m.code = 'PACAF';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'MISAWA', 'Misawa AB', true
from public.majcoms m
where m.code = 'PACAF'
  and not exists (
    select 1 from public.bases b where b.code = 'MISAWA'
  );

update public.bases b
set majcom_id = m.id,
    name = 'Osan AB',
    active = true
from public.majcoms m
where b.code = 'OSAN'
  and m.code = 'PACAF';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'OSAN', 'Osan AB', true
from public.majcoms m
where m.code = 'PACAF'
  and not exists (
    select 1 from public.bases b where b.code = 'OSAN'
  );

update public.bases b
set majcom_id = m.id,
    name = 'Yokota AB',
    active = true
from public.majcoms m
where b.code = 'YOKOTA'
  and m.code = 'PACAF';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'YOKOTA', 'Yokota AB', true
from public.majcoms m
where m.code = 'PACAF'
  and not exists (
    select 1 from public.bases b where b.code = 'YOKOTA'
  );

update public.bases b
set majcom_id = m.id,
    name = 'Aviano AB',
    active = true
from public.majcoms m
where b.code = 'AVIANO'
  and m.code = 'USAFE-AFAFRICA';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'AVIANO', 'Aviano AB', true
from public.majcoms m
where m.code = 'USAFE-AFAFRICA'
  and not exists (
    select 1 from public.bases b where b.code = 'AVIANO'
  );

update public.bases b
set majcom_id = m.id,
    name = 'Incirlik AB',
    active = true
from public.majcoms m
where b.code = 'INCIRLIK'
  and m.code = 'USAFE-AFAFRICA';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'INCIRLIK', 'Incirlik AB', true
from public.majcoms m
where m.code = 'USAFE-AFAFRICA'
  and not exists (
    select 1 from public.bases b where b.code = 'INCIRLIK'
  );

update public.bases b
set majcom_id = m.id,
    name = 'Lajes Field',
    active = true
from public.majcoms m
where b.code = 'LAJES'
  and m.code = 'USAFE-AFAFRICA';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'LAJES', 'Lajes Field', true
from public.majcoms m
where m.code = 'USAFE-AFAFRICA'
  and not exists (
    select 1 from public.bases b where b.code = 'LAJES'
  );

update public.bases b
set majcom_id = m.id,
    name = 'RAF Lakenheath',
    active = true
from public.majcoms m
where b.code = 'RAF-LAKENHEATH'
  and m.code = 'USAFE-AFAFRICA';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'RAF-LAKENHEATH', 'RAF Lakenheath', true
from public.majcoms m
where m.code = 'USAFE-AFAFRICA'
  and not exists (
    select 1 from public.bases b where b.code = 'RAF-LAKENHEATH'
  );

update public.bases b
set majcom_id = m.id,
    name = 'RAF Mildenhall',
    active = true
from public.majcoms m
where b.code = 'RAF-MILDENHALL'
  and m.code = 'USAFE-AFAFRICA';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'RAF-MILDENHALL', 'RAF Mildenhall', true
from public.majcoms m
where m.code = 'USAFE-AFAFRICA'
  and not exists (
    select 1 from public.bases b where b.code = 'RAF-MILDENHALL'
  );

update public.bases b
set majcom_id = m.id,
    name = 'Ramstein AB',
    active = true
from public.majcoms m
where b.code = 'RAMSTEIN'
  and m.code = 'USAFE-AFAFRICA';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'RAMSTEIN', 'Ramstein AB', true
from public.majcoms m
where m.code = 'USAFE-AFAFRICA'
  and not exists (
    select 1 from public.bases b where b.code = 'RAMSTEIN'
  );

update public.bases b
set majcom_id = m.id,
    name = 'Spangdahlem AB',
    active = true
from public.majcoms m
where b.code = 'SPANGDAHLEM'
  and m.code = 'USAFE-AFAFRICA';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'SPANGDAHLEM', 'Spangdahlem AB', true
from public.majcoms m
where m.code = 'USAFE-AFAFRICA'
  and not exists (
    select 1 from public.bases b where b.code = 'SPANGDAHLEM'
  );

update public.bases b
set majcom_id = m.id,
    name = 'Joint Base Andrews',
    active = true
from public.majcoms m
where b.code = 'JB-ANDREWS'
  and m.code = 'AFDW';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'JB-ANDREWS', 'Joint Base Andrews', true
from public.majcoms m
where m.code = 'AFDW'
  and not exists (
    select 1 from public.bases b where b.code = 'JB-ANDREWS'
  );

update public.bases b
set majcom_id = m.id,
    name = 'Joint Base Anacostia-Bolling',
    active = true
from public.majcoms m
where b.code = 'JBAB'
  and m.code = 'AFDW';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'JBAB', 'Joint Base Anacostia-Bolling', true
from public.majcoms m
where m.code = 'AFDW'
  and not exists (
    select 1 from public.bases b where b.code = 'JBAB'
  );

update public.bases b
set majcom_id = m.id,
    name = 'U.S. Air Force Academy',
    active = true
from public.majcoms m
where b.code = 'USAFA'
  and m.code = 'USAFA';

insert into public.bases (majcom_id, code, name, active)
select m.id, 'USAFA', 'U.S. Air Force Academy', true
from public.majcoms m
where m.code = 'USAFA'
  and not exists (
    select 1 from public.bases b where b.code = 'USAFA'
  );

-- Published RaPS curriculum versions
update public.curriculum_versions
set title = 'Tier 1 — All Service Members',
    published = true
where course_type = 'ASM'
  and version = 'TCCC-ASM-11-01 · 1 AUG 19';

insert into public.curriculum_versions
  (course_type, version, title, published, effective_date)
select
  'ASM', 'TCCC-ASM-11-01 · 1 AUG 19', 'Tier 1 — All Service Members', true, null
where not exists (
  select 1
  from public.curriculum_versions
  where course_type = 'ASM'
    and version = 'TCCC-ASM-11-01 · 1 AUG 19'
);

update public.curriculum_versions
set title = 'Tier 2 — Combat Lifesaver',
    published = true
where course_type = 'CLS'
  and version = 'TCCC-CLS-02-12 · 30 JUN 20';

insert into public.curriculum_versions
  (course_type, version, title, published, effective_date)
select
  'CLS', 'TCCC-CLS-02-12 · 30 JUN 20', 'Tier 2 — Combat Lifesaver', true, null
where not exists (
  select 1
  from public.curriculum_versions
  where course_type = 'CLS'
    and version = 'TCCC-CLS-02-12 · 30 JUN 20'
);

update public.curriculum_versions
set title = 'Tier 3 — Combat Medic / Corpsman',
    published = true
where course_type = 'CMC'
  and version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26';

insert into public.curriculum_versions
  (course_type, version, title, published, effective_date)
select
  'CMC', 'TCCC-CMC-TTA-05-02 · 30 MAY 26', 'Tier 3 — Combat Medic / Corpsman', true, null
where not exists (
  select 1
  from public.curriculum_versions
  where course_type = 'CMC'
    and version = 'TCCC-CMC-TTA-05-02 · 30 MAY 26'
);

update public.curriculum_versions
set title = 'Tier 4 — Combat Paramedic / Provider',
    published = true
where course_type = 'CPP'
  and version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26';

insert into public.curriculum_versions
  (course_type, version, title, published, effective_date)
select
  'CPP', 'TCCC-CPP-TTA-05-02 · 30 MAY 26', 'Tier 4 — Combat Paramedic / Provider', true, null
where not exists (
  select 1
  from public.curriculum_versions
  where course_type = 'CPP'
    and version = 'TCCC-CPP-TTA-05-02 · 30 MAY 26'
);

commit;

-- Verification
select code, name, active
from public.majcoms
order by code;

select m.code as majcom, b.code as base_code, b.name as base_name, b.active
from public.bases b
join public.majcoms m on m.id = b.majcom_id
order by m.code, b.name;

select id, course_type, version, title, published
from public.curriculum_versions
order by course_type, version;

-- Sanity checks: all should be zero rows.
select code, count(*) as duplicate_count
from public.majcoms
group by code
having count(*) > 1;

select code, count(*) as duplicate_count
from public.bases
where code is not null
group by code
having count(*) > 1;

select course_type, version, count(*) as duplicate_count
from public.curriculum_versions
group by course_type, version
having count(*) > 1;

-- RaPS Supabase catalog seed
-- Idempotent: safe to run more than once.
-- Seeds MAJCOMs/installations from the GitHub RaPS installation catalog and
-- seeds the four published TCCC curriculum versions used by the current app.
begin;

-- MAJCOM / command catalog
insert into public.majcoms (code, name, active)
values ('ACC', 'Air Combat Command (ACC)', true)
on conflict (code) do update
set name = excluded.name,
    active = excluded.active;

insert into public.majcoms (code, name, active)
values ('AETC', 'Air Education and Training Command (AETC)', true)
on conflict (code) do update
set name = excluded.name,
    active = excluded.active;

insert into public.majcoms (code, name, active)
values ('AFGSC', 'Air Force Global Strike Command (AFGSC)', true)
on conflict (code) do update
set name = excluded.name,
    active = excluded.active;

insert into public.majcoms (code, name, active)
values ('AFMC', 'Air Force Materiel Command (AFMC)', true)
on conflict (code) do update
set name = excluded.name,
    active = excluded.active;

insert into public.majcoms (code, name, active)
values ('AMC', 'Air Mobility Command (AMC)', true)
on conflict (code) do update
set name = excluded.name,
    active = excluded.active;

insert into public.majcoms (code, name, active)
values ('AFSOC', 'Air Force Special Operations Command (AFSOC)', true)
on conflict (code) do update
set name = excluded.name,
    active = excluded.active;

insert into public.majcoms (code, name, active)
values ('PACAF', 'Pacific Air Forces (PACAF)', true)
on conflict (code) do update
set name = excluded.name,
    active = excluded.active;

insert into public.majcoms (code, name, active)
values ('USAFE-AFAFRICA', 'U.S. Air Forces in Europe – Air Forces Africa (USAFE-AFAFRICA)', true)
on conflict (code) do update
set name = excluded.name,
    active = excluded.active;

insert into public.majcoms (code, name, active)
values ('AFDW', 'Air Force District of Washington (AFDW)', true)
on conflict (code) do update
set name = excluded.name,
    active = excluded.active;

insert into public.majcoms (code, name, active)
values ('USAFA', 'U.S. Air Force Academy / DRU', true)
on conflict (code) do update
set name = excluded.name,
    active = excluded.active;

insert into public.majcoms (code, name, active)
values ('OTHER', 'Other / Joint / DRU', true)
on conflict (code) do update
set name = excluded.name,
    active = excluded.active;

-- Installation catalog
insert into public.bases (majcom_id, code, name, active)
select m.id, 'BEALE', 'Beale AFB', true
from public.majcoms m
where m.code = 'ACC'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'CREECH', 'Creech AFB', true
from public.majcoms m
where m.code = 'ACC'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'DAVIS-MONTHAN', 'Davis-Monthan AFB', true
from public.majcoms m
where m.code = 'ACC'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'GRAND-FORKS', 'Grand Forks AFB', true
from public.majcoms m
where m.code = 'ACC'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'HOLLOMAN', 'Holloman AFB', true
from public.majcoms m
where m.code = 'ACC'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'JBLE', 'Joint Base Langley-Eustis (Langley)', true
from public.majcoms m
where m.code = 'ACC'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'LUKE', 'Luke AFB', true
from public.majcoms m
where m.code = 'ACC'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'MOODY', 'Moody AFB', true
from public.majcoms m
where m.code = 'ACC'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'MOUNTAIN-HOME', 'Mountain Home AFB', true
from public.majcoms m
where m.code = 'ACC'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'NELLIS', 'Nellis AFB', true
from public.majcoms m
where m.code = 'ACC'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'OFFUTT', 'Offutt AFB', true
from public.majcoms m
where m.code = 'ACC'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'SEYMOUR-JOHNSON', 'Seymour Johnson AFB', true
from public.majcoms m
where m.code = 'ACC'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'SHAW', 'Shaw AFB', true
from public.majcoms m
where m.code = 'ACC'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'TYNDALL', 'Tyndall AFB', true
from public.majcoms m
where m.code = 'ACC'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'ALTUS', 'Altus AFB', true
from public.majcoms m
where m.code = 'AETC'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'COLUMBUS', 'Columbus AFB', true
from public.majcoms m
where m.code = 'AETC'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'GOODFELLOW', 'Goodfellow AFB', true
from public.majcoms m
where m.code = 'AETC'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'JBSA-LACKLAND', 'Joint Base San Antonio–Lackland', true
from public.majcoms m
where m.code = 'AETC'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'JBSA-FORT-SAM', 'Joint Base San Antonio–Fort Sam Houston', true
from public.majcoms m
where m.code = 'AETC'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'JBSA-RANDOLPH', 'Joint Base San Antonio–Randolph', true
from public.majcoms m
where m.code = 'AETC'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'KEESLER', 'Keesler AFB', true
from public.majcoms m
where m.code = 'AETC'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'LAUGHLIN', 'Laughlin AFB', true
from public.majcoms m
where m.code = 'AETC'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'MAXWELL', 'Maxwell AFB', true
from public.majcoms m
where m.code = 'AETC'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'SHEPPARD', 'Sheppard AFB', true
from public.majcoms m
where m.code = 'AETC'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'VANCE', 'Vance AFB', true
from public.majcoms m
where m.code = 'AETC'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'BARKSDALE', 'Barksdale AFB', true
from public.majcoms m
where m.code = 'AFGSC'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'DYESS', 'Dyess AFB', true
from public.majcoms m
where m.code = 'AFGSC'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'ELLSWORTH', 'Ellsworth AFB', true
from public.majcoms m
where m.code = 'AFGSC'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'FE-WARREN', 'F.E. Warren AFB', true
from public.majcoms m
where m.code = 'AFGSC'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'KIRTLAND', 'Kirtland AFB', true
from public.majcoms m
where m.code = 'AFGSC'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'MALMSTROM', 'Malmstrom AFB', true
from public.majcoms m
where m.code = 'AFGSC'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'MINOT', 'Minot AFB', true
from public.majcoms m
where m.code = 'AFGSC'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'WHITEMAN', 'Whiteman AFB', true
from public.majcoms m
where m.code = 'AFGSC'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'ARNOLD', 'Arnold AFB', true
from public.majcoms m
where m.code = 'AFMC'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'EDWARDS', 'Edwards AFB', true
from public.majcoms m
where m.code = 'AFMC'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'EGLIN', 'Eglin AFB', true
from public.majcoms m
where m.code = 'AFMC'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'HANSCOM', 'Hanscom AFB', true
from public.majcoms m
where m.code = 'AFMC'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'HILL', 'Hill AFB', true
from public.majcoms m
where m.code = 'AFMC'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'ROBINS', 'Robins AFB', true
from public.majcoms m
where m.code = 'AFMC'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'TINKER', 'Tinker AFB', true
from public.majcoms m
where m.code = 'AFMC'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'WRIGHT-PATTERSON', 'Wright-Patterson AFB', true
from public.majcoms m
where m.code = 'AFMC'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'JB-LINDSEY-GRAHAM', 'Joint Base Lindsey Graham', true
from public.majcoms m
where m.code = 'AMC'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'DOVER', 'Dover AFB', true
from public.majcoms m
where m.code = 'AMC'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'FAIRCHILD', 'Fairchild AFB', true
from public.majcoms m
where m.code = 'AMC'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'LITTLE-ROCK', 'Little Rock AFB', true
from public.majcoms m
where m.code = 'AMC'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'MACDILL', 'MacDill AFB', true
from public.majcoms m
where m.code = 'AMC'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'JBMDL', 'Joint Base McGuire-Dix-Lakehurst', true
from public.majcoms m
where m.code = 'AMC'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'MCCONNELL', 'McConnell AFB', true
from public.majcoms m
where m.code = 'AMC'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'SCOTT', 'Scott AFB', true
from public.majcoms m
where m.code = 'AMC'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'TRAVIS', 'Travis AFB', true
from public.majcoms m
where m.code = 'AMC'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'JBLM', 'Joint Base Lewis-McChord (McChord Field)', true
from public.majcoms m
where m.code = 'AMC'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'POPE', 'Pope Army Airfield', true
from public.majcoms m
where m.code = 'AMC'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'HURLBURT', 'Hurlburt Field', true
from public.majcoms m
where m.code = 'AFSOC'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'CANNON', 'Cannon AFB', true
from public.majcoms m
where m.code = 'AFSOC'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'ANDERSEN', 'Andersen AFB', true
from public.majcoms m
where m.code = 'PACAF'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'EIELSON', 'Eielson AFB', true
from public.majcoms m
where m.code = 'PACAF'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'JBER', 'Joint Base Elmendorf-Richardson', true
from public.majcoms m
where m.code = 'PACAF'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'JBPHH', 'Joint Base Pearl Harbor-Hickam (Hickam)', true
from public.majcoms m
where m.code = 'PACAF'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'KADENA', 'Kadena AB', true
from public.majcoms m
where m.code = 'PACAF'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'KUNSAN', 'Kunsan AB', true
from public.majcoms m
where m.code = 'PACAF'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'MISAWA', 'Misawa AB', true
from public.majcoms m
where m.code = 'PACAF'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'OSAN', 'Osan AB', true
from public.majcoms m
where m.code = 'PACAF'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'YOKOTA', 'Yokota AB', true
from public.majcoms m
where m.code = 'PACAF'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'AVIANO', 'Aviano AB', true
from public.majcoms m
where m.code = 'USAFE-AFAFRICA'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'INCIRLIK', 'Incirlik AB', true
from public.majcoms m
where m.code = 'USAFE-AFAFRICA'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'LAJES', 'Lajes Field', true
from public.majcoms m
where m.code = 'USAFE-AFAFRICA'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'RAF-LAKENHEATH', 'RAF Lakenheath', true
from public.majcoms m
where m.code = 'USAFE-AFAFRICA'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'RAF-MILDENHALL', 'RAF Mildenhall', true
from public.majcoms m
where m.code = 'USAFE-AFAFRICA'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'RAMSTEIN', 'Ramstein AB', true
from public.majcoms m
where m.code = 'USAFE-AFAFRICA'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'SPANGDAHLEM', 'Spangdahlem AB', true
from public.majcoms m
where m.code = 'USAFE-AFAFRICA'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'JB-ANDREWS', 'Joint Base Andrews', true
from public.majcoms m
where m.code = 'AFDW'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'JBAB', 'Joint Base Anacostia-Bolling', true
from public.majcoms m
where m.code = 'AFDW'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

insert into public.bases (majcom_id, code, name, active)
select m.id, 'USAFA', 'U.S. Air Force Academy', true
from public.majcoms m
where m.code = 'USAFA'
on conflict (majcom_id, name) do update
set code = excluded.code,
    active = excluded.active;

-- Published RaPS curriculum versions
insert into public.curriculum_versions
  (course_type, version, title, published, effective_date)
values
  ('ASM', 'TCCC-ASM-11-01 · 1 AUG 19', 'Tier 1 — All Service Members', true, null)
on conflict (course_type, version) do update
set title = excluded.title,
    published = true;

insert into public.curriculum_versions
  (course_type, version, title, published, effective_date)
values
  ('CLS', 'TCCC-CLS-02-12 · 30 JUN 20', 'Tier 2 — Combat Lifesaver', true, null)
on conflict (course_type, version) do update
set title = excluded.title,
    published = true;

insert into public.curriculum_versions
  (course_type, version, title, published, effective_date)
values
  ('CMC', 'TCCC-CMC-TTA-05-02 · 30 MAY 26', 'Tier 3 — Combat Medic / Corpsman', true, null)
on conflict (course_type, version) do update
set title = excluded.title,
    published = true;

insert into public.curriculum_versions
  (course_type, version, title, published, effective_date)
values
  ('CPP', 'TCCC-CPP-TTA-05-02 · 30 MAY 26', 'Tier 4 — Combat Paramedic / Provider', true, null)
on conflict (course_type, version) do update
set title = excluded.title,
    published = true;

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

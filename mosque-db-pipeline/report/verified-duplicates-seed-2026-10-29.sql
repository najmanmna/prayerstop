-- Verified<->verified duplicate pairs NOT yet in duplicate_candidates (found 2026-10-29
-- while wiring the app to the database: these showed up as the same mosque twice
-- in real nearby results). Run once in the Supabase SQL editor. Inserts PENDING
-- candidates only — nothing is merged by this file. Merging happens afterwards
-- through decide_duplicate_candidate(), either by a reviewer in the review app,
-- or (for the 3 tier-high rows only: identical names, <=15m, no other mosque
-- within 50m) automatically. Both sides of every pair are verified records with
-- review history, so confirming any of these marks the redundant row
-- merged_into_id — it never deletes it.
-- Survivor = nsdi > dmrca > osm, tie-broken by id (same rule as 05e).

-- MARADANA SMALL MOSQUE | Maradana Small Jumma Masjid (1.6 m)
insert into public.duplicate_candidates (check_type, survivor_mosque_id, redundant_mosque_id, match_score, match_tier, distance_m) values ('intra_reviewed', 'nsdi-18539', 'dmrca-R-620-C-57', 100.0, 'high', 1.6) on conflict (survivor_mosque_id, redundant_mosque_id) do nothing;
-- Molawatta Masjid | Molawatta Masjid (3.9 m)
insert into public.duplicate_candidates (check_type, survivor_mosque_id, redundant_mosque_id, match_score, match_tier, distance_m) values ('intra_reviewed', 'nsdi-18789', 'dmrca-R-1521-C-148', 100.0, 'high', 3.9) on conflict (survivor_mosque_id, redundant_mosque_id) do nothing;
-- Colombo Grand Mosque | THE COLOMBO GRAND MOSQUE (4.3 m)
insert into public.duplicate_candidates (check_type, survivor_mosque_id, redundant_mosque_id, match_score, match_tier, distance_m) values ('intra_reviewed', 'nsdi-18744', 'dmrca-R-755-C-64', 100.0, 'high', 4.3) on conflict (survivor_mosque_id, redundant_mosque_id) do nothing;
-- Masjid Ul Jabbar Jummah Masjid (Gothatuwa Jumma Masjid) | MASJIDUL JABBAR JUMMA MOSQUE (6.0 m)
insert into public.duplicate_candidates (check_type, survivor_mosque_id, redundant_mosque_id, match_score, match_tier, distance_m) values ('intra_reviewed', 'nsdi-18586', 'dmrca-R-980-C-91', 60.2, 'medium', 6.0) on conflict (survivor_mosque_id, redundant_mosque_id) do nothing;
-- Dehiwala Junction Mosque | MASJID MUHIYIDEEN (46.8 m)
insert into public.duplicate_candidates (check_type, survivor_mosque_id, redundant_mosque_id, match_score, match_tier, distance_m) values ('intra_reviewed', 'nsdi-17647', 'dmrca-R-1011-C-102', 14.6, 'low', 46.8) on conflict (survivor_mosque_id, redundant_mosque_id) do nothing;
-- Al Qadir Hanafi Jummah Masjid | Al Qadir Hanafi Jummah Masjid (23.6 m)
insert into public.duplicate_candidates (check_type, survivor_mosque_id, redundant_mosque_id, match_score, match_tier, distance_m) values ('intra_reviewed', 'nsdi-18480', 'dmrca-R-1315-C-128', 100.0, 'low', 23.6) on conflict (survivor_mosque_id, redundant_mosque_id) do nothing;
-- Fort Jumma Mosque | COLOMBO FORT MOSQUE (16.7 m)
insert into public.duplicate_candidates (check_type, survivor_mosque_id, redundant_mosque_id, match_score, match_tier, distance_m) values ('intra_reviewed', 'nsdi-18644', 'dmrca-R-920-C-79', 61.1, 'low', 16.7) on conflict (survivor_mosque_id, redundant_mosque_id) do nothing;
-- Al Masjid Un Najmi Jummah Mosque - Kesalwatta Jummah Mosque | AL MASJIDUN NAJIMI JUMMA MOSQUE (41.4 m)
insert into public.duplicate_candidates (check_type, survivor_mosque_id, redundant_mosque_id, match_score, match_tier, distance_m) values ('intra_reviewed', 'nsdi-18659', 'dmrca-R-1070-C-113', 66.7, 'low', 41.4) on conflict (survivor_mosque_id, redundant_mosque_id) do nothing;
-- Jamiul Ashroff Masjid | JAMIUL ASHARAFF MOSQUE (7.5 m)
insert into public.duplicate_candidates (check_type, survivor_mosque_id, redundant_mosque_id, match_score, match_tier, distance_m) values ('intra_reviewed', 'nsdi-18677', 'dmrca-R-1059-C-111', 74.4, 'medium', 7.5) on conflict (survivor_mosque_id, redundant_mosque_id) do nothing;
-- Aluthkade Masjid | MUHIYIDEEN JUMMA MASJID (27.5 m)
insert into public.duplicate_candidates (check_type, survivor_mosque_id, redundant_mosque_id, match_score, match_tier, distance_m) values ('intra_reviewed', 'nsdi-18695', 'dmrca-R-40-C-07', 56.4, 'low', 27.5) on conflict (survivor_mosque_id, redundant_mosque_id) do nothing;
-- Aluthkade Masjid | MASJID SA'D BIN ABI WAQQAS (RALI) (2.3 m)
insert into public.duplicate_candidates (check_type, survivor_mosque_id, redundant_mosque_id, match_score, match_tier, distance_m) values ('intra_reviewed', 'nsdi-18695', 'dmrca-R-2087-C-19-7', 24.5, 'medium', 2.3) on conflict (survivor_mosque_id, redundant_mosque_id) do nothing;
-- Aluthkade Masjid | MEERANIYA JUMMA MASJID (18.5 m)
insert into public.duplicate_candidates (check_type, survivor_mosque_id, redundant_mosque_id, match_score, match_tier, distance_m) values ('intra_reviewed', 'nsdi-18695', 'dmrca-R-782-C-65', 52.6, 'low', 18.5) on conflict (survivor_mosque_id, redundant_mosque_id) do nothing;
-- Quadriya Takkiya Kotar Bawa Masjid | UMMUZ ZAVIA (29.0 m)
insert into public.duplicate_candidates (check_type, survivor_mosque_id, redundant_mosque_id, match_score, match_tier, distance_m) values ('intra_reviewed', 'nsdi-18743', 'dmrca-R-585-C-53', 17.8, 'low', 29.0) on conflict (survivor_mosque_id, redundant_mosque_id) do nothing;
-- Quadriya Takkiya Kotar Bawa Masjid | MUHIYIDEEN THAKKIYA (0.4 m)
insert into public.duplicate_candidates (check_type, survivor_mosque_id, redundant_mosque_id, match_score, match_tier, distance_m) values ('intra_reviewed', 'nsdi-18743', 'dmrca-R-1016-C-106', 41.5, 'medium', 0.4) on conflict (survivor_mosque_id, redundant_mosque_id) do nothing;
-- Mosque Kochchikade | Kochikade Jamia Mosque (23.5 m)
insert into public.duplicate_candidates (check_type, survivor_mosque_id, redundant_mosque_id, match_score, match_tier, distance_m) values ('intra_reviewed', 'nsdi-18830', 'dmrca-R-1071-C-114', 45.0, 'low', 23.5) on conflict (survivor_mosque_id, redundant_mosque_id) do nothing;
-- Orugodawatta Muslim Mosque | MASJID ALHUTHA (15.8 m)
insert into public.duplicate_candidates (check_type, survivor_mosque_id, redundant_mosque_id, match_score, match_tier, distance_m) values ('intra_reviewed', 'nsdi-18802', 'dmrca-R-2380-C-22-7', 10.0, 'low', 15.8) on conflict (survivor_mosque_id, redundant_mosque_id) do nothing;
-- Rahumaniya Jumma Masjid | RAHMANIYA JUMMA MOSQUE (26.0 m)
insert into public.duplicate_candidates (check_type, survivor_mosque_id, redundant_mosque_id, match_score, match_tier, distance_m) values ('intra_reviewed', 'nsdi-18781', 'dmrca-R-1457-C-141', 80.0, 'low', 26.0) on conflict (survivor_mosque_id, redundant_mosque_id) do nothing;
-- Kimbula Ela Jumma Mosque | AL MASJIDUL ISLAHIYYA JUMMA MOSQUE (17.4 m)
insert into public.duplicate_candidates (check_type, survivor_mosque_id, redundant_mosque_id, match_score, match_tier, distance_m) values ('intra_reviewed', 'nsdi-19010', 'dmrca-R-1984-C-18-3', 62.1, 'low', 17.4) on conflict (survivor_mosque_id, redundant_mosque_id) do nothing;
-- MASJID SA'D BIN ABI WAQQAS (RALI) | MUHIYIDEEN JUMMA MASJID (25.8 m)
insert into public.duplicate_candidates (check_type, survivor_mosque_id, redundant_mosque_id, match_score, match_tier, distance_m) values ('intra_reviewed', 'dmrca-R-2087-C-19-7', 'dmrca-R-40-C-07', 21.4, 'low', 25.8) on conflict (survivor_mosque_id, redundant_mosque_id) do nothing;
-- MUHIYIDEEN JUMMA MASJID | MEERANIYA JUMMA MASJID (25.4 m)
insert into public.duplicate_candidates (check_type, survivor_mosque_id, redundant_mosque_id, match_score, match_tier, distance_m) values ('intra_reviewed', 'dmrca-R-40-C-07', 'dmrca-R-782-C-65', 71.1, 'low', 25.4) on conflict (survivor_mosque_id, redundant_mosque_id) do nothing;
-- ABU SALIH THAKKIYA | MUHIYIDEEN THAKKIYA (25.8 m)
insert into public.duplicate_candidates (check_type, survivor_mosque_id, redundant_mosque_id, match_score, match_tier, distance_m) values ('intra_reviewed', 'dmrca-R-1498-C-144', 'dmrca-R-80-C-14', 59.5, 'low', 25.8) on conflict (survivor_mosque_id, redundant_mosque_id) do nothing;
-- Zaviyyathul Fassiyya Masjid | UN NADVATHUS SHATHULIYA ZAVIATHUL KHAIRIYA (7.5 m)
insert into public.duplicate_candidates (check_type, survivor_mosque_id, redundant_mosque_id, match_score, match_tier, distance_m) values ('intra_reviewed', 'nsdi-18494', 'dmrca-R-197-C-28', 40.6, 'medium', 7.5) on conflict (survivor_mosque_id, redundant_mosque_id) do nothing;
-- MASJIDUL AAKBAR JUMMA MOSQUE | Masjidul Akbar Jumma Masjid (5.3 m)
insert into public.duplicate_candidates (check_type, survivor_mosque_id, redundant_mosque_id, match_score, match_tier, distance_m) values ('intra_reviewed', 'dmrca-R-266-C-31', 'dmrca-R-340-C-39', 83.6, 'medium', 5.3) on conflict (survivor_mosque_id, redundant_mosque_id) do nothing;
-- MUHIYIDEEN THAKKIYA | UMMUZ ZAVIA (29.5 m)
insert into public.duplicate_candidates (check_type, survivor_mosque_id, redundant_mosque_id, match_score, match_tier, distance_m) values ('intra_reviewed', 'dmrca-R-1016-C-106', 'dmrca-R-585-C-53', 26.7, 'low', 29.5) on conflict (survivor_mosque_id, redundant_mosque_id) do nothing;
-- Muhiyudeen Jumma Masjid | MUHIYIDEEN MASJID (45.9 m)
insert into public.duplicate_candidates (check_type, survivor_mosque_id, redundant_mosque_id, match_score, match_tier, distance_m) values ('intra_reviewed', 'nsdi-18828', 'dmrca-R-717-C-61', 80.0, 'low', 45.9) on conflict (survivor_mosque_id, redundant_mosque_id) do nothing;
-- Muhiyadeen Jumma Mosque | DEMATAGODA MUHIYADEEN JUMMA MOSQUE (6.9 m)
insert into public.duplicate_candidates (check_type, survivor_mosque_id, redundant_mosque_id, match_score, match_tier, distance_m) values ('intra_reviewed', 'nsdi-18565', 'dmrca-R-891-C-76', 80.7, 'medium', 6.9) on conflict (survivor_mosque_id, redundant_mosque_id) do nothing;
-- Madampitiya Jumma Mosque | MASJIDUL HIDAYATH MADAMPITIYA JUMMA MOSQUE (0.5 m)
insert into public.duplicate_candidates (check_type, survivor_mosque_id, redundant_mosque_id, match_score, match_tier, distance_m) values ('intra_reviewed', 'nsdi-19005', 'dmrca-R-1588-C-156', 72.7, 'medium', 0.5) on conflict (survivor_mosque_id, redundant_mosque_id) do nothing;
-- MASJID SA'D BIN ABI WAQQAS (RALI) | MEERANIYA JUMMA MASJID (16.4 m)
insert into public.duplicate_candidates (check_type, survivor_mosque_id, redundant_mosque_id, match_score, match_tier, distance_m) values ('intra_reviewed', 'dmrca-R-2087-C-19-7', 'dmrca-R-782-C-65', 21.8, 'low', 16.4) on conflict (survivor_mosque_id, redundant_mosque_id) do nothing;
-- MUSLIM BURIAL GROUND | MASJIDUS SALAM JUMMA MOSQUE (20.4 m)
insert into public.duplicate_candidates (check_type, survivor_mosque_id, redundant_mosque_id, match_score, match_tier, distance_m) values ('intra_reviewed', 'dmrca-R-2159-C-21-1', 'dmrca-R-43-C-09', 46.8, 'low', 20.4) on conflict (survivor_mosque_id, redundant_mosque_id) do nothing;
-- Masjidur Rahumaniya Mosque | MASJIDHUL RAHMANIYA MOSQUE (9.8 m)
insert into public.duplicate_candidates (check_type, survivor_mosque_id, redundant_mosque_id, match_score, match_tier, distance_m) values ('intra_reviewed', 'nsdi-19002', 'dmrca-R-1668-C-166', 92.3, 'medium', 9.8) on conflict (survivor_mosque_id, redundant_mosque_id) do nothing;
-- Masjidus Salam Jumma Masjid | Muhammed Town Jummah Masjid (46.0 m)
insert into public.duplicate_candidates (check_type, survivor_mosque_id, redundant_mosque_id, match_score, match_tier, distance_m) values ('intra_reviewed', 'nsdi-18688', 'dmrca-R-2119-C-20-5', 63.0, 'low', 46.0) on conflict (survivor_mosque_id, redundant_mosque_id) do nothing;
-- Rajagiriya Jummah Mosque | NOORANIYA JUMMA MASJID (7.9 m)
insert into public.duplicate_candidates (check_type, survivor_mosque_id, redundant_mosque_id, match_score, match_tier, distance_m) values ('intra_reviewed', 'nsdi-18259', 'dmrca-R-1818-C-173', 60.9, 'medium', 7.9) on conflict (survivor_mosque_id, redundant_mosque_id) do nothing;

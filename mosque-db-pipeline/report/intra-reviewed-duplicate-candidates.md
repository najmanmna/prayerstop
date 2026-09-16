# Duplicate candidates within the already-reviewed set

Pairwise check across all 378 `verification_status='verified'`
`mosque_records` rows (any source — nsdi/dmrca/osm mixed), using real
human-confirmed coordinates (haversine distance) as the primary signal
and name similarity as a secondary, tier-raising one. Thresholds:
<= 50m always flagged high; <= 150m high if names are
similar (>=85) else medium; <= 400m only flagged at all if the name
match is very strong (medium at >=93, low at >=70). Nothing beyond
400m is considered, regardless of name.

- Total candidate pairs: 29
  - high: 23
  - medium: 5
  - low: 1

No database changes made — this is a report for human confirmation.

| Tier | Dist (m) | Name score | Record A | Record B |
|---|---|---|---|---|
| high | 5.2 | 100.0 | [dmrca-R-496-GM-12] MASJIDUN NOOR JUMMA MOSQUE (Gampaha) | [nsdi-28480] Masjidun Noor Jummah masjid (Gampaha) |
| high | 6.1 | 100.0 | [osm-node-13575435498] Azhariya jumma masid () | [osm-way-1480031445] Azhariya Jumma masjid () |
| high | 7.1 | 0.0 | [dmrca-R-1044-AM-50] THAKKIYA MOSQUE (Ampara) | [nsdi-21955] Thakkiya Mosque (Ampara) |
| high | 7.5 | 100.0 | [dmrca-R-1094-GM-34] MASJIDUN NOOR JUMMA MOSQUE (Gampaha) | [nsdi-19201] Masjidun Noor Jumma Mosque (Gampaha) |
| high | 9.2 | 100.0 | [nsdi-21437] Meera Maccam Mosque & Dargha Kandy (Kandy) | [osm-way-1167973230] Meera Maccam Mosque & Dargha Kandy () |
| high | 10.9 | 100.0 | [nsdi-15997] Muhiyadeen Jumma Masjid (Kalutara) | [osm-node-1822758906] Muhiyadeen Grand Jumma Masjid () |
| high | 13.3 | 36.4 | [nsdi-16540] Masjidun Noor (Kalutara) | [osm-way-1188664928] Masjidun NoorJummah Masjidh () |
| high | 13.8 | 64.0 | [nsdi-25887] Mohideen Jumma Mosque (Vavuniya) | [osm-node-4414048679] Mohaideen jumma masjith () |
| high | 14.7 | 100.0 | [nsdi-18744] Colombo Grand Mosque (Colombo) | [osm-way-1040165981] Colombo Grand Mosque () |
| high | 18.6 | 18.2 | [dmrca-R-945-GM-27] MAGUNAMUL FALAH JUMMA MOSQUE (Gampaha) | [nsdi-20662] Negombo Town Jumma Masjid (Gampaha) |
| high | 19.9 | 100.0 | [dmrca-R-0318-AM-03] NINTAVUR JUMMA MOSQUE (Ampara) | [nsdi-21858] Grand Jummah Mosque Nintavur (Ampara) |
| high | 22.2 | 100.0 | [nsdi-15140] Welithara Jummah Masjid Balapitiya (Galle) | [osm-way-287079524] Welithara Jummah Masjid Balapitiya () |
| high | 25.5 | 100.0 | [dmrca-R-2539-K-295] Masjidul Jabal Thakkiya (Kandy) | [nsdi-21009] Masjidul Jabal (Kandy) |
| high | 29.6 | 100.0 | [dmrca-R-1606-C-161] MASJIDHUL FALAH JUMMA MOSQUE (Colombo) | [nsdi-18910] Masjidul Falah Jummah Mosque (Colombo) |
| high | 33.6 | 100.0 | [dmrca-R-1379-GM-39] MASJIDUN-UN-NOOR JUMMA MOSQUE (Gampaha) | [nsdi-28483] Masjidun Noor Jumma Masjid (Gampaha) |
| high | 37.3 | 90.0 | [dmrca-R-334-C-37] DEWATAGAHA MOSQUE & SHRINE (Colombo) | [nsdi-18387] Dawatagaha Mosque (Colombo) |
| high | 45.1 | 100.0 | [nsdi-21932] MASJIDUR RASHAD (Kandy) | [nsdi-21933] MASJIDUR RASHAD (Kandy) |
| high | 70.8 | 100.0 | [nsdi-15750] MAGGONA JUMMA MOSQUE (Kalutara) | [nsdi-15754] Maggona Grand Jumma Masjid (Kalutara) |
| high | 71.1 | 100.0 | [nsdi-25986] Sooduventhapulavu (Vavuniya) | [nsdi-25992] Sooduventhapulavu (Vavuniya) |
| high | 71.9 | 88.0 | [dmrca-R-540-KL-33] KACHCHIMALAI SHRINE (Kalutara) | [nsdi-15683] Ketchchimalai Grand Mosque (Kalutara) |
| high | 77.1 | 100.0 | [dmrca-R-0889-KN-02] MASJIDUL ABDEEN JUMMA MOSQUE (Kilinochchi) | [nsdi-26737] MASJIDUL ABDEEN JUMMA MOSQUE (Kilinochchi) |
| high | 130.6 | 100.0 | [dmrca-R-0676-T-033] MALAY (JAWA) KOTHBA MOSQUE (Trincomalee) | [nsdi-25748] Jawa jummah Mosque (Trincomalee) |
| high | 132.0 | 100.0 | [dmrca-R-2006-C-18-7] MASJIDH UMAR (Colombo) | [nsdi-18839] Masjidul Umar Jummah Masjid (Colombo) |
| medium | 85.0 | 34.5 | [dmrca-R-079-P-08] MUHIYIDEEN JUMMA MOSQUE (Puttalam) | [osm-node-13339072331] Kandakuliya Grand Jummah Masjidh () |
| medium | 107.7 | 52.6 | [nsdi-14331] Zaviya Ummul Fuqarah (Galle) | [nsdi-14333] Zaviya Shazuliyyah (Galle) |
| medium | 134.7 | 23.5 | [nsdi-22831] Al Masjidul Jamiul Azhar (Kurunegala) | [nsdi-22834] Malay Jumma Mosque (Kurunegala) |
| medium | 136.8 | 16.7 | [dmrca-R-0676-T-033] MALAY (JAWA) KOTHBA MOSQUE (Trincomalee) | [nsdi-25745] Kinniya Grand Mosque (Trincomalee) |
| medium | 210.4 | 100.0 | [dmrca-R-894-GM-21] AKBAR TOWN JUMMA MASJID (Gampaha) | [nsdi-19323] Akbar Town Jummah Mosque (Gampaha) |
| low | 321.0 | 72.7 | [nsdi-26430] Mohaidee Sinna Palli (mosque) (Mannar) | [nsdi-26432] Mohideen Grand Mosque (Mannar) |

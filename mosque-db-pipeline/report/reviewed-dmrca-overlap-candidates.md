# Reviewed NSDI records with a likely unmatched DMRCA overlap

Re-run of `05_match.py`'s real matching algorithm (global 1:1 greedy
assignment, confidence tiers, runner-up margin + contested-cluster
demotion — identical logic, not a re-implementation), scoped to the
245 reviewed/verified `mosque_records` rows that currently
have no linked DMRCA source, against the 2207-record
unmatched-DMRCA pool.

- Total candidates found: 152
  - high: 51
  - medium: 19
  - low: 82
- No usable-name candidate at all: 93

None of these have been merged or changed in the database — this is
a report for human confirmation. `contested: true` means multiple
DMRCA records tied near the top for the same reviewed record (a
common-name collision within the district) — treat those as
genuinely ambiguous, not as this specific pairing being correct.

| Tier | Score | Reviewed record | District | Matched DMRCA | DMRCA city | Contested |
|---|---|---|---|---|---|---|
| high | 100.0 | [nsdi-22458] Masjid Ul Kabeer | Ampara | R/0278/AM/01: MASJIDUL KABEER JUMMA MOSQUE | KALMUNAI |  |
| high | 100.0 | [nsdi-21858] Grand Jummah Mosque Nintavur | Ampara | R/0406/AM/04: NINTAVUR JUMMA MOSQUE | KALMINAI |  |
| high | 100.0 | [nsdi-21907] Jalaliya Jummah Masjidh | Ampara | R/0434/AM/08: MASJIDUL JALALIYA JUMMA MOSQUE | AKKARAIPATTU |  |
| high | 100.0 | [nsdi-17946] Pottuvil Grand Mosque | Ampara | R/0528/AM/11: PANAMAIPATTU POTTUVIL JUMMA MOSQUE | POTTUVIL |  |
| high | 100.0 | [nsdi-20895] Irakkamam Ameer Ali Puram Mosque | Ampara | R/0770/AM/35: IRAKKAMAM JUMMA MOSQUE | IRAKKAMAM |  |
| high | 100.0 | [nsdi-22300] Jamia Jummah Masjid (Kalmunai Town Red Mosque) | Ampara | R/1022/AM/43: KALMUNAI TOWN JUMMA MOSQUE | KALMUNAI |  |
| high | 100.0 | [nsdi-20564] 11A Village Jummah Mosque | Ampara | R/1465/AM/114: '11A', JUMMA MOSQUE | IRAKKAMAM |  |
| high | 100.0 | [nsdi-17459] Bandarawela Jummah Mosque | Badulla | R/632/BD/27: BANDARAWELA JUMMA MOSQUE | BANDARAWELA |  |
| high | 100.0 | [nsdi-23606] Masjid Al Minan | Batticaloa | R/2502/BT/304: MASJIDUL MINAN | KATTANKUDY |  |
| high | 100.0 | [nsdi-24561] Masjidul Hairath | Batticaloa | R/2504/BT/305: MASJIDUL HAIRATH | ERAVUR |  |
| high | 100.0 | [nsdi-18469] Wekanda Jumma Mosque | Colombo | R/259/C.30: WEKANDA JUMMA MOSQUE | COLOMBO - 02 |  |
| high | 100.0 | [nsdi-17949] Wellawatte Jumma Masjid | Colombo | R/483/C.45: WELLAWATTE JUMMA MOSQUE | COLOMBO - 6 |  |
| high | 100.0 | [nsdi-18351] Jumma Mosque Kollupitiya | Colombo | R/508/C.47: KOLLUPITIYA JUMMA MOSQUE | COLOMBO - 03 |  |
| high | 100.0 | [nsdi-18276] Nawala Jumma Mosque | Colombo | R/942/C.81: NAWALA MOSQUE | RAJAGIRIYA |  |
| high | 100.0 | [nsdi-18391] Abdeen Jumma Masjid - Borella | Colombo | R/1012/C.103: BORELLA JUMMA MOSQUE | COLOMBO - 08 |  |
| high | 100.0 | [nsdi-18182] Jawatte Jumma Masjid | Colombo | R/1294/C.125: JAWATTE JUMMA MOSQUE | COLOMBO - 07 |  |
| high | 100.0 | [nsdi-19180] MASJID UL BADRIYA | Colombo | R/1555/C.152: AL MASJIDUL BADRIYA | COLOMBO - 15 |  |
| high | 100.0 | [nsdi-18839] Masjidul Umar Jummah Masjid | Colombo | R/2013/C/18 8: AL-MASJIDUL UMAR | WELLAMPITIYA |  |
| high | 100.0 | [nsdi-18910] Masjidul Falah Jummah Mosque | Colombo | R/2179/C/21 4: AL-MASJIDUL FALAH | COLOMBO - 10 |  |
| high | 100.0 | [nsdi-19465] Mabole Jumma Masjid | Gampaha | R/721/GM.18: MABOLE JUMMA MOSQUE | MABOLA |  |
| high | 100.0 | [nsdi-19323] Akbar Town Jummah Mosque | Gampaha | R/1570/GM.46: AL MASJIDUL AKBAR | THIHARIYA |  |
| high | 100.0 | [nsdi-28064] Nambuluwa Grand Mosque | Gampaha | R/2124/GM 75: NAMBULUWA JAMIUTH THOWHEETH MASJID | PASYALA |  |
| high | 100.0 | [nsdi-15642] Masjid ul Abrar | Kalutara | R/94/KL.07: MASJIDUL ABRAR | BERUWELA |  |
| high | 100.0 | [nsdi-15996] Naqshabandiya Thakkiya Mosque | Kalutara | R/153/KL.11: NAQSHABANDIYA JUMMA MOSQUE | MORATUWA |  |
| high | 100.0 | [nsdi-16829] Masjidul Ummi Jumma Mosque | Kalutara | R/1544/KL.75: MASJIDUL UMMI MOSQUE | MORATUWA |  |
| high | 100.0 | [nsdi-16502] Jisthiya Masjid | Kalutara | R/1963/KL/82: JISTHIYA THAKKIYA | PANADURA |  |
| high | 100.0 | [nsdi-15712] Riyalus Saliheen Jummah Masjid | Kalutara | R/2169/KL/86: RIYALUS SALIHEEN JUMMAH MASJID | BERUWALA |  |
| high | 100.0 | [nsdi-21437] Meera Maccam Mosque & Dargha Kandy | Kandy | R/168/K/22: MEERA MACCAM MOSQUE & DHARGA | KANDY |  |
| high | 100.0 | [nsdi-21058] Ilukwatte Jumma Mosque | Kandy | R/320/K/45: ILUKWATTE JUMMA MOSQUE | KADUGANNAWA |  |
| high | 100.0 | [nsdi-21973] Akurana Grand Mosque | Kandy | R/543/K/73: AKURANA GRAND JUMMA MOSQUE | AKURANA |  |
| high | 100.0 | [nsdi-22323] Al-Masjidh Ismail | Kandy | R/2174/K/206: MASJID ISMAIL | KANDY |  |
| high | 100.0 | [nsdi-20716] Masjidul Arafa | Kandy | R/2318/K/244: ARAFA JUMMAH MASJID | AKURANA |  |
| high | 100.0 | [nsdi-20408] Wilpola Jummah Mosque | Kegalle | R/0471/KD/37: WILPOLA JUMMA MASJID | ARANAYAKE |  |
| high | 100.0 | [nsdi-20327] Mawathagoda Jummah Mosque | Kegalle | R/0044/KD/57: MAWATHAGODA JUMMA MOSQUE | ARANAYAKE |  |
| high | 100.0 | [nsdi-22834] Malay Jumma Mosque | Kurunegala | R/616/KU.70: MALAY MOSQUE | KURUNEGALA |  |
| high | 100.0 | [nsdi-22682] Gongawela Jumma Masjid | Matale | R/58/MT 27: GONGAWELA MOSQUE | MATALE |  |
| high | 100.0 | [nsdi-22446] Masjidul Huda Mosque | Matale | R/2193/MT 57: MASJIDUL HUDA | UKUWELA |  |
| high | 100.0 | [nsdi-19785] Masjidhul Noor (Jumma Masjidh);Al Hamidhiyyah Arabic College | Nuwara Eliya | R/92/N/14: MASJIDUL NOOR JUMMA MOSQUE | HAPUGASTALAWA |  |
| high | 100.0 | [nsdi-17455] Maskeliya Hanafi Indonesian Memoriel Mosque | Nuwara Eliya | R/238/N/26: HANAFI JUMMA MOSQUE | MASKELIYA |  |
| high | 100.0 | [nsdi-18089] Hatton Jumma Mosque | Nuwara Eliya | R/309/N/27: HATTON JUMMA MOSQUE | HATTON |  |
| high | 100.0 | [nsdi-24686] Palavi Jumma Masjid | Puttalam | R/294/P.28: PALAVI JUMMA MOSQUE | PALAVI |  |
| high | 100.0 | [nsdi-16336] Balangoda City Jumma Masjidh | Ratnapura | R/474/R.13: BALANGODA JUMMA MOSQUE | PELMADULLA |  |
| high | 100.0 | [nsdi-25874] Jamaliya Jummah Mosque | Trincomalee | R/0558/T/014: JAMALIYA MUHIYIDEEN JUMMA MOSQUE | TRINCOMALEE |  |
| high | 100.0 | [nsdi-25748] Jawa jummah Mosque | Trincomalee | R/1101/T/071: JAWA JUMMA MOSQUE | MULLIPOTANA |  |
| high | 100.0 | [nsdi-25724] Thaqwa jumma mosque | Trincomalee | R/1679/T/147: AL MASJIDUL THAQWA | PULMODDAI |  |
| high | 100.0 | [nsdi-25735] Aqsha Mosque | Trincomalee | R/2468/T/216: AL-AQSHA JUMMAH MOSQUE |  |  |
| high | 100.0 | [nsdi-25661] Salihath Jumma Masjith | Trincomalee | R/2557/T/222: MASJIDUS SALIHATH THAKKIYA | MULLIPOTANA |  |
| high | 100.0 | [nsdi-25897] Masjidhuth Thaqwa - Sinnach Chippik Kulam | Vavuniya | R/2563/V/34: AL MASJIDUL THAQWA MOSQUE | VAVUNIYA |  |
| high | 95.2 | [nsdi-19900] Muhiyadheen Jumma Masjid | Nuwara Eliya | R/188/N/06: MUHIYADEEN MOSQUE | HETHUNUWEWA |  |
| high | 95.0 | [nsdi-15666] Hilriya Mosque Molliyamala | Kalutara | R/421/KL.27: MOLLIYAMALA KHILURIYA MOSQUE | BERUWELA |  |
| high | 94.1 | [nsdi-26238] Masjidul Munawwara Jumma Mosque | Mannar | R/1072/MN 46: AL MASJIDUL MUNAWWAR | MANNAR |  |
| medium | 100.0 | [nsdi-17883] Mohideen Masjid | Ampara | R/1468/AM/117: MOHIDEEN JUMMA MOSQUE | IRAKKAMAM |  |
| medium | 100.0 | [nsdi-21147] Masjith Majmaus Saliheen | Ampara | R/1719/AM/158: MASJITHUL SALIHEEN | KARAITHEEVU |  |
| medium | 100.0 | [nsdi-18644] Fort Jumma Mosque | Colombo | R/920/C.79: COLOMBO FORT MOSQUE | COLOMBO - 01 |  |
| medium | 100.0 | [nsdi-20662] Negombo Town Jumma Masjid | Gampaha | R.893/GM.20: NEGOMBO GRAND JUMMA MOSQUE | NEGOMBO |  |
| medium | 100.0 | [nsdi-19201] Masjidun Noor Jumma Mosque | Gampaha | R/1876/GM.57: MASJUN NOOR | KAL-ELIYA |  |
| medium | 100.0 | [nsdi-21932] MASJIDUR RASHAD | Kandy | R/2586/K/304: MASJIDUR RASHAD | AKURANA |  |
| medium | 100.0 | [nsdi-26105] Mohideen Jummah Mosque - Pattanichoor | Vavuniya | R/1733/V/25: MOHIDEEN JUMMA MOSQUE | VAVUNIYA |  |
| medium | 90.9 | [nsdi-18523] Masjidul Jamiah Mosque | Colombo | R/41/C.08: MASJIDUL JAMIA MOSQUE | COLOMBO - 02 |  |
| medium | 90.9 | [nsdi-18710] Jami Ul Alfar Mosque | Colombo | R/91/C.20: JAMIUL ALFAR MOSQUE | COLOMBO - 11 |  |
| medium | 90.9 | [nsdi-20389] Kahapitiya Jummah Masjid | Kandy | R/521/K/69: KAHATAPITIYA JUMMA MOSQUE | GAMPAHA |  |
| medium | 90.9 | [nsdi-22845] Siyambalagaskotuwa Grand Mosque | Kurunegala | R/779/KU.85: SIYAMBALAKOTUWA THAKKIYA | KAHATAGAHAMADA |  |
| medium | 90.0 | [nsdi-18262] Jumma Masjid, Padinawala | Badulla | R/473/BD/21: PADINAWELA MOSQUE | KAHAGOLLA |  |
| medium | 88.9 | [nsdi-21219] Masjidul Haima | Ampara | R/2428/AM/237: HIMA MOSQUE | PALAMUNAI -01 |  |
| medium | 88.0 | [nsdi-21831] Jameul Alfar Jummah Mosque | Ampara | R/1391/AM/101: JAMIUL ALUFAR | SAMMANTHURAI |  |
| medium | 87.5 | [nsdi-14458] Haliwala Jumma Masjid | Galle | R/0237/G/11: HALIWELA JUMMA MOSQUE | GALLE |  |
| medium | 87.0 | [nsdi-22738] THELIYAGONNA JUMMA MOSQUE | Kurunegala | R/608/KU.68: TELIYAGONNE JUMMA MOSQUE | KURUNEGALA |  |
| medium | 86.7 | [nsdi-20392] Al Jaamiul Hairath Jummah Masjid | Kegalle | R/1742/KD/83: JAMIUL HAJARATH MOSQUE | ARANAYAKE |  |
| medium | 85.7 | [nsdi-14523] Navinna Jumma Masjid | Galle | R/0070/G/04: NAWINNA JUMMA MOSQUE | GALLE |  |
| medium | 85.7 | [nsdi-14054] Muhiyaddeen Jumma Masjid | Matara | R/0059/MR/02: MUHIYIDEEN JUMMA MOSQUE | HAKMANA |  |
| low | 100.0 | [nsdi-20812] Markaz Masjid - Akkaraipattu | Ampara | R/0410/AM/05: AKKARAIPATTU TOWN JUMMA MOSQUE | AKKARAIPATTU | yes |
| low | 100.0 | [nsdi-17902] Al Nooraniya Mosque | Ampara | R/1047/AM/53: NOORANIYA SHRINE | SAMMANTHURAI | yes |
| low | 100.0 | [nsdi-22325] Salam Jumma Mosque | Ampara | R/1123/AM/70: AL - MASJIDUL SALAM JUMMA MOSQUE | SAMMANTHURAI | yes |
| low | 100.0 | [nsdi-21206] Masjidul Hidaya | Ampara | R//1179/AM/76 A: THAHIYATHUL HIDAYA THAKKIYA | NINTAVUR | yes |
| low | 100.0 | [nsdi-22439] Nooraniya Grand Jummah Mosque | Ampara | R/1323/AM/95: MASJIDUL NOORANIYA | POTTUVIL | yes |
| low | 100.0 | [nsdi-21980] Masjid Al Anwar | Ampara | R/1645/AM/149: AL MASJITHUL ANWAR | IRAKKAMAM | yes |
| low | 100.0 | [nsdi-22111] SALIHEEN JUMMA MOSQUE | Ampara | R/1998/AM/200: AL MASJITHUS SALIHEEN | SAMMANTHURAI | yes |
| low | 100.0 | [nsdi-22136] Masjid e safa | Ampara | R/2049/AM 205: AL-MASJIDUL SAFA JUMMA MASJID | IRAKKAMAM | yes |
| low | 100.0 | [nsdi-25297] Masjidul Thaqwa | Anuradhapura | R/1484/A.96: MASJIDUTH THAQWA JUMMA MOSQUE | MADATUGAMA | yes |
| low | 100.0 | [nsdi-17602] An-Noor Jumma Mosque Guruthalawa | Badulla | R/1654/BD/54: MASJIDUL NOOR JUMMA MOSQUE | HAKGALA | yes |
| low | 100.0 | [nsdi-24135] JAMIUL AKBAR JUMMA MOSQUE | Batticaloa | R/441/BT/15: JAMIUL MASJID | KATTANKUDY | yes |
| low | 100.0 | [nsdi-24492] Meeravodai Meera Jumma Masjid | Batticaloa | R/136/BT/25: GRAND MEERA JUMMA MOSQUE | KATTANKUDY | yes |
| low | 100.0 | [nsdi-23631] Mohideen Jummah Mosque | Batticaloa | R/768/BT/65: MOHIDEEN MOSQUE | VALAICHENAI | yes |
| low | 100.0 | [nsdi-24533] Masjithul Salam | Batticaloa | R/769/BT/66: AL MASJIDUL NOORUL SALAM | ERAVUR - 01 | yes |
| low | 100.0 | [nsdi-23716] Mohideen Meththai Grand Jumma Mosque | Batticaloa | R/783/BT/72: MOHIDEEN MOSQUE | NEW KATTANKUDY | yes |
| low | 100.0 | [nsdi-23767] Mohideen Thaika Mosque | Batticaloa | R/1175/BT/123: MOHIDEEN MOSQUE | ERAVUR | yes |
| low | 100.0 | [nsdi-24526] Oddamavadi Mohideen Jumma Masjid | Batticaloa | R/1394/BT/167: MOHIDEEN THAKKIYA MOSQUE | KATTANKUDY | yes |
| low | 100.0 | [nsdi-24565] Valaichenai Mohideen jumma mosque | Batticaloa | R/1415/BT/173: MOHIDEEN THAKKIYA MOSQUE | KATTANKUDY | yes |
| low | 100.0 | [nsdi-24532] Huda Jumma Masjid | Batticaloa | R/1477/BT/196: MASJIDUL MANARUL HUDA | NEW KATTANKUDY - 2 | yes |
| low | 100.0 | [nsdi-24514] Abrar Masjid | Batticaloa | R/1640/BT/236: MASJITHUL ABRAR | BATTICOLOA | yes |
| low | 100.0 | [nsdi-18744] Colombo Grand Mosque | Colombo | R/755/C.64: THE COLOMBO GRAND MOSQUE | COLOMBO - 12 | yes |
| low | 100.0 | [nsdi-18565] Muhiyadeen Jumma Mosque | Colombo | R/891/C.76: DEMATAGODA MUHIYADEEN JUMMA MOSQUE | COLOMBO - 09 | yes |
| low | 100.0 | [nsdi-17784] Dehiwala Muhiyadeen Grand Jummah Masjid | Colombo | R/1559/C.153: MUHIYADEEN JUMMA MASJID | COLOMBO - 06 | yes |
| low | 100.0 | [nsdi-16540] Masjidun Noor | Kalutara | R/1357/KL.71: MASJIDUN NOOR | BANDARAGAMA | yes |
| low | 100.0 | [nsdi-21361] Malay Military Mosque | Kandy | R/23/K/03: MALAY JUMMA MOSQUE | KANDY | yes |
| low | 100.0 | [nsdi-21672] Jamiul Khairath Jumma Masjid | Kandy | R/326/K/47: MASJIDUL ANVER FI JAMIUL KHAIRATH JUMMA MOSQUE | DANTURA | yes |
| low | 100.0 | [nsdi-21495] Jamiul Khairath Jummah Masjid Mahaiyawa | Kandy | R/1382/K.142: JAMIUL KHAIRATH THAKKIYA | KATUGASTOTA | yes |
| low | 100.0 | [nsdi-20721] Al Masjidhul Hudha Jumma Masjid | Kandy | R/1732/K.166: AL-MASJIDUL HUDHA | DELTOTA | yes |
| low | 100.0 | [nsdi-20946] Masjidh Al-Noor Jum'aah Masjidh - Kiringadeniya | Kegalle | R/0167/KD/16: NOOR MASJID JUMMA MOSQUE | NELUNDENIYA | yes |
| low | 100.0 | [nsdi-20786] Masjidul Huda Jummah Mosque | Kegalle | R/1627/KD/82: MASJIDUL HUDA | MAWANELLA | yes |
| low | 100.0 | [nsdi-24653] Masjidun Noor Jumma Masid | Kurunegala | R/223/KU.27: MASJIDUN NOOR JUMMA MOSQUE | ELABADAGAMA | yes |
| low | 100.0 | [nsdi-22831] Al Masjidul Jamiul Azhar | Kurunegala | R/300/KU.34: JAMIUL AZHAR JUMMA MOSQUE | HADIRAWALA | yes |
| low | 100.0 | [nsdi-22309] Jamiuth Thowheed Jumma Mosque (Old Mosque) | Kurunegala | R/1928/KU 160: JAMIUTH THOWHEED JUMMA MOSQUE | NARANGODA | yes |
| low | 100.0 | [nsdi-26432] Mohideen Grand Mosque | Mannar | R/0866/MN 44: MOHIDEEN JUMMA MOSQUE | ERUKKALAMPIDDY | yes |
| low | 100.0 | [nsdi-22497] Masjidun Noor Jumma Mosque | Matale | R/1700/MT 47: MASJIDUN NOOR JUMMA MOSQUE | GALEWELA | yes |
| low | 100.0 | [nsdi-24096] Al-Masjidun Noor Jumma Mosque | Matale | R/1766/MT 48: MASJIDUN NOOR JUMMA MOSQUE | MATALE | yes |
| low | 100.0 | [nsdi-14212] Jiffry Thakkiya | Matara | R/0384/MR/12: JIFFRY THAKKIYA | MATARA | yes |
| low | 100.0 | [nsdi-24770] MOHIDEEN JUMMA MOSQUE | Polonnaruwa | R/862/PL.12: MOHIDEEN MOSQUE | POLLONNARUWA | yes |
| low | 100.0 | [nsdi-24027] Mohideen Jummah Masjid Madawakkulam | Puttalam | R/1203/P.93: MOHIDEEN THAKKIYA | PUTTALAM | yes |
| low | 100.0 | [nsdi-24508] Mohideen Jummah Mosque | Puttalam | R/1338/P.102: MOHIDEEN THAKKIYA | TALAWILA | yes |
| low | 100.0 | [nsdi-24752] MOHIDEEN JUMMAH MASJID (GRAND MOSQUE) | Puttalam | R/1739/P.132: MOHIDEEN JUMMA MOSQUE, SEYED HAJA SEQUALAWUDEN OLIULLA DHARGA | PALLIVASALTHURAI | yes |
| low | 100.0 | [nsdi-24810] Mohideen Jumma Masjid | Puttalam | R/1755/P.136: AL-HIJRA MOHIDEEN JUMMA MOSQUE | NURAICHOLAI | yes |
| low | 100.0 | [nsdi-16454] Jennath Jumma Mosque | Ratnapura | R/191/R.08: JENNATH JUMMA MOSQUE | RATNAPURA | yes |
| low | 100.0 | [nsdi-26000] Mohideen Jumma Masjid (Mosque) | Trincomalee | R/0548/T/040: MOHIDEEN JUMMA MOSQUE | THAMPALAGAMA M | yes |
| low | 100.0 | [nsdi-25728] Masjidhul Rahman | Trincomalee | R/1470/T/120: MASJIDUR RAHMAN | MUTUR | yes |
| low | 100.0 | [nsdi-25731] Masjidul Falah Jummah Mosque | Trincomalee | R/1524/T/125: MASJIDUL FALAH | KINNIYA | yes |
| low | 100.0 | [nsdi-25743] Thakkiyathul Noor Mosque | Trincomalee | R/1567/T/128: MASJIDUN NOOR JUMMA MOSQUE | CHINA BAY | yes |
| low | 100.0 | [nsdi-25749] Masjidun Noor Mosque | Trincomalee | R/1580/T/133: MASJIDUN NOOR JUMMA MOSQUE | KANTALAI | yes |
| low | 100.0 | [nsdi-25729] Hijra Jumma Masjid | Trincomalee | R/1811/T/162: MASJIDUL HIJRA | KINNIYA - 03 | yes |
| low | 100.0 | [nsdi-25887] Mohideen Jumma Mosque | Vavuniya | R/1504/V/20: MOHIDEEN JUMMAMOSQUE | ANDIYAPULIYANKULAM | yes |
| low | 95.2 | [nsdi-18855] Muhiyaddeen Jumma Masjid | Colombo | R/1560/C.154: AL MASJIDUL MUHIYADEEN | COLOMBO - 09 | yes |
| low | 94.7 | [nsdi-19002] Masjidur Rahumaniya Mosque | Colombo | R/1457/C.141: RAHMANIYA JUMMA MOSQUE | COLOMBO - 14 | yes |
| low | 94.1 | [nsdi-25838] Mohaideen Jumma Masjid | Trincomalee | R/1053/T/063: MOHIDEEN JUMMA MOSQUE | TRINCOMALEE | yes |
| low | 90.0 | [nsdi-18828] Muhiyudeen Jumma Masjid | Colombo | R/40/C.07: MUHIYIDEEN JUMMA MASJID | COLOMBO - 12 | yes |
| low | 88.9 | [nsdi-22222] Mohideen grand Jumma Mosque | Ampara | R/1660/AM/150: MOHIYADEEN MASJID | POTTUWIL | yes |
| low | 85.7 | [nsdi-14394] Muhiyaddeen Jumma Masjid | Galle | R/0524/G/17: MUHIYIDEEN JUMMA MOSQUE | GALLE | yes |
| low | 84.2 | [nsdi-26368] Muhaideen Jumma Masjid | Mannar | R/0176/MN 04: MUHIYIDEEN PALLI | NANADDAN | yes |
| low | 84.2 | [nsdi-24861] Paariyappa Mosque | Puttalam | R/1170/P.89: PARRIAPPA PALLIVASAL | PUTTALAM |  |
| low | 83.7 | [nsdi-15977] Al Masjidul Fasiyathush Shazuliyah | Kalutara | R/1327/KL.68: ZAVIATHUL FASIYYAHTUL SHAZULIYA | BERUWELA |  |
| low | 83.3 | [nsdi-25868] Al Huloor Jummah Masjid | Trincomalee | R/1052/T/062: MASJIDUL HILOOR JUMMA MOSQUE | TRINCOMALEE |  |
| low | 83.3 | [nsdi-25762] MASJIDUL RABIYA | Trincomalee | R/1407/T/110: MASJIDUN SABIYA | KINNIYA |  |
| low | 82.4 | [nsdi-14428] Al Masjidhul Khilriyyu (Jumma Mosque) | Galle | R/1647/G/53: AL MASJIDUL KHILRIYA | SARENTHU KADE |  |
| low | 80.0 | [nsdi-20675] Kamachchode Jumma Mosque | Gampaha | R/596/GM.17: KAMACHODA MOSQUE | NEGOMBO |  |
| low | 79.2 | [nsdi-22186] Bakiyathus Salihath Masjidh | Ampara | R/2147/AM 216: MASJIDUL BAKIKIYATHUS SALIHATH | KALMUNAI-07 | yes |
| low | 77.8 | [nsdi-24782] Kalawewa Jumma Grand Masjid | Anuradhapura | R/257/A.06: BALALUWEWA JUMMA MOSQUE | PALAGALA |  |
| low | 76.9 | [nsdi-18688] Masjidus Salam Jumma Masjid | Colombo | R/2243/C/21 9: MASJIDUL SALAMIYA | GOTHATUWA |  |
| low | 76.9 | [nsdi-22736] Hanafi Mosque | Matale | R/536/MT 25: HANAFEE JUMMA MOSQUE | MATALE TOWN |  |
| low | 76.9 | [nsdi-25733] Masjidul Khair Jummah Mosque | Trincomalee | R/1228/T/089: MASJIDUL KHAIRIYA JUMMA MOSQUE | KINNIYA |  |
| low | 76.5 | [nsdi-21217] Hanthana Seyyidha Fathima Beebi Masjid (Mosque) and Shrine | Kandy | R/1381/K.141: FATHIMA BEEBI ZIYARAM | KANDY |  |
| low | 76.2 | [nsdi-20985] Kurukkuthala Jumma Masjid | Kandy | R.305/K/43: KURUTTALA JUMMA MOSQUE | KADUGANNAWA |  |
| low | 76.2 | [nsdi-26348] Periyamadu Central Masjid | Mannar | R/0209/MN 07: PERIYAKADAI JUMMA MOSQUE | MANNAR |  |
| low | 75.0 | [nsdi-20959] Addalachennai Grand Mousqe | Ampara | R/743/AM/25: ADDALAICHENAI METHAI PALLIVASAL | ADDALAICHENAI |  |
| low | 75.0 | [nsdi-23699] Masjid Quba | Batticaloa | R/1638/BT/235: MASJITHUL KUBA | VALAICHENAI |  |
| low | 75.0 | [nsdi-28481] Jamiut Tawheed Mosque | Gampaha | R/2242/GM/83: JAMIUTH TTHOWHEETH JUMMA MOSQUE | THIHARIYA |  |
| low | 73.7 | [nsdi-23553] Bandipola Jumma Masjid | Kurunegala | R/229/KU.28: HIBBANPOLA JUMMA MOSQUE | TUTTEIPITIYGAMA |  |
| low | 73.7 | [nsdi-24645] Nagawilluwa Jumma Mosque | Puttalam | R/122/P.10: NARAWILA JUMMA MOSQUE | KOSWATTE |  |
| low | 72.7 | [nsdi-21933] MASJIDUR RASHAD | Kandy | R/1922/K.183: MASJIDUL AKSHA |  | yes |
| low | 72.7 | [nsdi-26430] Mohaidee Sinna Palli (mosque) | Mannar | R/1081/MN 47: MOHIDEEN JUMMA MOSQUE | ADAMPAN | yes |
| low | 71.4 | [nsdi-25301] Nochchiyagama Grand Mosque | Anuradhapura | R/266/A.07: KALLANCHIYAGAMA JUMMA MOSQUE | KAGAMA |  |
| low | 71.1 | [nsdi-25254] Haja seihu alahudeen jumma mosque | Puttalam | R/574/P.53: HAJA SEGU ALUDEEN ANDAVAR JUMMA MOSQUE | KALPITIYA |  |
| low | 70.0 | [nsdi-21364] Grand Jumm'a Masjith Oluvil | Ampara | R/2250/AM/224: MEERA MASJITH | AKKARAIPATTU-01 | yes |
| low | 70.0 | [nsdi-18657] Meerania Jumma Masjidh | Colombo | R/2116/C/20 4: AL-AZHAR JUMMAH MASJIDH | DEHIWELA | yes |

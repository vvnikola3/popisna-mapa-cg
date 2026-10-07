# Priprema podataka

Skripte generišu sve fajlove u `public/data/<država>/` iz izvora u `sources/<država>/`:

```
npm run data:build
```

Trenutno postoje Crna Gora (`me`) i Sjeverna Makedonija (`mk`, vidi dolje). Nova država dobija svoj folder u
`sources/` i `public/data/`, svoj `teritorije.json` i svoje skripte za popise.

| Skripta | Izlaz | Opis |
|---|---|---|
| `build-region.js` | `public/data/region.json` | Mapa regiona za početnu stranicu: Natural Earth 1:50m (javno dobro), Kosovo spojeno sa Srbijom, susjedne države kao siva pozadina. |
| `build-geo.js` | `geo-<godina>.json`, `teritorije.json` | Granice opština za svaku godinu popisa, izvedene iz registra teritorija. Zeta (OSM relacija 10147976) se isijeca iz stare Podgorice. Svakoj opštini se računa tačka za naziv. |
| `fetch-popstat.js` | `sources/me/popstat-<godina>-<tema>.json` | Jednokratno preuzimanje tabela sa pop-stat.mashke.org (nacionalnost 1961–1991, vjera 1991) uz provjeru zbirova. |
| `build-census-historical.js` | `popis-1948.json` … `popis-1991.json` | Broj stanovnika: MONSTAT, Popis 2003, Knjiga 9 (1948 i 1953 preračunato na granice iz 2003); nacionalnost i vjera: pop-stat. |
| `build-census-2003.js` | `popis-2003.json` | MONSTAT, Popis 2003 – Knjiga 3 (ćirilica). |
| `build-census-2011.js` | `popis-2011.json` | MONSTAT, Popis 2011 – stanovništvo po opštinama. |
| `build-census-2023.js` | `popis-2023.json` | MONSTAT, Popis 2023 – saopštenja I i II. |

| `fetch-makstat.js` | `sources/mk/makstat-*.json` | Jednokratno preuzimanje MakStat tabela (Sjeverna Makedonija) preko PX-Web API-ja; `npm run data:fetch-mk`. |
| `build-geo-mk.js` | `mk/geo-2002.json`, `geo-2021.json`, `teritorije.json`, `sources/mk/povrsine.json` | Granice opština: geoBoundaries ADM2 (84 opštine = 2002); za 2021. su Drugovo, Oslomej, Vraneštica i Zajas spojeni sa Kičevom. Računa i površine. |
| `build-census-mk.js` | `mk/popis-2002.json`, `popis-2021.json` | MakStat: broj stanovnika, pol, starost, nacionalnost (2002: 8 grupa), 2021 još vjera i maternji jezik. |
| `geo-helpers.js` | – | Zajednički dio skripti za granice (isjecanje sitnih dijelova, tačka za naziv, upis `geo-<godina>.json`). |

Skripte za popis zahtijevaju da `geo-*.json` već postoji (zbog površine).
Godine popisa sa podacima su u `registry.js` (`CENSUS_YEARS`) i u `src/app/census/countries.ts`.

## Registar teritorija (`sources/me/teritorije.json`)

Svaka opština ima `id` i `naziv`; one nastale kasnije imaju i `osnovana` (godina)
i `izdvojenaIz` (opština čiji su dio bile), a preimenovane `raniji` (npr. Titograd
1946–1991, Ivangrad 1949–1991). `teritorijaPopisa` kaže na koje granice se odnose
podaci popisa kad nisu tadašnje (1948 i 1953 su u Knjizi 9 preračunati na 2003).
Iz toga se:

- prave granice za raniji popis – kasnije osnovane opštine se vraćaju u matičnu
  (npr. za 2011. i 2003.: Gusinje → Plav, Petnjica → Berane, Tuzi i Zeta → Podgorica;
  za 1961–1981 i Andrijevica → Ivangrad);
- u aplikaciji određuje šta je uporedivo između dva popisa (napomena „granice
  promijenjene" / „opština nije postojala").

## Sjeverna Makedonija (`sources/mk/`)

- `makstat-<godina>-<tema>.json` – tabele iz [MakStat](https://makstat.stat.gov.mk) (Državni zavod za statistiku,
  PX-Web API, bez ključa, traži `User-Agent`; dozvoljeno je samo nekoliko zahtjeva u nekoliko sekundi, pa
  skripta čeka na HTTP 429). Svaki fajl ima metapodatke tabele i redove `[opština, …, vrijednost]`;
  „-“ u izvoru je nula. `makstat-2021-nazivi-mk.json` su makedonski (ćirilični) nazivi opština.
- `geoboundaries-mkd-adm2.json` – [geoBoundaries](https://www.geoboundaries.org) ADM2, uprošćena verzija
  (CC BY 4.0), 84 opštine = stanje 2002.
- `teritorije.json` – registar: `id` (`MK` + redni broj opštine u tabeli popisa 2002), `naziv` (latinica,
  srpski pravopis), `cirilica` i `engleski` (aplikacija ih koristi umjesto transliteracije), `grad`
  (deset opština Grada Skoplja). Opštine ukinute 2013. imaju `ukinuta` i `pripojenaU` – za popis 2021.
  se spajaju u Kičevo (u Crnoj Gori je obrnuto: `osnovana` / `izdvojenaIz`).
- `povrsine.json` – generiše `build-geo-mk.js`. **Površine opština su izračunate iz granica**, jer baza
  nema tabelu površina; zato su malo manje od zvaničnih (koje uključuju jezera), a ukupna površina države
  (25.713 km²) je zvanična i veća je od zbira opština.

Provjere: zbir polova, starosnih grupa i svih kategorija = ukupno za svaku opštinu, zbir opština = država,
zbir deset skopskih opština = Grad Skoplje. U popisu 2021. za 7,2% stanovnika podaci su iz administrativnih
registara (nacionalnost, vjera i jezik nepoznati) – prikazano kao „Nepoznato“. Prosječna starost nije u bazi.
Po opštinama 2002. nema vjere ni maternjeg jezika (vidi TODO.md).

## Svaki popis sadrži

`stanovnika`, `muskarci`, `zene`, `prosjecnaStarost`, `starost` (0-14, 15-64, 65+),
`povrsinaKm2`, `gustina`, i liste `nacionalnost`, `vjera`, `jezik` (maternji jezik)
sa svim kategorijama iz izvora. Aplikacija ih grupiše (`census.model.ts`), jer se
nazivi razlikuju između popisa (npr. „Muslimanska" vjera 2011, „Nije vjernik" 2003,
„Srpsko-Hrvatski" 2023). Za popise 1948–1981 pol i starost su `null` (1991. ih ima, bez prosječne starosti), a liste koje
ne postoje prazne (1948 bez nacionalnosti, vjera samo 1991, jezik nijednom).
Opština tada ima istorijski `naziv` i `danas` (današnji naziv).

## Izvori (`sources/me/`)

- `teritorije.json` – registar opština
- `povrsine.json` – zvanične površine opština (tabela 1-2 iz Statističkog godišnjaka 2025,
  tekst tabele u `monstat-godisnjak-2025-povrsine.txt`)
- `simplemaps-me.json` – granice 24 opštine (simplemaps.com, CC BY 4.0), prije dodavanja Zete
- `osm-zeta-podgorica-tuzi.json` – granice iz OpenStreetMap-a (ODbL)
- `monstat-2003-knjiga9-opstine.txt` – tabela broja stanovnika po opštinama 1948–2003 iz
  MONSTAT, Popis 2003, Knjiga 9 (uporedni pregled)
- `popstat-*.json` – [pop-stat.mashke.org](https://pop-stat.mashke.org) (T. Bespjatov), prema
  publikacijama Saveznog zavoda za statistiku; 1971–1991 se po opštinama poklapa sa Knjigom 9,
  1961. se razlikuje samo Titograd (100 stanovnika)
- `rzs-1953-knjiga-nacionalnost-cg.txt` – Savezni zavod za statistiku, Popis 1953, stanovništvo po narodnosti
  po tadašnjim (oko 85) opštinama ([G19534001.pdf](https://publikacije.stat.gov.rs/G1953/Pdf/G19534001.pdf));
  `opstine-1953.json` ih raspoređuje po opštinama iz 2003. Raspored je približan, pa se udjeli preračunavaju
  na zvanični broj stanovnika iz Knjige 9 (skripta ispisuje opštine gdje je razlika veća od 1%)
- `rzs-1991-knjiga-starost-pol.txt` – Savezni zavod za statistiku, Popis 1991, „Stanovništvo prema
  starosti i polu“ (digitalizovao RZS Srbije: [G19914023.pdf](https://publikacije.stat.gov.rs/G1991/Pdf/G19914023.pdf)),
  `pdftotext -raw`; tekst je u YUSCII kodnoj strani (`[` = Š, `@` = Ž, `Q` = LJ, `W` = NJ …)
- `monstat-2003-knjiga3.pdf` – [MONSTAT, Popis 2003](https://www.monstat.org/cg/page.php?id=222), Knjiga 3
- `monstat-2011.pdf` – [MONSTAT, Popis 2011](https://www.monstat.org/userfiles/file/popis2011/saopstenje/saopstenje(1).pdf)
- `monstat-2023-*.pdf` – [MONSTAT, Popis 2023](https://www.monstat.org/cg/page.php?id=273&pageid=48)
- `*.txt` – tekst izvučen iz PDF-ova: `pdftotext -raw -enc UTF-8 <pdf> <txt>`
  (za 2003. i `-layout`, u `monstat-2003-knjiga3-layout.txt`)

## Provjere i napomene

- Svaka skripta provjerava zbirove (muško + žensko, starosne grupe, sve kategorije
  = ukupno, zbir opština = država) i prekida ako se ne slažu.
- U PDF-ovima iz 2023. razmak je i separator hiljada i separator kolona
  („1 569 855 714“); bira se jedino čitanje u kome se zbirovi slažu.
- 2023: ćelije označene sa „z“ (povjerljivo) se izostavljaju, pa zbir kategorija
  može biti do 3% manji od ukupnog.
- 2003: stranica za cijelu Crnu Goru je u PDF-u ispremiještana, pa se pol i starost
  za državu računaju kao zbir opština; postoji i kategorija „nepoznata starost“.
- Površina i gustina koriste **zvanične površine** iz `sources/me/povrsine.json` (MONSTAT,
  Statistički godišnjak 2025, izvor Uprava za nekretnine). Za ranije popise površina opštine
  je zbir današnjih opština koje su tada bile njen dio. Ukupno za Crnu Goru (13.883 km²)
  uključuje i Skadarsko jezero, koje ne pripada nijednoj opštini. Za Tuzi i Zetu MONSTAT
  daje privremenu površinu.

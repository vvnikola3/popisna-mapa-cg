# Popisna mapa Crne Gore

Interaktivna mapa rezultata popisa stanovništva Crne Gore po opštinama: nacionalna i
vjerska struktura, broj stanovnika i promjena između popisa, sa timeline-om popisa
od 1948. do 2023. (trenutno sa podacima za 2011. i 2023.).

Aplikacija je statična (Angular + Leaflet + d3): podaci se unaprijed pripremaju
skriptama u `scripts/` i servira ih se kao JSON iz `public/data/`.

## Pokretanje

```bash
npm install
npm start
```

Aplikacija je zatim na `http://localhost:4200/`.

```bash
npm run build        # produkcijski build u dist/
npm test             # unit testovi (Karma)
npm run data:build   # ponovo generiše public/data/ iz izvora
```

## Struktura

```
public/data/          geo-<godina>.json (granice), popis-<godina>.json (podaci)
scripts/              priprema podataka iz MONSTAT PDF-ova i OSM-a – vidi scripts/README.md
src/app/census/       model podataka, grupe, skale boja, zajedničko stanje (store)
src/app/map/          mapa, timeline, izbor prikaza i legenda, kartica na hover
src/app/panel/        lijevi panel sa pie chartovima i tabelama
src/app/core/         prevodi (CG / EN)
```

## Izvori podataka i licence

- **Popis stanovništva:** [MONSTAT](https://www.monstat.org) – Popis 2011. i Popis 2023.
- **Granice opština:** [simplemaps](https://simplemaps.com/gis/country/me), licenca
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- **Granica opštine Zeta:** © [OpenStreetMap](https://www.openstreetmap.org/copyright)
  contributors, licenca [ODbL](https://opendatacommons.org/licenses/odbl/)

Oba izvora granica zahtijevaju navođenje – ono je prikazano u uglu mape.
Granice su izmijenjene: Zeta je isječena iz Podgorice, a za 2011. su spojene
opštine koje su kasnije razdvojene (detalji u `scripts/README.md`).

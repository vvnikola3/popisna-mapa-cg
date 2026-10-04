# Popisna mapa Crne Gore

Interaktivna mapa rezultata popisa stanovništva Crne Gore po opštinama: nacionalna,
vjerska i jezička struktura, broj stanovnika i promjena između popisa, sa timeline-om
popisa od 1948. do 2023. (trenutno sa podacima za 2003., 2011. i 2023.).
Ćirilica, latinica i engleski; radi i na telefonu. Planirane su i druge države regiona.

Aplikacija je statična (Angular + Leaflet + d3): podaci se unaprijed pripremaju
skriptama u `scripts/` i servira ih se kao JSON iz `public/data/<država>/`.

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

## Linkovi

Adresa uvijek opisuje ono što je prikazano, pa se svaki prikaz može podijeliti:

```
/<država>/<godina>/<prikaz>[/<opština>][?udio=<grupa>]
/me/2003/jezik/plav?udio=bosnjacki
/me/2023/promjena
```

Prikazi: `nacionalnost`, `vjera`, `jezik`, `stanovnistvo`, `promjena`.
Pošto su to putanje, hosting mora sve nepoznate adrese vraćati na aplikaciju:
na GitHub Pages to radi `404.html` (kopija `index.html`, pravi je workflow),
a za Netlify i Cloudflare Pages `public/_redirects`.

## Objavljivanje (GitHub Pages)

Svaki push na `main` pokreće `.github/workflows/deploy.yml`: build i objava na
**https://popisi.org**.

Podešavanja (jednom):
- **Settings → Pages → Build and deployment → Source: GitHub Actions**
- **Settings → Pages → Custom domain: `popisi.org`**, uz *Enforce HTTPS*
  (sa Actions workflow-om fajl `CNAME` nije potreban)
- DNS kod registra (Porkbun): `A` zapisi na 185.199.108–111.153 i `CNAME` `www` → `vvnikola3.github.io`

Bez sopstvenog domena sajt bi bio na `https://vvnikola3.github.io/popisna-mapa-cg/`,
a `BASE_HREF` u workflow-u bi morao biti `/popisna-mapa-cg/`.

## Pretraživači i statistika

- `scripts/build-pages.js` (poslije `ng build`, i u workflow-u) pravi pravu HTML stranicu za
  svaki link – svaka ima svoj naslov, opis sa podacima popisa i canonical adresu, i vraća HTTP 200
  (inače bi GitHub Pages dubokim linkovima odgovarao sa 404, a takve stranice Google ne indeksira).
  Pravi i `sitemap.xml` i `robots.txt`. Lokalno: `npm run build:site`.
- Slika za pregled linka (Facebook, Viber…): `public/og-image.png`, izvor `scripts/og-image.svg`.
- Posjećenost: [GoatCounter](https://vvnikola3.goatcounter.com), bez kolačića. Prvu stranicu
  broji njihova skripta (`index.html`), a promjene prikaza `UrlState`.

## Struktura

```
public/data/me/       geo-<godina>.json (granice), popis-<godina>.json (podaci), teritorije.json
scripts/              priprema podataka iz MONSTAT PDF-ova i OSM-a – vidi scripts/README.md
src/app/census/       model podataka, grupe, skale boja, države, zajedničko stanje (store)
src/app/map/          mapa, timeline, izbor prikaza i legenda, kartica na hover / traka na dodir
src/app/panel/        lijevi panel sa pie chartovima i tabelama
src/app/core/         prevodi (ćirilica / latinica / EN), transliteracija, zastave
```

## Izvori podataka i licence

- **Popis stanovništva:** [MONSTAT](https://www.monstat.org) – popisi 2003., 2011. i 2023.
- **Granice opština:** [simplemaps](https://simplemaps.com/gis/country/me), licenca
  [CC BY 4.0](https://creativecommons.org/licenses/by/4.0/)
- **Granica opštine Zeta:** © [OpenStreetMap](https://www.openstreetmap.org/copyright)
  contributors, licenca [ODbL](https://opendatacommons.org/licenses/odbl/)

Oba izvora granica zahtijevaju navođenje – ono je prikazano u uglu mape.
Granice su izmijenjene: Zeta je isječena iz Podgorice, a za ranije popise su spojene
opštine koje su kasnije razdvojene (detalji u `scripts/README.md`).

# Priprema podataka

Skripte generišu sve fajlove u `public/data/` iz izvora u `sources/`:

```
npm run data:build
```

| Skripta | Izlaz | Opis |
|---|---|---|
| `build-geo.js` | `geo-2023.json`, `geo-2011.json` | Granice opština. Zeta (OSM relacija 10147976) se isijeca iz stare Podgorice; za 2011. se Gusinje, Petnjica, Tuzi i Zeta vraćaju u matične opštine. Svakoj opštini se računa tačka za naziv. |
| `build-census-2023.js` | `popis-2023.json` | MONSTAT, Popis 2023 – saopštenja I i II. |
| `build-census-2011.js` | `popis-2011.json` | MONSTAT, Popis 2011 – stanovništvo po opštinama. |

Skripte za popis zahtijevaju da `geo-*.json` već postoji (zbog površine).

## Izvori (`sources/`)

- `simplemaps-me.json` – originalne granice 24 opštine (simplemaps.com), prije dodavanja Zete
- `osm-zeta-podgorica-tuzi.json` – granice iz OpenStreetMap-a (Nominatim)
- `monstat-2023-*.pdf` – [MONSTAT, Popis 2023](https://www.monstat.org/cg/page.php?id=273&pageid=48)
- `monstat-2011.pdf` – [MONSTAT, Popis 2011](https://www.monstat.org/userfiles/file/popis2011/saopstenje/saopstenje(1).pdf)
- `*.txt` – tekst izvučen iz PDF-ova: `pdftotext -raw -enc UTF-8 <pdf> <txt>`

## Napomene

- U PDF-ovima iz 2023. razmak služi i kao separator hiljada i kao separator kolona
  („1 569 855 714“). Skripta bira jedino čitanje u kome se zbirovi slažu
  (muško + žensko = ukupno, zbir starosnih grupa = ukupno) i prekida ako ih ima više.
- Površina je izračunata iz granica i približna je (ukupno ≈ 13.856 km², zvanično 13.812 km²).
- Ćelije označene sa „z“ (povjerljivo) u 2023. se izostavljaju.

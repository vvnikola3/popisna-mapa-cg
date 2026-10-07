# TODO

## Sljedeće

- [ ] **Sjeverna Makedonija – vjera i maternji jezik 2002 po opštinama** (nisu u MakStat API-ju). Knjiga X popisa 2002
  ([knigaX.pdf](https://www.stat.gov.mk/publikacii/knigaX.pdf)) ima nacionalnost, jezik i vjeru, ali **po naseljima i po
  organizaciji iz 1996.** (ne po 84 opštine), a Knjiga XIII (po organizaciji iz 2004.) ima samo osam opštih tabela bez
  vjere i jezika – treba spojiti naselja u današnje opštine (spisak naselja po opštinama) ili pitati Državni zavod za statistiku
- [ ] Sjeverna Makedonija – nacionalnost po naseljima 1948–2002 (`Popisi/PopisNaNaselenie/PopisiNaseleniMesta/
  Popis_nm_1948_2002_NasPoEtnPrip_ang.px`; popisi 1948, 1953, 1961, 1971, 1981, 1991, 1994, 2002) → stari popisi tačno
  sabrani po opštinama iz 2002. Treba spisak naselja po opštinama
- [ ] Sjeverna Makedonija – prosječna starost i zvanične površine opština (u MakStat-u nisu nađene; sada su površine
  izračunate iz granica)
- [ ] Maternji jezik 1953–1991 i vjera 1953 – postoje samo u štampanim knjigama; pitati MONSTAT /
  Nacionalnu biblioteku „Đurđe Crnojević“ za skenove (vjera 1961–1981 nije bila pitanje u popisu)

## Kasnije (sa liste unapređenja)

- [ ] Još informacija pored vjere, jezika i nacionalnosti
- [ ] Stranica „O projektu“ (čeka tekst)
- [ ] Mjesne zajednice / naselja unutar opštine – kad se nađu granice

## Nova faza – region

- [ ] **Srbija** (podaci, granice, sopstvene grupe; boje po zastavi). Zbog velikog broja opština:
  - tab „Opštine“: sve opštine na mapi, naziv i podaci tek na hover
  - tab „Okruzi“: mapa okruga, klik na okrug otvara mapu okruga sa njegovim opštinama
- [ ] **Kombinovanje opština / regija**: izbor više opština, i iz različitih država (npr. Rudo + Priboj),
  i zbir njihovih podataka – broj stanovnika, nacionalna, vjerska i jezička struktura

## Odustali smo

- Kombinacije kategorija (npr. Crnogorci po vjeri)

## Urađeno

- [x] **Sjeverna Makedonija – popisi 2002 i 2021** (MakStat API + geoBoundaries): 84 opštine 2002, 80 opština 2021
  (Drugovo, Oslomej, Vraneštica i Zajas pripojene Kičevu 2013 – registar podržava `ukinuta` / `pripojenaU`), grupe i
  boje, nazivi ćirilica/latinica/engleski, Grad Skoplje (10 opština), klikabilna na početnoj mapi, stranice `/mk/...`
  za pretraživače. 2021: nacionalnost, vjera, jezik, starost i pol; 2002: nacionalnost (8 grupa), starost i pol

- [x] Početna mapa regiona (Crna Gora, Srbija sa Kosovom, BiH, Hrvatska, Sj. Makedonija); klikabilna samo Crna Gora

- [x] Poređenje opština (do 4, jedna pored druge; link ?poredi=…)
- [x] Google Search Console – domen verifikovan (TXT na Porkbunu), sitemap poslat

- [x] Svi popisi 1948–1991 (1948 samo broj stanovnika; vjera 1991)
- [x] Nacionalnost 1953 (procjena iz tadašnjih opština), pol i starost 1991

- [x] Telefon: broj ljudi se prikazuje sitno ispod procenta u uskim tabelama
- [x] Zvanične površine opština (MONSTAT, Statistički godišnjak 2025) umjesto računatih iz granica

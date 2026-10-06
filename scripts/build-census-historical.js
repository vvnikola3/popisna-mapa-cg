// Builds public/data/me/popis-<year>.json for the censuses 1948–1991.
//
//   Population per municipality:
//     1948, 1953  MONSTAT, Popis 2003, Knjiga 9 (recalculated to the 2003 municipalities)
//     1961–1991   pop-stat.mashke.org tables (census-day municipalities), checked against Knjiga 9
//   Ethnicity:    1961, 1971, 1981, 1991 – pop-stat.mashke.org (from Federal Statistical Office publications)
//   Religion:     1991 – pop-stat.mashke.org
//   Sex and age:  1991 – Federal Statistical Office book, digitised by the Statistical Office of Serbia
//                 1953 – Federal Statistical Office book by the small municipalities of the time,
//                 summed onto the 2003 municipalities (estimate, see ethnicity1953)
//   For 1948 ethnicity exists only per district (srez), so that year carries population figures only.

const fs = require('fs');
const path = require('path');
const { officialAreas, withPercent } = require('./parse-helpers');
const { loadRegistry, holderIn, nameIn, territoryYear } = require('./registry');
const { toLatin } = require('./translit');

const SRC = path.join(__dirname, 'sources', 'me');
const OUT = path.join(__dirname, '..', 'public', 'data', 'me');
const COUNTRY = 'Crna Gora';
const registry = loadRegistry('me');
const readJson = file => JSON.parse(fs.readFileSync(path.join(SRC, file), 'utf8'));

// ---------------------------------------------------------------- MONSTAT Knjiga 9 (totals)
// Lines "<name> 1953 1961 1971 1981 1991 2003 1991* 2003*" followed by a line with the 1948 value
// (* = 2003 methodology). Columns used here: 1948 … 1991 by the methodology of their time.
const BOOK9_YEARS = [1948, 1953, 1961, 1971, 1981, 1991];
const book9 = {};
{
  const lines = fs.readFileSync(path.join(SRC, 'monstat-2003-knjiga9-opstine.txt'), 'utf8').split(/\r?\n/);
  let pending = null;
  for (const line of lines) {
    const m = line.match(/^(\D+?) ((?:\d+ ){7}\d+)$/);
    if (m) {
      pending = { name: toLatin(m[1]).trim(), values: m[2].split(' ').map(Number) };
    } else if (pending && /^\d+$/.test(line)) {
      const v = [Number(line), ...pending.values];
      const name = pending.name === 'Republika Crna Gora' ? COUNTRY : pending.name;
      book9[name] = Object.fromEntries(BOOK9_YEARS.map((y, i) => [y, v[i]]));
      pending = null;
    }
  }
  if (Object.keys(book9).length !== 22) throw new Error(`Knjiga 9: ${Object.keys(book9).length} rows`);
}
const idByName = Object.fromEntries(registry.opstine.map(u => [u.naziv, u.id]));

// ---------------------------------------------------------------- pop-stat (categories)
/** pop-stat municipality label -> registry id */
function popstatId(label) {
  const aliases = { TITOGRAD: 'ME16', PODGORICA: 'ME16', IVANGRAD: 'ME03', BERANE: 'ME03', 'ROŽAJ': 'ME17' };
  if (aliases[label]) return aliases[label];
  const unit = registry.opstine.find(u => u.naziv.toUpperCase() === label);
  if (!unit) throw new Error(`Unknown pop-stat municipality ${label}`);
  return unit.id;
}

const ETHNICITY_NAMES = {
  NEMCI: 'Njemci',
  'NEIZJAŠNJENI I NEOPREDELJENI': 'Neizjašnjeni i neopredijeljeni',
};
const RELIGION_NAMES = {
  PRAVOSLAVCI: 'Pravoslavna',
  KATOLICI: 'Katolička',
  PROTESTANTI: 'Protestantska',
  MUSLIMANI: 'Islamska',
  JEVREJI: 'Judaistička',
  'PROORIJENTALNI KULTOVI': 'Orijentalni kultovi',
  DRUGI: 'Ostale vjere',
  'VERNICI BEZ VEROISPOVESTI': 'Vjernici bez vjeroispovijesti',
  'NISU VERNICI': 'Nije vjernik',
  NEPOZNATO: 'Nepoznato',
};
const titleCase = s => s.charAt(0) + s.slice(1).toLowerCase();

function popstat(year, topic, names) {
  const file = `popstat-${year}-${topic}.json`;
  if (!fs.existsSync(path.join(SRC, file))) return null;
  const data = readJson(file);
  const byId = {};
  for (const unit of data.jedinice) {
    const id = /CRNA GORA/.test(unit.naziv) ? COUNTRY : popstatId(unit.naziv);
    byId[id] = {
      ukupno: unit.ukupno,
      lista: Object.entries(unit.kategorije).map(([k, broj]) => ({ naziv: names[k] ?? titleCase(k), broj })),
    };
  }
  return { izvor: data.izvor, byId };
}

// ---------------------------------------------------------------- YUSCII
// Text from the digitised federal books uses the YUSCII code page: [ = Š, @ = Ž, Q = LJ, W = NJ …
const YUSCII = { '[': 'Š', '{': 'š', ']': 'Ć', '}': 'ć', '^': 'Č', '~': 'č', '\\': 'Đ', '|': 'đ', '@': 'Ž', '`': 'ž', Q: 'LJ', q: 'lj', W: 'NJ', w: 'nj', X: 'DŽ', x: 'dž' };
/** "Wegu{ko" -> "Njeguško", "PQEVQA" -> "PLJEVLJA" */
const yuscii = s => [...s].map((c, i) => {
  const out = YUSCII[c] ?? c;
  return out.length === 2 && /[a-z~{}`|]/.test(s[i + 1] ?? '') ? out[0] + out[1].toLowerCase() : out;
}).join('');

// ---------------------------------------------------------------- ethnicity 1953
// Savezni zavod za statistiku, Popis 1953 – Ukupno stanovništvo po narodnosti (publikacije.stat.gov.rs/G1953/Pdf/G19534001.pdf).
// It lists the ~85 small municipalities of the time; sources/me/opstine-1953.json assigns them to the
// 2003 municipalities. Some were later split between settlements, so the shares are an estimate:
// they are scaled to the official totals of Knjiga 9.
const COLUMNS_1953 = ['Srbi', 'Hrvati', 'Slovenci', 'Makedonci', 'Crnogorci', 'Jugosloveni – neopredijeljeni',
  'Albanci', 'Česi', 'Italijani', 'Rusi', 'Ostali slovenski', 'Ostali neslovenski'];

/** Rounds `values` scaled to `total` so that they still add up exactly (largest remainder). */
function scaleTo(values, total) {
  const sum = values.reduce((a, b) => a + b, 0);
  const exact = values.map(v => (v * total) / sum);
  const out = exact.map(Math.floor);
  const order = exact.map((v, i) => [v - out[i], i]).sort((a, b) => b[0] - a[0]);
  for (let k = 0; k < total - out.reduce((a, b) => a + b, 0); k++) out[order[k][1]]++;
  return out;
}

function ethnicity1953(official) {
  const rows = {};
  for (const line of fs.readFileSync(path.join(SRC, 'rzs-1953-knjiga-nacionalnost-cg.txt'), 'utf8').split(/\r?\n/)) {
    const m = line.match(/^(.+?) ((?:\d+|-)(?: (?:\d+|-)){12})$/);
    if (!m || line.startsWith('#')) continue;
    const v = m[2].split(' ').map(x => (x === '-' ? 0 : Number(x)));
    if (v[0] !== v.slice(1).reduce((a, b) => a + b, 0)) throw new Error(`1953: categories of ${m[1]} ≠ total`);
    rows[yuscii(m[1])] = v;
  }
  const { opstine } = readJson('opstine-1953.json');
  const assigned = Object.values(opstine).flat();
  const unknown = assigned.filter(n => !rows[n]);
  const left = Object.keys(rows).filter(n => !/^(NR|SREZ) /.test(n) && !assigned.includes(n));
  if (unknown.length || left.length) throw new Error(`1953 municipalities – unknown: ${unknown}, unassigned: ${left}`);

  const byId = {};
  const warnings = [];
  const add = (id, parts) => {
    const counts = COLUMNS_1953.map((_, k) => parts.reduce((a, p) => a + rows[p][k + 1], 0));
    const raw = counts.reduce((a, b) => a + b, 0);
    if (Math.abs(raw - official[id]) / official[id] > 0.01) warnings.push(`${id} ${raw} → ${official[id]}`);
    const scaled = scaleTo(counts, official[id]);
    byId[id] = { ukupno: official[id], lista: COLUMNS_1953.map((naziv, k) => ({ naziv, broj: scaled[k] })).filter(s => s.broj > 0) };
  };
  for (const [id, parts] of Object.entries(opstine)) add(id, parts);
  add(COUNTRY, ['NR Crna Gora']);
  console.log(`  1953 ethnicity: estimated (> 1% off Knjiga 9) for ${warnings.join(', ')}`);
  return { byId };
}

// ---------------------------------------------------------------- sex and age (1991)
// RZS Srbije, Popis 1991 – Stanovništvo prema starosti i polu (publikacije.stat.gov.rs/G1991/Pdf/G19914023.pdf),
// text from `pdftotext -raw`. Table 2-1 lists every municipality ("NAME", rows S/M/Ž, then GRADSKA and
// OSTALA) followed by its settlements; part 1 holds total + 0-4 … 45-49, part 2 50-54 … 95+ and unknown.
function sexAndAge(file, names) {
  const lines = fs.readFileSync(path.join(SRC, file), 'utf8').split(/\r?\n/);
  const values = row => row.split(' ').slice(1).map(v => (v === '-' ? 0 : Number(v)));
  const found = {}; // id -> { 1: {s, m, z}, 2: {s, m, z} }
  let table = null;
  let part = null;
  for (let i = 0; i < lines.length; i++) {
    const heading = lines[i].match(/^(\d-\d)\. /);
    if (heading) table = heading[1];
    const deo = lines[i].match(/^DEO ([12]) CRNA GORA/);
    if (deo) part = deo[1];
    if (table !== '2-1' || !part) continue; // 2-2 repeats the municipalities for ages under 30
    const id = names[yuscii(lines[i]).trim()];
    // a municipality (not a settlement of the same name) is followed by its urban / other split
    if (!id || lines[i + 4] !== 'GRADSKA') continue;
    const [s, m, z] = [1, 2, 3].map(k => values(lines[i + k]));
    if (!/^S /.test(lines[i + 1]) || s.length !== 11 || s.some((v, k) => v !== m[k] + z[k])) {
      throw new Error(`1991 sex/age: bad block for ${lines[i]} (part ${part})`);
    }
    (found[id] ??= {})[part] = { s, m, z };
  }
  const result = {};
  for (const [id, { 1: a, 2: b }] of Object.entries(found)) {
    if (!a || !b) throw new Error(`1991 sex/age: ${id} is missing a part`);
    const ages = [...a.s.slice(1), ...b.s.slice(0, 10)]; // 0-4 … 95+
    const unknown = b.s[10];
    const sum = (from, to) => ages.slice(from, to).reduce((x, y) => x + y, 0);
    const starost = { '0-14': sum(0, 3), '15-64': sum(3, 13), '65+': sum(13) };
    if (starost['0-14'] + starost['15-64'] + starost['65+'] + unknown !== a.s[0]) throw new Error(`1991 age sum for ${id}`);
    result[id] = { ukupno: a.s[0], muskarci: a.m[0], zene: a.z[0], starost };
  }
  return result;
}

/** Sex and age by municipality, where a source exists. */
const SEX_AGE = {
  // published in 1993+, so under the new names (Podgorica, Berane); Rožaje as "Rožaj"
  1991: () => sexAndAge('rzs-1991-knjiga-starost-pol.txt', Object.fromEntries(
    registry.opstine.filter(u => holderIn(registry, u.id, 1991) === u.id)
      .flatMap(u => [[u.naziv.toUpperCase(), u.id], [nameIn(registry, u.id, 1991).toUpperCase(), u.id]])
      .concat([['ROŽAJ', 'ME17']])
  )),
};

// ---------------------------------------------------------------- per census
const NOTES = {
  1948: 'Broj stanovnika je preračunat na granice opština iz 2003. (MONSTAT, Popis 2003, Knjiga 9). Nacionalni sastav za ovaj popis postoji samo po tadašnjim srezovima, pa nije prikazan.',
  1953: 'Broj stanovnika je preračunat na granice opština iz 2003. (MONSTAT, Popis 2003, Knjiga 9). Nacionalni sastav je procjena: objavljen je po tadašnjim, manjim opštinama, koje su ovdje sabrane po opštinama iz 2003. i preračunate na zvanični broj stanovnika (za Bar, Bijelo Polje, Budvu, Kolašin, Mojkovac, Pljevlja, Plužine, Rožaje i Ulcinj zbir je tačan). Muslimani se 1953. nisu mogli izjasniti kao posebna nacija – upisivani su kao Crnogorci, Srbi ili „Jugosloveni – neopredijeljeni“.',
  1961: 'Andrijevica je bila u sastavu opštine Ivangrad (danas Berane). „Muslimani“ su 1961. popisivani kao „Muslimani u etničkom smislu“. Za Titograd MONSTAT-ova Knjiga 9 navodi 100 stanovnika više (72.319, ukupno 471.994) nego publikacija Saveznog zavoda koja se ovdje koristi.',
  1971: 'Andrijevica je bila u sastavu opštine Ivangrad (danas Berane).',
  1981: 'Andrijevica je bila u sastavu opštine Ivangrad (danas Berane).',
  1991: 'Popis 1991. (tadašnja metodologija) u stalno stanovništvo ubraja i građane na privremenom radu u inostranstvu, pa poređenje sa 2003. treba uzimati s rezervom.',
};

for (const year of BOOK9_YEARS) {
  const geo = JSON.parse(fs.readFileSync(path.join(OUT, `geo-${year}.json`), 'utf8'));
  const ids = geo.features.map(f => f.properties.id);
  const { byId: areas, total: countryArea } = officialAreas('me', year);
  const territory = territoryYear(registry, year);

  const religion = popstat(year, 'vjera', RELIGION_NAMES);
  const sexAge = SEX_AGE[year]?.() ?? null;
  if (sexAge) {
    const ids = Object.keys(sexAge);
    if (ids.length !== geo.features.length) throw new Error(`${year} sex/age: ${ids.length} municipalities`);
    const add = key => ids.reduce((a, id) => a + sexAge[id][key], 0);
    const age = key => ids.reduce((a, id) => a + sexAge[id].starost[key], 0);
    sexAge[COUNTRY] = {
      ukupno: add('ukupno'), muskarci: add('muskarci'), zene: add('zene'),
      starost: { '0-14': age('0-14'), '15-64': age('15-64'), '65+': age('65+') },
    };
  }

  // Knjiga 9 totals summed onto the census-day municipalities (e.g. Ivangrad = Berane + Andrijevica)
  const official = { [COUNTRY]: book9[COUNTRY][year] };
  for (const unit of registry.opstine) {
    const row = book9[unit.naziv];
    if (!row) continue; // municipalities founded after 2003
    const holder = holderIn(registry, unit.id, territory);
    official[holder] = (official[holder] ?? 0) + row[year];
  }
  const ethnicity = popstat(year, 'nacionalnost', ETHNICITY_NAMES) ?? (year === 1953 ? ethnicity1953(official) : null);

  const warnings = [];
  const entity = (id, name, area) => {
    const total = ethnicity ? ethnicity.byId[id].ukupno : official[id];
    if (official[id] !== total) warnings.push(`${name}: pop-stat ${total}, MONSTAT ${official[id]}`);
    if (religion && religion.byId[id].ukupno !== total) throw new Error(`${year} religion total for ${name}`);
    const sa = sexAge?.[id] ?? null;
    if (sa && sa.ukupno !== total) throw new Error(`${year} sex/age total for ${name}: ${sa.ukupno} ≠ ${total}`);
    const today = id === COUNTRY ? COUNTRY : registry.opstine.find(u => u.id === id).naziv;
    return {
      naziv: name,
      ...(today !== name ? { danas: today } : {}),
      stanovnika: total,
      muskarci: sa?.muskarci ?? null,
      zene: sa?.zene ?? null,
      prosjecnaStarost: null,
      starost: sa?.starost ?? null,
      povrsinaKm2: area,
      gustina: Math.round((total / area) * 10) / 10,
      nacionalnost: ethnicity ? withPercent(ethnicity.byId[id].lista, total) : [],
      vjera: religion ? withPercent(religion.byId[id].lista, total) : [],
      jezik: [],
    };
  };

  const opstine = Object.fromEntries(ids.map(id => [id, entity(id, nameIn(registry, id, year), areas[id])]));
  const drzava = entity(COUNTRY, COUNTRY, countryArea);
  const sum = Object.values(opstine).reduce((a, b) => a + b.stanovnika, 0);
  if (sum !== drzava.stanovnika) throw new Error(`${year}: municipalities ${sum} ≠ country ${drzava.stanovnika}`);

  const sources = ['MONSTAT – Popis 2003, Knjiga 9: Uporedni pregled broja stanovnika 1948–2003'];
  if (sexAge) sources.push('pol i starost: Savezni zavod za statistiku, Popis 1991 – Stanovništvo prema starosti i polu');
  if (year === 1953) sources.push('nacionalnost: Savezni zavod za statistiku, Popis 1953 – Stanovništvo po narodnosti (procjena po današnjim opštinama)');
  else if (ethnicity) sources.push(`nacionalnost${religion ? ' i vjera' : ''}: pop-stat (T. Bespjatov), prema publikacijama Saveznog zavoda za statistiku`);

  fs.writeFileSync(path.join(OUT, `popis-${year}.json`), JSON.stringify({
    godina: year,
    izvor: sources.join('; '),
    napomena: NOTES[year],
    drzava,
    opstine,
  }));
  console.log(`popis-${year}.json: ${ids.length} municipalities, ${drzava.stanovnika} inhabitants` +
    (warnings.length ? ` – differs from MONSTAT: ${warnings.join('; ')}` : ''));
}

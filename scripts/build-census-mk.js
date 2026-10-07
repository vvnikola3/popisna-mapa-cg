// Builds public/data/mk/popis-2002.json and popis-2021.json (North Macedonia) from the
// MakStat tables downloaded by fetch-makstat.js (sources/mk/makstat-*.json).
//
// 2021: nationality, religion, mother tongue and age, each by sex, for 80 municipalities.
// 2002: municipalities (84) have only the population, 8 nationality groups and age by sex –
//       religion and mother tongue by municipality are not in the database.

const fs = require('fs');
const path = require('path');
const { loadRegistry } = require('./registry');
const { officialAreas, withPercent } = require('./parse-helpers');

const SRC = path.join(__dirname, 'sources', 'mk');
const OUT = path.join(__dirname, '..', 'public', 'data', 'mk');
const COUNTRY = 'Sjeverna Makedonija';

const registry = loadRegistry('mk');
const read = name => JSON.parse(fs.readFileSync(path.join(SRC, name), 'utf8'));

/** A MakStat table as a lookup: (municipality, …dimensions) -> number ("-" in the source is zero). */
function table(name) {
  const t = read(`makstat-${name}.json`);
  const cells = new Map();
  for (const row of t.podaci) {
    const raw = row[row.length - 1];
    if (raw !== '-' && !/^\d+$/.test(raw)) throw new Error(`${name}: unexpected value "${raw}"`);
    cells.set(row.slice(0, -1).join('|'), raw === '-' ? 0 : Number(raw));
  }
  return {
    get: (...key) => {
      const v = cells.get(key.join('|'));
      if (v === undefined) throw new Error(`${name}: no cell ${key.join('|')}`);
      return v;
    },
  };
}

// ---------------------------------------------------------------- places
// 2021: MakStat code -> registry id, through the Macedonian names
const names21 = read('makstat-2021-nazivi-mk.json');
const code21 = {};
for (const [code, cir] of Object.entries(names21)) {
  const unit = registry.opstine.find(u => u.cirilica === cir.replace(/ - /g, '-'));
  if (unit) code21[unit.id] = code;
}
// 2002: the table's index is the number in the id (MK45 -> 45)
const code02 = id => String(Number(id.slice(2)));

const ids21 = registry.opstine.filter(u => u.ukinuta == null).map(u => u.id);
const ids02 = registry.opstine.map(u => u.id);
if (Object.keys(code21).length !== 80 || ids21.length !== 80) throw new Error('2021: expected 80 municipalities');

// ---------------------------------------------------------------- categories ([code in the table, name])
const NATIONALITY_21 = [
  ['1', 'Makedonci'], ['2', 'Albanci'], ['3', 'Turci'], ['4', 'Romi'], ['5', 'Vlasi'], ['6', 'Srbi'], ['7', 'Bošnjaci'],
  ['8', 'Ostali'], ['9', 'Neizjašnjeni'], ['10', 'Nepoznato'], ['11', 'Podaci iz administrativnih izvora'],
];
const RELIGION_21 = [
  ['01', 'Pravoslavna'], ['02', 'Islamska'], ['03', 'Katolička'], ['04', 'Hrišćani'], ['05', 'Protestantska'],
  ['08', 'Evangelistička'], ['09', 'Evangelističko-metodistička'], ['11', 'Jehovini svjedoci'], ['90', 'Ostale vjere'],
  ['15', 'Ateisti'], ['16', 'Neizjašnjeni'], ['99', 'Nepoznato'], ['88', 'Podaci iz administrativnih izvora'],
];
const LANGUAGE_21 = [
  ['01', 'Makedonski'], ['03', 'Albanski'], ['06', 'Turski'], ['05', 'Romski'], ['04', 'Vlaški'], ['27', 'Srpski'],
  ['10', 'Bošnjački'], ['37', 'Ostali jezici'], ['39', 'Znakovni jezik'], ['99', 'Nepoznato'], ['88', 'Podaci iz administrativnih izvora'],
];
const NATIONALITY_02 = [
  ['1', 'Makedonci'], ['2', 'Albanci'], ['3', 'Turci'], ['4', 'Romi'], ['5', 'Vlasi'], ['6', 'Srbi'], ['7', 'Bošnjaci'], ['8', 'Ostali'],
];
const AGE_CODES_21 = ['0_4', '5_9', '10_14', '15_19', '20_24', '25_29', '30_34', '35_39', '40_44', '45_49', '50_54', '55_59',
  '60_64', '65_69', '70_74', '75_79', '80_84', '85_'];
const AGE_CODES_02 = Array.from({ length: 18 }, (_, i) => String(i + 1)); // 0-4 … 85+; 19 = unknown age

const sum = list => list.reduce((a, b) => a + b, 0);

// the three broad groups: 0-14 = first 3 five-year groups, 15-64 = next 10, 65+ = the rest
const broad = values => ({
  '0-14': sum(values.slice(0, 3)),
  '15-64': sum(values.slice(3, 13)),
  '65+': sum(values.slice(13)),
});

function check(label, list, total) {
  const s = sum(list.map(x => x.broj));
  if (s !== total) throw new Error(`${label}: categories sum ${s} ≠ ${total}`);
}

// ---------------------------------------------------------------- 2021
function build2021() {
  const nat = table('2021-nacionalnost'), rel = table('2021-vjera'), lang = table('2021-jezik');
  const age = table('2021-starost'), pop = table('2021-ukupno');
  const { byId: areas, total: countryArea } = officialAreas('mk', 2021);

  const list = (t, cats, code) => cats.map(([c, naziv]) => ({ naziv, broj: t.get(code, '0', c) }));

  function entity(naziv, code, area) {
    const total = pop.get(code, '0');
    const men = nat.get(code, '1', '0'), women = nat.get(code, '2', '0');
    if (men + women !== total || nat.get(code, '0', '0') !== total) throw new Error(`${naziv}: sex totals`);
    const nationality = list(nat, NATIONALITY_21, code), religion = list(rel, RELIGION_21, code), language = list(lang, LANGUAGE_21, code);
    check(`${naziv} nationality`, nationality, total);
    check(`${naziv} religion`, religion, total);
    check(`${naziv} language`, language, total);
    const ages = AGE_CODES_21.map(c => age.get(code, '0', c));
    if (sum(ages) !== total) throw new Error(`${naziv}: age sum ${sum(ages)} ≠ ${total}`);
    if (sum(AGE_CODES_21.map(c => age.get(code, '1', c))) !== men) throw new Error(`${naziv}: male age sum`);
    return {
      naziv,
      stanovnika: total,
      muskarci: men,
      zene: women,
      prosjecnaStarost: null,
      starost: broad(ages),
      povrsinaKm2: area,
      gustina: Math.round((total / area) * 10) / 10,
      nacionalnost: withPercent(nationality, total),
      vjera: withPercent(religion, total),
      jezik: withPercent(language, total),
    };
  }

  const opstine = {};
  for (const id of ids21) opstine[id] = entity(registry.opstine.find(u => u.id === id).naziv, code21[id], areas[id]);
  const drzava = entity(COUNTRY, '0000', countryArea);
  if (sum(Object.values(opstine).map(e => e.stanovnika)) !== drzava.stanovnika) throw new Error('2021: municipalities ≠ country');
  // City of Skopje (0019) = its ten municipalities
  const skopje = sum(registry.opstine.filter(u => u.grad).map(u => opstine[u.id].stanovnika));
  if (skopje !== pop.get('0019', '0')) throw new Error(`2021: Skopje ${skopje} ≠ ${pop.get('0019', '0')}`);

  const admin = drzava.nacionalnost.find(x => x.naziv === 'Podaci iz administrativnih izvora');
  return {
    godina: 2021,
    izvor: 'Državni zavod za statistiku Sjeverne Makedonije (MakStat) – Popis stanovništva, domaćinstava i stanova 2021',
    napomena: `Za ${admin.procenat.toFixed(1).replace('.', ',')}% stanovnika podaci su preuzeti iz administrativnih izvora, pa za njih nacionalnost, vjera i maternji jezik nisu poznati. ` +
      'Opštine Drugovo, Oslomej, Vraneštica i Zajas pripojene su 2013. Kičevu, zato 2021. ima 80 opština (2002: 84).',
    drzava,
    opstine,
  };
}

// ---------------------------------------------------------------- 2002
function build2002() {
  const nat = table('2002-nacionalnost'), age = table('2002-starost'), pop = table('2002-ukupno');
  const { byId: areas, total: countryArea } = officialAreas('mk', 2002);

  function entity(naziv, code, area) {
    const total = pop.get(code, '0');
    const men = age.get(code, '0', '1'), women = age.get(code, '0', '2');
    if (men + women !== total || nat.get(code, '0') !== total || age.get(code, '0', '0') !== total) throw new Error(`${naziv}: totals`);
    const nationality = NATIONALITY_02.map(([c, n]) => ({ naziv: n, broj: nat.get(code, c) }));
    check(`${naziv} nationality`, nationality, total);
    const ages = AGE_CODES_02.map(c => age.get(code, c, '0'));
    if (sum(ages) + age.get(code, '19', '0') !== total) throw new Error(`${naziv}: age sum`);
    return {
      naziv,
      stanovnika: total,
      muskarci: men,
      zene: women,
      prosjecnaStarost: null,
      starost: broad(ages),
      povrsinaKm2: area,
      gustina: Math.round((total / area) * 10) / 10,
      nacionalnost: withPercent(nationality, total),
      vjera: [],
      jezik: [],
    };
  }

  const opstine = {};
  for (const id of ids02) opstine[id] = entity(registry.opstine.find(u => u.id === id).naziv, code02(id), areas[id]);
  const drzava = entity(COUNTRY, '0', countryArea);
  if (sum(Object.values(opstine).map(e => e.stanovnika)) !== drzava.stanovnika) throw new Error('2002: municipalities ≠ country');
  const skopje = sum(registry.opstine.filter(u => u.grad).map(u => opstine[u.id].stanovnika));
  if (skopje !== pop.get('1', '0')) throw new Error(`2002: Skopje ${skopje} ≠ ${pop.get('1', '0')}`);

  return {
    godina: 2002,
    izvor: 'Državni zavod za statistiku Sjeverne Makedonije (MakStat) – Popis stanovništva, domaćinstava i stanova 2002',
    napomena: 'Po opštinama je objavljeno samo osam nacionalnih grupa (ostali su zbirno), a vjera i maternji jezik po opštinama nisu u bazi podataka.',
    drzava,
    opstine,
  };
}

fs.mkdirSync(OUT, { recursive: true });
for (const census of [build2002(), build2021()]) {
  fs.writeFileSync(path.join(OUT, `popis-${census.godina}.json`), JSON.stringify(census));
  console.log(`popis-${census.godina}.json: ${Object.keys(census.opstine).length} municipalities, ${census.drzava.stanovnika} inhabitants`);
}

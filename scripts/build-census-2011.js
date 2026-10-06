// Parses MONSTAT "Stanovništvo Crne Gore prema polu, tipu naselja, nacionalnoj odnosno
// etničkoj pripadnosti, vjeroispovijesti i maternjem jeziku po opštinama" (Popis 2011)
// into public/data/me/popis-2011.json. Numbers in this release have no thousands separator.

const fs = require('fs');
const path = require('path');
const { officialAreas, withPercent } = require('./parse-helpers');

const SRC = path.join(__dirname, 'sources', 'me');
const OUT = path.join(__dirname, '..', 'public', 'data', 'me');
const COUNTRY = 'Crna Gora';

const lines = fs.readFileSync(path.join(SRC, 'monstat-2011.txt'), 'utf8').split(/\r?\n/);
const geo = JSON.parse(fs.readFileSync(path.join(OUT, 'geo-2011.json'), 'utf8'));
const municipalities = geo.features.map(f => f.properties.name);

const ETHNICITY_1 = ['Ukupno', 'Crnogorci', 'Srbi', 'Bošnjaci', 'Albanci', 'Muslimani', 'Hrvati', 'Bosanci',
  'Bošnjaci-Muslimani', 'Crnogorci-Muslimani', 'Crnogorci-Srbi', 'Egipćani', 'Goranci'];
const ETHNICITY_2 = ['Italijani', 'Jugosloveni', 'Mađari', 'Makedonci', 'Muslimani-Bošnjaci', 'Muslimani-Crnogorci',
  'Njemci', 'Romi', 'Rusi', 'Slovenci', 'Srbi-Crnogorci', 'Turci', 'Ostalo', 'Regionalna pripadnost',
  'Ne želi da se izjasni'];
// 2011 labels normalised to the names used in 2023 where they mean the same thing
const RELIGION = ['Ukupno', 'Pravoslavna', 'Katolička', 'Islamska', 'Muslimanska', 'Adventistička', 'Agnostici',
  'Ateisti', 'Budistička', 'Hrišćani', 'Jehovini svjedoci', 'Protestantska', 'Ostale vjere', 'Ne želi da se izjasni'];
// "Maternji" is a category of its own in the source (answer without a language name)
const LANGUAGE_1 = ['Ukupno', 'Crnogorski', 'Srpski', 'Bosanski', 'Albanski', 'Hrvatski', 'Crnogorsko-srpski', 'Engleski',
  'Hrvatsko-srpski', 'Bošnjački', 'Mađarski', 'Makedonski'];
const LANGUAGE_2 = ['Maternji', 'Njemački', 'Romski', 'Rumunski', 'Ruski', 'Slovenački', 'Srpskohrvatski',
  'Srpsko-crnogorski', 'Ostali jezici', 'Regionalni jezici', 'Ne želi da se izjasni'];

/** Reads the 22 data rows (country + 21 municipalities) that follow `titleLine`. */
function readRows(titleIndex, columns) {
  const rows = {};
  for (let i = titleIndex; i < lines.length && Object.keys(rows).length < municipalities.length + 1; i++) {
    const l = lines[i];
    if (l.startsWith('MONTENEGRO ')) {
      rows[COUNTRY] = l.slice('MONTENEGRO '.length).split(' ').map(Number);
      continue;
    }
    const n = municipalities.find(m => l.startsWith(m + ' ') && /^\d/.test(l.slice(m.length + 1)));
    if (n && !rows[n]) rows[n] = l.slice(n.length + 1).split(' ').map(Number);
  }
  for (const [n, values] of Object.entries(rows)) {
    if (values.length !== columns.length || values.some(isNaN)) throw new Error(`${n}: ${values.length} values`);
  }
  return Object.fromEntries(Object.entries(rows).map(([n, v]) => [n, Object.fromEntries(columns.map((c, i) => [c, v[i]]))]));
}

const findTitle = (text, from = 0) => {
  // skip the table of contents, whose entries end in dot leaders
  const i = lines.findIndex((l, k) => k >= from && l.startsWith(text) && !l.includes('....'));
  if (i < 0) throw new Error(`Title not found: ${text}`);
  return i;
};

const eth1At = findTitle('Tabela 4. STANOVNIŠTVO PREMA NACIONALNOJ');
const eth1 = readRows(eth1At, ETHNICITY_1);
const eth2 = readRows(findTitle('Tabela 4. STANOVNIŠTVO PREMA NACIONALNOJ', eth1At + 1), ETHNICITY_2);
const religion = readRows(findTitle('Tabela 6. STANOVNIŠTVO PREMA VJEROISPOVIJESTI'), RELIGION);
const lang1At = findTitle('Tabela 5. STANOVNIŠTVO PREMA MATERNJEM');
const lang1 = readRows(lang1At, LANGUAGE_1);
const lang2 = readRows(findTitle('Tabela 5. STANOVNIŠTVO PREMA MATERNJEM', lang1At + 1), LANGUAGE_2);

// Tabela 2 (sex) comes out of the PDF as columns: 22 totals, then 22 male counts.
function readSex() {
  const start = lines.findIndex(l => l.startsWith('muško/Male'));
  const male = lines.slice(start + 1, start + 1 + municipalities.length + 1).map(Number);
  const order = [COUNTRY, ...[...municipalities].sort((a, b) => a.localeCompare(b, 'sr'))];
  // row order in the PDF is alphabetical with the country first; verify it against the totals
  const totalsStart = lines.findIndex(l => l === '620029');
  const totals = lines.slice(totalsStart, totalsStart + order.length).map(Number);
  order.forEach((n, i) => {
    const expected = n === COUNTRY ? eth1[COUNTRY].Ukupno : eth1[n].Ukupno;
    if (totals[i] !== expected) throw new Error(`Sex table order mismatch at ${n}: ${totals[i]} vs ${expected}`);
  });
  return Object.fromEntries(order.map((n, i) => [n, male[i]]));
}
const male = readSex();

// ---------------------------------------------------------------- assemble + verify
const { byId: areas, total: countryArea } = officialAreas('me', 2011);
const ids = Object.fromEntries(geo.features.map(f => [f.properties.name, f.properties.id]));

function entity(name, area) {
  const total = eth1[name].Ukupno;
  const nationality = [...ETHNICITY_1.slice(1).map(k => ({ naziv: k, broj: eth1[name][k] })),
    ...ETHNICITY_2.map(k => ({ naziv: k, broj: eth2[name][k] }))];
  const religions = RELIGION.slice(1).map(k => ({ naziv: k, broj: religion[name][k] }));
  const languages = [...LANGUAGE_1.slice(1).map(k => ({ naziv: k, broj: lang1[name][k] })),
    ...LANGUAGE_2.map(k => ({ naziv: k, broj: lang2[name][k] }))];
  for (const [key, list] of [['nacionalnost', nationality], ['vjera', religions], ['jezik', languages]]) {
    const sum = list.reduce((a, b) => a + b.broj, 0);
    if (sum !== total) throw new Error(`${key} sum for ${name}: ${sum} / ${total}`);
  }
  if (religion[name].Ukupno !== total || lang1[name].Ukupno !== total) throw new Error(`Table total for ${name}`);
  return {
    naziv: name,
    stanovnika: total,
    muskarci: male[name],
    zene: total - male[name],
    prosjecnaStarost: null,
    starost: null,
    povrsinaKm2: area,
    gustina: Math.round((total / area) * 10) / 10,
    nacionalnost: withPercent(nationality, total),
    vjera: withPercent(religions, total),
    jezik: withPercent(languages, total),
  };
}

const opstine = Object.fromEntries(municipalities.map(n => [ids[n], entity(n, areas[ids[n]])]));
const drzava = entity(COUNTRY, countryArea);
const sum = Object.values(opstine).reduce((a, b) => a + b.stanovnika, 0);
if (sum !== drzava.stanovnika) throw new Error(`Municipalities sum ${sum} ≠ country ${drzava.stanovnika}`);

fs.writeFileSync(path.join(OUT, 'popis-2011.json'), JSON.stringify({
  godina: 2011,
  izvor: 'MONSTAT – Popis stanovništva, domaćinstava i stanova u Crnoj Gori 2011',
  drzava,
  opstine,
}));
console.log(`popis-2011.json: ${Object.keys(opstine).length} municipalities, ${drzava.stanovnika} inhabitants`);

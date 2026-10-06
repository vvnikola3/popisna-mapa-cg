// Parses MONSTAT "Popis stanovništva, domaćinstava i stanova u 2003. – Knjiga 3:
// Vjeroispovijest, maternji jezik i nacionalna ili etnička pripadnost prema starosti i polu"
// into public/data/me/popis-2003.json. The book is in Cyrillic; categories are stored in Latin.
//
//   monstat-2003-knjiga3.txt        pdftotext -raw     (religion, mother tongue)
//   monstat-2003-knjiga3-layout.txt pdftotext -layout  (ethnicity with sex and age)

const fs = require('fs');
const path = require('path');
const { officialAreas, withPercent } = require('./parse-helpers');
const { toCyrillic } = require('./translit');

const SRC = path.join(__dirname, 'sources', 'me');
const OUT = path.join(__dirname, '..', 'public', 'data', 'me');
const COUNTRY = 'Crna Gora';
const COUNTRY_CYR = 'Република Црна Гора';

// pdftotext starts every page with a form feed
const read = file => fs.readFileSync(path.join(SRC, file), 'utf8').replace(/\f/g, '').split(/\r?\n/);
const raw = read('monstat-2003-knjiga3.txt');
const layout = read('monstat-2003-knjiga3-layout.txt');
const geo = JSON.parse(fs.readFileSync(path.join(OUT, 'geo-2003.json'), 'utf8'));

const municipalities = geo.features.map(f => f.properties.name);
// Cyrillic name in the book -> Latin name used everywhere else
const byCyrillic = Object.fromEntries([[COUNTRY_CYR, COUNTRY], ...municipalities.map(n => [toCyrillic(n), n])]);
const cyrNames = Object.keys(byCyrillic);

const RELIGION = ['Islamska', 'Judaistička', 'Katolička', 'Pravoslavna', 'Protestantska', 'Orijentalni kultovi',
  'Ostale vjere', 'Ne želi da se izjasni', 'Nije vjernik', 'Nepoznato'];
const LANGUAGE = ['Srpski', 'Crnogorski', 'Albanski', 'Bosanski', 'Bošnjački', 'Mađarski', 'Makedonski', 'Njemački',
  'Romski', 'Slovenački', 'Hrvatski', 'Ostali jezici', 'Neizjašnjeni i nepoznato'];
const ETHNICITY_1 = ['Crnogorci', 'Srbi', 'Jugosloveni', 'Albanci', 'Bošnjaci', 'Egipćani', 'Italijani', 'Makedonci', 'Mađari'];
const ETHNICITY_2 = ['Muslimani', 'Njemci', 'Romi', 'Rusi', 'Slovenci', 'Hrvati', 'Ostali',
  'Neizjašnjeni i neopredijeljeni', 'Regionalna pripadnost', 'Nepoznato'];

const numbers = text => text.trim().split(/\s+/).map(v => (v === '-' ? 0 : Number(v)));
const between = (lines, start, end) => {
  const a = lines.findIndex(l => l.startsWith(start));
  const b = lines.findIndex((l, i) => i > a && l.startsWith(end));
  if (a < 0 || b < 0) throw new Error(`Section ${start} … ${end} not found`);
  return lines.slice(a, b);
};
const out = Object.fromEntries(Object.values(byCyrillic).map(n => [n, {}]));

// 1. Religion (raw): "<10 values>" / "<total>" / "<name>" – followed by urban/other rows we skip
{
  const lines = between(raw, '1. СТАНОВНИШТВО ПРЕМА ВЈЕРОИСПОВЈЕСТИ', '2. СТАНОВНИШТВО ПРЕМА МАТЕРЊЕМ');
  lines.forEach((l, i) => {
    const name = byCyrillic[l.trim()];
    if (!name || out[name].vjera) return;
    const total = Number(lines[i - 1]);
    const values = numbers(lines[i - 2]);
    if (values.length !== RELIGION.length) throw new Error(`Religion row ${name}: ${values.length} values`);
    out[name].ukupno = total;
    out[name].vjera = RELIGION.map((naziv, k) => ({ naziv, broj: values[k] }));
  });
}

// 2. Mother tongue (raw): "<name> <total> <13 values>"
{
  const lines = between(raw, '2. СТАНОВНИШТВО ПРЕМА МАТЕРЊЕМ', '3. СТАНОВНИШТВО ПРЕМА СТАРОСТИ');
  for (const l of lines) {
    const cyr = cyrNames.find(n => l.startsWith(n + ' ') && /^\d/.test(l.slice(n.length + 1)));
    if (!cyr || out[byCyrillic[cyr]].jezik) continue;
    const [total, ...values] = numbers(l.slice(cyr.length));
    if (values.length !== LANGUAGE.length) throw new Error(`Language row ${cyr}: ${values.length} values`);
    out[byCyrillic[cyr]].jezikUkupno = total;
    out[byCyrillic[cyr]].jezik = LANGUAGE.map((naziv, k) => ({ naziv, broj: values[k] }));
  }
}

// 3. Ethnicity by age and sex (layout). Each municipality has a part 1 block
//    (total + 9 groups) followed by a part 2 block (10 groups). After the part 1
//    total the rows always come in the same order – м, ж, then с/м/ж for each of
//    the 17 age groups, then the average age – but on some pages the age labels
//    are printed on separate lines, so rows are read by position, not by label.
const AGE_GROUPS = ['0-4', '5-9', '10-14', '15-19', '20-24', '25-29', '30-34', '35-39', '40-44', '45-49',
  '50-54', '55-59', '60-64', '65-69', '70-74', '75+', 'nepoznato'];
{
  const ROW = /(?:^|\s)([смж])\s+(-|\d+(?:\.\d+)?)(?=\s|$)/;
  let current = null;
  let part = 0;
  for (const l of layout) {
    const header = l.match(/^\s*(\S.*?)\s+с\s+([\d\s-]+)$/);
    const cyr = header && cyrNames.find(n => header[1].trim() === n);
    if (cyr) {
      const name = byCyrillic[cyr];
      current = out[name];
      part = current.eth1 ? 2 : 1;
      const values = numbers(header[2]);
      if (part === 1) {
        if (values.length !== ETHNICITY_1.length + 1) throw new Error(`Ethnicity 1 row ${name}: ${values.length}`);
        [current.ethTotal, ...current.eth1] = values;
        current.rows = [];
      } else {
        if (values.length !== ETHNICITY_2.length) throw new Error(`Ethnicity 2 row ${name}: ${values.length}`);
        current.eth2 = values;
      }
      continue;
    }
    const row = part === 1 && l.match(ROW);
    if (row && current.rows.length < 2 + AGE_GROUPS.length * 3 + 1) {
      current.rows.push({ marker: row[1], value: row[2] === '-' ? 0 : Number(row[2]) });
    }
  }

  for (const [name, o] of Object.entries(out)) {
    if (name === COUNTRY) continue; // its page is jumbled in the PDF – derived from the municipalities below
    const expected = ['м', 'ж', ...AGE_GROUPS.flatMap(() => ['с', 'м', 'ж']), 'с'];
    if (o.rows.map(r => r.marker).join('') !== expected.join('')) throw new Error(`Row order for ${name}`);
    o.muskarci = o.rows[0].value;
    o.zene = o.rows[1].value;
    o.ages = Object.fromEntries(AGE_GROUPS.map((g, k) => [g, o.rows[2 + k * 3].value]));
    o.prosjecnaStarost = o.rows[o.rows.length - 1].value;
  }

  const country = out[COUNTRY];
  const parts = municipalities.map(n => out[n]);
  country.muskarci = parts.reduce((s, o) => s + o.muskarci, 0);
  country.zene = parts.reduce((s, o) => s + o.zene, 0);
  country.ages = Object.fromEntries(AGE_GROUPS.map(g => [g, parts.reduce((s, o) => s + o.ages[g], 0)]));
  // the average age is readable in the raw text (first "Просјечна старост" row, first column);
  // it must match the population-weighted average of the municipalities
  const avgRow = raw.find(l => /^Прос.ечна старост с /.test(l));
  country.prosjecnaStarost = Number(avgRow.split(' ')[3]);
  const weighted = parts.reduce((s, o) => s + o.prosjecnaStarost * o.ukupno, 0) / parts.reduce((s, o) => s + o.ukupno, 0);
  if (Math.abs(weighted - country.prosjecnaStarost) > 0.1) throw new Error(`Country average age ${country.prosjecnaStarost} vs ${weighted}`);
}

// ---------------------------------------------------------------- assemble + verify
const { byId: areas, total: countryArea } = officialAreas('me', 2003);
const ids = Object.fromEntries(geo.features.map(f => [f.properties.name, f.properties.id]));

function entity(name, area) {
  const o = out[name];
  const total = o.ukupno;
  const nationality = [...ETHNICITY_1.map((naziv, k) => ({ naziv, broj: o.eth1[k] })),
    ...ETHNICITY_2.map((naziv, k) => ({ naziv, broj: o.eth2[k] }))];

  if (o.ethTotal !== total || o.jezikUkupno !== total) throw new Error(`Table totals differ for ${name}`);
  for (const [key, list] of [['nacionalnost', nationality], ['vjera', o.vjera], ['jezik', o.jezik]]) {
    const sum = list.reduce((a, b) => a + b.broj, 0);
    if (sum !== total) throw new Error(`${key} sum for ${name}: ${sum} / ${total}`);
  }
  if (o.muskarci + o.zene !== total) throw new Error(`Sex mismatch: ${name}`);

  const a = o.ages;
  const group = keys => keys.reduce((s, k) => {
    if (a[k] == null) throw new Error(`Age group ${k} missing for ${name}`);
    return s + a[k];
  }, 0);
  const starost = {
    '0-14': group(['0-4', '5-9', '10-14']),
    '15-64': group(['15-19', '20-24', '25-29', '30-34', '35-39', '40-44', '45-49', '50-54', '55-59', '60-64']),
    '65+': group(['65-69', '70-74', '75+']),
  };
  // the 2003 census also has people of unknown age
  if (starost['0-14'] + starost['15-64'] + starost['65+'] + a.nepoznato !== total) throw new Error(`Age sum for ${name}`);

  return {
    naziv: name,
    stanovnika: total,
    muskarci: o.muskarci,
    zene: o.zene,
    prosjecnaStarost: o.prosjecnaStarost,
    starost,
    povrsinaKm2: area,
    gustina: Math.round((total / area) * 10) / 10,
    nacionalnost: withPercent(nationality, total),
    vjera: withPercent(o.vjera, total),
    jezik: withPercent(o.jezik, total),
  };
}

const opstine = Object.fromEntries(municipalities.map(n => [ids[n], entity(n, areas[ids[n]])]));
const drzava = entity(COUNTRY, countryArea);
const sum = Object.values(opstine).reduce((a, b) => a + b.stanovnika, 0);
if (sum !== drzava.stanovnika) throw new Error(`Municipalities sum ${sum} ≠ country ${drzava.stanovnika}`);

fs.writeFileSync(path.join(OUT, 'popis-2003.json'), JSON.stringify({
  godina: 2003,
  izvor: 'MONSTAT – Popis stanovništva, domaćinstava i stanova 2003, Knjiga 3',
  drzava,
  opstine,
}));
console.log(`popis-2003.json: ${Object.keys(opstine).length} municipalities, ${drzava.stanovnika} inhabitants`);

// Parses MONSTAT "Popis stanovništva, domaćinstava i stanova 2023" releases I and II
// (text extracted with `pdftotext -raw -enc UTF-8`) into public/data/me/popis-2023.json.

const fs = require('fs');
const path = require('path');
const { num, section, splitsSummingToHead, officialAreas, withPercent } = require('./parse-helpers');

const SRC = path.join(__dirname, 'sources', 'me');
const OUT = path.join(__dirname, '..', 'public', 'data', 'me');
const COUNTRY = 'Crna Gora';

const I = fs.readFileSync(path.join(SRC, 'monstat-2023-I.txt'), 'utf8').split(/\r?\n/);
const II = fs.readFileSync(path.join(SRC, 'monstat-2023-II.txt'), 'utf8').split(/\r?\n/);
const geo = JSON.parse(fs.readFileSync(path.join(OUT, 'geo-2023.json'), 'utf8'));

const municipalities = geo.features.map(f => f.properties.name);
const names = [COUNTRY, ...municipalities];
const rowName = line => names.find(n => line.startsWith(n + ' '));
const out = Object.fromEntries(names.map(n => [n, { nacionalnost: [], vjera: [], jezik: [] }]));

// Tabela 1 – total (count + percentage, unambiguous)
for (const l of section(I, 'Tabela 1.', 'Grafik 1')) {
  const n = rowName(l);
  if (n) out[n].ukupno = num(l.slice(n.length).match(/^ (\d{1,3}(?: \d{3})*) \d+,\d+$/)[1]);
}

// Tabela 2 – sex: drop the total's digit groups, split the rest so male + female = total
for (const l of section(I, 'Tabela 2.', 'Grafik 2')) {
  const n = rowName(l);
  if (!n) continue;
  const total = out[n].ukupno;
  const tokens = l.slice(n.length).trim().split(' ').filter(t => !t.includes(','));
  const rest = tokens.slice(total.toLocaleString('en').split(',').length);
  const found = splitsSummingToHead([String(total).replace(/\B(?=(\d{3})+$)/g, ' ').split(' '), rest].flat(), 3);
  if (found.length !== 1) throw new Error(`Sex split for ${n}: ${found.length} solutions`);
  [, out[n].muskarci, out[n].zene] = found[0];
}

// Tabela 4 – age in 5-year groups (total / male / female rows); must agree with each other
{
  let current = null, rows = {};
  const flush = () => {
    const [T, M, F] = [rows.t, rows.m, rows.f].map(r => splitsSummingToHead(r, 17));
    const ok = T.filter(t => M.some(m => F.some(f => t.every((v, k) => v === m[k] + f[k]))));
    if (ok.length !== 1) throw new Error(`Age split for ${current}: ${ok.length} solutions`);
    const g = ok[0].slice(1);
    out[current].starost = {
      '0-14': g[0] + g[1] + g[2],
      '15-64': g.slice(3, 13).reduce((a, b) => a + b, 0),
      '65+': g[13] + g[14] + g[15],
    };
    current = null;
  };
  for (const l of section(I, 'Tabela 4.', 'Tabela 5.')) {
    const n = rowName(l);
    if (n) { current = n; rows = { t: l.slice(n.length).trim().split(' ') }; }
    else if (current && l.startsWith('muško ')) rows.m = l.slice(6).trim().split(' ');
    else if (current && l.startsWith('žensko ')) { rows.f = l.slice(7).trim().split(' '); flush(); }
  }
}

// Tabela 5 – average age
for (const l of section(I, 'Tabela 5.', 'Grafik 4')) {
  const n = rowName(l);
  if (n) out[n].prosjecnaStarost = num(l.slice(n.length).trim().split(' ')[0]);
}

// II Tabele 1 i 3 – ethnicity and mother tongue: municipalities are columns, split over
// several pages; a few category names wrap onto a second line
function parseWideTable(start, end, key) {
  let cols = null;
  let pending = null;
  for (const l of section(II, start, end)) {
    if (/ u %/.test(l) && !/^\d/.test(l)) {
      const header = l.split(' u %').map(x => x.trim()).filter(Boolean);
      if (header.every(h => names.includes(h))) cols = header;
      pending = null;
      continue;
    }
    if (!cols) continue;
    let label, values;
    if (pending && /^(\d|z |- )/.test(l)) {
      [label, values] = [pending, l];
      pending = null;
    } else if (!/\d/.test(l) && (l.endsWith('-') || pending)) {
      pending = (pending ?? '') + l;
      continue;
    } else {
      const m = l.match(/^(\p{L}.*?) ((?:\d|z |z$|- |-$).*)$/u);
      pending = null;
      if (!m) continue;
      [, label, values] = m;
    }
    if (label === 'Ukupno' || label.startsWith('od toga')) continue;
    const pairs = values.match(/\d{1,3}(?: \d{3})* \d+,\d+|z z|- -|z \d+,\d+/g) ?? [];
    // the first page also carries the country column in front
    const all = pairs.length === cols.length + 1 ? [COUNTRY, ...cols] : cols;
    all.forEach((c, j) => {
      const pm = pairs[j]?.match(/^(\d{1,3}(?: \d{3})*) (\d+,\d+)$/);
      if (pm) out[c][key].push({ naziv: label, broj: num(pm[1]), procenat: num(pm[2]) });
    });
  }
}
parseWideTable('Tabela 1.', 'Tabela 2.', 'nacionalnost');
parseWideTable('Tabela 3.', 'Tabela 4.', 'jezik');

// II Tabela 2 – religion: municipalities are rows, religions split over two pages
{
  const PAGE1 = ['Ukupno', 'Pravoslavna', 'Katolička', 'Protestantska', 'Jehovini svjedoci', 'Ostale hrišćanske'];
  const PAGE2 = ['Islamska', 'Budistička', 'Ostale vjere', 'Ateisti', 'Agnostici', 'Ne želi da se izjasni', 'Ostalo'];
  let cols = PAGE1;
  for (const l of section(II, 'Tabela 2.', 'Tabela 3.')) {
    if (l.startsWith('Opštine Islamska')) cols = PAGE2;
    const n = rowName(l);
    if (!n) continue;
    const pairs = [...l.slice(n.length).matchAll(/(\d{1,3}(?: \d{3})*|z|-) (\d+,\d+|z|-)/g)];
    if (pairs.length !== cols.length) throw new Error(`Religion row ${n}: ${pairs.length} values`);
    pairs.forEach((p, j) => {
      if (cols[j] !== 'Ukupno' && num(p[1]) != null) out[n].vjera.push({ naziv: cols[j], broj: num(p[1]), procenat: num(p[2]) });
    });
  }
}

// ---------------------------------------------------------------- assemble + verify
const { byId: areas, total: countryArea } = officialAreas('me', 2023);
const ids = Object.fromEntries(geo.features.map(f => [f.properties.name, f.properties.id]));

function entity(name, area) {
  const o = out[name];
  const total = o.ukupno;
  if (o.muskarci + o.zene !== total) throw new Error(`Sex mismatch: ${name}`);
  if (Object.values(o.starost).reduce((a, b) => a + b, 0) !== total) throw new Error(`Age mismatch: ${name}`);
  for (const key of ['nacionalnost', 'vjera', 'jezik']) {
    const sum = o[key].reduce((a, b) => a + b.broj, 0);
    // small municipalities have suppressed ("z") cells, so allow a few percent
    if (sum > total || (total - sum) / total > 0.03) throw new Error(`${key} sum for ${name}: ${sum} / ${total}`);
  }
  return {
    naziv: name,
    stanovnika: total,
    muskarci: o.muskarci,
    zene: o.zene,
    prosjecnaStarost: o.prosjecnaStarost,
    starost: o.starost,
    povrsinaKm2: area,
    gustina: Math.round((total / area) * 10) / 10,
    nacionalnost: withPercent(o.nacionalnost, total),
    vjera: withPercent(o.vjera, total),
    jezik: withPercent(o.jezik, total),
  };
}

const opstine = Object.fromEntries(municipalities.map(n => [ids[n], entity(n, areas[ids[n]])]));
const drzava = entity(COUNTRY, countryArea);
const sum = Object.values(opstine).reduce((a, b) => a + b.stanovnika, 0);
if (sum !== drzava.stanovnika) throw new Error(`Municipalities sum ${sum} ≠ country ${drzava.stanovnika}`);

fs.writeFileSync(path.join(OUT, 'popis-2023.json'), JSON.stringify({
  godina: 2023,
  izvor: 'MONSTAT – Popis stanovništva, domaćinstava i stanova 2023, konačni rezultati',
  drzava,
  opstine,
}));
console.log(`popis-2023.json: ${Object.keys(opstine).length} municipalities, ${drzava.stanovnika} inhabitants`);

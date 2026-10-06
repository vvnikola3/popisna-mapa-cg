// Downloads the Montenegro rows of the Yugoslav census tables compiled by
// T. Bespyatov on pop-stat.mashke.org (from Federal Statistical Office
// publications) and stores them as sources/me/popstat-<year>-<topic>.json.
//
// Only needs to run again if the source pages change:  node scripts/fetch-popstat.js

const fs = require('fs');
const path = require('path');

const OUT = path.join(__dirname, 'sources', 'me');
const BASE = 'http://pop-stat.mashke.org/';

const PAGES = [
  { year: 1961, topic: 'nacionalnost', page: 'yugoslavia-ethnic1961.htm' },
  { year: 1971, topic: 'nacionalnost', page: 'yugoslavia-ethnic1971.htm' },
  { year: 1981, topic: 'nacionalnost', page: 'yugoslavia-ethnic1981.htm' },
  { year: 1991, topic: 'nacionalnost', page: 'yugoslavia-ethnic1991.htm' },
  { year: 1991, topic: 'vjera', page: 'yugoslavia-religion-1991.htm' },
];

/** Table rows as arrays of cell texts; the pages omit </td> and </tr>. */
function rows(html) {
  return html.replace(/^﻿/, '').split(/<tr[^>]*>/i).slice(1).map(tr =>
    tr.replace(/<\/table[\s\S]*$/i, '').split(/<t[dh][^>]*>/i).slice(1).map(c =>
      c.replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/\s+/g, ' ').trim())
  ).filter(c => c.length);
}

const toNumber = v => (v === '-' || v === '' ? 0 : Number(v.replace(/\D/g, '')));

async function main() {
  for (const { year, topic, page } of PAGES) {
    const res = await fetch(BASE + page, { headers: { 'User-Agent': 'popisi.org data build' } });
    if (!res.ok) throw new Error(`${page}: HTTP ${res.status}`);
    const table = rows(await res.text());

    const start = table.findIndex(c => /CRNA GORA/i.test(c[0]));
    if (start < 0) throw new Error(`${page}: no Montenegro block`);
    // the column header is the closest row above the block that starts with a total column
    const header = table.slice(0, start).reverse().find(c => c.some(x => /^UKUPNO$/i.test(x)));
    const columns = header.slice(header.findIndex(x => /^UKUPNO$/i.test(x)) + 1);

    const units = [];
    for (let k = start; k < table.length; k++) {
      const cells = table[k];
      if (k > start && (/^(NR|SR|SAP) /.test(cells[0]) || /SRBIJA|HRVATSKA|BOSNA|UKUPNO|^$/i.test(cells[0]))) break;
      const [total, ...values] = cells.slice(1).map(toNumber);
      if (values.length !== columns.length) throw new Error(`${page}: ${cells[0]} has ${values.length} values`);
      const sum = values.reduce((a, b) => a + b, 0);
      if (sum !== total) throw new Error(`${page}: ${cells[0]} categories ${sum} ≠ total ${total}`);
      units.push({ naziv: cells[0], ukupno: total, kategorije: Object.fromEntries(columns.map((c, i) => [c, values[i]])) });
    }

    const file = path.join(OUT, `popstat-${year}-${topic}.json`);
    fs.writeFileSync(file, JSON.stringify({
      izvor: `pop-stat.mashke.org (T. Bespyatov), ${BASE}${page}`,
      napomena: 'Prepisano iz publikacija Saveznog zavoda za statistiku; ukupni broj stanovnika po opštinama provjeren prema MONSTAT, Popis 2003, Knjiga 9.',
      godina: year,
      tema: topic,
      jedinice: units,
    }, null, 1));
    console.log(`${path.basename(file)}: ${units.length - 1} municipalities, ${columns.length} categories`);
  }
}

main().catch(e => { console.error(e); process.exit(1); });

// One-off download of the MakStat tables (North Macedonia, censuses 2002 and 2021) into
// sources/mk/makstat-<table>.json. PX-Web API, no key needed, but it wants a User-Agent.
// Each file keeps the table's metadata (variables with codes and names) next to the
// data rows, so the build scripts do not depend on the API being reachable.

const fs = require('fs');
const path = require('path');

const API = 'https://makstat.stat.gov.mk/PXWeb/api/v1/en/MakStat/';
const OUT = path.join(__dirname, 'sources', 'mk');

const P21 = 'Popisi/Popis2021/NaselenieVkupno/NaseleniePopis2021/EtnoKulturniKarakteristiki/';
const P02 = 'Popisi/PopisNaNaselenie/PopisOpstini/';

const TABLES = {
  '2021-nacionalnost': P21 + 'T1008P21.px',
  '2021-vjera': P21 + 'T1012P21.px',
  '2021-jezik': P21 + 'T1015P21.px',
  '2021-starost': 'Popisi/Popis2021/NaselenieSet/T1003P21.px',
  '2021-ukupno': 'Popisi/Popis2021/NaselenieSet/T1001P21.px',
  '2002-nacionalnost': P02 + '03Popis_op_02_VkNasPoNacPr_ang.px',
  '2002-starost': P02 + '02Popis_op_02_VkNasPoVozrGrPol_ang.px',
  '2002-ukupno': P02 + '01Popis_op_02_VkNasDomSt_ang.px',
};

const headers = { 'User-Agent': 'Mozilla/5.0 (popisi.org data build)' };

const sleep = ms => new Promise(r => setTimeout(r, ms));

/** The API allows only a few requests per few seconds (HTTP 429, Retry-After 10). */
async function call(url, init) {
  for (let attempt = 0; attempt < 6; attempt++) {
    const res = await fetch(url, init);
    if (res.status !== 429) return res;
    await sleep((Number(res.headers.get("retry-after")) || 10) * 1000);
  }
  throw new Error(`${url}: still rate limited`);
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  for (const [name, table] of Object.entries(TABLES)) {
    const meta = await (await call(API + table, { headers })).json();
    const query = {
      query: meta.variables.map(v => ({ code: v.code, selection: { filter: 'all', values: ['*'] } })),
      response: { format: 'json' },
    };
    const res = await call(API + table, { method: 'POST', headers: { ...headers, 'Content-Type': 'application/json' }, body: JSON.stringify(query) });
    if (!res.ok) throw new Error(`${table}: HTTP ${res.status} ${await res.text()}`);
    const data = JSON.parse((await res.text()).replace(/^﻿/, ''));
    fs.writeFileSync(path.join(OUT, `makstat-${name}.json`), JSON.stringify({
      izvor: API + table,
      naslov: meta.title,
      varijable: meta.variables.map(v => ({ code: v.code, text: v.text, values: v.values, valueTexts: v.valueTexts })),
      kolone: data.columns.map(c => c.code),
      podaci: data.data.map(r => [...r.key, ...r.values]),
    }));
    console.log(`makstat-${name}.json: ${data.data.length} rows`);
  }

  // Macedonian (Cyrillic) municipality names of the 2021 table: the English API serves only English ones
  const mk = await (await call(API.replace('/en/', '/mk/') + TABLES['2021-ukupno'], { headers })).json();
  const names = Object.fromEntries(mk.variables[0].values.map((code, i) => [code, mk.variables[0].valueTexts[i]]));
  fs.writeFileSync(path.join(OUT, 'makstat-2021-nazivi-mk.json'), JSON.stringify(names, null, 1));
  console.log(`makstat-2021-nazivi-mk.json: ${Object.keys(names).length} names`);
}

main().catch(e => { console.error(e); process.exit(1); });

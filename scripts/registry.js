// Territorial registry: which municipalities exist in a given census year and
// which existing municipality a later one was carved out of.

const fs = require('fs');
const path = require('path');

/** Census years with data, per country. */
const CENSUS_YEARS = { me: [2003, 2011, 2023] };

function loadRegistry(country) {
  const file = path.join(__dirname, 'sources', country, 'teritorije.json');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

const existsIn = (unit, year) => unit.osnovana == null || unit.osnovana <= year;

/** The municipality that held `id`'s territory in `year` (itself if it already existed). */
function holderIn(registry, id, year) {
  const byId = Object.fromEntries(registry.opstine.map(u => [u.id, u]));
  let unit = byId[id];
  while (!existsIn(unit, year)) unit = byId[unit.izdvojenaIz];
  return unit.id;
}

module.exports = { CENSUS_YEARS, loadRegistry, existsIn, holderIn };

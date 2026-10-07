// Territorial registry: which municipalities exist in a given census year, which
// municipality a later one was carved out of (osnovana / izdvojenaIz), which one an
// abolished one was merged into (ukinuta / pripojenaU), and their names back then.

const fs = require('fs');
const path = require('path');

/** Census years with data, per country. */
const CENSUS_YEARS = {
  me: [1948, 1953, 1961, 1971, 1981, 1991, 2003, 2011, 2023],
  mk: [2002, 2021],
};

function loadRegistry(country) {
  const file = path.join(__dirname, 'sources', country, 'teritorije.json');
  return JSON.parse(fs.readFileSync(file, 'utf8'));
}

/**
 * The territorial state a census' figures refer to. Usually the census year itself,
 * but some older figures were recalculated to later borders (see teritorijaPopisa).
 */
const territoryYear = (registry, year) => registry.teritorijaPopisa?.[year] ?? year;

const existsIn = (unit, year) => (unit.osnovana == null || unit.osnovana <= year) && (unit.ukinuta == null || year < unit.ukinuta);

/**
 * The municipality that held `id`'s territory in `year`: itself if it existed then,
 * otherwise the one it was carved out of (founded later) or merged into (abolished before).
 */
function holderIn(registry, id, year) {
  const byId = Object.fromEntries(registry.opstine.map(u => [u.id, u]));
  let unit = byId[id];
  while (!existsIn(unit, year)) unit = byId[unit.osnovana != null && unit.osnovana > year ? unit.izdvojenaIz : unit.pripojenaU];
  return unit.id;
}

/** Name of a municipality at the time of a census (e.g. Titograd in 1981). */
function nameIn(registry, id, year) {
  const unit = registry.opstine.find(u => u.id === id);
  return unit.raniji?.find(r => r.od <= year && year <= r.do)?.naziv ?? unit.naziv;
}

module.exports = { CENSUS_YEARS, loadRegistry, territoryYear, existsIn, holderIn, nameIn };

const turf = require('@turf/turf');

/** "179 505" -> 179505, "28,78" -> 28.78, "z"/"-" -> null */
const num = s => (s === 'z' || s === '-' ? null : +s.replace(/ /g, '').replace(',', '.'));

/** Lines between the first line starting with `start` and the next one starting with `end`. */
function section(lines, start, end) {
  const a = lines.findIndex(l => l.startsWith(start));
  const b = lines.findIndex((l, i) => i > a && l.startsWith(end));
  if (a < 0 || b < 0) throw new Error(`Section ${start} … ${end} not found`);
  return lines.slice(a, b);
}

/**
 * MONSTAT 2023 PDFs use a space both as thousands separator and as column
 * separator ("1 569 855 714"). Returns every way to read the digit groups as
 * `count` numbers where numbers 2..count add up to the first one.
 */
function splitsSummingToHead(tokens, count) {
  const res = [];
  (function rec(i, acc) {
    if (res.length > 50) return;
    if (i === tokens.length) {
      if (acc.length === count && acc.slice(1).reduce((a, b) => a + b, 0) === acc[0]) res.push(acc);
      return;
    }
    if (acc.length >= count) return;
    let s = '';
    for (let j = i; j < tokens.length; j++) {
      if (j > i && tokens[j].length !== 3) break;
      s += tokens[j];
      rec(j + 1, [...acc, +s]);
      if (tokens[i].length > 3 || s.length > 7) break;
    }
  })(0, []);
  return res;
}

/** Area (km², rounded) of each feature in a geo file, keyed by municipality id. */
function areasById(geo) {
  return Object.fromEntries(geo.features.map(f => [f.properties.id, Math.round(turf.area(f) / 1e6)]));
}

/** Sorts a list of {naziv, broj} descending and adds `procenat` relative to `total`. */
function withPercent(list, total) {
  return list
    .filter(x => x.broj > 0)
    .sort((a, b) => b.broj - a.broj)
    .map(x => ({ naziv: x.naziv, broj: x.broj, procenat: x.procenat ?? Math.round((x.broj / total) * 10000) / 100 }));
}

module.exports = { num, section, splitsSummingToHead, areasById, withPercent };

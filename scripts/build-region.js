// Builds public/data/region.json – the start page map of the region.
//
// Source: Natural Earth 1:50m Admin 0 countries (public domain), trimmed to the
// countries around the region in sources/region/ne-50m-drzave.json.
// The five countries of the app get `code` (as in src/app/census/countries.ts);
// Kosovo is merged into Serbia. Neighbours are kept, clipped, as grey context.

const fs = require('fs');
const path = require('path');
const turf = require('@turf/turf');

const SRC = path.join(__dirname, 'sources', 'region', 'ne-50m-drzave.json');
const OUT = path.join(__dirname, '..', 'public', 'data', 'region.json');

const CODES = { MNE: 'me', SRB: 'rs', BIH: 'ba', HRV: 'hr', MKD: 'mk' };
const MERGE_INTO = { KOS: 'SRB' };
/** Label positions where the centre of mass falls outside (Croatia's crescent wraps around Bosnia). */
const LABELS = { hr: [15.55, 45.3] };
/** Area drawn around the region (west, south, east, north). */
const BBOX = [11.5, 39.3, 25.5, 47.8];

const round = geometry =>
  JSON.parse(JSON.stringify(geometry), (_, v) => (typeof v === 'number' ? Math.round(v * 1e3) / 1e3 : v));

const source = JSON.parse(fs.readFileSync(SRC, 'utf8')).features;
const byA3 = Object.fromEntries(source.map(f => [f.properties.a3, f]));

for (const [part, into] of Object.entries(MERGE_INTO)) {
  byA3[into] = turf.union(turf.featureCollection([byA3[into], byA3[part]]));
  delete byA3[part];
}

const features = Object.entries(byA3).map(([a3, f]) => {
  const code = CODES[a3] ?? null;
  const geometry = code ? f.geometry : turf.bboxClip(f, BBOX).geometry;
  const props = { code };
  if (code) {
    const [lng, lat] = turf.centerOfMass(f).geometry.coordinates;
    props.label = LABELS[code] ?? [Math.round(lng * 1e3) / 1e3, Math.round(lat * 1e3) / 1e3];
  }
  return { type: 'Feature', properties: props, geometry: round(turf.simplify({ type: 'Feature', geometry }, { tolerance: 0.01 }).geometry) };
});

fs.writeFileSync(OUT, JSON.stringify({ type: 'FeatureCollection', features }));
console.log(`region.json: ${features.filter(f => f.properties.code).length} countries + ${features.filter(f => !f.properties.code).length} neighbours`);

// Builds municipality boundaries for every census year that has data.
//
//   2023: 25 municipalities. Zeta (split from Podgorica in 2022) comes from
//         OpenStreetMap and is carved out of the old Podgorica polygon, so its
//         borders with the neighbours stay identical.
//   2011: 21 municipalities. Gusinje, Petnjica, Tuzi and Zeta did not exist yet,
//         so they are merged back into the municipality they were part of.
//
// Output: public/data/geo-<year>.json (each feature gets a `label` point).

const fs = require('fs');
const path = require('path');
const turf = require('@turf/turf');
const polylabel = require('polylabel');

const SRC = path.join(__dirname, 'sources');
const OUT = path.join(__dirname, '..', 'public', 'data');

const readJson = file => JSON.parse(fs.readFileSync(path.join(SRC, file), 'utf8'));
const km2 = feature => turf.area(feature) / 1e6;
const round = geometry =>
  JSON.parse(JSON.stringify(geometry), (_, v) => (typeof v === 'number' ? Math.round(v * 1e4) / 1e4 : v));

/** Drops slivers (< minKm2) and holes that appear when unioning slightly mismatched polygons. */
function clean(feature, minKm2 = 0.5) {
  const parts = turf.flatten(feature).features
    .filter(p => km2(p) >= minKm2)
    .map(p => turf.polygon([p.geometry.coordinates[0]]));
  const merged = parts.length === 1 ? parts[0] : turf.union(turf.featureCollection(parts));
  return merged.geometry;
}

/** Visual centre of the largest polygon, used to place the municipality name. */
function labelPoint(geometry) {
  const polygons = geometry.type === 'Polygon' ? [geometry.coordinates] : geometry.coordinates;
  const largest = polygons
    .map(coords => turf.polygon(coords))
    .sort((a, b) => km2(b) - km2(a))[0];
  const [lng, lat] = polylabel(largest.geometry.coordinates, 0.0005);
  return [Math.round(lng * 1e4) / 1e4, Math.round(lat * 1e4) / 1e4];
}

function write(year, features) {
  for (const f of features) {
    f.geometry = round(f.geometry);
    f.properties.label = labelPoint(f.geometry);
  }
  features.sort((a, b) => a.properties.id.localeCompare(b.properties.id));
  const file = path.join(OUT, `geo-${year}.json`);
  fs.writeFileSync(file, JSON.stringify({ type: 'FeatureCollection', features }));
  console.log(`geo-${year}.json: ${features.length} municipalities`);
}

// ---------------------------------------------------------------- 2023
const simplemaps = readJson('simplemaps-me.json');
const osm = readJson('osm-zeta-podgorica-tuzi.json');

const features = simplemaps.features.map(f => ({
  type: 'Feature',
  geometry: f.geometry,
  properties: { id: f.properties.id, name: f.properties.name === 'Nikšic' ? 'Nikšić' : f.properties.name }
}));

const podgoricaOld = features.find(f => f.properties.id === 'ME16');
const zetaOsm = osm.features.find(f => f.properties.name.includes('Zeta'));

let zeta = turf.intersect(turf.featureCollection([
  turf.simplify(zetaOsm, { tolerance: 0.002, highQuality: true }),
  podgoricaOld
]));
const remainder = turf.flatten(turf.difference(turf.featureCollection([podgoricaOld, zeta]))).features
  .sort((a, b) => km2(b) - km2(a));
// The largest remaining piece is the new Podgorica. Everything else is either a
// sliver or the part of Skadar Lake that now only touches Zeta, so it goes to Zeta.
for (const piece of remainder.slice(1)) zeta = turf.union(turf.featureCollection([zeta, piece]));

podgoricaOld.geometry = remainder[0].geometry;
features.push({ type: 'Feature', geometry: clean(zeta, 0.05), properties: { id: 'ME25', name: 'Zeta' } });
write(2023, features);

// ---------------------------------------------------------------- 2011
const MERGED_IN_2011 = {
  ME03: ['ME23'],         // Berane  ← Petnjica (2013)
  ME13: ['ME22'],         // Plav    ← Gusinje (2014)
  ME16: ['ME24', 'ME25'], // Podgorica ← Tuzi (2018), Zeta (2022)
};
const absorbed = new Set(Object.values(MERGED_IN_2011).flat());
const byId = Object.fromEntries(features.map(f => [f.properties.id, f]));

const features2011 = features
  .filter(f => !absorbed.has(f.properties.id))
  .map(f => {
    const parts = [f, ...(MERGED_IN_2011[f.properties.id] ?? []).map(id => byId[id])];
    const geometry = parts.length === 1
      ? f.geometry
      : clean(turf.union(turf.featureCollection(parts.map(p => turf.feature(p.geometry)))));
    return { type: 'Feature', geometry, properties: { id: f.properties.id, name: f.properties.name } };
  });
write(2011, features2011);

// Builds municipality boundaries for every census year that has data (Montenegro).
//
// Base geometry is today's 25 municipalities: simplemaps boundaries, with Zeta
// (split from Podgorica in 2022) taken from OpenStreetMap and carved out of the
// old Podgorica polygon so its borders with the neighbours stay identical.
// For an earlier census, every municipality founded after it (see
// sources/me/teritorije.json) is merged back into the one it was part of.
//
// Output: public/data/me/geo-<year>.json (each feature gets a `label` point)
//         public/data/me/teritorije.json (copy of the registry for the app)

const fs = require('fs');
const path = require('path');
const turf = require('@turf/turf');
const polylabel = require('polylabel');
const { CENSUS_YEARS, loadRegistry, holderIn } = require('./registry');

const COUNTRY = 'me';
const SRC = path.join(__dirname, 'sources', COUNTRY);
const OUT = path.join(__dirname, '..', 'public', 'data', COUNTRY);

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

// ---------------------------------------------------------------- today's municipalities
const registry = loadRegistry(COUNTRY);
const names = Object.fromEntries(registry.opstine.map(u => [u.id, u.naziv]));
const simplemaps = readJson('simplemaps-me.json');
const osm = readJson('osm-zeta-podgorica-tuzi.json');

const current = simplemaps.features.map(f => ({
  type: 'Feature',
  geometry: f.geometry,
  properties: { id: f.properties.id, name: names[f.properties.id] },
}));

const podgoricaOld = current.find(f => f.properties.id === 'ME16');
const zetaOsm = osm.features.find(f => f.properties.name.includes('Zeta'));

let zeta = turf.intersect(turf.featureCollection([
  turf.simplify(zetaOsm, { tolerance: 0.002, highQuality: true }),
  podgoricaOld,
]));
const remainder = turf.flatten(turf.difference(turf.featureCollection([podgoricaOld, zeta]))).features
  .sort((a, b) => km2(b) - km2(a));
// The largest remaining piece is the new Podgorica. Everything else is either a
// sliver or the part of Skadar Lake that now only touches Zeta, so it goes to Zeta.
for (const piece of remainder.slice(1)) zeta = turf.union(turf.featureCollection([zeta, piece]));

podgoricaOld.geometry = remainder[0].geometry;
current.push({ type: 'Feature', geometry: clean(zeta, 0.05), properties: { id: 'ME25', name: names.ME25 } });

const missing = registry.opstine.filter(u => !current.some(f => f.properties.id === u.id));
if (missing.length) throw new Error(`No geometry for ${missing.map(u => u.id).join(', ')}`);

// ---------------------------------------------------------------- one file per census year
fs.mkdirSync(OUT, { recursive: true });

for (const year of CENSUS_YEARS[COUNTRY]) {
  const groups = {};
  for (const f of current) (groups[holderIn(registry, f.properties.id, year)] ??= []).push(f);

  const features = Object.entries(groups)
    .map(([id, parts]) => {
      const geometry = parts.length === 1
        ? parts[0].geometry
        : clean(turf.union(turf.featureCollection(parts.map(p => turf.feature(p.geometry)))));
      const rounded = round(geometry);
      return { type: 'Feature', geometry: rounded, properties: { id, name: names[id], label: labelPoint(rounded) } };
    })
    .sort((a, b) => a.properties.id.localeCompare(b.properties.id));

  fs.writeFileSync(path.join(OUT, `geo-${year}.json`), JSON.stringify({ type: 'FeatureCollection', features }));
  console.log(`geo-${year}.json: ${features.length} municipalities`);
}

fs.copyFileSync(path.join(SRC, 'teritorije.json'), path.join(OUT, 'teritorije.json'));

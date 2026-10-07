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
const { loadRegistry } = require('./registry');
const { km2, clean, writeCensusGeo } = require('./geo-helpers');

const COUNTRY = 'me';
const SRC = path.join(__dirname, 'sources', COUNTRY);

const readJson = file => JSON.parse(fs.readFileSync(path.join(SRC, file), 'utf8'));

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

writeCensusGeo(COUNTRY, current, registry);

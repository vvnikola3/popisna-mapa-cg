// Geometry helpers shared by the per-country boundary builders (build-geo*.js).

const fs = require('fs');
const path = require('path');
const turf = require('@turf/turf');
const polylabel = require('polylabel');
const { CENSUS_YEARS, holderIn, nameIn, territoryYear } = require('./registry');

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

/**
 * Writes public/data/<country>/geo-<year>.json for every census year with data, plus a
 * copy of the registry. `base` holds one feature per municipality of the registry
 * (the finest division: today's for Montenegro, the one of 2002 for North Macedonia);
 * for each census, municipalities that did not exist then (or no longer exist) are
 * merged into the one that held their territory.
 */
function writeCensusGeo(country, base, registry) {
  const src = path.join(__dirname, 'sources', country);
  const out = path.join(__dirname, '..', 'public', 'data', country);
  fs.mkdirSync(out, { recursive: true });

  for (const year of CENSUS_YEARS[country]) {
    const groups = {};
    const territory = territoryYear(registry, year);
    for (const f of base) (groups[holderIn(registry, f.properties.id, territory)] ??= []).push(f);

    const features = Object.entries(groups)
      .map(([id, parts]) => {
        const geometry = parts.length === 1
          ? parts[0].geometry
          : clean(turf.union(turf.featureCollection(parts.map(p => turf.feature(p.geometry)))));
        const rounded = round(geometry);
        return { type: 'Feature', geometry: rounded, properties: { id, name: nameIn(registry, id, year), label: labelPoint(rounded) } };
      })
      .sort((a, b) => a.properties.id.localeCompare(b.properties.id));

    fs.writeFileSync(path.join(out, `geo-${year}.json`), JSON.stringify({ type: 'FeatureCollection', features }));
    console.log(`${country}/geo-${year}.json: ${features.length} municipalities`);
  }

  fs.copyFileSync(path.join(src, 'teritorije.json'), path.join(out, 'teritorije.json'));
}

module.exports = { km2, round, clean, labelPoint, writeCensusGeo };

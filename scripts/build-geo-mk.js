// Builds municipality boundaries for the censuses 2002 and 2021 (North Macedonia).
//
// Base geometry is the 84 municipalities of 2002: geoBoundaries ADM2 (CC BY 4.0,
// simplified version). In 2013 Drugovo, Oslomej, Vraneština and Zajas were merged into
// Kičevo (see sources/mk/teritorije.json: ukinuta / pripojenaU), so for 2021 those four
// polygons are united with Kičevo – 80 municipalities.
//
// Output: public/data/mk/geo-<year>.json (each feature gets a `label` point)
//         public/data/mk/teritorije.json (copy of the registry for the app)
//         sources/mk/povrsine.json (areas computed from the borders, see below)

const fs = require('fs');
const path = require('path');
const turf = require('@turf/turf');
const { loadRegistry } = require('./registry');
const { km2, writeCensusGeo } = require('./geo-helpers');

const COUNTRY = 'mk';
const SRC = path.join(__dirname, 'sources', COUNTRY);
/** Area of the whole country (State Statistical Office); includes the lakes, so it is larger than the sum of municipalities. */
const COUNTRY_AREA_KM2 = 25713;

const registry = loadRegistry(COUNTRY);
const source = JSON.parse(fs.readFileSync(path.join(SRC, 'geoboundaries-mkd-adm2.json'), 'utf8'));

// geoBoundaries transliterates "ц" as "ts" (Kavadartsi, Vinitsa); the registry uses MakStat's English names
const normalise = s => s.toLowerCase().replace(/ts/g, 'c').replace(/[^a-z]/g, '');
const ALIASES = { mavrovoandrostusha: 'mavrovoirostushe', debarca: 'debrca' };
const byName = Object.fromEntries(registry.opstine.map(u => [normalise(u.engleski), u]));

const base = source.features.map(f => {
  const key = normalise(f.properties.shapeName);
  const unit = byName[ALIASES[key] ?? key];
  if (!unit) throw new Error(`No registry entry for ${f.properties.shapeName}`);
  return { type: 'Feature', geometry: f.geometry, properties: { id: unit.id, name: unit.naziv } };
});

const missing = registry.opstine.filter(u => !base.some(f => f.properties.id === u.id));
if (missing.length) throw new Error(`No geometry for ${missing.map(u => u.naziv).join(', ')}`);
if (new Set(base.map(f => f.properties.id)).size !== base.length) throw new Error('A municipality matched twice');

// The State Statistical Office publishes no table of municipal areas, so they are measured
// on the (simplified) borders – a little below the official figures, which include lakes.
const areas = Object.fromEntries(base.map(f => [f.properties.id, Math.round(km2(f) * 10) / 10]));
fs.writeFileSync(path.join(SRC, 'povrsine.json'), JSON.stringify({
  izvor: 'izračunato iz granica (geoBoundaries ADM2, CC BY 4.0); ukupno za državu: Državni zavod za statistiku',
  drzava: COUNTRY_AREA_KM2,
  opstine: areas,
}, null, 1));

writeCensusGeo(COUNTRY, base, registry);

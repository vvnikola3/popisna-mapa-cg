// Runs after `ng build`. GitHub Pages has no URL rewrites, so a link such as
// /me/2023/nacionalnost/podgorica would only work through 404.html – which
// answers with HTTP 404, and search engines don't index 404 pages. This script
// writes a real copy of index.html for every shareable view, each with its own
// <title>, description (with actual census figures), canonical URL and Open Graph
// tags, plus sitemap.xml and robots.txt.
//
// Usage: node scripts/build-pages.js [distDir]   (default: dist/popisna-mapa-cg/browser)

const fs = require('fs');
const path = require('path');
const { CENSUS_YEARS, loadRegistry, holderIn } = require('./registry');

const SITE = 'https://popisi.org';
const DIST = path.resolve(process.argv[2] ?? path.join(__dirname, '..', 'dist', 'popisna-mapa-cg', 'browser'));
const DATA = path.join(__dirname, '..', 'public', 'data');
const COUNTRY = { code: 'me', name: 'Crna Gora', genitive: 'Crne Gore' };

// keep in sync with MODE_SLUGS in src/app/core/url-state.service.ts
const MODES = [
  { slug: 'nacionalnost', list: 'nacionalnost', label: 'nacionalni sastav' },
  { slug: 'vjera', list: 'vjera', label: 'vjerski sastav' },
  { slug: 'jezik', list: 'jezik', label: 'maternji jezik' },
  { slug: 'stanovnistvo', label: 'broj stanovnika' },
  { slug: 'gustina', label: 'gustina naseljenosti' },
  { slug: 'promjena', label: 'promjena broja stanovnika', needsPrevious: true },
];

// same rules as slugify() in url-state.service.ts
const slugify = text =>
  text.toLowerCase().replace(/đ/g, 'dj').normalize('NFD').replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');

const num = (v, d = 0) => v.toLocaleString('sr-Latn-ME', { minimumFractionDigits: d, maximumFractionDigits: d });
const signedPct = v => `${v > 0 ? '+' : v < 0 ? '−' : ''}${num(Math.abs(v), 1)}%`;
const escape = s => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

/** Categories that are not a group of people in their own right. */
const isResidual = name => /^(Ne želi|Neizjašnj|Nepoznato|Ostal|Maternji$|Regionaln)/.test(name);

function describe(mode, entity, place, year, previous) {
  if (mode.list) {
    const top = entity[mode.list].filter(s => !isResidual(s.naziv)).slice(0, 3)
      .map(s => `${s.naziv} ${num(s.procenat, 1)}%`).join(', ');
    return `${capitalize(mode.label)} – ${place}, popis ${year}: ${top}. Interaktivna mapa po opštinama i poređenje sa ranijim popisima.`;
  }
  if (mode.slug === 'stanovnistvo') {
    return `${place} ima ${num(entity.stanovnika)} stanovnika prema popisu ${year} (muškarci ${num(entity.muskarci)}, žene ${num(entity.zene)}). Interaktivna popisna mapa po opštinama.`;
  }
  if (mode.slug === 'gustina') {
    return `Gustina naseljenosti – ${place}, popis ${year}: ${num(entity.gustina, 1)} stanovnika po km² (${num(entity.stanovnika)} stanovnika). Interaktivna popisna mapa po opštinama.`;
  }
  const change = previous ? ((entity.stanovnika - previous.entity.stanovnika) / previous.entity.stanovnika) * 100 : null;
  return change === null
    ? `Promjena broja stanovnika – ${place}: ${num(entity.stanovnika)} stanovnika prema popisu ${year}. Granice opštine su se mijenjale, pa direktno poređenje nije moguće.`
    : `Promjena broja stanovnika – ${place}: ${num(previous.entity.stanovnika)} (${previous.year}) → ${num(entity.stanovnika)} (${year}), ${signedPct(change)}. Interaktivna popisna mapa po opštinama.`;
}

const capitalize = s => s.charAt(0).toUpperCase() + s.slice(1);

/** Head tags of index.html that are rewritten per page. */
function personalise(html, { url, title, description }) {
  const replacements = [
    [/<title>[^<]*<\/title>/, `<title>${escape(title)}</title>`],
    [/(<meta name="description" content=")[^"]*(")/, `$1${escape(description)}$2`],
    [/(<link rel="canonical" href=")[^"]*(")/, `$1${url}$2`],
    [/(<meta property="og:url" content=")[^"]*(")/, `$1${url}$2`],
    [/(<meta property="og:title" content=")[^"]*(")/, `$1${escape(title)}$2`],
    [/(<meta property="og:description" content=")[^"]*(")/, `$1${escape(description)}$2`],
  ];
  for (const [pattern, value] of replacements) {
    if (!pattern.test(html)) throw new Error(`index.html is missing ${pattern}`);
    html = html.replace(pattern, value);
  }
  return html;
}

// ---------------------------------------------------------------- pages
const template = fs.readFileSync(path.join(DIST, 'index.html'), 'utf8');
const registry = loadRegistry(COUNTRY.code);
const years = CENSUS_YEARS[COUNTRY.code];
const census = Object.fromEntries(years.map(y => [y, JSON.parse(fs.readFileSync(path.join(DATA, COUNTRY.code, `popis-${y}.json`), 'utf8'))]));

/** Same territory in the previous census, or null when borders changed (see CensusStore.compare). */
function previousOf(id, year) {
  const prevYear = years[years.indexOf(year) - 1];
  if (!prevYear) return null;
  const prev = census[prevYear];
  if (!id) return { year: prevYear, entity: prev.drzava };
  const unit = registry.opstine.find(u => u.id === id);
  if (unit?.osnovana && unit.osnovana > prevYear) return null;
  const split = registry.opstine.some(u => u.osnovana > prevYear && u.osnovana <= year && holderIn(registry, u.id, prevYear) === id);
  return split || !prev.opstine[id] ? null : { year: prevYear, entity: prev.opstine[id] };
}

const pages = [];
for (const year of years) {
  const data = census[year];
  const places = [[null, data.drzava], ...Object.entries(data.opstine)];
  for (const mode of MODES) {
    if (mode.needsPrevious && years.indexOf(year) === 0) continue;
    for (const [id, entity] of places) {
      const place = id ? entity.naziv : COUNTRY.name;
      const parts = [COUNTRY.code, String(year), mode.slug, ...(id ? [slugify(entity.naziv)] : [])];
      // trailing slash: GitHub Pages serves dir/index.html there and 301-redirects the slash-less form
      const url = `${SITE}/${parts.join('/')}/`;
      const title = `${place} – ${mode.label}, popis ${year} · Popisna mapa`;
      const description = describe(mode, entity, place, year, previousOf(id, year));
      const dir = path.join(DIST, ...parts);
      fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(path.join(dir, 'index.html'), personalise(template, { url, title, description }));
      pages.push(url);
    }
  }
}

// the start page gets its canonical URL too
fs.writeFileSync(path.join(DIST, 'index.html'), personalise(template, {
  url: `${SITE}/`,
  title: 'Popisna mapa – popisi stanovništva po opštinama · Пописна мапа',
  description: `Interaktivna mapa popisa stanovništva ${COUNTRY.genitive} (${years.join(', ')}) po opštinama: nacionalnost, vjera, maternji jezik, broj stanovnika, gustina i promjene između popisa.`,
}));

// ---------------------------------------------------------------- sitemap + robots
const today = new Date().toISOString().slice(0, 10);
const sitemap = [`${SITE}/`, ...pages]
  .map(loc => `  <url><loc>${loc}</loc><lastmod>${today}</lastmod></url>`)
  .join('\n');
fs.writeFileSync(path.join(DIST, 'sitemap.xml'),
  `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${sitemap}\n</urlset>\n`);
fs.writeFileSync(path.join(DIST, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap.xml\n`);

console.log(`build-pages: ${pages.length} pages + sitemap.xml + robots.txt in ${path.relative(process.cwd(), DIST)}`);

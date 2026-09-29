// Serbian/Montenegrin Latin <-> Cyrillic transliteration (same rules as src/app/core/translit.ts).

const DIGRAPHS = [['Lj', 'Љ'], ['LJ', 'Љ'], ['lj', 'љ'], ['Nj', 'Њ'], ['NJ', 'Њ'], ['nj', 'њ'], ['Dž', 'Џ'], ['DŽ', 'Џ'], ['dž', 'џ']];
const LETTERS = 'A:А B:Б C:Ц Č:Ч Ć:Ћ D:Д Đ:Ђ E:Е F:Ф G:Г H:Х I:И J:Ј K:К L:Л M:М N:Н O:О P:П R:Р S:С Š:Ш T:Т U:У V:В Z:З Ž:Ж'
  .split(' ')
  .flatMap(pair => {
    const [lat, cyr] = pair.split(':');
    return [[lat, cyr], [lat.toLowerCase(), cyr.toLowerCase()]];
  });

function toCyrillic(text) {
  let out = text;
  for (const [lat, cyr] of DIGRAPHS) out = out.split(lat).join(cyr);
  const map = Object.fromEntries(LETTERS);
  return [...out].map(ch => map[ch] ?? ch).join('');
}

function toLatin(text) {
  const map = Object.fromEntries([...DIGRAPHS.filter(([l]) => l !== 'LJ' && l !== 'NJ' && l !== 'DŽ'), ...LETTERS].map(([l, c]) => [c, l]));
  return [...text].map(ch => map[ch] ?? ch).join('');
}

module.exports = { toCyrillic, toLatin };

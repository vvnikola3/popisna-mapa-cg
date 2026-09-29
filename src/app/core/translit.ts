// Serbian/Montenegrin Latin -> Cyrillic (same rules as scripts/translit.js).

const DIGRAPHS: [string, string][] = [
  ['Lj', 'Љ'], ['LJ', 'Љ'], ['lj', 'љ'],
  ['Nj', 'Њ'], ['NJ', 'Њ'], ['nj', 'њ'],
  ['Dž', 'Џ'], ['DŽ', 'Џ'], ['dž', 'џ'],
];

const LETTERS: Record<string, string> = Object.fromEntries(
  'A:А B:Б C:Ц Č:Ч Ć:Ћ D:Д Đ:Ђ E:Е F:Ф G:Г H:Х I:И J:Ј K:К L:Л M:М N:Н O:О P:П R:Р S:С Š:Ш T:Т U:У V:В Z:З Ž:Ж'
    .split(' ')
    .flatMap(pair => {
      const [lat, cyr] = pair.split(':');
      return [[lat, cyr], [lat.toLowerCase(), cyr.toLowerCase()]];
    })
);

const cache = new Map<string, string>();

export function toCyrillic(text: string): string {
  const hit = cache.get(text);
  if (hit !== undefined) return hit;
  let out = text;
  for (const [lat, cyr] of DIGRAPHS) out = out.split(lat).join(cyr);
  out = [...out].map(ch => LETTERS[ch] ?? ch).join('');
  cache.set(text, out);
  return out;
}

import { Injectable, signal } from '@angular/core';
import { Territory } from '../census/census.model';
import { toCyrillic } from './translit';

/** Cyrillic and Latin share one Montenegrin dictionary; Cyrillic is transliterated from it. */
export type Lang = 'cyr' | 'lat' | 'en';
export const LANGUAGES: { code: Lang; short: string; name: string }[] = [
  { code: 'cyr', short: 'ЋИР', name: 'Ћирилица' },
  { code: 'lat', short: 'LAT', name: 'Latinica' },
  { code: 'en', short: 'EN', name: 'English' },
];

const ME = {
  appTitle: 'Popisna mapa',
  appSubtitle: 'Stanovništvo po opštinama kroz popise',
  menu: 'Meni',
  menuMap: 'Popisna mapa',
  menuCompare: 'Poređenje opština',
  menuSources: 'Izvori podataka',
  menuAbout: 'O projektu',
  soon: 'uskoro',
  language: 'Jezik i pismo',
  countrySelect: 'Država',
  census: 'Popis',
  censuses: 'Popisi',
  population: 'Stanovnika',
  area: 'Površina',
  density: 'Gustina',
  avgAge: 'Prosječna starost',
  yearsShort: 'god.',
  perKm2: 'st./km²',
  nationality: 'Nacionalna pripadnost',
  religion: 'Vjeroispovijest',
  motherTongue: 'Maternji jezik',
  sexAge: 'Pol i starost',
  male: 'Muškarci',
  female: 'Žene',
  ageGroups: 'Starosne grupe',
  noAgeData: 'Starosna struktura nije dostupna u podacima ovog popisa.',
  view: 'Prikaz na mapi',
  modeNationality: 'Nacionalnost',
  modeReligion: 'Vjera',
  modeLanguage: 'Jezik',
  modePopulation: 'Broj stanovnika',
  modeDensity: 'Gustina naseljenosti',
  modeChange: 'Promjena od {prev}.',
  absolute: 'apsolutna većina (> 50%)',
  relative: 'relativna većina',
  groupHint: 'Klikni na grupu da vidiš njen udio po opštinama.',
  backToMajority: 'Nazad na većinu',
  shareOf: 'Udio: {group}',
  notComparable: 'neuporedivo (promjena granica)',
  noCensusData: 'Podaci za ovaj popis još nisu dodati',
  changedBorders: 'Granice promijenjene od {prev}. – tada je obuhvatala i: {list}.',
  createdAfter: 'Opština nije postojala {prev}. – bila je dio opštine {parent}.',
  noPrevious: 'Nema ranijeg popisa za poređenje.',
  changedBordersNow: 'Granice promijenjene od {prev}. – sada obuhvata i: {list}.',
  today: 'danas {name}',
  topicUnavailable: 'Podaci po opštinama za ovaj popis još nisu pronađeni',
  topicNotAsked: 'Ovo pitanje nije postojalo u popisu {year}.',
  onlyPopulation: 'Za ovaj popis po opštinama postoji samo broj stanovnika.',
  censusNote: 'Napomena',
  home: 'Početna',
  regionTitle: 'Izaberi državu',
  regionLead: 'Rezultati popisa stanovništva po opštinama – nacionalna, vjerska i jezička struktura i broj stanovnika kroz sve popise od 1948. Klikni državu na mapi ili u listi.',
  compareTitle: 'Poređenje opština',
  compareHint: 'Izaberi opštine iz liste ili klikom na mapi (najviše {max}).',
  compareAdd: 'Uporedi',
  compareSelect: '+ Dodaj opštinu…',
  compareClose: 'Zatvori poređenje',
  compareRemove: 'Ukloni iz poređenja',
  compareFull: 'Izabrano je najviše {max} opštine – ukloni jednu da dodaš drugu.',
  compareBasics: 'Osnovni podaci',
  pinned: 'Izabrano',
  unpin: 'Poništi izbor',
  hint: 'Pređi mišem preko opštine, klikom je izabereš.',
  hintTouch: 'Dodirni opštinu za detalje.',
  details: 'Detalji',
  change: 'Promjena',
  loading: 'Učitavanje podataka…',
  loadError: 'Podaci nisu mogli biti učitani.',
  source: 'Izvor',
  areaNote: 'Površina: MONSTAT, Statistički godišnjak 2025 (Uprava za nekretnine); za Tuzi i Zetu privremena. Za ranije popise – zbir današnjih opština koje su tada bile u sastavu opštine.',
  areaNoteMk: 'Površina opština: izračunata iz granica na mapi, pa je malo manja od zvanične, koja uključuje jezera; ukupno za državu: Državni zavod za statistiku. Za 2021. – zbir opština koje su tada bile u sastavu opštine.',
  boundaries: 'Granice',
  data: 'Podaci',
  share: 'Kopiraj link',
  linkCopied: 'Link je kopiran',
  colCount: 'broj',
  colChange: 'promjena',
  colShare: 'udio',
  ppShort: 'p.p.',
  countChangeHint: 'za koliko se promijenio broj ljudi u grupi (npr. 19.906 → 3.662 = −81,6%).',
  changeHelpNa: 'poređenje nije moguće: kategorija nije postojala u jednom od popisa ili su se granice opštine u međuvremenu promijenile.',
  changeHelpToggle: 'Objašnjenje kolona promjene',
  countChangeShort: 'broj',
  ppHint: 'za koliko se promijenio procenat grupe u ukupnom stanovništvu, u procentnim poenima (npr. 28,7% → 32,9% = +4,2).',
  ofPopulation: 'stanovništva',
};

type Key = keyof typeof ME;

const EN: Record<Key, string> = {
  appTitle: 'Census Map',
  appSubtitle: 'Population by municipality across censuses',
  menu: 'Menu',
  menuMap: 'Census map',
  menuCompare: 'Compare municipalities',
  menuSources: 'Data sources',
  menuAbout: 'About',
  soon: 'soon',
  language: 'Language',
  countrySelect: 'Country',
  census: 'Census',
  censuses: 'Censuses',
  population: 'Population',
  area: 'Area',
  density: 'Density',
  avgAge: 'Average age',
  yearsShort: 'yrs',
  perKm2: 'per km²',
  nationality: 'Ethnicity',
  religion: 'Religion',
  motherTongue: 'Mother tongue',
  sexAge: 'Sex and age',
  male: 'Men',
  female: 'Women',
  ageGroups: 'Age groups',
  noAgeData: 'Age structure is not available for this census.',
  view: 'Map view',
  modeNationality: 'Ethnicity',
  modeReligion: 'Religion',
  modeLanguage: 'Language',
  modePopulation: 'Population',
  modeDensity: 'Population density',
  modeChange: 'Change since {prev}',
  absolute: 'absolute majority (> 50%)',
  relative: 'plurality',
  groupHint: 'Click a group to map its share by municipality.',
  backToMajority: 'Back to majority',
  shareOf: 'Share: {group}',
  notComparable: 'not comparable (border change)',
  noCensusData: 'Data for this census has not been added yet',
  changedBorders: 'Borders changed since {prev} – it then also included: {list}.',
  createdAfter: 'The municipality did not exist in {prev} – it was part of {parent}.',
  noPrevious: 'No earlier census to compare with.',
  changedBordersNow: 'Borders changed since {prev} – it now also includes: {list}.',
  today: 'today {name}',
  topicUnavailable: 'Municipal data for this census has not been found yet',
  topicNotAsked: 'The {year} census did not ask this question.',
  onlyPopulation: 'For this census only population figures exist by municipality.',
  censusNote: 'Note',
  home: 'Home',
  regionTitle: 'Choose a country',
  regionLead: 'Census results by municipality – ethnic, religious and language structure and population across every census since 1948. Click a country on the map or in the list.',
  compareTitle: 'Compare municipalities',
  compareHint: 'Pick municipalities from the list or click them on the map (up to {max}).',
  compareAdd: 'Compare',
  compareSelect: '+ Add a municipality…',
  compareClose: 'Close comparison',
  compareRemove: 'Remove from comparison',
  compareFull: 'Up to {max} municipalities – remove one to add another.',
  compareBasics: 'Basics',
  pinned: 'Selected',
  unpin: 'Clear selection',
  hint: 'Hover over a municipality, click to select it.',
  hintTouch: 'Tap a municipality for details.',
  details: 'Details',
  change: 'Change',
  loading: 'Loading data…',
  loadError: 'Could not load the data.',
  source: 'Source',
  areaNote: 'Area: MONSTAT, Statistical Yearbook 2025 (Real Estate Administration); provisional for Tuzi and Zeta. For earlier censuses – the sum of today’s municipalities that were part of it then.',
  areaNoteMk: 'Municipal areas are calculated from the boundaries on the map, so they are slightly smaller than the official ones, which include lakes; country total: State Statistical Office. For 2021 – the sum of the municipalities that were part of it then.',
  boundaries: 'Boundaries',
  data: 'Data',
  share: 'Copy link',
  linkCopied: 'Link copied',
  colCount: 'count',
  colChange: 'change',
  colShare: 'share',
  ppShort: 'pp',
  countChangeHint: 'how much the number of people in the group changed (e.g. 19,906 → 3,662 = −81.6%).',
  changeHelpNa: 'no comparison possible: the category was not recorded in one of the censuses, or the municipality’s borders changed in between.',
  changeHelpToggle: 'Explain the change columns',
  countChangeShort: 'count',
  ppHint: 'how much the group’s share of the population changed, in percentage points (e.g. 28.7% → 32.9% = +4.2).',
  ofPopulation: 'of the population',
};

/** English names of census groups and countries; Montenegrin uses the keys as they are. */
const NAMES_EN: Record<string, string> = {
  Crnogorci: 'Montenegrins',
  Srbi: 'Serbs',
  Bošnjaci: 'Bosniaks',
  Albanci: 'Albanians',
  Muslimani: 'Muslims',
  Hrvati: 'Croats',
  Jugosloveni: 'Yugoslavs',
  Ostali: 'Others',
  Neizjašnjeni: 'Undeclared',
  Pravoslavna: 'Orthodox',
  Islamska: 'Islam',
  Katolička: 'Catholic',
  'Ateisti i agnostici': 'Atheists & agnostics',
  Srpski: 'Serbian',
  Crnogorski: 'Montenegrin',
  Bosanski: 'Bosnian',
  Bošnjački: 'Bosniak',
  Albanski: 'Albanian',
  Srpskohrvatski: 'Serbo-Croatian',
  Hrvatski: 'Croatian',
  Makedonci: 'Macedonians',
  Turci: 'Turks',
  Romi: 'Roma',
  Vlasi: 'Vlachs',
  Hrišćani: 'Christians',
  Nepoznato: 'Unknown',
  Makedonski: 'Macedonian',
  Turski: 'Turkish',
  Romski: 'Romani',
  Vlaški: 'Vlach',
  'Crna Gora': 'Montenegro',
  Srbija: 'Serbia',
  'Bosna i Hercegovina': 'Bosnia and Herzegovina',
  Hrvatska: 'Croatia',
  'Sjeverna Makedonija': 'North Macedonia',
};

/** English versions of the per-census notes in popis-<year>.json (keyed by country and year). */
const CENSUS_NOTES_EN: Record<string, string> = {
  'me-1948': 'Population figures recalculated to the 2003 municipal borders (MONSTAT, Census 2003, Book 9). Ethnic composition for this census exists only by the districts (srez) of the time, so it is not shown.',
  'me-1953': 'Population figures recalculated to the 2003 municipal borders (MONSTAT, Census 2003, Book 9). The ethnic composition is an estimate: it was published for the smaller municipalities of the time, which are summed here into the 2003 municipalities and scaled to the official population (exact for Bar, Bijelo Polje, Budva, Kolašin, Mojkovac, Pljevlja, Plužine, Rožaje and Ulcinj). In 1953 Muslims could not declare themselves as a separate nation – they were recorded as Montenegrins, Serbs or “Yugoslavs – undecided”.',
  'me-1961': 'Andrijevica was part of the municipality of Ivangrad (today Berane). “Muslims” were recorded in 1961 as “Muslims in the ethnic sense”. For Titograd, MONSTAT’s Book 9 gives 100 more inhabitants (72,319; total 471,994) than the Federal Statistical Office publication used here.',
  'me-1971': 'Andrijevica was part of the municipality of Ivangrad (today Berane).',
  'me-1981': 'Andrijevica was part of the municipality of Ivangrad (today Berane).',
  'mk-2002': 'Only eight nationality groups were published by municipality (the rest are summed up as “Others”); religion and mother tongue by municipality are not in the State Statistical Office’s database.',
  'mk-2021': 'For 7.2% of the population the data were taken from administrative sources, so their nationality, religion and mother tongue are unknown. Drugovo, Oslomej, Vraneštica and Zajas were merged into Kičevo in 2013, so 2021 has 80 municipalities (2002: 84).',
  'me-1991': 'The 1991 census (methodology of the time) counts citizens temporarily working abroad as residents, so comparisons with 2003 should be taken with caution.',
};

const STORAGE_KEY = 'popis-lang';

@Injectable({ providedIn: 'root' })
export class I18n {
  readonly lang = signal<Lang>(this.restore());
  /** Cyrillic / English names of the selected country's municipalities, keyed by their Latin name. */
  private units = new Map<string, Territory>();

  constructor() {
    this.applyDocumentLang(this.lang());
  }

  /** Municipalities whose Cyrillic / English name is not the plain transliteration (North Macedonia). */
  registerNames(territories: Territory[]) {
    this.units = new Map(territories.filter(t => t.cirilica || t.engleski).map(t => [t.naziv, t]));
  }

  setLang(lang: Lang) {
    this.lang.set(lang);
    this.applyDocumentLang(lang);
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // storage unavailable (private mode) – the choice just isn't remembered
    }
  }

  t(key: Key, params: Record<string, string | number> = {}): string {
    const lang = this.lang();
    const text = (lang === 'en' ? EN : ME)[key].replace(/\{(\w+)\}/g, (_, p) => String(params[p] ?? ''));
    return lang === 'cyr' ? toCyrillic(text) : text;
  }

  /** A name from the data (municipality, census group, country) in the current script / language. */
  name(text: string): string {
    const lang = this.lang();
    const unit = this.units.get(text);
    if (lang === 'en') return unit?.engleski ?? NAMES_EN[text] ?? text;
    return lang === 'cyr' ? unit?.cirilica ?? toCyrillic(text) : text;
  }

  /** A census note from the data (written in Montenegrin) in the current language. */
  censusNote(country: string, year: number, text: string): string {
    if (this.lang() === 'en') return CENSUS_NOTES_EN[`${country}-${year}`] ?? text;
    return this.name(text);
  }

  num(value: number, decimals = 0): string {
    return value.toLocaleString(this.lang() === 'en' ? 'en-GB' : 'sr-Latn-ME', {
      minimumFractionDigits: decimals,
      maximumFractionDigits: decimals,
    });
  }

  pct(value: number, decimals = 1): string {
    return `${this.num(value, decimals)}%`;
  }

  signedPct(value: number, decimals = 1): string {
    return `${this.signed(value, decimals)}%`;
  }

  /** +4,2 / −1,3 / 0,0 – rounded first, so a tiny change never shows as "−0,0". */
  signed(value: number, decimals = 1): string {
    const rounded = Number(value.toFixed(decimals));
    return `${rounded > 0 ? '+' : rounded < 0 ? '−' : ''}${this.num(Math.abs(rounded), decimals)}`;
  }

  private applyDocumentLang(lang: Lang) {
    document.documentElement.lang = lang === 'en' ? 'en' : lang === 'cyr' ? 'sr-Cyrl-ME' : 'sr-Latn-ME';
  }

  private restore(): Lang {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'cyr' || saved === 'lat' || saved === 'en') return saved;
      if (saved === 'cg') return 'lat'; // value used by the first version
    } catch {
      // ignore
    }
    return 'cyr';
  }
}

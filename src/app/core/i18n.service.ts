import { Injectable, signal } from '@angular/core';

export type Lang = 'cg' | 'en';
export const LANGUAGES: { code: Lang; label: string; name: string }[] = [
  { code: 'cg', label: 'CG', name: 'Crnogorski' },
  { code: 'en', label: 'EN', name: 'English' },
];

const CG = {
  appTitle: 'Popisna mapa Crne Gore',
  appSubtitle: 'Stanovništvo po opštinama kroz popise',
  menu: 'Meni',
  menuMap: 'Popisna mapa',
  menuCompare: 'Poređenje opština',
  menuSources: 'Izvori podataka',
  menuAbout: 'O projektu',
  soon: 'uskoro',
  language: 'Jezik',
  census: 'Popis',
  censuses: 'Popisi',
  country: 'Crna Gora',
  population: 'Stanovnika',
  area: 'Površina',
  density: 'Gustina',
  avgAge: 'Prosječna starost',
  yearsShort: 'god.',
  perKm2: 'st./km²',
  nationality: 'Nacionalna pripadnost',
  religion: 'Vjeroispovijest',
  sexAge: 'Pol i starost',
  male: 'Muškarci',
  female: 'Žene',
  ageGroups: 'Starosne grupe',
  noAgeData: 'Starosna struktura nije dostupna u podacima ovog popisa.',
  view: 'Prikaz na mapi',
  modeNationality: 'Nacionalna većina',
  modeReligion: 'Vjerska većina',
  modePopulation: 'Broj stanovnika',
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
  pinned: 'Zakačeno',
  unpin: 'Otkači',
  hint: 'Pređi mišem preko opštine, klikom je zakačiš.',
  majority: 'Većina',
  change: 'Promjena',
  municipalities: 'opština',
  loading: 'Učitavanje podataka…',
  loadError: 'Podaci nisu mogli biti učitani.',
  source: 'Izvor',
  areaNote: 'Površina je približna, izračunata iz granica na mapi.',
  others: 'Ostali',
};

type Key = keyof typeof CG;

const EN: Record<Key, string> = {
  appTitle: 'Montenegro Census Map',
  appSubtitle: 'Population by municipality across censuses',
  menu: 'Menu',
  menuMap: 'Census map',
  menuCompare: 'Compare municipalities',
  menuSources: 'Data sources',
  menuAbout: 'About',
  soon: 'soon',
  language: 'Language',
  census: 'Census',
  censuses: 'Censuses',
  country: 'Montenegro',
  population: 'Population',
  area: 'Area',
  density: 'Density',
  avgAge: 'Average age',
  yearsShort: 'yrs',
  perKm2: 'per km²',
  nationality: 'Ethnicity',
  religion: 'Religion',
  sexAge: 'Sex and age',
  male: 'Men',
  female: 'Women',
  ageGroups: 'Age groups',
  noAgeData: 'Age structure is not available for this census.',
  view: 'Map view',
  modeNationality: 'Ethnic majority',
  modeReligion: 'Religious majority',
  modePopulation: 'Population',
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
  pinned: 'Pinned',
  unpin: 'Unpin',
  hint: 'Hover over a municipality, click to pin it.',
  majority: 'Majority',
  change: 'Change',
  municipalities: 'municipalities',
  loading: 'Loading data…',
  loadError: 'Could not load the data.',
  source: 'Source',
  areaNote: 'Area is approximate, computed from the map boundaries.',
  others: 'Others',
};

/** English names of census groups; Montenegrin uses the census keys as they are. */
const GROUPS_EN: Record<string, string> = {
  Crnogorci: 'Montenegrins',
  Srbi: 'Serbs',
  Bošnjaci: 'Bosniaks',
  Albanci: 'Albanians',
  Muslimani: 'Muslims',
  Hrvati: 'Croats',
  Ostali: 'Others',
  Pravoslavna: 'Orthodox',
  Islamska: 'Islam',
  Katolička: 'Catholic',
  'Ateisti i agnostici': 'Atheists & agnostics',
  'Crna Gora': 'Montenegro',
};

const STORAGE_KEY = 'popis-lang';

@Injectable({ providedIn: 'root' })
export class I18n {
  readonly lang = signal<Lang>(this.restore());

  setLang(lang: Lang) {
    this.lang.set(lang);
    document.documentElement.lang = lang === 'cg' ? 'sr-Latn-ME' : 'en';
    try {
      localStorage.setItem(STORAGE_KEY, lang);
    } catch {
      // storage unavailable (private mode) – the choice just isn't remembered
    }
  }

  t(key: Key, params: Record<string, string | number> = {}): string {
    const text = (this.lang() === 'en' ? EN : CG)[key];
    return text.replace(/\{(\w+)\}/g, (_, p) => String(params[p] ?? ''));
  }

  group(key: string): string {
    return this.lang() === 'en' ? GROUPS_EN[key] ?? key : key;
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
    return `${value > 0 ? '+' : value < 0 ? '−' : ''}${this.num(Math.abs(value), decimals)}%`;
  }

  private restore(): Lang {
    try {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved === 'cg' || saved === 'en') return saved;
    } catch {
      // ignore
    }
    return 'cg';
  }
}

import { lab } from 'd3-color';
import { interpolateRgb } from 'd3-interpolate';
import { schemePuBu, schemeReds } from 'd3-scale-chromatic';

export interface Share {
  naziv: string;
  broj: number;
  procenat: number;
}

export interface CensusEntity {
  /** Name at the time of the census (e.g. Titograd in 1981). */
  naziv: string;
  /** Today's name, when it differs. */
  danas?: string;
  stanovnika: number;
  /** null for censuses where the split by sex is not available (1948–1991). */
  muskarci: number | null;
  zene: number | null;
  prosjecnaStarost: number | null;
  starost: { '0-14': number; '15-64': number; '65+': number } | null;
  povrsinaKm2: number;
  gustina: number;
  nacionalnost: Share[];
  vjera: Share[];
  jezik: Share[];
}

export interface CensusYear {
  godina: number;
  izvor: string;
  /** Caveats for this census (recalculated borders, methodology…). */
  napomena?: string;
  drzava: CensusEntity;
  opstine: Record<string, CensusEntity>;
}

export interface YearData {
  year: number;
  census: CensusYear;
  geo: GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, { id: string; name: string; label: [number, number] }>;
}

/** Entry of public/data/<country>/teritorije.json. */
export interface Territory {
  id: string;
  naziv: string;
  /** Year the municipality was founded; absent = exists in every census with data. */
  osnovana?: number;
  /** Municipality it was part of before that. */
  izdvojenaIz?: string;
  /** Year the municipality was abolished (merged into another); absent = still exists. */
  ukinuta?: number;
  /** Municipality it was merged into. */
  pripojenaU?: string;
  /** Name in Cyrillic / English where it is not the transliteration of `naziv` (North Macedonia). */
  cirilica?: string;
  engleski?: string;
  /** Larger unit the municipality belongs to (the ten municipalities of the City of Skopje). */
  grad?: string;
}

/** public/data/<country>/teritorije.json */
export interface TerritoryRegistry {
  opstine: Territory[];
  /** Censuses whose figures were recalculated to later borders: { "1948": 2003 }. */
  teritorijaPopisa?: Record<string, number | string>;
}

export type Topic = 'nationality' | 'religion' | 'language';
export type MapMode = Topic | 'population' | 'density' | 'change';
export const TOPICS: Topic[] = ['nationality', 'religion', 'language'];

export const isTopic = (mode: MapMode): mode is Topic => (TOPICS as string[]).includes(mode);

// ------------------------------------------------------------------ groups & colours

export interface Group {
  key: string;
  color: string;
  /** Raw census categories that make up this group (names differ between censuses). */
  members: string[];
  /** Shown and mappable, but never counted as a majority (e.g. undeclared). */
  special?: boolean;
}

export const UNDECLARED_KEY = 'Neizjašnjeni';
const UNDECLARED_COLOR = '#a08c74';

/** Census groups of one country, per topic. */
export type CountryGroups = Record<Topic, Group[]>;

/** Montenegro */
const ME_GROUPS: CountryGroups = {
  nationality: [
    { key: 'Crnogorci', color: '#c8102e', members: ['Crnogorci'] },
    { key: 'Srbi', color: '#2b5ea7', members: ['Srbi'] },
    { key: 'Bošnjaci', color: '#2e8b57', members: ['Bošnjaci'] },
    { key: 'Albanci', color: '#e07b1a', members: ['Albanci'] },
    { key: 'Muslimani', color: '#159a8c', members: ['Muslimani'] },
    { key: 'Hrvati', color: '#7b4fb3', members: ['Hrvati'] },
    // a declared nationality in the censuses 1961–1991 (5,7% in 1981); in 1953 "Yugoslav, undecided"
    { key: 'Jugosloveni', color: '#d6619a', members: ['Jugosloveni', 'Jugosloveni – neopredijeljeni'] },
    {
      key: UNDECLARED_KEY, color: UNDECLARED_COLOR, special: true,
      members: ['Ne želi da se izjasni', 'Neizjašnjeni i neopredijeljeni'],
    },
  ],
  religion: [
    { key: 'Pravoslavna', color: '#c9a227', members: ['Pravoslavna'] },
    // 2011 recorded "Islamska" and "Muslimanska" separately
    { key: 'Islamska', color: '#2e8b57', members: ['Islamska', 'Muslimanska'] },
    { key: 'Katolička', color: '#6d5bd0', members: ['Katolička'] },
    // 2003 asked "not a believer" instead of atheist/agnostic
    { key: 'Ateisti i agnostici', color: '#6b7280', members: ['Ateisti', 'Agnostici', 'Nije vjernik'] },
    { key: UNDECLARED_KEY, color: UNDECLARED_COLOR, special: true, members: ['Ne želi da se izjasni'] },
  ],
  language: [
    { key: 'Srpski', color: '#2b5ea7', members: ['Srpski'] },
    { key: 'Crnogorski', color: '#c8102e', members: ['Crnogorski'] },
    { key: 'Bosanski', color: '#2e8b57', members: ['Bosanski'] },
    // deliberately not green: a light Bosnian tint (relative majority) would look the same
    { key: 'Bošnjački', color: '#d4a017', members: ['Bošnjački'] },
    { key: 'Albanski', color: '#e07b1a', members: ['Albanski'] },
    { key: 'Srpskohrvatski', color: '#159a8c', members: ['Srpskohrvatski', 'Srpsko-Hrvatski', 'Hrvatsko-srpski', 'Hrvatsko-Srpski'] },
    { key: 'Hrvatski', color: '#7b4fb3', members: ['Hrvatski'] },
    // 2003 published undeclared and unknown together
    {
      key: UNDECLARED_KEY, color: UNDECLARED_COLOR, special: true,
      members: ['Ne želi da se izjasni', 'Neizjašnjeni i nepoznato'],
    },
  ],
};

export const UNKNOWN_KEY = 'Nepoznato';
const UNKNOWN_COLOR = '#7d8a99';

/** North Macedonia. The 2021 census took the answers of some people from administrative registers. */
const MK_UNKNOWN: Group = {
  key: UNKNOWN_KEY, color: UNKNOWN_COLOR, special: true, members: ['Nepoznato', 'Podaci iz administrativnih izvora'],
};
const MK_UNDECLARED: Group = { key: UNDECLARED_KEY, color: UNDECLARED_COLOR, special: true, members: ['Neizjašnjeni'] };

const MK_GROUPS: CountryGroups = {
  nationality: [
    { key: 'Makedonci', color: '#d62828', members: ['Makedonci'] },
    { key: 'Albanci', color: '#e07b1a', members: ['Albanci'] },
    { key: 'Turci', color: '#159a8c', members: ['Turci'] },
    { key: 'Romi', color: '#7b4fb3', members: ['Romi'] },
    { key: 'Vlasi', color: '#8c6d31', members: ['Vlasi'] },
    { key: 'Srbi', color: '#2b5ea7', members: ['Srbi'] },
    { key: 'Bošnjaci', color: '#2e8b57', members: ['Bošnjaci'] },
    MK_UNDECLARED,
    MK_UNKNOWN,
  ],
  religion: [
    { key: 'Pravoslavna', color: '#c9a227', members: ['Pravoslavna'] },
    { key: 'Islamska', color: '#2e8b57', members: ['Islamska'] },
    // "Christians" without a denomination: 13% in 2021
    { key: 'Hrišćani', color: '#4a90b8', members: ['Hrišćani'] },
    { key: 'Katolička', color: '#6d5bd0', members: ['Katolička'] },
    { key: 'Ateisti i agnostici', color: '#6b7280', members: ['Ateisti'] },
    MK_UNDECLARED,
    MK_UNKNOWN,
  ],
  language: [
    { key: 'Makedonski', color: '#d62828', members: ['Makedonski'] },
    { key: 'Albanski', color: '#e07b1a', members: ['Albanski'] },
    { key: 'Turski', color: '#159a8c', members: ['Turski'] },
    { key: 'Romski', color: '#7b4fb3', members: ['Romski'] },
    { key: 'Vlaški', color: '#8c6d31', members: ['Vlaški'] },
    { key: 'Srpski', color: '#2b5ea7', members: ['Srpski'] },
    { key: 'Bošnjački', color: '#2e8b57', members: ['Bošnjački'] },
    MK_UNKNOWN,
  ],
};

const GROUPS: Record<string, CountryGroups> = { me: ME_GROUPS, mk: MK_GROUPS };

export const OTHER_KEY = 'Ostali';
export const OTHER_COLOR = '#c4c9d0';
export const NO_DATA_COLOR = '#dfe3e8';

export const groupsFor = (country: string, topic: Topic): Group[] => GROUPS[country][topic];

const listFor = (entity: CensusEntity, topic: Topic): Share[] =>
  topic === 'nationality' ? entity.nacionalnost : topic === 'religion' ? entity.vjera : entity.jezik;

export interface GroupShare {
  key: string;
  color: string;
  broj: number;
  procenat: number;
  special?: boolean;
}

/**
 * Collapses raw census categories into display groups: regular groups by size,
 * then special ones (undeclared), then "Ostali" (everything else).
 */
export function groupShares(entity: CensusEntity, topic: Topic, country: string): GroupShare[] {
  const list = listFor(entity, topic);
  const total = entity.stanovnika;
  const shares = groupsFor(country, topic).map(g => {
    const broj = list.filter(s => g.members.includes(s.naziv)).reduce((a, s) => a + s.broj, 0);
    return { key: g.key, color: g.color, broj, procenat: (broj / total) * 100, special: !!g.special };
  });
  const rest = total - shares.reduce((a, s) => a + s.broj, 0);
  return [
    ...shares.filter(s => !s.special).sort((a, b) => b.broj - a.broj),
    ...shares.filter(s => s.special),
    { key: OTHER_KEY, color: OTHER_COLOR, broj: rest, procenat: (rest / total) * 100, special: true },
  ];
}

export function majority(shares: GroupShare[]): GroupShare {
  return shares.filter(s => !s.special).reduce((a, b) => (b.broj > a.broj ? b : a));
}

export const lighten = (color: string, amount: number) => interpolateRgb(color, '#ffffff')(amount);

/** Absolute majority gets the full colour, a relative majority a lighter tint. */
export const majorityColor = (m: GroupShare) => (m.procenat > 50 ? m.color : lighten(m.color, 0.5));

/** Pale fills need a dark outline, otherwise the borders disappear into the background. */
export const isLight = (color: string) => lab(color).l > 80;

// ------------------------------------------------------------------ classed scales

export interface Scale {
  /** Lower bounds of every class after the first. */
  breaks: number[];
  colors: string[];
}

export const binIndex = (value: number, breaks: number[]) => breaks.filter(b => value >= b).length;

export const POPULATION_SCALE: Scale = {
  breaks: [5000, 10000, 20000, 40000, 80000],
  colors: [...schemeReds[6]],
};

/** Inhabitants per km² (Plužine ≈ 2.5 … Tivat ≈ 360). */
export const DENSITY_SCALE: Scale = {
  breaks: [10, 25, 50, 100, 200],
  colors: [...schemePuBu[6]],
};

export const CHANGE_SCALE: Scale = {
  breaks: [-20, -10, -5, 0, 5],
  colors: ['#b2182b', '#d6604d', '#f4a582', '#fbe3d6', '#b8d5ea', '#4393c3'],
};

/** Share of one group: even the lowest class stays clearly tinted. */
export const shareScale = (color: string): Scale => ({
  breaks: [5, 15, 30, 50, 70],
  colors: [0.8, 0.64, 0.48, 0.32, 0.16, 0].map(t => lighten(color, t)),
});

export type Comparison =
  | { status: 'none' }
  | { status: 'same'; entity: CensusEntity }
  /** Same municipality, different territory: `before` = parts it had then but not now, `now` = the reverse. */
  | { status: 'changed'; entity: CensusEntity; before: string[]; now: string[] }
  | { status: 'created'; parent: string };

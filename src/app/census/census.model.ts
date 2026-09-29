import { interpolateRgb, schemeReds } from 'd3';

export interface Share {
  naziv: string;
  broj: number;
  procenat: number;
}

export interface CensusEntity {
  naziv: string;
  stanovnika: number;
  muskarci: number;
  zene: number;
  prosjecnaStarost: number | null;
  starost: { '0-14': number; '15-64': number; '65+': number } | null;
  povrsinaKm2: number;
  gustina: number;
  nacionalnost: Share[];
  vjera: Share[];
}

export interface CensusYear {
  godina: number;
  izvor: string;
  drzava: CensusEntity;
  opstine: Record<string, CensusEntity>;
}

export interface YearData {
  year: number;
  census: CensusYear;
  geo: GeoJSON.FeatureCollection<GeoJSON.Polygon | GeoJSON.MultiPolygon, { id: string; name: string; label: [number, number] }>;
}

/** Every census held in Montenegro since WWII. Only some of them have data loaded yet. */
export const CENSUS_YEARS = [1948, 1953, 1961, 1971, 1981, 1991, 2003, 2011, 2023];
export const AVAILABLE_YEARS = [2011, 2023];

export type MapMode = 'nationality' | 'religion' | 'population' | 'change';
export type Topic = 'nationality' | 'religion';

// ------------------------------------------------------------------ groups & colours

export interface Group {
  key: string;
  color: string;
  /** Raw census categories that make up this group. */
  members: string[];
}

export const NATIONALITY_GROUPS: Group[] = [
  { key: 'Crnogorci', color: '#c8102e', members: ['Crnogorci'] },
  { key: 'Srbi', color: '#2b5ea7', members: ['Srbi'] },
  { key: 'Bošnjaci', color: '#2e8b57', members: ['Bošnjaci'] },
  { key: 'Albanci', color: '#e07b1a', members: ['Albanci'] },
  { key: 'Muslimani', color: '#159a8c', members: ['Muslimani'] },
  { key: 'Hrvati', color: '#7b4fb3', members: ['Hrvati'] },
];

export const RELIGION_GROUPS: Group[] = [
  { key: 'Pravoslavna', color: '#c9a227', members: ['Pravoslavna'] },
  // 2011 recorded "Islamska" and "Muslimanska" separately
  { key: 'Islamska', color: '#2e8b57', members: ['Islamska', 'Muslimanska'] },
  { key: 'Katolička', color: '#6d5bd0', members: ['Katolička'] },
  { key: 'Ateisti i agnostici', color: '#6b7280', members: ['Ateisti', 'Agnostici'] },
];

export const OTHER_KEY = 'Ostali';
export const OTHER_COLOR = '#c4c9d0';
export const NO_DATA_COLOR = '#e6e8eb';

export const groupsFor = (topic: Topic) => (topic === 'nationality' ? NATIONALITY_GROUPS : RELIGION_GROUPS);

export interface GroupShare {
  key: string;
  color: string;
  broj: number;
  procenat: number;
}

/** Collapses raw census categories into display groups plus "Ostali" (everything else, incl. undeclared). */
export function groupShares(entity: CensusEntity, topic: Topic): GroupShare[] {
  const list = topic === 'nationality' ? entity.nacionalnost : entity.vjera;
  const total = entity.stanovnika;
  const shares = groupsFor(topic).map(g => {
    const broj = list.filter(s => g.members.includes(s.naziv)).reduce((a, s) => a + s.broj, 0);
    return { key: g.key, color: g.color, broj, procenat: (broj / total) * 100 };
  });
  const rest = total - shares.reduce((a, s) => a + s.broj, 0);
  return [
    ...shares.sort((a, b) => b.broj - a.broj),
    { key: OTHER_KEY, color: OTHER_COLOR, broj: rest, procenat: (rest / total) * 100 },
  ];
}

export function majority(shares: GroupShare[]): GroupShare {
  return shares.filter(s => s.key !== OTHER_KEY).reduce((a, b) => (b.broj > a.broj ? b : a));
}

export const lighten = (color: string, amount: number) => interpolateRgb(color, '#ffffff')(amount);

/** Absolute majority gets the full colour, a relative majority a lighter tint. */
export const majorityColor = (m: GroupShare) => (m.procenat > 50 ? m.color : lighten(m.color, 0.5));

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

export const CHANGE_SCALE: Scale = {
  breaks: [-20, -10, -5, 0, 5],
  colors: ['#b2182b', '#d6604d', '#f4a582', '#fbe3d6', '#b8d5ea', '#4393c3'],
};

export const shareScale = (color: string): Scale => ({
  breaks: [5, 15, 30, 50, 70],
  colors: [0.92, 0.78, 0.6, 0.4, 0.18, 0].map(t => lighten(color, t)),
});

// ------------------------------------------------------------------ territorial changes

/**
 * Municipalities created since the previous census, relative to the year in the key.
 * `split` lists what has been carved out of an existing municipality, `createdFrom`
 * names the municipality a new one used to belong to.
 */
export const TERRITORIAL_CHANGES: Record<number, { split: Record<string, string[]>; createdFrom: Record<string, string> }> = {
  2023: {
    split: { ME03: ['ME23'], ME13: ['ME22'], ME16: ['ME24', 'ME25'] },
    createdFrom: { ME22: 'ME13', ME23: 'ME03', ME24: 'ME16', ME25: 'ME16' },
  },
};

export type Comparison =
  | { status: 'none' }
  | { status: 'same'; entity: CensusEntity }
  | { status: 'changed'; entity: CensusEntity; splitOff: string[] }
  | { status: 'created'; parent: string };

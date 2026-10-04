import { lab } from 'd3-color';
import { interpolateRgb } from 'd3-interpolate';
import { schemePuBu, schemeReds } from 'd3-scale-chromatic';

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
  jezik: Share[];
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

/** Entry of public/data/<country>/teritorije.json. */
export interface Territory {
  id: string;
  naziv: string;
  /** Year the municipality was founded; absent = exists in every census with data. */
  osnovana?: number;
  /** Municipality it was part of before that. */
  izdvojenaIz?: string;
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

export const NATIONALITY_GROUPS: Group[] = [
  { key: 'Crnogorci', color: '#c8102e', members: ['Crnogorci'] },
  { key: 'Srbi', color: '#2b5ea7', members: ['Srbi'] },
  { key: 'Bošnjaci', color: '#2e8b57', members: ['Bošnjaci'] },
  { key: 'Albanci', color: '#e07b1a', members: ['Albanci'] },
  { key: 'Muslimani', color: '#159a8c', members: ['Muslimani'] },
  { key: 'Hrvati', color: '#7b4fb3', members: ['Hrvati'] },
  {
    key: UNDECLARED_KEY, color: UNDECLARED_COLOR, special: true,
    members: ['Ne želi da se izjasni', 'Neizjašnjeni i neopredijeljeni'],
  },
];

export const RELIGION_GROUPS: Group[] = [
  { key: 'Pravoslavna', color: '#c9a227', members: ['Pravoslavna'] },
  // 2011 recorded "Islamska" and "Muslimanska" separately
  { key: 'Islamska', color: '#2e8b57', members: ['Islamska', 'Muslimanska'] },
  { key: 'Katolička', color: '#6d5bd0', members: ['Katolička'] },
  // 2003 asked "not a believer" instead of atheist/agnostic
  { key: 'Ateisti i agnostici', color: '#6b7280', members: ['Ateisti', 'Agnostici', 'Nije vjernik'] },
  { key: UNDECLARED_KEY, color: UNDECLARED_COLOR, special: true, members: ['Ne želi da se izjasni'] },
];

export const LANGUAGE_GROUPS: Group[] = [
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
];

export const OTHER_KEY = 'Ostali';
export const OTHER_COLOR = '#c4c9d0';
export const NO_DATA_COLOR = '#dfe3e8';

export const groupsFor = (topic: Topic): Group[] =>
  topic === 'nationality' ? NATIONALITY_GROUPS : topic === 'religion' ? RELIGION_GROUPS : LANGUAGE_GROUPS;

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
export function groupShares(entity: CensusEntity, topic: Topic): GroupShare[] {
  const list = listFor(entity, topic);
  const total = entity.stanovnika;
  const shares = groupsFor(topic).map(g => {
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
  | { status: 'changed'; entity: CensusEntity; splitOff: string[] }
  | { status: 'created'; parent: string };

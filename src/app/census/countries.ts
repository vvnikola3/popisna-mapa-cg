import { Topic } from './census.model';

export type CountryCode = 'me' | 'rs' | 'ba' | 'mk' | 'hr';

export interface Country {
  code: CountryCode;
  /** Name in Latin script; other scripts/languages come from the i18n service. */
  name: string;
  available: boolean;
  /** Every census held since WWII – shown on the timeline. */
  censusYears: number[];
  /** Census years with data in public/data/<code>/. */
  dataYears: number[];
  /** Censuses whose questionnaire did not ask about a topic (as opposed to data not found yet). */
  notAsked?: Partial<Record<Topic, number[]>>;
}

export const COUNTRIES: Country[] = [
  {
    code: 'me',
    name: 'Crna Gora',
    available: true,
    censusYears: [1948, 1953, 1961, 1971, 1981, 1991, 2003, 2011, 2023],
    dataYears: [1948, 1953, 1961, 1971, 1981, 1991, 2003, 2011, 2023],
    // Savezni zavod za statistiku, Popis 1981 – uporedni pregled obilježja po popisima
    notAsked: { religion: [1961, 1971, 1981], language: [1948] },
  },
  { code: 'rs', name: 'Srbija', available: false, censusYears: [], dataYears: [] },
  { code: 'ba', name: 'Bosna i Hercegovina', available: false, censusYears: [], dataYears: [] },
  { code: 'hr', name: 'Hrvatska', available: false, censusYears: [], dataYears: [] },
  { code: 'mk', name: 'Sjeverna Makedonija', available: false, censusYears: [], dataYears: [] },
];

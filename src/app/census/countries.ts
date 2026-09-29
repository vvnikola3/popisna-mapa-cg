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
}

export const COUNTRIES: Country[] = [
  {
    code: 'me',
    name: 'Crna Gora',
    available: true,
    censusYears: [1948, 1953, 1961, 1971, 1981, 1991, 2003, 2011, 2023],
    dataYears: [2003, 2011, 2023],
  },
  { code: 'rs', name: 'Srbija', available: false, censusYears: [], dataYears: [] },
  { code: 'ba', name: 'Bosna i Hercegovina', available: false, censusYears: [], dataYears: [] },
  { code: 'hr', name: 'Hrvatska', available: false, censusYears: [], dataYears: [] },
  { code: 'mk', name: 'Sjeverna Makedonija', available: false, censusYears: [], dataYears: [] },
];

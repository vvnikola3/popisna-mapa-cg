import { Injectable, computed, signal } from '@angular/core';
import { COUNTRIES, Country, CountryCode } from './countries';
import {
  CensusEntity, CensusYear, Comparison, MapMode, OTHER_KEY, Territory, TerritoryRegistry, Topic, YearData,
  groupShares, isTopic
} from './census.model';

/** How a group changed since the previous census. */
export interface GroupChange {
  /** Change of its share, in percentage points (28,7% → 32,9% = +4,2). */
  share: number;
  /** Change of its head count, in % (19.906 → 3.662 = −81,6%); null when it was 0 before. */
  count: number | null;
}

/** Shared UI state: selected country and census, map mode, hovered / pinned municipality. */
@Injectable({ providedIn: 'root' })
export class CensusStore {
  readonly country = signal<Country>(COUNTRIES[0]);
  readonly years = signal<Record<number, YearData>>({});
  readonly territories = signal<Territory[]>([]);
  /** Censuses whose figures refer to later borders (e.g. 1948 recalculated to 2003). */
  private readonly territoryYears = signal<Record<string, number | string>>({});
  readonly error = signal(false);

  readonly year = signal(COUNTRIES[0].dataYears[COUNTRIES[0].dataYears.length - 1]);
  readonly mode = signal<MapMode>('nationality');
  /** Group whose share is mapped instead of the majority (e.g. "Srbi"), or null. */
  readonly focusGroup = signal<string | null>(null);
  readonly hoveredId = signal<string | null>(null);
  readonly pinnedId = signal<string | null>(null);

  readonly current = computed(() => this.years()[this.year()] ?? null);
  readonly previousYear = computed(() => {
    const years = this.country().dataYears;
    const i = years.indexOf(this.year());
    return i > 0 ? years[i - 1] : null;
  });
  readonly previous = computed(() => {
    const y = this.previousYear();
    return y ? this.years()[y] ?? null : null;
  });

  /** Municipality shown in the side panel: hovered first, then pinned, null = whole country. */
  readonly activeId = computed(() => this.hoveredId() ?? this.pinnedId());

  private readonly byId = computed(() => Object.fromEntries(this.territories().map(t => [t.id, t])));

  constructor() {
    this.load(this.country());
  }

  private async load(country: Country) {
    const base = `data/${country.code}`;
    try {
      const [registry, ...loaded] = await Promise.all([
        fetch(`${base}/teritorije.json`).then(r => r.json() as Promise<TerritoryRegistry>),
        ...country.dataYears.map(async year => {
          const [census, geo] = await Promise.all([
            fetch(`${base}/popis-${year}.json`).then(r => r.json() as Promise<CensusYear>),
            fetch(`${base}/geo-${year}.json`).then(r => r.json()),
          ]);
          return { year, census, geo } as YearData;
        }),
      ]);
      this.territories.set(registry.opstine);
      this.territoryYears.set(registry.teritorijaPopisa ?? {});
      this.years.set(Object.fromEntries(loaded.map(d => [d.year, d])));
    } catch (e) {
      console.error('Could not load census data', e);
      this.error.set(true);
    }
  }

  selectCountry(code: CountryCode) {
    const country = COUNTRIES.find(c => c.code === code);
    if (!country?.available || country === this.country()) return;
    this.country.set(country);
    this.years.set({});
    this.year.set(country.dataYears[country.dataYears.length - 1]);
    this.pinnedId.set(null);
    this.hoveredId.set(null);
    this.load(country);
  }

  selectYear(year: number) {
    if (!this.country().dataYears.includes(year) || year === this.year()) return;
    this.year.set(year);
    this.hoveredId.set(null);
    this.pinnedId.set(null);
    const mode = this.mode();
    // (before the data has loaded, UrlState re-checks the topic once it arrives)
    const loaded = !!this.current();
    if ((mode === 'change' && !this.previousYear()) || (loaded && isTopic(mode) && !this.hasTopic(mode))) {
      this.setMode(this.hasTopic('nationality') ? 'nationality' : 'population');
    }
    // a group this census did not record (Bošnjaci in 1981) would map as 0% everywhere
    const focus = this.focusGroup();
    const topic = this.mode();
    if (loaded && focus && isTopic(topic) && !this.recorded(this.current(), topic, focus)) this.focusGroup.set(null);
  }

  /** Whether a census has data for a topic (1948/1953 have no ethnicity, religion only from 1991…). */
  hasTopic(topic: Topic, data: YearData | null = this.current()): boolean {
    if (!data) return false;
    const e = data.census.drzava;
    return (topic === 'nationality' ? e.nacionalnost : topic === 'religion' ? e.vjera : e.jezik).length > 0;
  }

  setMode(mode: MapMode) {
    this.mode.set(mode);
    this.focusGroup.set(null);
  }

  toggleFocus(group: string) {
    this.focusGroup.update(g => (g === group ? null : group));
  }

  /** Shows one group's share on the map, switching to its topic (pie slice / table row click). */
  selectGroup(topic: Topic, group: string) {
    if (group === OTHER_KEY) return; // "Ostali" is a remainder, not a group that can be mapped
    if (this.mode() === topic && this.focusGroup() === group) {
      this.focusGroup.set(null);
      return;
    }
    this.setMode(topic);
    this.focusGroup.set(group);
  }

  togglePin(id: string) {
    this.pinnedId.update(p => (p === id ? null : id));
  }

  entity(id: string | null): CensusEntity | null {
    const census = this.current()?.census;
    if (!census) return null;
    return id ? census.opstine[id] ?? null : census.drzava;
  }

  /** The borders a census' figures refer to (usually the census year itself). */
  territoryYear(year: number): number {
    return Number(this.territoryYears()[year] ?? year);
  }

  /** The municipality that held `id`'s territory in a census (itself if it already existed). */
  holderIn(id: string, year: number): string {
    const territory = this.territoryYear(year);
    const byId = this.byId();
    let unit = byId[id];
    while (unit?.osnovana && unit.osnovana > territory && unit.izdvojenaIz) unit = byId[unit.izdvojenaIz];
    return unit?.id ?? id;
  }

  /** Today's municipalities whose territory belonged to `id` in a census. */
  private coverage(id: string, year: number): string[] {
    return this.territories().map(t => t.id).filter(t => this.holderIn(t, year) === id);
  }

  /** The same municipality in the previous census, and whether its territory changed since. */
  compare(id: string | null): Comparison {
    const prevYear = this.previousYear();
    const prev = this.previous()?.census;
    const current = this.current()?.census;
    if (!prevYear || !prev || !current) return { status: 'none' };
    if (!id) return { status: 'same', entity: prev.drzava };

    const entity = prev.opstine[id];
    if (!entity) {
      const parent = this.holderIn(id, prevYear);
      return { status: 'created', parent: prev.opstine[parent]?.naziv ?? parent };
    }

    const then = this.coverage(id, prevYear);
    const now = this.coverage(id, this.year());
    const names = (parts: string[], year: number, census: CensusYear) =>
      [...new Set(parts.map(p => this.holderIn(p, year)))].map(h => census.opstine[h]?.naziv ?? h);
    const before = names(then.filter(p => !now.includes(p)), this.year(), current);
    const added = names(now.filter(p => !then.includes(p)), prevYear, prev);
    return before.length || added.length
      ? { status: 'changed', entity, before, now: added }
      : { status: 'same', entity };
  }

  /** Population change in % since the previous census, or null when not comparable. */
  change(id: string | null): number | null {
    const now = this.entity(id);
    const cmp = this.compare(id);
    if (!now || cmp.status !== 'same') return null;
    return ((now.stanovnika - cmp.entity.stanovnika) / cmp.entity.stanovnika) * 100;
  }

  /** Change of a group's share since the previous census, in percentage points (null when not comparable). */
  groupChange(id: string | null, topic: Topic, group: string): GroupChange | null {
    const now = this.entity(id);
    const cmp = this.compare(id);
    if (!now || cmp.status !== 'same' || !this.hasTopic(topic, this.previous())) return null;
    if (!this.recorded(this.previous(), topic, group)) return null;
    const current = groupShares(now, topic).find(s => s.key === group);
    const previous = groupShares(cmp.entity, topic).find(s => s.key === group);
    if (!current || !previous) return null;
    return {
      share: current.procenat - previous.procenat,
      count: previous.broj > 0 ? ((current.broj - previous.broj) / previous.broj) * 100 : null,
    };
  }

  /**
   * Whether a census recorded the group at all. Some categories were not offered
   * in every census (e.g. "Srpskohrvatski" as a mother tongue did not exist in 2003),
   * so a zero there means "not asked", not "nobody".
   */
  recorded(data: YearData | null, topic: Topic, group: string): boolean {
    if (!data) return false;
    if (group === OTHER_KEY) return true;
    return (groupShares(data.census.drzava, topic).find(s => s.key === group)?.broj ?? 0) > 0;
  }
}

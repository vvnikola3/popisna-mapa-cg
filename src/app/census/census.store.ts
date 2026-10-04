import { Injectable, computed, signal } from '@angular/core';
import { COUNTRIES, Country, CountryCode } from './countries';
import {
  CensusEntity, CensusYear, Comparison, MapMode, OTHER_KEY, Territory, Topic, YearData, groupShares
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
      const [territories, ...loaded] = await Promise.all([
        fetch(`${base}/teritorije.json`).then(r => r.json()),
        ...country.dataYears.map(async year => {
          const [census, geo] = await Promise.all([
            fetch(`${base}/popis-${year}.json`).then(r => r.json() as Promise<CensusYear>),
            fetch(`${base}/geo-${year}.json`).then(r => r.json()),
          ]);
          return { year, census, geo } as YearData;
        }),
      ]);
      this.territories.set(territories.opstine);
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
    if (this.mode() === 'change' && !this.previousYear()) this.mode.set('nationality');
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

  /** The municipality that held `id`'s territory in `year` (itself if it already existed). */
  holderIn(id: string, year: number): string {
    const byId = this.byId();
    let unit = byId[id];
    while (unit?.osnovana && unit.osnovana > year && unit.izdvojenaIz) unit = byId[unit.izdvojenaIz];
    return unit?.id ?? id;
  }

  /** The same territory in the previous census, taking municipality splits into account. */
  compare(id: string | null): Comparison {
    const prevYear = this.previousYear();
    const prev = this.previous()?.census;
    if (!prevYear || !prev) return { status: 'none' };
    if (!id) return { status: 'same', entity: prev.drzava };

    const unit = this.byId()[id];
    if (unit?.osnovana && unit.osnovana > prevYear) {
      const parent = this.holderIn(id, prevYear);
      return { status: 'created', parent: prev.opstine[parent]?.naziv ?? parent };
    }

    const entity = prev.opstine[id];
    if (!entity) return { status: 'none' };
    const splitOff = this.territories()
      .filter(t => t.osnovana && t.osnovana > prevYear && t.osnovana <= this.year() && this.holderIn(t.id, prevYear) === id)
      .map(t => this.current()?.census.opstine[t.id]?.naziv ?? t.naziv);
    return splitOff.length ? { status: 'changed', entity, splitOff } : { status: 'same', entity };
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
    if (!now || cmp.status !== 'same' || !this.recorded(this.previous(), topic, group)) return null;
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

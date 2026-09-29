import { Injectable, computed, signal } from '@angular/core';
import {
  AVAILABLE_YEARS, CensusEntity, CensusYear, Comparison, MapMode, TERRITORIAL_CHANGES, YearData
} from './census.model';

/** Shared UI state: selected census, map mode and which municipality is hovered or pinned. */
@Injectable({ providedIn: 'root' })
export class CensusStore {
  readonly years = signal<Record<number, YearData>>({});
  readonly error = signal(false);

  readonly year = signal(AVAILABLE_YEARS[AVAILABLE_YEARS.length - 1]);
  readonly mode = signal<MapMode>('nationality');
  /** Group whose share is mapped instead of the majority (e.g. "Srbi"), or null. */
  readonly focusGroup = signal<string | null>(null);
  readonly hoveredId = signal<string | null>(null);
  readonly pinnedId = signal<string | null>(null);

  readonly current = computed(() => this.years()[this.year()] ?? null);
  readonly previousYear = computed(() => {
    const i = AVAILABLE_YEARS.indexOf(this.year());
    return i > 0 ? AVAILABLE_YEARS[i - 1] : null;
  });
  readonly previous = computed(() => {
    const y = this.previousYear();
    return y ? this.years()[y] ?? null : null;
  });

  /** Municipality shown in the side panel: hovered first, then pinned, null = whole country. */
  readonly activeId = computed(() => this.hoveredId() ?? this.pinnedId());

  constructor() {
    this.loadAll();
  }

  private async loadAll() {
    try {
      const loaded = await Promise.all(AVAILABLE_YEARS.map(async year => {
        const [census, geo] = await Promise.all([
          fetch(`data/popis-${year}.json`).then(r => r.json() as Promise<CensusYear>),
          fetch(`data/geo-${year}.json`).then(r => r.json()),
        ]);
        return { year, census, geo } as YearData;
      }));
      this.years.set(Object.fromEntries(loaded.map(d => [d.year, d])));
    } catch (e) {
      console.error('Could not load census data', e);
      this.error.set(true);
    }
  }

  selectYear(year: number) {
    if (!AVAILABLE_YEARS.includes(year) || year === this.year()) return;
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

  togglePin(id: string) {
    this.pinnedId.update(p => (p === id ? null : id));
  }

  entity(id: string | null): CensusEntity | null {
    const census = this.current()?.census;
    if (!census) return null;
    return id ? census.opstine[id] ?? null : census.drzava;
  }

  /** The same territory in the previous census, taking municipality splits into account. */
  compare(id: string | null): Comparison {
    const prev = this.previous()?.census;
    if (!prev) return { status: 'none' };
    if (!id) return { status: 'same', entity: prev.drzava };

    const changes = TERRITORIAL_CHANGES[this.year()];
    const parent = changes?.createdFrom[id];
    if (parent) return { status: 'created', parent: prev.opstine[parent]?.naziv ?? parent };

    const entity = prev.opstine[id];
    if (!entity) return { status: 'none' };
    const split = changes?.split[id];
    if (split) {
      const names = split.map(s => this.current()?.census.opstine[s]?.naziv ?? s);
      return { status: 'changed', entity, splitOff: names };
    }
    return { status: 'same', entity };
  }

  /** Population change in % since the previous census, or null when not comparable. */
  change(id: string | null): number | null {
    const now = this.entity(id);
    const cmp = this.compare(id);
    if (!now || cmp.status !== 'same') return null;
    return ((now.stanovnika - cmp.entity.stanovnika) / cmp.entity.stanovnika) * 100;
  }
}

import { Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, inject, signal } from '@angular/core';
import { CensusStore } from '../census/census.store';
import { GroupShare, OTHER_KEY, TOPICS, Topic } from '../census/census.model';
import { I18n } from '../core/i18n.service';
import { PieChartComponent } from './pie-chart.component';
import { CompareComponent } from './compare.component';

/** Panel content width (px) under which the tables drop their count columns. */
const COMPACT_BELOW = 480;

interface TopicRow {
  key: string;
  color: string;
  current: GroupShare;
  previous: GroupShare | null;
  /** False when that census did not record the group at all (shown as "–", not 0). */
  previousRecorded: boolean;
  currentRecorded: boolean;
  /** Share change in percentage points; null when not comparable. */
  delta: number | null;
  /** Head-count change in %; null when not comparable or the group was 0 before. */
  deltaCount: number | null;
  clickable: boolean;
}

interface TopicView {
  topic: Topic;
  current: GroupShare[];
  previous: GroupShare[] | null;
  rows: TopicRow[];
}

@Component({
  selector: 'app-panel',
  standalone: true,
  imports: [PieChartComponent, CompareComponent],
  templateUrl: './panel.component.html',
  styleUrl: './panel.component.scss',
})
export class PanelComponent {
  readonly store = inject(CensusStore);
  readonly i18n = inject(I18n);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);

  readonly touch = typeof matchMedia !== 'undefined' && matchMedia('(hover: none)').matches;

  /**
   * Narrow panel (phones, smaller laptops): the count columns are dropped so the
   * percentages and both changes stay visible. Based on the panel's own width,
   * since on desktop it is only part of the screen.
   */
  readonly compact = signal(false);

  constructor() {
    const observer = new ResizeObserver(([entry]) => this.compact.set(entry.contentRect.width < COMPACT_BELOW));
    observer.observe(this.host.nativeElement);
    inject(DestroyRef).onDestroy(() => observer.disconnect());
  }

  readonly entity = computed(() => this.store.entity(this.store.activeId()));
  readonly isCountry = computed(() => !this.store.activeId());
  readonly isPinned = computed(() => !!this.store.pinnedId() && this.store.activeId() === this.store.pinnedId());
  readonly countryName = computed(() => this.i18n.name(this.store.country().name));

  readonly comparison = computed(() => this.store.compare(this.store.activeId()));
  readonly previousEntity = computed(() => {
    const c = this.comparison();
    return c.status === 'same' || c.status === 'changed' ? c.entity : null;
  });
  readonly change = computed(() => this.store.change(this.store.activeId()));

  readonly note = computed(() => {
    const c = this.comparison();
    const prev = this.store.previousYear();
    if (c.status === 'changed') {
      const list = (names: string[]) => names.map(n => this.i18n.name(n)).join(', ');
      return [
        c.before.length ? this.i18n.t('changedBorders', { prev: prev ?? '', list: list(c.before) }) : '',
        c.now.length ? this.i18n.t('changedBordersNow', { prev: prev ?? '', list: list(c.now) }) : '',
      ].filter(Boolean).join(' ');
    }
    if (c.status === 'created') return this.i18n.t('createdAfter', { prev: prev ?? '', parent: this.i18n.name(c.parent) });
    if (!prev) return this.i18n.t('noPrevious');
    return null;
  });

  /** The topic selected on the map is shown first. */
  readonly topics = computed<TopicView[]>(() => {
    const e = this.entity();
    if (!e) return [];
    const prev = this.previousEntity();
    const comparable = this.comparison().status === 'same';
    const mode = this.store.mode();
    const order = TOPICS.filter(t => this.store.hasTopic(t)).sort((a, b) => Number(b === mode) - Number(a === mode));
    return order.map(topic => {
      const current = this.store.shares(e, topic);
      const previous = prev && this.store.hasTopic(topic, this.store.previous()) ? this.store.shares(prev, topic) : null;
      return {
        topic,
        current,
        previous,
        rows: current.map(s => {
          const before = previous?.find(p => p.key === s.key) ?? null;
          const previousRecorded = this.store.recorded(this.store.previous(), topic, s.key);
          const changeable = comparable && !!before && previousRecorded;
          return {
            key: s.key,
            color: s.color,
            current: s,
            previous: before,
            previousRecorded,
            currentRecorded: this.store.recorded(this.store.current(), topic, s.key),
            delta: changeable ? s.procenat - before!.procenat : null,
            deltaCount: changeable && before!.broj > 0 ? ((s.broj - before!.broj) / before!.broj) * 100 : null,
            clickable: s.key !== OTHER_KEY,
          };
        })
          // a group neither census knew (Bošnjaci before 2003) would be a row of dashes
          .filter(r => r.currentRecorded || (previous && r.previousRecorded)),
      };
    });
  });

  readonly ageGroups = computed(() => {
    const e = this.entity();
    if (!e?.starost) return null;
    return (['0-14', '15-64', '65+'] as const).map(key => ({
      key,
      value: e.starost![key],
      share: (e.starost![key] / e.stanovnika) * 100,
    }));
  });

  readonly areaNote = computed(() => this.i18n.t(this.store.country().code === 'mk' ? 'areaNoteMk' : 'areaNote'));
  readonly source = computed(() => this.store.current()?.census.izvor ?? '');
  readonly censusNote = computed(() => {
    const text = this.store.current()?.census.napomena;
    return text ? this.i18n.censusNote(this.store.country().code, this.store.year(), text) : null;
  });

  /** Men / women; null for censuses without the split by sex (1948–1991). */
  readonly sexes = computed(() => {
    const e = this.entity();
    if (!e || e.muskarci === null || e.zene === null) return null;
    return {
      male: e.muskarci,
      female: e.zene,
      maleShare: (e.muskarci / e.stanovnika) * 100,
      femaleShare: (e.zene / e.stanovnika) * 100,
    };
  });

  readonly groupName = (key: string) => this.i18n.name(key);

  /** Group highlighted in this topic's pie and table (the one mapped on the right). */
  selectedKey(topic: Topic): string | null {
    return this.store.mode() === topic ? this.store.focusGroup() : null;
  }

  selectGroup(topic: Topic, key: string) {
    // the selected topic moves to the top of the panel – follow it there
    const moves = this.store.mode() !== topic;
    this.store.selectGroup(topic, key);
    if (moves) {
      afterNextRender(
        () => this.host.nativeElement
          .querySelector(`[data-topic="${topic}"]`)
          ?.scrollIntoView({ behavior: 'smooth', block: 'start' }),
        { injector: this.injector }
      );
    }
  }

  /** +4,2% / −81,6% / +137% – no decimals once the change is large. */
  countChange(value: number): string {
    return this.i18n.signedPct(value, Math.abs(value) >= 100 ? 0 : 1);
  }

  topicTitle(topic: Topic) {
    return this.i18n.t(topic === 'nationality' ? 'nationality' : topic === 'religion' ? 'religion' : 'motherTongue');
  }

  readonly copied = signal(false);
  /** Explanation of the change columns, opened from the "i" next to the column title. */
  readonly showChangeHelp = signal(false);

  /** The address bar always describes the current view (see UrlState). */
  async copyLink() {
    try {
      await navigator.clipboard.writeText(location.href);
      this.copied.set(true);
      setTimeout(() => this.copied.set(false), 2000);
    } catch {
      // clipboard blocked – the link is still in the address bar
    }
  }

  showCountry() {
    this.store.pinnedId.set(null);
    this.store.hoveredId.set(null);
  }
}

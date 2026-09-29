import { Component, computed, inject, signal } from '@angular/core';
import { CensusStore } from '../census/census.store';
import { GroupShare, TOPICS, Topic, groupShares } from '../census/census.model';
import { I18n } from '../core/i18n.service';
import { PieChartComponent } from './pie-chart.component';

interface TopicRow {
  key: string;
  color: string;
  current: GroupShare;
  previous: GroupShare | null;
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
  imports: [PieChartComponent],
  templateUrl: './panel.component.html',
  styleUrl: './panel.component.scss',
})
export class PanelComponent {
  readonly store = inject(CensusStore);
  readonly i18n = inject(I18n);

  readonly touch = typeof matchMedia !== 'undefined' && matchMedia('(hover: none)').matches;

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
      return this.i18n.t('changedBorders', { prev: prev ?? '', list: c.splitOff.map(n => this.i18n.name(n)).join(', ') });
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
    const mode = this.store.mode();
    const order = [...TOPICS].sort((a, b) => Number(b === mode) - Number(a === mode));
    return order.map(topic => {
      const current = groupShares(e, topic);
      const previous = prev ? groupShares(prev, topic) : null;
      return {
        topic,
        current,
        previous,
        rows: current.map(s => ({
          key: s.key,
          color: s.color,
          current: s,
          previous: previous?.find(p => p.key === s.key) ?? null,
        })),
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

  readonly source = computed(() => this.store.current()?.census.izvor ?? '');

  readonly groupName = (key: string) => this.i18n.name(key);

  topicTitle(topic: Topic) {
    return this.i18n.t(topic === 'nationality' ? 'nationality' : topic === 'religion' ? 'religion' : 'motherTongue');
  }

  readonly copied = signal(false);

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

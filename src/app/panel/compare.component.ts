import { Component, computed, inject } from '@angular/core';
import { CensusStore, MAX_COMPARE } from '../census/census.store';
import { CensusEntity, OTHER_KEY, TOPICS, Topic, groupShares } from '../census/census.model';
import { I18n } from '../core/i18n.service';

interface Column {
  id: string;
  entity: CensusEntity;
  change: number | null;
}

interface TopicTable {
  topic: Topic;
  rows: { key: string; color: string; cells: { procenat: number; broj: number }[] }[];
}

/** Side-by-side view of up to MAX_COMPARE municipalities (replaces the panel while comparing). */
@Component({
  selector: 'app-compare',
  standalone: true,
  templateUrl: './compare.component.html',
  styleUrl: './compare.component.scss',
})
export class CompareComponent {
  readonly store = inject(CensusStore);
  readonly i18n = inject(I18n);
  readonly max = MAX_COMPARE;

  readonly columns = computed<Column[]>(() =>
    this.store.compareIds()
      .map(id => ({ id, entity: this.store.entity(id)!, change: this.store.change(id) }))
      .filter(c => c.entity)
  );

  readonly full = computed(() => this.columns().length >= MAX_COMPARE);

  /** Municipalities that can still be added, alphabetically in the chosen script. */
  readonly options = computed(() => {
    const census = this.store.current()?.census;
    if (!census) return [];
    const chosen = this.store.compareIds();
    return Object.entries(census.opstine)
      .filter(([id]) => !chosen.includes(id))
      .map(([id, e]) => ({ id, name: this.i18n.name(e.naziv) }))
      .sort((a, b) => a.name.localeCompare(b.name, this.i18n.lang() === 'en' ? 'en' : 'sr'));
  });

  add(select: HTMLSelectElement) {
    if (select.value) this.store.toggleCompare(select.value);
    select.value = '';
  }

  /** One table per topic: every group recorded in this census, largest (summed over the columns) first. */
  readonly tables = computed<TopicTable[]>(() => {
    const cols = this.columns();
    if (!cols.length) return [];
    const mode = this.store.mode();
    return TOPICS.filter(t => this.store.hasTopic(t))
      .sort((a, b) => Number(b === mode) - Number(a === mode))
      .map(topic => {
        const shares = cols.map(c => groupShares(c.entity, topic));
        const rows = shares[0]
          .filter(g => g.key === OTHER_KEY || this.store.recorded(this.store.current(), topic, g.key))
          .map(g => ({
            key: g.key,
            color: g.color,
            special: !!g.special,
            cells: shares.map(list => {
              const s = list.find(x => x.key === g.key)!;
              return { procenat: s.procenat, broj: s.broj };
            }),
          }))
          .sort((a, b) => Number(a.special) - Number(b.special) || total(b) - total(a));
        return { topic, rows };
      });
  });

  topicTitle(topic: Topic) {
    return this.i18n.t(topic === 'nationality' ? 'nationality' : topic === 'religion' ? 'religion' : 'motherTongue');
  }
}

/** Sum of the shares, so a large municipality does not decide the order alone. */
const total = (row: { cells: { procenat: number }[] }) => row.cells.reduce((a, c) => a + c.procenat, 0);

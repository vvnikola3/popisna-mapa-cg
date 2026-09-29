import { Component, computed, input } from '@angular/core';
import { arc, pie } from 'd3-shape';
import { GroupShare } from '../census/census.model';

interface Slice {
  key: string;
  path: string;
  color: string;
  title: string;
}

@Component({
  selector: 'app-pie-chart',
  standalone: true,
  template: `
    <svg [attr.viewBox]="viewBox()" [attr.width]="size()" [attr.height]="size()" role="img" [attr.aria-label]="label()">
      <g [attr.transform]="'translate(' + size() / 2 + ',' + size() / 2 + ')'">
        @for (s of slices(); track s.key) {
          <path [attr.d]="s.path" [attr.fill]="s.color"><title>{{ s.title }}</title></path>
        }
      </g>
    </svg>
  `,
  styles: [`
    :host { display: inline-block; line-height: 0; }
    path { stroke: #fff; stroke-width: 1.5; transition: opacity .15s; }
    path:hover { opacity: .85; }
  `],
})
export class PieChartComponent {
  readonly shares = input.required<GroupShare[]>();
  /** Display names for the slice tooltips, keyed like the shares. */
  readonly names = input<(key: string) => string>(k => k);
  readonly size = input(180);
  readonly label = input('');

  readonly viewBox = computed(() => `0 0 ${this.size()} ${this.size()}`);

  readonly slices = computed<Slice[]>(() => {
    const radius = this.size() / 2 - 2;
    const toPath = arc<{ startAngle: number; endAngle: number }>().innerRadius(0).outerRadius(radius);
    const layout = pie<GroupShare>().sort(null).value(s => s.broj);
    return layout(this.shares().filter(s => s.broj > 0)).map(a => ({
      key: a.data.key,
      path: toPath(a) ?? '',
      color: a.data.color,
      title: `${this.names()(a.data.key)}: ${a.data.procenat.toFixed(1)}%`,
    }));
  });
}

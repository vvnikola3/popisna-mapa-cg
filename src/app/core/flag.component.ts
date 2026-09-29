import { Component, input } from '@angular/core';
import { CountryCode } from '../census/countries';

/** Simplified 3:2 flags (emoji flags don't render on Windows). */
@Component({
  selector: 'app-flag',
  standalone: true,
  template: `
    <svg viewBox="0 0 30 20" [attr.width]="size()" [attr.height]="size() * 2 / 3" aria-hidden="true">
      @switch (code()) {
        @case ('me') {
          <rect width="30" height="20" fill="#d4af37"/>
          <rect x="1.5" y="1.5" width="27" height="17" fill="#c40308"/>
          <path d="M15 5.5c-1.6 0-2.2 1.1-2.2 1.1-1.3-.9-2.8-.5-2.8-.5.6 1.9 2.1 2.6 3.4 2.8-.3 1-1 2.6-1 3.9 0 1.6 1.2 2.4 2.6 3.2 1.4-.8 2.6-1.6 2.6-3.2 0-1.3-.7-2.9-1-3.9 1.3-.2 2.8-.9 3.4-2.8 0 0-1.5-.4-2.8.5 0 0-.6-1.1-2.2-1.1z" fill="#d4af37"/>
        }
        @case ('rs') {
          <rect width="30" height="20" fill="#fff"/>
          <rect width="30" height="6.67" fill="#c6363c"/>
          <rect y="6.67" width="30" height="6.67" fill="#0c4076"/>
          <rect x="7" y="4.5" width="5" height="8" rx="1.2" fill="#c6363c" stroke="#fff" stroke-width=".8"/>
        }
        @case ('ba') {
          <rect width="30" height="20" fill="#002395"/>
          <path d="M8 0h14v20z" fill="#fecb00"/>
          @for (i of [0, 1, 2, 3, 4, 5]; track i) {
            <circle [attr.cx]="6.5 + i * 2.4" [attr.cy]="1.5 + i * 3.4" r=".8" fill="#fff"/>
          }
        }
        @case ('hr') {
          <rect width="30" height="20" fill="#fff"/>
          <rect width="30" height="6.67" fill="#ff0000"/>
          <rect y="13.33" width="30" height="6.67" fill="#171796"/>
          <rect x="12" y="5" width="6" height="8" fill="#fff" stroke="#ff0000" stroke-width=".6"/>
          @for (c of checker; track $index) {
            <rect [attr.x]="12 + c[0] * 2" [attr.y]="5 + c[1] * 2" width="2" height="2" fill="#ff0000"/>
          }
        }
        @case ('mk') {
          <rect width="30" height="20" fill="#d20000"/>
          <path d="M0 0l15 10L0 20M30 0L15 10l15 10M12 0h6l-3 10zM12 20h6l-3-10zM0 8.5v3l15-1.5zM30 8.5v3L15 10z" fill="#ffe600"/>
          <circle cx="15" cy="10" r="3.2" fill="#ffe600" stroke="#d20000" stroke-width=".7"/>
        }
      }
    </svg>
  `,
  styles: [`:host { display: inline-flex; line-height: 0; } svg { border-radius: 2px; box-shadow: 0 0 0 1px rgba(0,0,0,.15); }`],
})
export class FlagComponent {
  readonly code = input.required<CountryCode>();
  readonly size = input(22);

  readonly checker = [[0, 0], [2, 0], [1, 1], [0, 2], [2, 2], [1, 3]];
}

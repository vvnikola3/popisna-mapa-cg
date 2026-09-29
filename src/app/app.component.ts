import { Component, HostListener, inject, signal } from '@angular/core';
import { MapComponent } from './map/map.component';
import { PanelComponent } from './panel/panel.component';
import { I18n, LANGUAGES } from './core/i18n.service';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [MapComponent, PanelComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  readonly i18n = inject(I18n);
  readonly languages = LANGUAGES;
  readonly menuOpen = signal(false);

  readonly menu = [
    { key: 'menuMap', icon: 'map', active: true, soon: false },
    { key: 'menuCompare', icon: 'compare', active: false, soon: true },
    { key: 'menuSources', icon: 'doc', active: false, soon: true },
    { key: 'menuAbout', icon: 'info', active: false, soon: true },
  ] as const;

  @HostListener('document:keydown.escape')
  closeMenu() {
    this.menuOpen.set(false);
  }
}

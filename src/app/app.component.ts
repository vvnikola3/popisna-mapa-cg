import { Component, ElementRef, HostListener, inject, signal } from '@angular/core';
import { MapComponent } from './map/map.component';
import { PanelComponent } from './panel/panel.component';
import { FlagComponent } from './core/flag.component';
import { I18n, LANGUAGES, Lang } from './core/i18n.service';
import { CensusStore } from './census/census.store';
import { COUNTRIES, Country } from './census/countries';
import { UrlState } from './core/url-state.service';

type Menu = 'country' | 'lang';

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [MapComponent, PanelComponent, FlagComponent],
  templateUrl: './app.component.html',
  styleUrl: './app.component.scss',
})
export class AppComponent {
  readonly i18n = inject(I18n);
  readonly store = inject(CensusStore);
  private readonly host = inject(ElementRef<HTMLElement>);
  // started here so a shared link is applied on load and the address bar follows every change
  private readonly urlState = inject(UrlState);

  readonly languages = LANGUAGES;
  readonly countries = COUNTRIES;
  readonly menuOpen = signal(false);
  readonly openDropdown = signal<Menu | null>(null);

  readonly menu = [
    { key: 'menuMap', icon: 'map', active: true, soon: false },
    { key: 'menuCompare', icon: 'compare', active: false, soon: true },
    { key: 'menuSources', icon: 'doc', active: false, soon: true },
    { key: 'menuAbout', icon: 'info', active: false, soon: true },
  ] as const;

  currentLanguage() {
    return LANGUAGES.find(l => l.code === this.i18n.lang())!;
  }

  toggleDropdown(menu: Menu) {
    this.openDropdown.update(m => (m === menu ? null : menu));
  }

  chooseLanguage(lang: Lang) {
    this.i18n.setLang(lang);
    this.openDropdown.set(null);
  }

  chooseCountry(country: Country) {
    if (!country.available) return;
    this.store.selectCountry(country.code);
    this.openDropdown.set(null);
  }

  @HostListener('document:click', ['$event'])
  closeOnOutsideClick(event: MouseEvent) {
    const dropdowns = this.host.nativeElement.querySelectorAll('.dropdown');
    if (![...dropdowns].some((d: Element) => d.contains(event.target as Node))) this.openDropdown.set(null);
  }

  @HostListener('document:keydown.escape')
  closeAll() {
    this.menuOpen.set(false);
    this.openDropdown.set(null);
  }
}

import { Component, ElementRef, HostListener, effect, inject, signal } from '@angular/core';
import { MapComponent } from './map/map.component';
import { PanelComponent } from './panel/panel.component';
import { RegionComponent } from './region/region.component';
import { FlagComponent } from './core/flag.component';
import { I18n, LANGUAGES, Lang } from './core/i18n.service';
import { CensusStore } from './census/census.store';
import { COUNTRIES, Country } from './census/countries';
import { UrlState } from './core/url-state.service';

type Menu = 'country' | 'lang';

/** Keep in sync with the region fade-out in app.component.scss. */
const REGION_FADE_MS = 450;

@Component({
  selector: 'app-root',
  standalone: true,
  imports: [MapComponent, PanelComponent, FlagComponent, RegionComponent],
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
  /** Wide screens: the menu is a column next to the content, open from the start. */
  readonly desktop = typeof matchMedia !== 'undefined' && matchMedia('(min-width: 861px)').matches;
  readonly menuOpen = signal(this.desktop);
  /** The region map, kept a little longer than regionView so it can fade out over the country. */
  readonly regionShown = signal(true);
  private fadeTimer?: ReturnType<typeof setTimeout>;

  constructor() {
    effect(() => {
      const region = this.store.regionView();
      clearTimeout(this.fadeTimer);
      if (region) this.regionShown.set(true);
      else this.fadeTimer = setTimeout(() => this.regionShown.set(false), REGION_FADE_MS);
    });
  }
  readonly openDropdown = signal<Menu | null>(null);

  readonly menu = [
    { key: 'menuMap', icon: 'map', soon: false },
    { key: 'menuCompare', icon: 'compare', soon: false },
    { key: 'menuSources', icon: 'doc', soon: true },
    { key: 'menuAbout', icon: 'info', soon: true },
  ] as const;

  isActive(key: string) {
    if (this.store.regionView()) return false;
    return key === 'menuCompare' ? this.store.compareMode() : key === 'menuMap' && !this.store.compareMode();
  }

  openMenuItem(key: string, soon: boolean) {
    if (soon) return;
    if (key === 'menuCompare') {
      this.store.regionView.set(false);
      this.store.startCompare();
    }
    if (key === 'menuMap') {
      this.store.exitCompare();
      this.store.regionView.set(false);
    }
    if (!this.desktop) this.menuOpen.set(false);
  }

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
    this.store.openCountry(country.code);
    this.openDropdown.set(null);
  }

  @HostListener('document:click', ['$event'])
  closeOnOutsideClick(event: MouseEvent) {
    const dropdowns = this.host.nativeElement.querySelectorAll('.dropdown');
    if (![...dropdowns].some((d: Element) => d.contains(event.target as Node))) this.openDropdown.set(null);
  }

  @HostListener('document:keydown.escape')
  closeAll() {
    if (!this.desktop) this.menuOpen.set(false);
    this.openDropdown.set(null);
  }
}

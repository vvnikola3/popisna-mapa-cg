import { Injectable, effect, inject, untracked } from '@angular/core';
import { CensusStore } from '../census/census.store';
import { COUNTRIES } from '../census/countries';
import { MapMode, TOPICS, Topic, groupsFor } from '../census/census.model';
import { I18n } from './i18n.service';

/** GoatCounter's script (index.html) – absent on localhost and when blocked. */
declare global {
  interface Window {
    goatcounter?: { count(vars: { path: string; title?: string }): void };
  }
}

/** A view is counted once it has stayed on screen this long (skips quick clicking through tabs). */
const COUNT_AFTER_MS = 1500;

/**
 * Keeps the address bar in sync with what is shown, so every view can be shared:
 *
 *   <base>/<country>/<year>/<view>[/<municipality>]/[?udio=<group>][&poredi=<municipality>,…]
 *   e.g. /me/2003/jezik/pljevlja/, /me/2023/nacionalnost/?udio=srbi, /me/2023/vjera/?poredi=bar,ulcinj
 *
 * The trailing slash matches the pages scripts/build-pages.js writes (dir/index.html),
 * which GitHub Pages serves directly instead of redirecting.
 *
 * <base> is the <base href> of the build: "/" on an own domain,
 * "/popisna-mapa-cg/" on GitHub Pages.
 */
const BASE = new URL(document.baseURI).pathname.replace(/\/?$/, '/');

const MODE_SLUGS: Record<MapMode, string> = {
  nationality: 'nacionalnost',
  religion: 'vjera',
  language: 'jezik',
  population: 'stanovnistvo',
  density: 'gustina',
  change: 'promjena',
};

/** "Bijelo Polje" -> "bijelo-polje", "Nikšić" -> "niksic" */
export const slugify = (text: string) =>
  text
    .toLowerCase()
    .replace(/đ/g, 'dj')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');

interface Requested {
  municipality?: string;
  group?: string;
  /** Slugs of compared municipalities ("" = comparison open, nothing chosen yet). */
  compare?: string;
}

@Injectable({ providedIn: 'root' })
export class UrlState {
  private readonly store = inject(CensusStore);
  private readonly i18n = inject(I18n);
  /** Last path reported to GoatCounter; the first one is counted by its own script on load. */
  private countedPath: string | null = null;
  private countTimer?: ReturnType<typeof setTimeout>;
  /** Parts of the URL that can only be applied once the data has loaded. */
  private pending: Requested | null = null;

  constructor() {
    this.pending = this.applyFromUrl();

    effect(() => {
      const data = this.store.current();
      const territories = this.store.territories();
      if (!data || !territories.length) return;
      untracked(() => this.applyPending());
    });

    effect(() => {
      const path = this.buildUrl();
      if (this.pending) return; // don't overwrite a shared link before it has been applied
      if (path !== location.pathname + location.search) history.replaceState(history.state, '', path);
      untracked(() => this.countView());
    });

    // the browser tab / bookmark title follows the view, in the chosen script
    effect(() => {
      const pinned = this.store.pinnedId();
      const name = pinned ? this.store.current()?.census.opstine[pinned]?.naziv : null;
      if (this.store.regionView()) {
        document.title = `${this.i18n.t('appTitle')} – ${this.i18n.t('appSubtitle')}`;
        return;
      }
      const place = this.i18n.name(name ?? this.store.country().name);
      document.title = `${place} – ${this.modeLabel()} ${this.store.year()} · ${this.i18n.t('appTitle')}`;
    });
  }

  private modeLabel(): string {
    const prev = this.store.previousYear();
    switch (this.store.mode()) {
      case 'nationality': return this.i18n.t('modeNationality');
      case 'religion': return this.i18n.t('modeReligion');
      case 'language': return this.i18n.t('modeLanguage');
      case 'population': return this.i18n.t('modePopulation');
      case 'density': return this.i18n.t('modeDensity');
      case 'change': return prev ? this.i18n.t('modeChange', { prev }) : this.i18n.t('change');
    }
  }

  /** Reports a new view (path without ?udio=…) to GoatCounter, once it has been looked at for a moment. */
  private countView() {
    const path = location.pathname;
    if (this.countedPath === null) {
      // the first URL of the visit was already counted by GoatCounter's own script
      this.countedPath = path;
      return;
    }
    clearTimeout(this.countTimer);
    if (path === this.countedPath) return;
    this.countTimer = setTimeout(() => {
      this.countedPath = path;
      window.goatcounter?.count({ path, title: document.title });
    }, COUNT_AFTER_MS);
  }

  /** Country, year and view can be set right away. */
  private applyFromUrl(): Requested | null {
    const path = location.pathname.startsWith(BASE) ? location.pathname.slice(BASE.length) : '';
    const [country, year, mode, municipality] = path.split('/').filter(Boolean);
    const query = new URLSearchParams(location.search);
    const group = query.get('udio') ?? undefined;
    const compare = query.get('poredi') ?? undefined;
    if (!country) return null;

    const c = COUNTRIES.find(x => x.code === country && x.available);
    if (!c) return null; // unknown country: stay on the region map
    this.store.openCountry(c.code);
    if (year) this.store.selectYear(Number(year));
    const m = (Object.keys(MODE_SLUGS) as MapMode[]).find(k => MODE_SLUGS[k] === mode);
    if (m && (m !== 'change' || this.store.previousYear())) this.store.setMode(m);

    return municipality || group || compare !== undefined ? { municipality, group, compare } : null;
  }

  /** Municipality and focused group need the loaded data to be resolved. */
  private applyPending() {
    // a link to a view the census does not have (e.g. ethnicity in 1948) falls back to population
    const current = this.store.mode();
    if ((TOPICS as string[]).includes(current) && !this.store.hasTopic(current as Topic)) this.store.setMode('population');

    const req = this.pending;
    this.pending = null;
    if (!req) return;

    const census = this.store.current()!.census;
    if (req.compare !== undefined) {
      this.store.compareMode.set(true);
      const slugs = req.compare.split(',').filter(Boolean);
      for (const slug of slugs) {
        const id = Object.keys(census.opstine).find(k => slugify(census.opstine[k].naziv) === slug);
        if (id) this.store.toggleCompare(id);
      }
    }
    if (req.municipality) {
      // the name at the time (titograd in 1981) or today's name (podgorica)
      const id = Object.keys(census.opstine).find(k => slugify(census.opstine[k].naziv) === req.municipality)
        ?? Object.keys(census.opstine).find(k => slugify(census.opstine[k].danas ?? '') === req.municipality);
      if (id) this.store.pinnedId.set(id);
    }
    const mode = this.store.mode();
    if (req.group && (TOPICS as string[]).includes(mode)) {
      const group = groupsFor(mode as Topic).find(g => slugify(g.key) === req.group);
      if (group && this.store.recorded(this.store.current(), mode as Topic, group.key)) this.store.focusGroup.set(group.key);
    }
  }

  private buildUrl(): string {
    if (this.store.regionView()) return BASE;
    const parts = [this.store.country().code, String(this.store.year()), MODE_SLUGS[this.store.mode()]];
    const pinned = this.store.pinnedId();
    const name = pinned ? this.store.current()?.census.opstine[pinned]?.naziv : null;
    if (name) parts.push(slugify(name));
    const query: string[] = [];
    const focus = this.store.focusGroup();
    if (focus) query.push(`udio=${slugify(focus)}`);
    if (this.store.compareMode()) {
      const opstine = this.store.current()?.census.opstine ?? {};
      query.push('poredi=' + this.store.compareIds().map(id => slugify(opstine[id]?.naziv ?? id)).join(','));
    }
    return BASE + parts.join('/') + '/' + (query.length ? '?' + query.join('&') : '');
  }
}

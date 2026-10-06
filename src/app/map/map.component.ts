import { Component, ElementRef, OnDestroy, OnInit, ViewChild, computed, effect, inject, signal, untracked } from '@angular/core';
import * as L from 'leaflet';
import { CensusStore, GroupChange } from '../census/census.store';
import {
  CHANGE_SCALE, DENSITY_SCALE, GroupShare, MapMode, NO_DATA_COLOR, POPULATION_SCALE, Scale, Topic, YearData,
  binIndex, groupShares, groupsFor, isLight, isTopic, lighten, majority, majorityColor, shareScale
} from '../census/census.model';
import { I18n } from '../core/i18n.service';

/** Horizontal distance between the cursor and the hover card. */
const CARD_GAP = 40;
const EDGE = 8;

interface LegendItem {
  color: string;
  label: string;
}

/** What the hover card / selection bar shows, depending on the selected tab. */
type CardBody =
  | { kind: 'groups'; topic: Topic; groups: GroupShare[] }
  | { kind: 'focus'; topic: Topic; share: GroupShare; change: GroupChange | null }
  | { kind: 'population' }
  | { kind: 'density' }
  | { kind: 'change' };

@Component({
  selector: 'app-map',
  standalone: true,
  templateUrl: './map.component.html',
  styleUrl: './map.component.scss',
})
export class MapComponent implements OnInit, OnDestroy {
  readonly store = inject(CensusStore);
  readonly i18n = inject(I18n);

  @ViewChild('mapDiv', { static: true }) mapDiv!: ElementRef<HTMLDivElement>;
  @ViewChild('card') card?: ElementRef<HTMLDivElement>;

  /** Phones and tablets: no hover, a tap selects a municipality. */
  readonly touch = typeof matchMedia !== 'undefined' && matchMedia('(hover: none)').matches;
  readonly cardPos = signal({ x: 0, y: 0 });

  private map?: L.Map;
  private layer?: L.GeoJSON;
  private labels?: L.LayerGroup;
  private readonly paths = new Map<string, L.Path>();
  private resizeObserver?: ResizeObserver;
  private fitted = false;
  private fitting = false;
  /** Once the user pans or zooms, resizing no longer re-fits the country. */
  private userMoved = false;
  private attribution = '';

  readonly timeline = computed(() => {
    const { censusYears, dataYears } = this.store.country();
    return censusYears.map((year, i) => ({
      year,
      available: dataYears.includes(year),
      position: censusYears.length > 1 ? (i / (censusYears.length - 1)) * 100 : 50,
    }));
  });

  readonly modes = computed(() => {
    const prev = this.store.previousYear();
    const loaded = !!this.store.current();
    // a topic the selected census did not ask about (1948: no ethnicity, religion only from 1991…)
    const topic = (mode: Topic, key: 'modeNationality' | 'modeReligion' | 'modeLanguage') => {
      const disabled = loaded && !this.store.hasTopic(mode);
      const year = this.store.year();
      const why = this.store.country().notAsked?.[mode]?.includes(year)
        ? this.i18n.t('topicNotAsked', { year })
        : this.i18n.t('topicUnavailable');
      return { mode: mode as MapMode, label: this.i18n.t(key), disabled, title: disabled ? why : '' };
    };
    return [
      topic('nationality', 'modeNationality'),
      topic('religion', 'modeReligion'),
      topic('language', 'modeLanguage'),
      { mode: 'population' as MapMode, label: this.i18n.t('modePopulation'), disabled: false, title: '' },
      { mode: 'density' as MapMode, label: this.i18n.t('modeDensity'), disabled: false, title: '' },
      {
        mode: 'change' as MapMode,
        label: prev ? this.i18n.t('modeChange', { prev }) : this.i18n.t('change'),
        disabled: !prev,
        title: prev ? '' : this.i18n.t('noPrevious'),
      },
    ];
  });

  /** Clickable groups for the nationality / religion / language views. */
  readonly legendGroups = computed(() => {
    const mode = this.store.mode();
    if (!isTopic(mode)) return null;
    // only groups this census recorded (no Bosniaks before 2003, no Yugoslavs after 1991…)
    const current = this.store.current();
    return groupsFor(mode).filter(g => this.store.recorded(current, mode, g.key)).map(g =>({ key: g.key, color: g.color, light: lighten(g.color, 0.5), special: !!g.special }));
  });

  /** Classed legend for population, change, or the share of the focused group. */
  readonly legendScale = computed<LegendItem[] | null>(() => {
    const mode = this.store.mode();
    const focus = this.store.focusGroup();
    if (mode === 'population') return this.scaleItems(POPULATION_SCALE, v => this.i18n.num(v));
    if (mode === 'density') {
      return this.scaleItems(DENSITY_SCALE, v => this.i18n.num(v)).map(i => ({ ...i, label: `${i.label} ${this.i18n.t('perKm2')}` }));
    }
    if (mode === 'change') {
      return [
        ...this.scaleItems(CHANGE_SCALE, v => this.i18n.signedPct(v, 0)),
        { color: NO_DATA_COLOR, label: this.i18n.t('notComparable') },
      ];
    }
    if (focus) {
      const group = groupsFor(mode).find(g => g.key === focus)!;
      return this.scaleItems(shareScale(group.color), v => this.i18n.pct(v, 0));
    }
    return null;
  });

  /** Hover card (desktop) / selection bar (touch): follows the selected tab and group. */
  readonly summary = computed(() => {
    const id = this.touch ? this.store.pinnedId() : this.store.hoveredId();
    const entity = this.store.entity(id);
    if (!id || !entity) return null;
    const mode = this.store.mode();
    const focus = this.store.focusGroup();

    let body: CardBody;
    if (isTopic(mode) && this.store.hasTopic(mode)) {
      const shares = groupShares(entity, mode);
      const focused = focus ? shares.find(s => s.key === focus) : undefined;
      body = focused
        ? { kind: 'focus', topic: mode, share: focused, change: this.store.groupChange(id, mode, focused.key) }
        : { kind: 'groups', topic: mode, groups: shares.filter(s => !s.special).slice(0, 3) };
    } else {
      body = { kind: isTopic(mode) ? 'population' : mode };
    }

    const accent =
      body.kind === 'focus' ? body.share.color
        : body.kind === 'groups' ? majority(groupShares(entity, body.topic)).color
          : '#c8102e';
    return { entity, body, accent, change: this.store.change(id), previous: this.store.compare(id) };
  });

  constructor() {
    effect(() => {
      const data = this.store.current();
      if (data) untracked(() => this.render(data));
    });

    // colours follow the view, the hovered and the pinned municipality
    effect(() => {
      this.store.mode();
      this.store.focusGroup();
      this.store.hoveredId();
      this.store.pinnedId();
      untracked(() => this.restyle());
    });

    // label values depend on the view and the language
    effect(() => {
      this.store.mode();
      this.store.focusGroup();
      this.store.current();
      this.i18n.lang();
      untracked(() => {
        this.renderLabels();
        this.updateAttribution();
      });
    });
  }

  ngOnInit() {
    this.map = L.map(this.mapDiv.nativeElement, {
      zoomControl: true,
      zoomSnap: 0.25,
      minZoom: 6,
      maxZoom: 11,
    });
    this.map.attributionControl.setPrefix(false);
    this.map.on('dragstart zoomstart', () => {
      if (!this.fitting) this.userMoved = true;
    });
    // a tap / click outside every municipality clears the selection
    this.map.on('click', () => this.store.pinnedId.set(null));

    // toolbar height, window size and phone rotation all change the map size
    this.resizeObserver = new ResizeObserver(() => {
      if (this.fitted) this.map?.invalidateSize();
      if (!this.fitted || !this.userMoved) this.fit();
    });
    this.resizeObserver.observe(this.mapDiv.nativeElement);
  }

  ngOnDestroy() {
    this.resizeObserver?.disconnect();
    this.map?.remove();
  }

  isFocused(key: string) {
    return this.store.focusGroup() === key;
  }

  focusedName() {
    const focus = this.store.focusGroup();
    return focus ? this.i18n.name(focus) : '';
  }

  topicLabel(topic: Topic) {
    return this.i18n.t(topic === 'nationality' ? 'nationality' : topic === 'religion' ? 'religion' : 'motherTongue');
  }

  /** +4,2% / −81,6% / +137% – no decimals once the change is large. */
  countChange(value: number): string {
    return this.i18n.signedPct(value, Math.abs(value) >= 100 ? 0 : 1);
  }

  showDetails() {
    document.getElementById('details')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }

  // ---------------------------------------------------------------- rendering

  private render(data: YearData) {
    if (!this.map) return;
    this.layer?.remove();
    this.paths.clear();

    this.layer = L.geoJSON(data.geo, {
      style: feature => this.styleFor(feature!.properties.id),
      onEachFeature: (feature, layer) => {
        const id: string = feature.properties.id;
        this.paths.set(id, layer as L.Path);
        if (!this.touch) {
          layer.on('mouseover', (e: L.LeafletMouseEvent) => {
            this.store.hoveredId.set(id);
            this.moveCard(e);
          });
          layer.on('mousemove', (e: L.LeafletMouseEvent) => this.moveCard(e));
          layer.on('mouseout', () => {
            if (this.store.hoveredId() === id) this.store.hoveredId.set(null);
          });
        }
        layer.on('click', (e: L.LeafletMouseEvent) => {
          L.DomEvent.stopPropagation(e);
          this.store.togglePin(id);
        });
      },
    });

    // the view should exist before vector layers are added; if the map is still
    // invisible, the resize observer fits it as soon as it gets a size
    if (!this.fitted) this.fit();
    this.layer.addTo(this.map);
    this.renderLabels();
  }

  private fit() {
    if (!this.map || !this.layer) return;
    // Leaflet caches the map size the first time it is asked and cannot refresh it
    // before the map has a view, so never ask while the container is still 0×0
    // (page opened in a background tab, layout not settled yet on a phone, …).
    const el = this.mapDiv.nativeElement;
    if (!el.clientWidth || !el.clientHeight) return;
    this.fitting = true;
    // extra room for edge labels (Herceg Novi) and the attribution line at the bottom
    this.map.fitBounds(this.layer.getBounds(), { paddingTopLeft: [30, 12], paddingBottomRight: [16, 28], animate: false });
    this.fitting = false;
    this.fitted = true;
  }

  private renderLabels() {
    const data = this.store.current();
    if (!this.map || !data) return;
    this.labels?.remove();
    this.labels = L.layerGroup(
      data.geo.features.map(f => {
        const [lng, lat] = f.properties.label;
        const value = this.labelValue(f.properties.id);
        return L.marker([lat, lng], {
          interactive: false,
          keyboard: false,
          icon: L.divIcon({
            className: 'muni-label',
            iconSize: [0, 0],
            html: `<div><span class="name">${this.i18n.name(f.properties.name)}</span>${value ? `<span class="value">${value}</span>` : ''}</div>`,
          }),
        });
      })
    ).addTo(this.map);
  }

  /** Required credits for the boundary data (simplemaps is CC BY 4.0, OSM is ODbL). */
  private updateAttribution() {
    if (!this.map) return;
    if (this.attribution) this.map.attributionControl.removeAttribution(this.attribution);
    this.attribution =
      `${this.i18n.t('boundaries')}: <a href="https://simplemaps.com/gis/country/me" target="_blank" rel="noopener">simplemaps</a>, ` +
      '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors · ' +
      `${this.i18n.t('data')}: <a href="https://www.monstat.org" target="_blank" rel="noopener">MONSTAT</a>, ` +
      '<a href="https://pop-stat.mashke.org" target="_blank" rel="noopener">pop-stat</a>';
    this.map.attributionControl.addAttribution(this.attribution);
  }

  private labelValue(id: string): string {
    const entity = this.store.entity(id);
    if (!entity) return '';
    const mode = this.store.mode();
    if (mode === 'population') return this.i18n.num(entity.stanovnika);
    if (mode === 'density') return this.i18n.num(entity.gustina, entity.gustina < 10 ? 1 : 0);
    if (mode === 'change') {
      const change = this.store.change(id);
      return change === null ? '' : this.i18n.signedPct(change);
    }
    const focus = this.store.focusGroup();
    if (!focus || !this.store.hasTopic(mode)) return '';
    const share = groupShares(entity, mode).find(s => s.key === focus)!;
    return this.i18n.pct(share.procenat);
  }

  private restyle() {
    const hovered = this.store.hoveredId();
    const pinned = this.store.pinnedId();
    for (const [id, path] of this.paths) path.setStyle(this.styleFor(id));
    // bring highlighted outlines on top so neighbours don't cover them
    if (pinned) this.paths.get(pinned)?.bringToFront();
    if (hovered) this.paths.get(hovered)?.bringToFront();
  }

  private styleFor(id: string): L.PathOptions {
    const fill = this.fillFor(id);
    const hovered = id === this.store.hoveredId();
    const pinned = id === this.store.pinnedId();
    const border = isLight(fill) ? '#7d8691' : '#ffffff';
    return {
      fillColor: hovered ? lighten(fill, 0.35) : fill,
      fillOpacity: 1,
      color: hovered || pinned ? '#1f2328' : border,
      weight: pinned ? 3 : hovered ? 2.5 : 1,
      opacity: 1,
    };
  }

  private fillFor(id: string): string {
    const entity = this.store.entity(id);
    if (!entity) return NO_DATA_COLOR;
    const mode = this.store.mode();

    if (mode === 'population') return POPULATION_SCALE.colors[binIndex(entity.stanovnika, POPULATION_SCALE.breaks)];
    if (mode === 'density') return DENSITY_SCALE.colors[binIndex(entity.gustina, DENSITY_SCALE.breaks)];
    if (mode === 'change') {
      const change = this.store.change(id);
      return change === null ? NO_DATA_COLOR : CHANGE_SCALE.colors[binIndex(change, CHANGE_SCALE.breaks)];
    }

    if (!this.store.hasTopic(mode)) return NO_DATA_COLOR;
    const shares = groupShares(entity, mode);
    const focus = this.store.focusGroup();
    if (focus) {
      const share = shares.find(s => s.key === focus)!;
      const scale = shareScale(share.color);
      return scale.colors[binIndex(share.procenat, scale.breaks)];
    }
    return majorityColor(majority(shares));
  }

  private scaleItems(scale: Scale, format: (v: number) => string): LegendItem[] {
    const { breaks, colors } = scale;
    return colors.map((color, i) => ({
      color,
      label: i === 0
        ? `< ${format(breaks[0])}`
        : i === breaks.length
          ? `≥ ${format(breaks[i - 1])}`
          : `${format(breaks[i - 1])} – ${format(breaks[i])}`,
    }));
  }

  /** Keeps the card beside the cursor (not under it), flipping sides near the edges. */
  private moveCard(e: L.LeafletMouseEvent) {
    if (!this.map) return;
    const point = e.containerPoint;
    const size = this.map.getSize();
    const width = this.card?.nativeElement.offsetWidth ?? 260;
    const height = this.card?.nativeElement.offsetHeight ?? 190;

    let x = point.x + CARD_GAP;
    if (x + width > size.x - EDGE) x = point.x - CARD_GAP - width;
    const y = Math.min(Math.max(point.y - height / 2, EDGE), size.y - height - EDGE);

    this.cardPos.set({ x: Math.max(EDGE, x), y });
  }
}

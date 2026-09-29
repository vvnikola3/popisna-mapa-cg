import { Component, ElementRef, OnDestroy, OnInit, ViewChild, computed, effect, inject, signal, untracked } from '@angular/core';
import * as L from 'leaflet';
import { CensusStore } from '../census/census.store';
import {
  AVAILABLE_YEARS, CENSUS_YEARS, CHANGE_SCALE, MapMode, NO_DATA_COLOR, POPULATION_SCALE, Scale, YearData,
  binIndex, groupShares, groupsFor, lighten, majority, majorityColor, shareScale
} from '../census/census.model';
import { I18n } from '../core/i18n.service';

/** Horizontal distance between the cursor and the hover card. */
const CARD_GAP = 40;
const EDGE = 8;

/** Required credits for the boundary data (OSM is ODbL, simplemaps is CC BY 4.0). */
const DATA_ATTRIBUTION =
  'Granice: <a href="https://simplemaps.com/gis/country/me" target="_blank" rel="noopener">simplemaps</a>, ' +
  '© <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a> contributors · ' +
  'Podaci: <a href="https://www.monstat.org" target="_blank" rel="noopener">MONSTAT</a>';

interface LegendItem {
  color: string;
  label: string;
}

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

  readonly timeline = CENSUS_YEARS.map(year => ({
    year,
    available: AVAILABLE_YEARS.includes(year),
    position: ((year - CENSUS_YEARS[0]) / (CENSUS_YEARS[CENSUS_YEARS.length - 1] - CENSUS_YEARS[0])) * 100,
  }));

  /** Municipality names are hidden while the pointer is over the map. */
  readonly pointerOnMap = signal(false);
  readonly cardPos = signal({ x: 0, y: 0 });

  private map?: L.Map;
  private layer?: L.GeoJSON;
  private labels?: L.LayerGroup;
  private readonly paths = new Map<string, L.Path>();
  private fitted = false;
  private resizeObserver?: ResizeObserver;

  readonly modes = computed(() => {
    const prev = this.store.previousYear();
    return [
      { mode: 'nationality' as MapMode, label: this.i18n.t('modeNationality'), disabled: false },
      { mode: 'religion' as MapMode, label: this.i18n.t('modeReligion'), disabled: false },
      { mode: 'population' as MapMode, label: this.i18n.t('modePopulation'), disabled: false },
      { mode: 'change' as MapMode, label: prev ? this.i18n.t('modeChange', { prev }) : this.i18n.t('change'), disabled: !prev },
    ];
  });

  /** Clickable groups for the nationality / religion views. */
  readonly legendGroups = computed(() => {
    const mode = this.store.mode();
    if (mode !== 'nationality' && mode !== 'religion') return null;
    return groupsFor(mode).map(g => ({ key: g.key, color: g.color, light: lighten(g.color, 0.5) }));
  });

  /** Classed legend for population, change, or the share of the focused group. */
  readonly legendScale = computed<LegendItem[] | null>(() => {
    const mode = this.store.mode();
    const focus = this.store.focusGroup();
    if (mode === 'population') return this.scaleItems(POPULATION_SCALE, v => this.i18n.num(v));
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

  readonly hovered = computed(() => {
    const id = this.store.hoveredId();
    const entity = this.store.entity(id);
    if (!id || !entity) return null;
    return {
      entity,
      nationality: majority(groupShares(entity, 'nationality')),
      religion: majority(groupShares(entity, 'religion')),
      change: this.store.change(id),
    };
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
      this.i18n.lang();
      untracked(() => this.renderLabels());
    });
  }

  ngOnInit() {
    this.map = L.map(this.mapDiv.nativeElement, {
      zoomControl: true,
      zoomSnap: 0.25,
      minZoom: 7,
      maxZoom: 11,
    });
    this.map.attributionControl.setPrefix(false).addAttribution(DATA_ATTRIBUTION);
    // the toolbar above the map changes height with the selected view
    this.resizeObserver = new ResizeObserver(() => this.map?.invalidateSize());
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
    return focus ? this.i18n.group(focus) : '';
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
        layer.on('mouseover', (e: L.LeafletMouseEvent) => {
          this.store.hoveredId.set(id);
          this.moveCard(e);
        });
        layer.on('mousemove', (e: L.LeafletMouseEvent) => this.moveCard(e));
        layer.on('mouseout', () => {
          if (this.store.hoveredId() === id) this.store.hoveredId.set(null);
        });
        layer.on('click', () => this.store.togglePin(id));
      },
    });

    if (!this.fitted) {
      // the view must exist before vector layers are added
      this.map.invalidateSize();
      this.map.fitBounds(this.layer.getBounds(), { padding: [16, 16], animate: false });
      this.fitted = true;
    }
    this.layer.addTo(this.map);
    this.renderLabels();
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
            html: `<div><span class="name">${f.properties.name}</span>${value ? `<span class="value">${value}</span>` : ''}</div>`,
          }),
        });
      })
    ).addTo(this.map);
  }

  private labelValue(id: string): string {
    const entity = this.store.entity(id);
    if (!entity) return '';
    const mode = this.store.mode();
    if (mode === 'population') return this.i18n.num(entity.stanovnika);
    if (mode === 'change') {
      const change = this.store.change(id);
      return change === null ? '' : this.i18n.signedPct(change);
    }
    const focus = this.store.focusGroup();
    if (!focus) return '';
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
    return {
      fillColor: hovered ? lighten(fill, 0.35) : fill,
      fillOpacity: 1,
      color: hovered || pinned ? '#1f2328' : '#ffffff',
      weight: pinned ? 3 : hovered ? 2.5 : 1,
      opacity: 1,
    };
  }

  private fillFor(id: string): string {
    const entity = this.store.entity(id);
    if (!entity) return NO_DATA_COLOR;
    const mode = this.store.mode();

    if (mode === 'population') return POPULATION_SCALE.colors[binIndex(entity.stanovnika, POPULATION_SCALE.breaks)];
    if (mode === 'change') {
      const change = this.store.change(id);
      return change === null ? NO_DATA_COLOR : CHANGE_SCALE.colors[binIndex(change, CHANGE_SCALE.breaks)];
    }

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
    const height = this.card?.nativeElement.offsetHeight ?? 170;

    let x = point.x + CARD_GAP;
    if (x + width > size.x - EDGE) x = point.x - CARD_GAP - width;
    const y = Math.min(Math.max(point.y - height / 2, EDGE), size.y - height - EDGE);

    this.cardPos.set({ x: Math.max(EDGE, x), y });
  }
}

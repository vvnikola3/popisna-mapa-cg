import { Component, ElementRef, OnDestroy, OnInit, ViewChild, effect, inject, signal, untracked } from '@angular/core';
import * as L from 'leaflet';
import { CensusStore } from '../census/census.store';
import { COUNTRIES, Country, CountryCode } from '../census/countries';
import { FlagComponent } from '../core/flag.component';
import { I18n } from '../core/i18n.service';

type RegionGeo = GeoJSON.FeatureCollection<
  GeoJSON.Polygon | GeoJSON.MultiPolygon,
  { code: CountryCode | null; label?: [number, number] }
>;

const AVAILABLE = '#c8102e';
const SOON = '#cdd2d9';
const NEIGHBOUR = '#f3f4f6';

/** Start page: the region, where the visitor picks the country to open. */
@Component({
  selector: 'app-region',
  standalone: true,
  imports: [FlagComponent],
  templateUrl: './region.component.html',
  styleUrl: './region.component.scss',
})
export class RegionComponent implements OnInit, OnDestroy {
  readonly store = inject(CensusStore);
  readonly i18n = inject(I18n);
  readonly countries = COUNTRIES;
  /** Country under the cursor – on the map or in the list. */
  readonly hovered = signal<CountryCode | null>(null);

  @ViewChild('mapDiv', { static: true }) mapDiv!: ElementRef<HTMLDivElement>;

  private map?: L.Map;
  private layer?: L.GeoJSON;
  private labels?: L.LayerGroup;
  private readonly paths = new Map<CountryCode, L.Path>();
  private resizeObserver?: ResizeObserver;

  constructor() {
    effect(() => {
      this.hovered();
      this.leaving();
      untracked(() => this.restyle());
    });
    effect(() => {
      this.i18n.lang();
      untracked(() => this.renderLabels());
    });
  }

  async ngOnInit() {
    this.map = L.map(this.mapDiv.nativeElement, {
      zoomControl: false,
      attributionControl: true,
      dragging: false,
      scrollWheelZoom: false,
      doubleClickZoom: false,
      touchZoom: false,
      boxZoom: false,
      keyboard: false,
      zoomSnap: 0.1,
    });
    this.map.attributionControl.setPrefix(false);
    this.map.attributionControl.addAttribution(
      '<a href="https://www.naturalearthdata.com" target="_blank" rel="noopener">Natural Earth</a>'
    );
    this.resizeObserver = new ResizeObserver(() => {
      this.map?.invalidateSize();
      this.fit();
    });
    this.resizeObserver.observe(this.mapDiv.nativeElement);

    const geo: RegionGeo = await fetch('data/region.json').then(r => r.json());
    this.layer = L.geoJSON(geo, {
      style: f => this.styleFor(f!.properties.code),
      onEachFeature: (f, layer) => {
        const code = f.properties.code as CountryCode | null;
        if (!code) return;
        this.paths.set(code, layer as L.Path);
        layer.on('mouseover', () => this.hovered.set(code));
        layer.on('mouseout', () => this.hovered.set(null));
        layer.on('click', () => this.open(code));
      },
    });
    this.fit();
    this.layer.addTo(this.map);
    this.renderLabels();
  }

  ngOnDestroy() {
    this.resizeObserver?.disconnect();
    this.map?.remove();
  }

  available(code: CountryCode) {
    return COUNTRIES.find(c => c.code === code)!.available;
  }

  /** Set while the map zooms into the chosen country, before its census map opens. */
  readonly leaving = signal<CountryCode | null>(null);

  /** Zooms into the country, then opens it (directly when animations are turned off). */
  open(code: CountryCode) {
    if (!this.available(code) || this.leaving()) return;
    const path = this.paths.get(code) as L.Polygon | undefined;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (!this.map || !path || reduced) {
      this.store.openCountry(code);
      return;
    }
    this.leaving.set(code);
    this.hovered.set(null);
    // moveend ends the zoom; the timer covers a tab in the background, where the animation stalls
    const go = () => {
      clearTimeout(timer);
      if (this.store.regionView()) this.store.openCountry(code);
    };
    const timer = setTimeout(go, 1500);
    this.map.once('moveend', go);
    this.map.flyToBounds(path.getBounds(), { padding: [24, 24], duration: 0.8, easeLinearity: 0.2 });
  }

  name(country: Country) {
    return this.i18n.name(country.name);
  }

  private fit() {
    const el = this.mapDiv.nativeElement;
    if (!this.map || !this.layer || !el.clientWidth || !el.clientHeight) return;
    // only the five countries decide the view; neighbours are just context
    const bounds = L.latLngBounds([]);
    for (const path of this.paths.values()) bounds.extend((path as L.Polygon).getBounds());
    this.map.fitBounds(bounds, { padding: [16, 16], animate: false });
  }

  private styleFor(code: CountryCode | null): L.PathOptions {
    if (!code) return { fillColor: NEIGHBOUR, fillOpacity: 1, color: '#ffffff', weight: 1 };
    const leaving = this.leaving();
    // while zooming in, everything but the chosen country fades away
    if (leaving && leaving !== code) return { fillColor: NEIGHBOUR, fillOpacity: 1, color: '#ffffff', weight: 1 };
    const on = this.available(code);
    const hover = this.hovered() === code;
    return {
      fillColor: on ? (hover ? '#e0334f' : AVAILABLE) : hover ? '#c4c9d0' : SOON,
      fillOpacity: 1,
      color: '#ffffff',
      weight: hover ? 2.5 : 1.5,
      className: on ? 'clickable' : 'soon',
    };
  }

  private restyle() {
    for (const [code, path] of this.paths) path.setStyle(this.styleFor(code));
  }

  private renderLabels() {
    if (!this.map || !this.layer) return;
    this.labels?.remove();
    const markers: L.Marker[] = [];
    this.layer.eachLayer(l => {
      const f = (l as L.GeoJSON).feature as GeoJSON.Feature<GeoJSON.Geometry, { code: CountryCode | null; label?: [number, number] }>;
      const { code, label } = f.properties;
      if (!code || !label) return;
      const country = COUNTRIES.find(c => c.code === code)!;
      const soon = country.available ? '' : `<span class="soon">${this.i18n.t('soon')}</span>`;
      markers.push(L.marker([label[1], label[0]], {
        interactive: false,
        keyboard: false,
        icon: L.divIcon({
          className: `country-label${country.available ? ' on' : ''}`,
          iconSize: [0, 0],
          html: `<div><span class="name">${this.name(country)}</span>${soon}</div>`,
        }),
      }));
    });
    this.labels = L.layerGroup(markers).addTo(this.map);
  }
}

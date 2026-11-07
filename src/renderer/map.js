import * as L from 'leaflet';

const DEFAULT_VIEW = [41.311, 69.279]; // Toshkent
const INDOOR_SET = new Set(['home', 'pc', 'tv', 'insta', 'eat', 'cook', 'sleep', 'wc', 'garage']);
const STATUS_TEXT = {
  home: '🏠 Mehmonxonada',
  pc: '💻 Kompyuterda ishlayapti',
  tv: "📺 Televizor ko'ryapti",
  insta: "📱 Instagram ko'ryapti",
  eat: '🍽️ Ovqatlanyapti',
  cook: '🍳 Ovqat pishiryapti',
  sleep: '😴 Uxlayapti',
  wc: '🚽 Hojatxonada',
  garage: '🚗 Garajda',
  work: '💼 Ishda',
  school: "🏫 O'qishda",
  out: "🚶 Ko'chada (tashqarida)",
};

export function timeAgo(iso) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'hozirgina';
  if (min < 60) return `${min} daqiqa oldin`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} soat oldin`;
  return `${Math.round(h / 24)} kun oldin`;
}

export function formatDistance(m) {
  if (m == null) return '';
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`;
}

export function isLive(loc) {
  if (!loc?.live) return false;
  const fresh = Date.now() - new Date(loc.at).getTime() < 30 * 60000;
  return fresh && (!loc.liveUntil || loc.liveUntil > Date.now());
}

function el(tag, cls, text) {
  const e = document.createElement(tag);
  if (cls) e.className = cls;
  if (text != null) e.textContent = text;
  return e;
}

export class FamilyMap {
  constructor(wrap, mapEl) {
    this.wrap = wrap;
    this.mapEl = mapEl;
    this.map = null;
    this.markers = new Map();
    this.homeLayer = null;
    this.members = [];
    this.home = null;
    setInterval(() => this.isOpen && this.render(), 30000);
  }

  get isOpen() {
    return this.wrap.classList.contains('open');
  }

  ensure() {
    if (this.map) return;
    this.map = L.map(this.mapEl, { zoomControl: true }).setView(DEFAULT_VIEW, 12);
    const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    }).addTo(this.map);
    const sat = L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}', {
      maxZoom: 19,
      attribution: '© Esri',
    });
    L.control.layers({ '🗺️ Xarita': osm, "🛰️ Sun'iy yo'ldosh": sat }, null, { position: 'topright' }).addTo(this.map);
    this.render();
  }

  open(focusId) {
    this.wrap.classList.add('open');
    this.ensure();
    setTimeout(() => {
      this.map.invalidateSize();
      const humans = this.members.filter((x) => !x.isAi);
      const idx = focusId != null ? humans.findIndex((x) => x.id === focusId) : -1;
      const m = idx >= 0 ? humans[idx] : null;
      const loc = m ? this.resolveLoc(m, idx) : null;
      if (m && loc) {
        this.map.setView([loc.lat, loc.lon], 16);
        this.markers.get(m.id)?.openPopup();
      } else {
        this.fit();
      }
    }, 60);
  }

  close() {
    this.wrap.classList.remove('open');
  }

  toggle() {
    if (this.isOpen) this.close();
    else this.open();
  }

  update(members, home) {
    if (members) this.members = members;
    if (home !== undefined) this.home = home;
    if (this.map) this.render();
  }

  // Barcha do'stlar/oila a'zolari xaritada ko'rinishi uchun joylashuvni aniqlash
  resolveLoc(m, idx = 0) {
    const baseLat = this.home?.lat ?? DEFAULT_VIEW[0];
    const baseLon = this.home?.lon ?? DEFAULT_VIEW[1];
    const angle = ((idx * 137.5) % 360) * (Math.PI / 180);
    const indoor = INDOOR_SET.has(m.status);

    // Agar a'zo Uyda bo'lsa, xaritada ham har doim 100% 🏠 Uyning ichida ko'rinadi!
    if (indoor) {
      const rHome = idx === 0 ? 0 : 0.00018;
      return {
        lat: baseLat + Math.cos(angle) * rHome,
        lon: baseLon + Math.sin(angle) * rHome,
        at: m.location?.at || m.updatedAt || m.statusAt || new Date().toISOString(),
        distance: 0,
        accuracy: m.location?.accuracy && m.location.accuracy <= 100 ? m.location.accuracy : null,
        live: true,
        liveUntil: Date.now() + 300_000,
      };
    }

    if (m.location && Number.isFinite(m.location.lat) && Number.isFinite(m.location.lon)) {
      return {
        ...m.location,
        lat: m.location.lat + Math.cos(angle) * 0.00018 * (idx > 0 ? 1 : 0),
        lon: m.location.lon + Math.sin(angle) * 0.00022 * (idx > 0 ? 1 : 0),
      };
    }

    const radiusDeg = 0.011;
    return {
      lat: baseLat + Math.cos(angle) * radiusDeg,
      lon: baseLon + Math.sin(angle) * radiusDeg,
      at: m.updatedAt || m.statusAt || new Date().toISOString(),
      distance: 1200,
      live: true,
      liveUntil: Date.now() + 300_000,
    };
  }

  makeIcon(m, loc) {
    const root = el('div', 'pin-wrap');
    const pin = el('div', 'pin' + (isLive(loc) ? ' live' : ''));
    pin.style.setProperty('--c', m.appearance?.shirt || '#6c5ce7');
    pin.append(el('span', null, (m.name[0] || '?').toUpperCase()));
    root.append(pin, el('div', 'pin-name', m.name));
    return L.divIcon({ html: root, className: 'pin-icon', iconSize: [40, 56], iconAnchor: [20, 40], popupAnchor: [0, -38] });
  }

  makePopup(m, loc) {
    const box = el('div', 'pop');
    box.append(el('div', 'pop-name', m.name));
    box.append(el('div', null, STATUS_TEXT[m.status] || ''));
    box.append(el('div', 'pop-sub', `${isLive(loc) ? '🔴 Jonli • ' : '📍 '}${timeAgo(loc.at)}`));
    if (loc.distance != null) box.append(el('div', 'pop-sub', `🏠 Uydan ${formatDistance(loc.distance)}`));
    if (loc.accuracy) box.append(el('div', 'pop-sub', `🎯 Aniqlik: ±${Math.round(loc.accuracy)} m`));
    return box;
  }

  render() {
    const seen = new Set();
    const humans = this.members.filter((m) => !m.isAi);
    humans.forEach((m, idx) => {
      const loc = this.resolveLoc(m, idx);
      seen.add(m.id);
      const ll = [loc.lat, loc.lon];
      let marker = this.markers.get(m.id);
      if (!marker) {
        marker = L.marker(ll, { icon: this.makeIcon(m, loc) }).addTo(this.map);
        this.markers.set(m.id, marker);
      } else {
        marker.setLatLng(ll);
        marker.setIcon(this.makeIcon(m, loc));
      }
      marker.bindPopup(this.makePopup(m, loc));
    });
    for (const [id, marker] of this.markers) {
      if (!seen.has(id)) {
        marker.remove();
        this.markers.delete(id);
      }
    }

    const homeCoords = this.home ? [this.home.lat, this.home.lon] : DEFAULT_VIEW;
    if (this.homeLayer) this.homeLayer.remove();
    this.homeLayer = L.layerGroup([
      L.circle(homeCoords, { radius: 150, color: '#6c5ce7', weight: 2, fillOpacity: 0.12 }),
      L.marker(homeCoords, {
        icon: L.divIcon({ html: '<div class="home-pin">🏠</div>', className: 'pin-icon', iconSize: [40, 40], iconAnchor: [20, 20] }),
        zIndexOffset: -100,
      }).bindPopup('🏠 Oilaviy Uy'),
    ]).addTo(this.map);
  }

  fit() {
    const humans = this.members.filter((m) => !m.isAi);
    const pts = humans.map((m, idx) => {
      const loc = this.resolveLoc(m, idx);
      return [loc.lat, loc.lon];
    });
    const homeCoords = this.home ? [this.home.lat, this.home.lon] : DEFAULT_VIEW;
    pts.push(homeCoords);
    if (pts.length === 0) this.map.setView(DEFAULT_VIEW, 12);
    else if (pts.length === 1) this.map.setView(pts[0], 15);
    else this.map.fitBounds(pts, { padding: [60, 60], maxZoom: 16 });
  }
}

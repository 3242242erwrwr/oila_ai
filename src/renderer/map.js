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
    this.addrCache = new Map();
    this.addrPending = new Set();
    this.homeLayer = null;
    this.members = [];
    this.home = null;
    setInterval(() => this.isOpen && this.render(), 10000);
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

  // Har bir oila a'zosining joylashuvini aniqlaymiz:
  // 1. Agar GPS lokatsiyasi bo'lsa -> GPS nuqtasida
  // 2. Agar alohida GPS bo'lmasa, lekin uyda yoki bino ichida bo'lsa -> Uy nuqtasida (bir-birini to'sib qo'ymasligi uchun biroz suriladi)
  resolveLoc(m, index = 0, total = 1) {
    if (m.location && Number.isFinite(m.location.lat) && Number.isFinite(m.location.lon)) {
      return m.location;
    }
    if (this.home && Number.isFinite(this.home.lat) && Number.isFinite(this.home.lon)) {
      if (INDOOR_SET.has(m.status) || m.status === 'home' || !m.status) {
        const angle = (index * 2 * Math.PI) / Math.max(total, 1);
        const offsetLat = total > 1 ? Math.cos(angle) * 0.00015 : 0;
        const offsetLon = total > 1 ? Math.sin(angle) * 0.00020 : 0;
        return {
          lat: this.home.lat + offsetLat,
          lon: this.home.lon + offsetLon,
          distance: 0,
          at: m.statusAt || m.joinedAt || new Date().toISOString(),
          isHomeFallback: true,
        };
      }
    }
    return null;
  }

  makeIcon(m, loc) {
    const root = el('div', 'pin-wrap');
    const pin = el('div', 'pin' + (isLive(loc) ? ' live' : ''));
    pin.style.setProperty('--c', m.appearance?.shirt || '#6c5ce7');
    pin.append(el('span', null, (m.name[0] || '?').toUpperCase()));
    root.append(pin, el('div', 'pin-name', m.name));
    return L.divIcon({ html: root, className: 'pin-icon', iconSize: [40, 56], iconAnchor: [20, 40], popupAnchor: [0, -38] });
  }

  getAddress(loc) {
    if (loc.address) return loc.address;
    const key = `${loc.lat.toFixed(4)},${loc.lon.toFixed(4)}`;
    if (this.addrCache.has(key)) return this.addrCache.get(key);
    if (!this.addrPending.has(key)) {
      this.addrPending.add(key);
      fetch(`https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${loc.lat}&lon=${loc.lon}&zoom=18&accept-language=uz`)
        .then((r) => (r.ok ? r.json() : null))
        .then((data) => {
          if (!data) return;
          const a = data.address || {};
          const city = a.city || a.town || a.county || a.district || a.municipality || a.state || '';
          const area = a.suburb || a.neighbourhood || a.quarter || a.village || a.hamlet || '';
          const road = a.road || a.pedestrian || a.residential || '';
          const house = a.house_number ? `${a.house_number}-uy` : '';
          const parts = [];
          if (city) parts.push(city);
          if (area && area !== city) parts.push(area);
          if (road && road !== area && road !== city) parts.push(road);
          if (house) parts.push(house);
          const formatted = parts.join(', ') || (data.display_name ? data.display_name.split(',').slice(0, 3).join(', ').trim() : '');
          if (formatted) {
            this.addrCache.set(key, formatted);
            if (this.map && this.isOpen) this.render();
          }
        })
        .catch(() => {})
        .finally(() => this.addrPending.delete(key));
    }
    return null;
  }

  makePopup(m, loc) {
    const box = el('div', 'pop');
    box.append(el('div', 'pop-name', m.name));
    box.append(el('div', null, STATUS_TEXT[m.status] || ''));
    if (loc.isHomeFallback) {
      box.append(el('div', 'pop-sub', '🏠 Uyda'));
    } else {
      const addr = this.getAddress(loc);
      if (addr) {
        box.append(el('div', 'pop-sub', `📍 ${addr}`));
      }
      box.append(el('div', 'pop-sub', `${isLive(loc) ? '🔴 Jonli • ' : '🕒 '}${timeAgo(loc.at)}`));
      if (loc.distance != null) {
        const distLabel = loc.distance <= 5 ? '🏠 Uyda (0 m)' : `🏠 Uydan ${formatDistance(loc.distance)}`;
        box.append(el('div', 'pop-sub', distLabel));
      }
      if (loc.accuracy) box.append(el('div', 'pop-sub', `🎯 Aniqlik: ±${Math.round(loc.accuracy)} m`));
    }
    return box;
  }

  render() {
    const seen = new Set();
    const humans = this.members.filter((m) => !m.isAi);
    const total = humans.length;
    humans.forEach((m, idx) => {
      const loc = this.resolveLoc(m, idx, total);
      if (!loc) return;
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
      const popupContent = this.makePopup(m, loc);
      marker.bindPopup(popupContent);
      if (marker.isPopupOpen()) {
        marker.setPopupContent(popupContent);
      }
    });
    for (const [id, marker] of this.markers) {
      if (!seen.has(id)) {
        marker.remove();
        this.markers.delete(id);
      }
    }

    if (this.homeLayer) this.homeLayer.remove();
    this.homeLayer = null;
    if (this.home) {
      const homeCoords = [this.home.lat, this.home.lon];
      this.homeLayer = L.layerGroup([
        L.circle(homeCoords, { radius: 150, color: '#6c5ce7', weight: 2, fillOpacity: 0.12 }),
        L.marker(homeCoords, {
          icon: L.divIcon({ html: '<div class="home-pin">🏠</div>', className: 'pin-icon', iconSize: [40, 40], iconAnchor: [20, 20] }),
          zIndexOffset: -100,
        }).bindPopup('🏠 Oilaviy Uy'),
      ]).addTo(this.map);
    }
  }

  fit() {
    const humans = this.members.filter((m) => !m.isAi);
    const total = humans.length;
    const pts = [];
    humans.forEach((m, idx) => {
      const loc = this.resolveLoc(m, idx, total);
      if (loc) pts.push([loc.lat, loc.lon]);
    });
    if (pts.length === 0 && this.home) pts.push([this.home.lat, this.home.lon]);
    if (pts.length === 0) this.map.setView(DEFAULT_VIEW, 12);
    else if (pts.length === 1) this.map.setView(pts[0], 16);
    else this.map.fitBounds(pts, { padding: [60, 60], maxZoom: 16 });
  }
}

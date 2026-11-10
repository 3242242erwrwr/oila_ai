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
  // Oldingi barqaror holat: oxirgi signaldan keyin 30 daqiqa davomida jonli ko'rinadi
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
    this.iconKeys = new Map();
    this.popupKeys = new Map();
    this.animFrames = new Map();
    this.animTargets = new Map();
    this.addrCache = new Map();
    this.addrPending = new Set();
    this.homeLayer = null;
    this.homeKey = '';
    this.members = [];
    this.home = null;
    this.followId = null;
    this.myUid = null;
    this.isDark = (() => { try { return localStorage.getItem('familyMapDark') === '1'; } catch { return false; } })();
    this.showTraffic = (() => { try { return localStorage.getItem('familyMapTraffic') === '1'; } catch { return false; } })();
    this.activeBaseName = '';
    this.trafficLayer = null;
    this.applyThemeUi();
    setInterval(() => this.isOpen && this.render(), 2000);
  }

  applyThemeUi() {
    if (this.wrap) this.wrap.classList.toggle('map-dark', this.isDark);
    const nativeVisual = this.activeBaseName.includes("Sun'iy") || this.activeBaseName.includes('Qora');
    if (this.mapEl) this.mapEl.classList.toggle('dark-tiles', this.isDark && !nativeVisual);
    const darkBtn = document.getElementById('map-dark');
    if (darkBtn) {
      darkBtn.classList.toggle('dark-on', this.isDark);
      darkBtn.textContent = this.isDark ? '☀️ Kunduzgi' : '🌙 Tungi';
    }
    const trBtn = document.getElementById('map-traffic');
    if (trBtn) {
      trBtn.classList.toggle('traffic-on', this.showTraffic);
      trBtn.textContent = this.showTraffic ? '🚦 Probka ✓' : '🚦 Probka';
    }
  }

  toggleDark() {
    this.isDark = !this.isDark;
    try { localStorage.setItem('familyMapDark', this.isDark ? '1' : '0'); } catch {}
    this.applyThemeUi();
  }

  toggleTraffic() {
    this.showTraffic = !this.showTraffic;
    try { localStorage.setItem('familyMapTraffic', this.showTraffic ? '1' : '0'); } catch {}
    if (this.map && this.trafficLayer) {
      if (this.showTraffic) this.trafficLayer.addTo(this.map);
      else this.map.removeLayer(this.trafficLayer);
    }
    this.applyThemeUi();
  }

  get isOpen() {
    return this.wrap.classList.contains('open');
  }

  setMyUid(uid) {
    this.myUid = uid ? Number(uid) : null;
  }

  updateFollowUi() {
    const btn = document.getElementById('map-follow');
    if (!btn) return;
    if (this.followId != null) {
      const target = this.members.find((x) => Number(x.id) === Number(this.followId));
      btn.textContent = `🧭 Kuzatish: ${target?.name || '...'} ✓`;
      btn.classList.add('following');
    } else {
      btn.textContent = '🧭 Kuzatish';
      btn.classList.remove('following');
    }
  }

  follow(id) {
    this.followId = id != null ? Number(id) : null;
    this.updateFollowUi();
    if (this.followId != null && this.map) {
      const humans = this.members.filter((x) => !x.isAi);
      const idx = humans.findIndex((x) => Number(x.id) === this.followId);
      const m = idx >= 0 ? humans[idx] : null;
      const loc = m ? this.resolveLoc(m, idx, humans.length) : null;
      if (loc) {
        const z = Math.max(this.map.getZoom() || 16, 17);
        this.map.setView([loc.lat, loc.lon], z, { animate: true });
      }
    }
    if (this.map) this.render();
  }

  stopFollow() {
    if (this.followId == null) return;
    this.followId = null;
    this.updateFollowUi();
    if (this.map) this.render();
  }

  toggleFollowMe() {
    if (this.followId != null) {
      this.stopFollow();
      return;
    }
    const humans = this.members.filter((x) => !x.isAi);
    const me = (this.myUid && humans.find((x) => Number(x.id) === Number(this.myUid))) || humans[0];
    if (me) {
      this.follow(me.id);
    }
  }

  ensure() {
    if (this.map) return;
    this.map = L.map(this.mapEl, { zoomControl: true }).setView(DEFAULT_VIEW, 14);

    // Barmoq bilan xaritani surib ko'rganda kuzatish avtomatik pauza bo'ladi
    this.map.on('dragstart', () => {
      if (this.followId != null) this.stopFollow();
    });

    const conn = navigator.connection || navigator.mozConnection || navigator.webkitConnection;
    const isVerySlowNet = Boolean(conn && (conn.saveData || conn.effectiveType === '2g' || conn.effectiveType === 'slow-2g'));
    const tileScale = isVerySlowNet ? 1 : 2;

    // 1. O'zbekcha HD batafsil xarita (kuchsiz tarmoqda avtomatik yengil scale=1)
    const googleUz = L.tileLayer(`https://{s}.google.com/vt/lyrs=m&hl=uz&scale=${tileScale}&x={x}&y={y}&z={z}`, {
      maxZoom: 20,
      keepBuffer: 2,
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
      attribution: '© Google Oʻzbekcha HD',
    }).addTo(this.map);

    // 2. Sun'iy yo'ldosh + O'zbekcha nomlar (Gibrid HD)
    const hybridSatUz = L.tileLayer(`https://{s}.google.com/vt/lyrs=y&hl=uz&scale=${tileScale}&x={x}&y={y}&z={z}`, {
      maxZoom: 20,
      keepBuffer: 2,
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
      attribution: '© Google Gibrid HD',
    });

    // 3. Ruscha HD batafsil xarita
    const googleRu = L.tileLayer(`https://{s}.google.com/vt/lyrs=m&hl=ru&scale=${tileScale}&x={x}&y={y}&z={z}`, {
      maxZoom: 20,
      keepBuffer: 2,
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
      attribution: '© Google Ruscha HD',
    });

    // 4. Yandex Xarita
    const yandexLayer = L.tileLayer('https://core-renderer-tiles.maps.yandex.net/tiles?l=map&x={x}&y={y}&z={z}&scale=1&lang=uz_UZ', {
      maxZoom: 19,
      attribution: '© Yandex Xarita',
    });

    // 5. CartoDB Dark (Haqiqiy tungi xarita)
    const cartoDark = L.tileLayer('https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png', {
      maxZoom: 20,
      attribution: '© CartoDB Dark',
    });

    // 6. OpenStreetMap
    const osm = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxZoom: 19,
      attribution: '© OpenStreetMap',
    });

    // Haqiqiy Google jonli tirbandlik (Probka) qatlami
    this.trafficLayer = L.tileLayer('https://{s}.google.com/vt/lyrs=h@221097413,traffic&hl=uz&scale=2&x={x}&y={y}&z={z}', {
      maxZoom: 20,
      subdomains: ['mt0', 'mt1', 'mt2', 'mt3'],
      zIndex: 15,
      opacity: 0.9,
      attribution: '© Google Traffic',
    });
    if (this.showTraffic) this.trafficLayer.addTo(this.map);

    L.control.layers(
      {
        "🇺🇿 O'zbekcha HD Xarita": googleUz,
        '🛰️ Sun\'iy yo\'ldosh (Gibrid HD)': hybridSatUz,
        '🌑 Qora Xarita (CartoDB)': cartoDark,
        '🇷🇺 Ruscha HD Xarita': googleRu,
        '🟡 Yandex Xarita': yandexLayer,
        '🌍 OpenStreetMap': osm,
      },
      {
        '🚦 Jonli Probka (Tirbandlik)': this.trafficLayer,
      },
      { position: 'topright' }
    ).addTo(this.map);

    this.map.on('baselayerchange', (e) => {
      this.activeBaseName = e.name || '';
      this.applyThemeUi();
    });
    this.map.on('overlayadd', (e) => {
      if (e.layer === this.trafficLayer && !this.showTraffic) {
        this.showTraffic = true;
        try { localStorage.setItem('familyMapTraffic', '1'); } catch {}
        this.applyThemeUi();
      }
    });
    this.map.on('overlayremove', (e) => {
      if (e.layer === this.trafficLayer && this.showTraffic) {
        this.showTraffic = false;
        try { localStorage.setItem('familyMapTraffic', '0'); } catch {}
        this.applyThemeUi();
      }
    });

    this.updateFollowUi();
    this.applyThemeUi();
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
      const loc = m ? this.resolveLoc(m, idx, humans.length) : null;
      if (m && loc) {
        this.map.setView([loc.lat, loc.lon], 16);
        this.markers.get(m.id)?.openPopup();
      } else if (this.followId != null) {
        this.follow(this.followId);
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
    this.updateFollowUi();
    if (this.map) this.render();
  }

  // Har bir oila a'zosining joylashuvini aniqlaymiz:
  // 1. Agar GPS lokatsiyasi bo'lsa -> GPS nuqtasida
  // 2. Agar alohida GPS bo'lmasa, lekin uyda yoki bino ichida bo'lsa -> Uy nuqtasida
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
    const isLiveLoc = isLive(loc);
    const hasPhoto = Boolean(m.photo || m.photoUrl);

    if (hasPhoto) {
      const pin = el('div', 'pin has-photo' + (isLiveLoc ? ' live' : ''));
      const img = document.createElement('img');
      img.src = m.photo || m.photoUrl;
      img.alt = m.name || '';
      img.onerror = () => {
        pin.className = 'pin' + (isLiveLoc ? ' live' : '');
        pin.style.setProperty('--c', m.appearance?.shirt || '#6c5ce7');
        pin.innerHTML = `<span>${(m.name[0] || '?').toUpperCase()}</span>`;
      };
      pin.append(img);
      root.append(pin, el('div', 'pin-name', m.name));
      return L.divIcon({ html: root, className: 'pin-icon', iconSize: [44, 62], iconAnchor: [22, 44], popupAnchor: [0, -42] });
    }

    const pin = el('div', 'pin' + (isLiveLoc ? ' live' : ''));
    pin.style.setProperty('--c', m.appearance?.shirt || '#6c5ce7');
    pin.append(el('span', null, (m.name[0] || '?').toUpperCase()));
    root.append(pin, el('div', 'pin-name', m.name));
    return L.divIcon({ html: root, className: 'pin-icon', iconSize: [40, 56], iconAnchor: [20, 40], popupAnchor: [0, -38] });
  }

  animateMarkerTo(id, marker, toLat, toLon) {
    const prevTarget = this.animTargets.get(id);
    if (prevTarget && Math.abs(prevTarget[0] - toLat) < 1e-7 && Math.abs(prevTarget[1] - toLon) < 1e-7) {
      return;
    }
    this.animTargets.set(id, [toLat, toLon]);

    const cur = marker.getLatLng();
    if (!cur) {
      marker.setLatLng([toLat, toLon]);
      return;
    }
    const dLat = toLat - cur.lat;
    const dLon = toLon - cur.lng;
    if (Math.abs(dLat) < 1e-7 && Math.abs(dLon) < 1e-7) return;

    const prevRaf = this.animFrames.get(id);
    if (prevRaf) cancelAnimationFrame(prevRaf);

    const isFollowed = this.followId != null && Number(id) === Number(this.followId) && this.map && this.isOpen;

    // Juda uzoqqa (2+ km) sakraganda darhol o'tkazamiz
    if (Math.abs(dLat) > 0.02 || Math.abs(dLon) > 0.02) {
      marker.setLatLng([toLat, toLon]);
      if (isFollowed) this.map.setView([toLat, toLon], this.map.getZoom(), { animate: false });
      return;
    }

    const approxMeters = Math.hypot(dLat * 111320, dLon * 85000);
    const duration = approxMeters <= 40
      ? 1050
      : Math.min(2200, Math.max(1150, Math.round(approxMeters * 12)));

    if (isFollowed && approxMeters >= 3) {
      this.map.panTo([toLat, toLon], {
        animate: true,
        duration: Math.min(1.1, duration / 1000),
        easeLinearity: 1,
        noMoveStart: true,
      });
    }

    const fromLat = cur.lat;
    const fromLon = cur.lng;
    const start = performance.now();

    const step = (now) => {
      const t = Math.min(1, (now - start) / duration);
      const curLat = fromLat + dLat * t;
      const curLon = fromLon + dLon * t;
      marker.setLatLng([curLat, curLon]);
      if (t < 1) {
        this.animFrames.set(id, requestAnimationFrame(step));
      } else {
        this.animFrames.delete(id);
        this.animTargets.delete(id);
      }
    };
    this.animFrames.set(id, requestAnimationFrame(step));
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
      if (loc.speed != null && loc.speed >= 5) {
        box.append(el('div', 'pop-sub', `🚗 Tezlik: ${Math.round(loc.speed)} km/soat`));
      }
      if (loc.distance != null) {
        const distLabel = loc.distance <= 5 ? '🏠 Uyda (0 m)' : `🏠 Uydan ${formatDistance(loc.distance)}`;
        box.append(el('div', 'pop-sub', distLabel));
      }
      if (loc.accuracy) box.append(el('div', 'pop-sub', `🎯 Aniqlik: ±${Math.round(loc.accuracy)} m`));
    }

    const isFollowing = this.followId != null && Number(this.followId) === Number(m.id);
    const followBtn = el('button', 'pop-follow-btn' + (isFollowing ? ' active' : ''), isFollowing ? "🧭 Kuzatishni o'chirish ✓" : '🧭 Kuzatish');
    followBtn.type = 'button';
    followBtn.onclick = (e) => {
      e.stopPropagation();
      if (isFollowing) this.stopFollow();
      else this.follow(m.id);
    };
    box.append(followBtn);

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
      const iconKey = `${isLive(loc)}|${m.name}|${m.photo ? 'p' : m.photoUrl || ''}|${m.appearance?.shirt || ''}`;
      const addr = loc.isHomeFallback ? '' : (this.getAddress(loc) || '');
      const isFollowing = this.followId != null && Number(this.followId) === Number(m.id);
      const popupKey = `${m.status}|${loc.at}|${timeAgo(loc.at)}|${loc.distance}|${loc.speed || 0}|${addr}|${isFollowing}`;

      let marker = this.markers.get(m.id);
      if (!marker) {
        marker = L.marker(ll, { icon: this.makeIcon(m, loc) }).addTo(this.map);
        marker.bindPopup(this.makePopup(m, loc));
        this.markers.set(m.id, marker);
        this.iconKeys.set(m.id, iconKey);
        this.popupKeys.set(m.id, popupKey);
      } else {
        this.animateMarkerTo(m.id, marker, loc.lat, loc.lon);
        if (this.iconKeys.get(m.id) !== iconKey) {
          marker.setIcon(this.makeIcon(m, loc));
          this.iconKeys.set(m.id, iconKey);
        }
        if (this.popupKeys.get(m.id) !== popupKey) {
          marker.setPopupContent(this.makePopup(m, loc));
          this.popupKeys.set(m.id, popupKey);
        }
      }
    });
    for (const [id, marker] of this.markers) {
      if (!seen.has(id)) {
        const raf = this.animFrames.get(id);
        if (raf) cancelAnimationFrame(raf);
        this.animFrames.delete(id);
        this.animTargets.delete(id);
        this.iconKeys.delete(id);
        this.popupKeys.delete(id);
        marker.remove();
        this.markers.delete(id);
      }
    }

    const nextHomeKey = this.home ? `${this.home.lat}|${this.home.lon}` : '';
    if (nextHomeKey !== this.homeKey) {
      if (this.homeLayer) this.homeLayer.remove();
      this.homeLayer = null;
      this.homeKey = nextHomeKey;
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

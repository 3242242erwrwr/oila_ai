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
    this.showRadars = (() => { try { return localStorage.getItem('familyMapRadars') !== '0'; } catch { return true; } })();
    this.activeBaseName = '';
    this.trafficLayer = null;
    this.cameras = [];
    this.camerasLoaded = false;
    this.hazards = [];
    this.roadAlert = null;
    this.cameraLayer = null;
    this.hazardLayer = null;
    this.helperMarker = null;
    this.helperIconKey = '';
    this.reportMode = null;
    this.alertTimer = null;
    this.localCool = new Map();
    this.lastShownAlertId = '';
    this.patrolRoute = [];
    this.patrolAnchorKey = '';
    this.patrolState = { idx: 0, lat: null, lon: null };
    this.lastHelperHoldUntil = 0;
    this.lastHelperSpot = null;
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
    const radBtn = document.getElementById('map-radars');
    if (radBtn) {
      radBtn.classList.toggle('radar-on', this.showRadars);
      radBtn.textContent = this.showRadars ? '📸 Radar ✓' : '📸 Radar';
    }
  }

  toggleRadars() {
    this.showRadars = !this.showRadars;
    try { localStorage.setItem('familyMapRadars', this.showRadars ? '1' : '0'); } catch {}
    this.applyThemeUi();
    this.renderCameras();
    this.renderHazards();
  }

  setRoadData(hazards, roadAlert) {
    if (Array.isArray(hazards)) this.hazards = hazards;
    if (roadAlert !== undefined) {
      this.roadAlert = roadAlert;
      if (roadAlert && roadAlert.id && roadAlert.id !== this.lastShownAlertId && Date.now() - roadAlert.at < 35000) {
        this.lastShownAlertId = roadAlert.id;
        this.showAlertBanner(roadAlert.text, !roadAlert.isReport);
      }
    }
    if (this.map && this.isOpen) {
      this.renderHazards();
      this.updateHelperBot();
    }
  }

  showAlertBanner(text, isWarn = true) {
    const elBox = document.getElementById('map-alert');
    if (!elBox || !text) return;
    elBox.textContent = `🤖 ${text}`;
    elBox.classList.toggle('info', !isWarn);
    elBox.classList.add('show');
    if (this.alertTimer) clearTimeout(this.alertTimer);
    this.alertTimer = setTimeout(() => elBox.classList.remove('show'), 8500);
  }

  setReportMode(mode) {
    this.reportMode = mode || null;
    const hint = document.getElementById('map-report-hint');
    const menu = document.getElementById('map-report-menu');
    if (menu) menu.classList.remove('open');
    if (hint) {
      if (this.reportMode) {
        const lbl = this.reportMode === 'gai' ? '🚔 GAI' : this.reportMode === 'radar' ? '📡 Radar' : '📸 Doimiy kamera';
        hint.textContent = `👇 Xaritada ${lbl} joyini bosing!`;
        hint.classList.add('show');
      } else {
        hint.classList.remove('show');
      }
    }
  }

  async loadCameras() {
    if (this.camerasLoaded) return;
    this.camerasLoaded = true;
    try {
      const r = await fetch('/api/cameras');
      if (r.ok) {
        this.cameras = await r.json();
        if (this.map) {
          this.renderCameras();
          this.updateHelperBot();
        }
      }
    } catch {
      this.camerasLoaded = false;
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

    this.cameraLayer = L.layerGroup().addTo(this.map);
    this.hazardLayer = L.layerGroup().addTo(this.map);
    this.map.on('moveend zoomend', () => {
      this.renderCameras();
    });
    this.map.on('click', async (e) => {
      if (!this.reportMode) return;
      const mode = this.reportMode;
      this.setReportMode(null);
      const me = this.myUid && this.members.find((x) => Number(x.id) === Number(this.myUid));
      try {
        const res = await fetch('/api/hazard', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: mode,
            lat: e.latlng.lat,
            lon: e.latlng.lng,
            reportedBy: this.myUid || null,
            reportedByName: me?.name || 'Haydovchi',
          }),
        });
        if (res.ok) {
          const data = await res.json();
          if (data.hazard) {
            this.hazards = [...this.hazards.filter((h) => h.id !== data.hazard.id), data.hazard];
            this.renderHazards();
            this.showAlertBanner('✅ Belgilandi va xaritaga chiqarildi!', false);
          }
        }
      } catch {}
    });

    this.updateFollowUi();
    this.applyThemeUi();
    this.loadCameras();
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

    this.renderCameras();
    this.renderHazards();
    this.updateHelperBot();
  }

  renderCameras() {
    if (!this.cameraLayer || !this.map) return;
    this.cameraLayer.clearLayers();
    if (!this.showRadars || !this.cameras.length || this.map.getZoom() < 11) return;
    const bounds = this.map.getBounds().pad(0.25);
    let shown = 0;
    for (const c of this.cameras) {
      if (!bounds.contains([c.lat, c.lon])) continue;
      if (shown >= 160) break;
      shown += 1;
      const label = c.limit ? `📸 ${c.limit}` : '📸';
      const icon = L.divIcon({ html: `<div class="cam-pin">${label}</div>`, className: 'pin-icon', iconSize: [46, 22], iconAnchor: [23, 11] });
      const title = c.type === 'alpr' ? '📸 Raqam o\'qish kamerasi' : c.type === 'traffic_camera' ? '📸 Chorraha kamerasi' : '📡 Tezlik radari';
      const info = [title, c.limit ? `Cheklov: ${c.limit} km/soat` : '', c.road ? `Yo'l: ${c.road}` : ''].filter(Boolean).join('<br/>');
      L.marker([c.lat, c.lon], { icon, zIndexOffset: -40 }).bindPopup(info).addTo(this.cameraLayer);
    }
  }

  renderHazards() {
    if (!this.hazardLayer || !this.map) return;
    this.hazardLayer.clearLayers();
    if (!this.showRadars || !this.hazards.length) return;
    const now = Date.now();
    for (const h of this.hazards) {
      if (h.expiresAt && h.expiresAt <= now) continue;
      const cls = h.type === 'radar' ? 'hz-pin radar' : h.type === 'camera' ? 'hz-pin camera' : 'hz-pin';
      const lbl = h.type === 'radar' ? '📡 Radar' : h.type === 'camera' ? '📸 Kamera' : '🚔 GAI';
      const icon = L.divIcon({ html: `<div class="${cls}">${lbl}</div>`, className: 'pin-icon', iconSize: [68, 24], iconAnchor: [34, 12] });
      const rem = h.expiresAt ? `⏳ ${Math.max(1, Math.round((h.expiresAt - now) / 60000))} daqiqa qoldi` : '📌 Doimiy belgi';
      const who = h.reportedByName ? `Belgiladi: ${h.reportedByName}` : '';
      const info = [`<b>${lbl}</b>`, rem, who].filter(Boolean).join('<br/>');
      L.marker([h.lat, h.lon], { icon, zIndexOffset: 20 }).bindPopup(info).addTo(this.hazardLayer);
    }
  }

  getSpeedSay(speed) {
    const spd = Math.round(Number(speed || 0));
    if (spd >= 70) return { tier: 70, emoji: '🚨', phrase: "Ko'zingga qara, shtrafga tushasan uka!", warn: true };
    if (spd >= 60) return { tier: 60, emoji: '⚠️', phrase: 'Sekinroq uka!', warn: true };
    if (spd >= 50) return { tier: 50, emoji: '😎', phrase: 'Shoshilma shovvoz!', warn: false };
    return null;
  }

  checkLocalDrivingAlert() {
    const humans = this.members.filter((m) => !m.isAi && m.location && isLive(m.location));
    const fast = humans
      .filter((m) => Number(m.location.speed || 0) >= 45)
      .sort((a, b) => Number(b.location.speed || 0) - Number(a.location.speed || 0));
    const now = Date.now();
    for (const m of fast) {
      const { lat, lon, speed } = m.location;
      const spd = Math.round(Number(speed || 0));
      const tierInfo = this.getSpeedSay(spd);
      const spots = [
        ...this.hazards.filter((h) => !h.expiresAt || h.expiresAt > now).map((h) => ({ id: h.id, lat: h.lat, lon: h.lon, kind: h.type, limit: h.limit })),
        ...this.cameras.filter((c) => Math.abs(c.lat - lat) <= 0.008 && Math.abs(c.lon - lon) <= 0.008),
      ];
      let best = null;
      let bestDist = Infinity;
      for (const s of spots) {
        const d = Math.hypot((s.lat - lat) * 111320, (s.lon - lon) * 85000);
        if (d <= 450 && d < bestDist) {
          bestDist = d;
          best = s;
        }
      }
      if (best) {
        const distRounded = Math.max(20, Math.round(bestDist / 10) * 10);
        const kindTxt = best.kind === 'gai' ? '🚔 GAI posti' : best.limit ? `📸 Radar (${best.limit})` : '📸 Kamera';
        const text = tierInfo
          ? `${tierInfo.emoji} ${m.name} (${spd} km/s): ${tierInfo.phrase} • ~${distRounded} m da ${kindTxt}!`
          : `⚠️ ${m.name} (${spd} km/s): ~${distRounded} m da ${kindTxt}!`;
        const ck = `${m.id}:${best.id}`;
        const prev = this.localCool.get(ck) || 0;
        if (now - prev > 120_000) {
          this.localCool.set(ck, now);
          this.showAlertBanner(text, true);
        }
        return { lat: best.lat, lon: best.lon, text, warn: true };
      }
      if (tierInfo) {
        const text = `${tierInfo.emoji} ${m.name} (${spd} km/s): ${tierInfo.phrase}`;
        const ck = `${m.id}:spd:${tierInfo.tier}`;
        const prev = this.localCool.get(ck) || 0;
        if (now - prev > 90_000) {
          this.localCool.set(ck, now);
          this.showAlertBanner(text, tierInfo.warn);
        }
        return { lat: lat + 0.00032, lon: lon + 0.00032, text, warn: tierInfo.warn };
      }
    }
    return null;
  }

  updateHelperBot() {
    if (!this.map) return;
    let target = null;
    const localAlert = this.checkLocalDrivingAlert();

    if (localAlert) {
      target = localAlert;
    } else if (this.roadAlert && Date.now() - this.roadAlert.at < 30_000) {
      target = {
        lat: this.roadAlert.lat,
        lon: this.roadAlert.lon,
        text: this.roadAlert.text,
        warn: this.roadAlert.kind === 'speed' ? (this.roadAlert.tier >= 60) : !this.roadAlert.isReport,
      };
    } else {
      const drivers = this.members
        .filter((m) => !m.isAi && m.location && isLive(m.location) && Number(m.location.speed || 0) >= 20)
        .sort((a, b) => Number(b.location.speed || 0) - Number(a.location.speed || 0));
      if (drivers.length) {
        const d = drivers[0];
        target = {
          lat: d.location.lat + 0.00032,
          lon: d.location.lon + 0.00032,
          text: `🤖 ${d.name}: ${Math.round(d.location.speed)} km/soat`,
          warn: false,
        };
      } else if (this.lastHelperSpot && Date.now() < this.lastHelperHoldUntil) {
        // Haydovchi to'xtaganida ham darrov uyga qaytib ketmaydi, biroz shaharda turadi
        target = {
          lat: this.lastHelperSpot.lat,
          lon: this.lastHelperSpot.lon,
          text: "🤖 Shahar kuzatuvi: yo'llar tinch",
          warn: false,
        };
      } else {
        target = this.nextCityPatrolPoint();
      }
    }

    if (target && (localAlert || (this.roadAlert && Date.now() - this.roadAlert.at < 30_000) || target.text?.includes('km/soat'))) {
      this.lastHelperSpot = { lat: target.lat, lon: target.lon };
      this.lastHelperHoldUntil = Date.now() + 20_000;
    }

    if (!target || !Number.isFinite(target.lat) || !Number.isFinite(target.lon)) return;
    const key = `${target.warn ? 1 : 0}|${target.text}`;
    const html = `<div class="helper-wrap"><div class="helper-bubble${target.warn ? ' warn' : ''}">${target.text}</div><div class="helper-pin">🤖</div></div>`;
    const icon = L.divIcon({ html, className: 'pin-icon', iconSize: [180, 62], iconAnchor: [90, 45] });

    if (!this.helperMarker) {
      this.helperMarker = L.marker([target.lat, target.lon], { icon, zIndexOffset: 80 }).addTo(this.map);
      this.helperMarker.bindPopup('<b>🤖 Yo\'l Yordamchisi</b><br/>Shahar bo\'ylab yuradi, 50-60-70+ km/soat da kamera, radar va GAI dan ogohlantiradi.');
      this.helperIconKey = key;
    } else {
      this.animateMarkerTo('__helper__', this.helperMarker, target.lat, target.lon);
      if (this.helperIconKey !== key) {
        this.helperMarker.setIcon(icon);
        this.helperIconKey = key;
      }
    }
  }

  ensurePatrolRoute() {
    const anchor = this.home || this.members.find((m) => !m.isAi && m.location)?.location || { lat: DEFAULT_VIEW[0], lon: DEFAULT_VIEW[1] };
    const aKey = `${Number(anchor.lat).toFixed(3)}|${Number(anchor.lon).toFixed(3)}|${this.cameras.length}`;
    if (aKey === this.patrolAnchorKey && this.patrolRoute.length >= 3) return;
    this.patrolAnchorKey = aKey;

    // Uyning o'ziga emas, atrofdagi shahar yo'llaridagi haqiqiy kamera nuqtalarini aylanma marshrut qilamiz
    const raw = this.cameras.filter(
      (c) => Math.abs(c.lat - anchor.lat) <= 0.08 && Math.abs(c.lon - anchor.lon) <= 0.1
    );
    const dedup = [];
    for (const c of raw) {
      if (!dedup.some((u) => Math.hypot((u.lat - c.lat) * 111320, (u.lon - c.lon) * 85000) < 250)) {
        dedup.push({ lat: c.lat, lon: c.lon });
      }
    }

    if (dedup.length >= 3) {
      const ordered = [dedup.shift()];
      while (dedup.length && ordered.length < 14) {
        const prev = ordered[ordered.length - 1];
        let bestIdx = 0;
        let bestD = Infinity;
        for (let i = 0; i < dedup.length; i++) {
          const d = Math.hypot(dedup[i].lat - prev.lat, dedup[i].lon - prev.lon);
          if (d < bestD) { bestD = d; bestIdx = i; }
        }
        ordered.push(dedup.splice(bestIdx, 1)[0]);
      }
      this.patrolRoute = ordered;
    } else {
      // Shahar bo'ylab keng aylanma nuqtalar
      const baseLat = anchor.lat + 0.009;
      const baseLon = anchor.lon + 0.008;
      this.patrolRoute = [
        { lat: baseLat, lon: baseLon },
        { lat: baseLat + 0.012, lon: baseLon + 0.010 },
        { lat: baseLat + 0.015, lon: baseLon - 0.012 },
        { lat: baseLat - 0.004, lon: baseLon - 0.014 },
      ];
    }

    if (this.patrolState.lat == null) {
      this.patrolState = { idx: 0, lat: this.patrolRoute[0].lat, lon: this.patrolRoute[0].lon };
    }
  }

  nextCityPatrolPoint() {
    this.ensurePatrolRoute();
    const route = this.patrolRoute;
    if (!route.length) return null;

    if (this.patrolState.lat == null) {
      this.patrolState = { idx: 0, lat: route[0].lat, lon: route[0].lon };
    }

    const wp = route[this.patrolState.idx % route.length];
    const dLat = wp.lat - this.patrolState.lat;
    const dLon = wp.lon - this.patrolState.lon;
    const distM = Math.hypot(dLat * 111320, dLon * 85000);
    const stepM = 48; // Har 2 soniyada ~48 m (~85 km/soat shahar bo'ylab silliq yurish)

    if (distM <= stepM) {
      this.patrolState.lat = wp.lat;
      this.patrolState.lon = wp.lon;
      this.patrolState.idx = (this.patrolState.idx + 1) % route.length;
    } else {
      const k = stepM / distM;
      this.patrolState.lat += dLat * k;
      this.patrolState.lon += dLon * k;
    }

    return {
      lat: this.patrolState.lat,
      lon: this.patrolState.lon,
      text: "🤖 Shahar patruli: yo'llar tinch",
      warn: false,
    };
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

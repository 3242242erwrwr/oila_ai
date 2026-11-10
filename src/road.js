// Haqiqiy kamera/radar bazasi (data/cameras.json) + haydovchilar belgilagan jonli GAI/Radar nuqtalari
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');

const CAMERAS_FILE = path.join(__dirname, '..', 'data', 'cameras.json');
const HAZARDS_FILE = path.join(__dirname, '..', 'data', 'hazards.json');

const GAI_TTL_MS = 2 * 60 * 60 * 1000;   // Jonli GAI / ko'chma radar: 2 soat
const ALERT_DIST_M = 450;                // 450 m qolganda ogohlantirish
const ALERT_MIN_SPEED = 40;              // 40+ km/soat dan kamera/radar/GAI ogohlantirishi ishga tushadi
const ALERT_COOLDOWN_MS = 4 * 60 * 1000; // Bir xil nuqta uchun 4 daqiqa qayta bezovta qilmaslik

function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function formatHazardLabel(kind, speedLimit) {
  const spd = speedLimit ? ` (${speedLimit} km/soat)` : '';
  if (kind === 'gai') return `🚔 GAI posti`;
  if (kind === 'radar') return `📡 Ko'chma radar${spd}`;
  if (kind === 'alpr') return `📸 Kamera${spd}`;
  return `📸 Radar/Kamera${spd}`;
}

function getSpeedPhrase(speed) {
  const spd = Number(speed || 0);
  if (spd >= 70) return { tier: 70, emoji: '🚨', phrase: "Ko'zingga qara, shtrafga tushasan uka!", warn: true };
  if (spd >= 60) return { tier: 60, emoji: '⚠️', phrase: 'Sekinroq uka!', warn: true };
  if (spd >= 50) return { tier: 50, emoji: '😎', phrase: 'Shoshilma shovvoz!', warn: false };
  return null;
}

class RoadGuard extends EventEmitter {
  constructor() {
    super();
    this.cameras = [];
    this.hazards = [];
    this.cooldowns = new Map();
    this.latestAlert = null;
    this._attached = false;
    this.load();
  }

  load() {
    try {
      if (fs.existsSync(CAMERAS_FILE)) {
        const raw = JSON.parse(fs.readFileSync(CAMERAS_FILE, 'utf8'));
        const list = Array.isArray(raw) ? raw : [];
        this.cameras = list
          .filter((x) => Number.isFinite(Number(x.latitude)) && Number.isFinite(Number(x.longitude)))
          .map((x, idx) => ({
            id: `cam_${x.id || x.osm_node_id || idx}`,
            lat: Number(x.latitude),
            lon: Number(x.longitude),
            limit: x.speed_limit ? Number(x.speed_limit) : null,
            type: x.camera_type || 'speed_camera',
            dir: x.compass_direction || null,
            road: x.road_direction || null,
          }));
      }
    } catch (err) {
      console.error('Kameralar bazasini o\'qishda xato:', err.message);
      this.cameras = [];
    }

    try {
      if (fs.existsSync(HAZARDS_FILE)) {
        const raw = JSON.parse(fs.readFileSync(HAZARDS_FILE, 'utf8'));
        this.hazards = Array.isArray(raw) ? raw : [];
        this.pruneExpired(false);
      }
    } catch {
      this.hazards = [];
    }
  }

  saveHazards() {
    try {
      fs.mkdirSync(path.dirname(HAZARDS_FILE), { recursive: true });
      const tmp = HAZARDS_FILE + '.tmp';
      fs.writeFileSync(tmp, JSON.stringify(this.hazards, null, 2));
      fs.renameSync(tmp, HAZARDS_FILE);
    } catch {}
  }

  pruneExpired(emitChange = true) {
    const now = Date.now();
    const before = this.hazards.length;
    this.hazards = this.hazards.filter((h) => !h.expiresAt || h.expiresAt > now);
    if (this.hazards.length !== before) {
      this.saveHazards();
      if (emitChange) this.emit('change');
    }
  }

  getCameras() {
    return this.cameras;
  }

  getActiveHazards() {
    this.pruneExpired(false);
    return this.hazards;
  }

  getLatestAlert() {
    if (this.latestAlert && Date.now() - this.latestAlert.at < 45_000) {
      return this.latestAlert;
    }
    return null;
  }

  addHazard({ type = 'gai', lat, lon, speedLimit = null, reportedBy = null, reportedByName = '' } = {}) {
    const cleanLat = Number(lat);
    const cleanLon = Number(lon);
    if (!Number.isFinite(cleanLat) || !Number.isFinite(cleanLon)) return null;

    const cleanType = ['gai', 'radar', 'camera'].includes(type) ? type : 'gai';
    const now = Date.now();
    this.pruneExpired(false);

    // 120 m atrofida shu turdagi belgi allaqachon bo'lsa muddatini yangilaymiz
    const existing = this.hazards.find(
      (h) => h.type === cleanType && distanceMeters(h.lat, h.lon, cleanLat, cleanLon) <= 120
    );
    const expiresAt = cleanType === 'camera' ? null : now + GAI_TTL_MS;

    if (existing) {
      existing.lat = cleanLat;
      existing.lon = cleanLon;
      existing.reportedBy = reportedBy ?? existing.reportedBy;
      existing.reportedByName = reportedByName || existing.reportedByName;
      existing.updatedAt = now;
      existing.expiresAt = expiresAt;
      if (speedLimit != null) existing.limit = Number(speedLimit) || null;
      this.saveHazards();
      this.emit('change');
      return existing;
    }

    const item = {
      id: `hz_${now}_${Math.floor(Math.random() * 1000)}`,
      type: cleanType,
      lat: cleanLat,
      lon: cleanLon,
      limit: speedLimit ? Number(speedLimit) : null,
      reportedBy: reportedBy ?? null,
      reportedByName: String(reportedByName || '').slice(0, 40),
      createdAt: now,
      updatedAt: now,
      expiresAt,
    };
    this.hazards.push(item);
    this.saveHazards();

    const kindWord = cleanType === 'gai' ? '🚔 GAI posti' : cleanType === 'radar' ? '📡 Ko\'chma radar' : '📸 Yangi kamera';
    this.latestAlert = {
      id: `al_${now}`,
      at: now,
      targetId: reportedBy ?? null,
      targetName: reportedByName || 'Haydovchi',
      hazardId: item.id,
      kind: cleanType,
      label: kindWord,
      speedLimit: item.limit,
      dist: 0,
      lat: item.lat,
      lon: item.lon,
      text: `${reportedByName || 'Haydovchi'} belgiladi: ${kindWord}`,
      isReport: true,
    };
    this.emit('alert', this.latestAlert);
    this.emit('change');
    return item;
  }

  attachStore(store) {
    if (this._attached) return;
    this._attached = true;
    store.on('location', (member) => this.checkMember(member));
  }

  checkMember(member) {
    if (!member || member.isAi || !member.location) return null;
    const { lat, lon, speed } = member.location;
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    const spd = Math.round(Number(speed || 0));
    const now = Date.now();
    // Haydovchi sekinlashsa (< 42 km/soat), keyingi 50/60/70 ko'tarilishida yana yangidan eslatadi
    if (spd < 42) {
      this.cooldowns.delete(`${member.id}:spd:50`);
      this.cooldowns.delete(`${member.id}:spd:60`);
      this.cooldowns.delete(`${member.id}:spd:70`);
    }
    if (spd < ALERT_MIN_SPEED) return null;

    this.pruneExpired(false);
    const tierInfo = getSpeedPhrase(spd);

    let best = null;
    let bestDist = Infinity;

    for (const h of this.hazards) {
      if (Math.abs(h.lat - lat) > 0.008 || Math.abs(h.lon - lon) > 0.008) continue;
      const d = distanceMeters(lat, lon, h.lat, h.lon);
      if (d <= ALERT_DIST_M && d < bestDist) {
        best = { id: h.id, lat: h.lat, lon: h.lon, kind: h.type, limit: h.limit };
        bestDist = d;
      }
    }

    for (const c of this.cameras) {
      if (Math.abs(c.lat - lat) > 0.008 || Math.abs(c.lon - lon) > 0.008) continue;
      const d = distanceMeters(lat, lon, c.lat, c.lon);
      if (d <= ALERT_DIST_M && d < bestDist) {
        best = { id: c.id, lat: c.lat, lon: c.lon, kind: c.type, limit: c.limit };
        bestDist = d;
      }
    }

    // Eski cooldown yozuvlarini tozalash
    if (this.cooldowns.size > 300) {
      for (const [k, ts] of this.cooldowns) {
        if (now - ts > ALERT_COOLDOWN_MS) this.cooldowns.delete(k);
      }
    }

    if (best) {
      const coolKey = `${member.id}:${best.id}`;
      const lastSent = this.cooldowns.get(coolKey) || 0;
      if (now - lastSent >= ALERT_COOLDOWN_MS) {
        this.cooldowns.set(coolKey, now);
        const distRounded = Math.max(20, Math.round(bestDist / 10) * 10);
        const label = formatHazardLabel(best.kind, best.limit);
        const prefix = tierInfo ? `${tierInfo.emoji} ${member.name} (${spd} km/s): ${tierInfo.phrase} ` : `⚠️ ${member.name}: `;
        const alert = {
          id: `al_${now}`,
          at: now,
          targetId: member.id,
          targetName: member.name,
          hazardId: best.id,
          kind: best.kind,
          label,
          speedLimit: best.limit,
          dist: distRounded,
          lat: best.lat,
          lon: best.lon,
          driverLat: lat,
          driverLon: lon,
          speed: spd,
          text: `${prefix}Oldinda ~${distRounded} m da ${label}!`,
        };
        this.latestAlert = alert;
        this.emit('alert', alert);
        this.emit('change');
        return alert;
      }
    }

    // 50-60-70+ km/soat tezlik ogohlantirishlari (kamera bo'lmasa ham)
    if (tierInfo) {
      const spdKey = `${member.id}:spd:${tierInfo.tier}`;
      const lastTierSent = this.cooldowns.get(spdKey) || 0;
      if (now - lastTierSent >= 120_000) {
        this.cooldowns.set(spdKey, now);
        const alert = {
          id: `al_${now}`,
          at: now,
          targetId: member.id,
          targetName: member.name,
          kind: 'speed',
          tier: tierInfo.tier,
          label: tierInfo.phrase,
          dist: 0,
          lat: lat + 0.00032,
          lon: lon + 0.00032,
          driverLat: lat,
          driverLon: lon,
          speed: spd,
          text: `${tierInfo.emoji} ${member.name} (${spd} km/s): ${tierInfo.phrase}`,
        };
        this.latestAlert = alert;
        this.emit('alert', alert);
        this.emit('change');
        return alert;
      }
    }

    return null;
  }
}

module.exports = new RoadGuard();

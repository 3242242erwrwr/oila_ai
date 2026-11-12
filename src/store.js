// A'zolar ro'yxati, profil (ism, jins, yosh, kasb), holatlar va joylashuv (data/members.json).
const fs = require('fs');
const path = require('path');
const { EventEmitter } = require('events');
const { PERMANENT_AI_MEMBERS } = require('./ai');

const PALETTE = {
  skin: ['#ffd9b8', '#f2c29b', '#e0a878', '#c68a5e', '#9c6644'],
  hair: ['#2b1d16', '#5a3825', '#a0522d', '#1c1c2e', '#6f4e37'],
  shirt: ['#ff6b6b', '#4ecdc4', '#ffd166', '#6c5ce7', '#06d6a0', '#ff8fab', '#118ab2', '#f78c3b'],
  pants: ['#3d5a80', '#2d3142', '#6d4c41', '#4a4e69', '#264653'],
};

const JOBS = {
  housewife: { label: '👩‍🍳 Uy bekasi', title: 'Uy bekasi', shirt: '#ff8fab', outfit: 'apron' },
  taxi:      { label: '🚕 Taksist', title: 'Taksist', shirt: '#118ab2', outfit: 'taxi', hat: 'cap' },
  dev:       { label: '💻 Dasturchi / Ofis', title: 'Dasturchi', shirt: '#6c5ce7', outfit: 'hoodie', glasses: true },
  doctor:    { label: '👨‍⚕️ Shifokor', title: 'Shifokor', shirt: '#f8f9fa', outfit: 'doctor' },
  teacher:   { label: "👨‍🏫 O'qituvchi / Biznes", title: "O'qituvchi", shirt: '#2d3142', outfit: 'suit', glasses: true },
  student:   { label: "🎓 O'quvchi / Talaba", title: 'Talaba', shirt: '#4ecdc4', outfit: 'student' },
  builder:   { label: '👷 Usta / Quruvchi', title: 'Usta', shirt: '#f78c3b', outfit: 'vest', hat: 'hardhat' },
  other:     { label: '🌟 Boshqa', title: "Oila a'zosi", outfit: 'casual' },
};

const INDOOR_STATUSES = new Set(['home', 'pc', 'tv', 'insta', 'eat', 'cook', 'sleep', 'wc', 'garage']);

// Vaqtinchalik holatlar: ma'lum vaqtdan keyin avtomatik 'home' (Mehmonxona) ga qaytadi
const AUTO_REVERT_MS = {
  wc: 10 * 60 * 1000,   // 10 daqiqa
  eat: 40 * 60 * 1000,  // 40 daqiqa
  cook: 60 * 60 * 1000, // 60 daqiqa
};

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

function buildAppearance({ gender = 'male', age = 25, job = 'other', existing = {} } = {}) {
  if (job === 'robot') {
    return {
      skin: '#e2e8f0',
      hair: '#38bdf8',
      hairStyle: 0,
      shirt: '#38bdf8',
      pants: '#1e293b',
      scale: 0.95,
      glasses: false,
      mustache: false,
      beard: false,
      hat: 'none',
      outfit: 'robot',
    };
  }
  if (job === 'cat') {
    return {
      skin: '#f4a261',
      hair: '#e76f51',
      hairStyle: 0,
      shirt: '#f4a261',
      pants: '#ffffff',
      scale: 0.85,
      glasses: false,
      mustache: false,
      beard: false,
      hat: 'none',
      outfit: 'cat',
    };
  }
  if (job === 'dog') {
    return {
      skin: '#d4a373',
      hair: '#8d5524',
      hairStyle: 0,
      shirt: '#d4a373',
      pants: '#8d5524',
      scale: 0.9,
      glasses: false,
      mustache: false,
      beard: false,
      hat: 'none',
      outfit: 'dog',
    };
  }
  const j = JOBS[job] || JOBS.other;
  const isChild = age <= 12;
  const isTeen = age > 12 && age <= 17;
  const isSenior = age >= 55;

  const hairStyles = gender === 'female' ? [1, 2] : [0, 3];
  const hairStyle = hairStyles.includes(existing.hairStyle) ? existing.hairStyle : pick(hairStyles);

  // O'zbekona bosh kiyim: Usta -> kaska, Erkaklar -> O'zbek Chust do'ppisi, Uy bekasi / katta ayollar -> ro'mol
  let hat = 'none';
  if (j.hat === 'hardhat') hat = 'hardhat';
  else if (gender === 'male') hat = 'doppi';
  else if (job === 'housewife' || isSenior) hat = 'romol';

  return {
    skin: existing.skin || pick(PALETTE.skin),
    hair: isSenior ? '#d9dfe8' : (existing.hair && existing.hair !== '#d9dfe8' ? existing.hair : '#2b1d16'),
    hairStyle,
    shirt: gender === 'female' && (job === 'housewife' || job === 'other') ? '#e63946' : (j.shirt || existing.shirt || pick(PALETTE.shirt)),
    pants: existing.pants || pick(PALETTE.pants),
    scale: isChild ? 0.72 : isTeen ? 0.86 : 1.0,
    glasses: Boolean(j.glasses || isSenior),
    mustache: Boolean(gender === 'male' && age >= 30),
    beard: Boolean(gender === 'male' && isSenior),
    hat,
    outfit: gender === 'female' && job === 'other' ? 'atlas' : (j.outfit || 'casual'),
  };
}

class Store extends EventEmitter {
  constructor(file) {
    super();
    this.file = file;
    this.data = { members: [] };
    this.pairingCodes = new Map();
    this.load();
    setInterval(() => this.checkAutoRevert(), 20_000).unref();
  }

  load() {
    try {
      this.data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {
      this.data = { members: [] };
    }
    if (!Array.isArray(this.data.members)) this.data.members = [];
    if (!this.data.pairingCodes || typeof this.data.pairingCodes !== 'object') {
      this.data.pairingCodes = {};
    }
    let changed = false;

    // Doimiy AI personajlar (AI Robot, Mushuk, It) har doim uyda mavjud bo'lishini ta'minlaymiz
    const now = new Date().toISOString();
    for (const aiDef of PERMANENT_AI_MEMBERS) {
      let existingAi = this.data.members.find((m) => m.id === aiDef.id);
      if (!existingAi) {
        this.data.members.push({
          ...aiDef,
          statusAt: now,
          seat: this.freeSeat(),
          appearance: buildAppearance({ gender: aiDef.gender, age: aiDef.age, job: aiDef.job }),
          joinedAt: now,
        });
        changed = true;
      } else {
        existingAi.name = aiDef.name;
        existingAi.job = aiDef.job;
        existingAi.isAi = true;
        existingAi.aiType = aiDef.aiType;
        if (!INDOOR_STATUSES.has(existingAi.status) && existingAi.status !== 'out') existingAi.status = 'home';
        existingAi.appearance = buildAppearance({ gender: aiDef.gender, age: aiDef.age, job: aiDef.job });
      }
    }

    for (const m of this.data.members) {
      if (m.isAi) continue;
      // Qat'iy nomlash: 7748681452 = Мурат (foydalanuvchi ushlab turgan telefon), 5123370336 = Dilmurod
      if (Number(m.id) === 7748681452) {
        m.name = 'Мурат';
        changed = true;
      } else if (Number(m.id) === 5123370336) {
        m.name = 'Dilmurod';
        changed = true;
      }
      if (!m.gender) { m.gender = m.appearance?.hairStyle === 1 || m.appearance?.hairStyle === 2 ? 'female' : 'male'; changed = true; }
      if (!m.age) { m.age = 25; changed = true; }
      if (!m.job) { m.job = 'other'; changed = true; }
      if (m.apkInstalled === undefined) { m.apkInstalled = false; changed = true; }
      if (!m.appearance?.outfit || !m.appearance?.hat || m.appearance.hat === 'none' || m.appearance.hat === 'cap') {
        m.appearance = buildAppearance({ gender: m.gender, age: m.age, job: m.job, existing: m.appearance });
        changed = true;
      }
      if (m.location && (!m.location.live || (m.location.accuracy && m.location.accuracy > 120))) {
        delete m.location;
        changed = true;
      }
    }
    if (changed) this.save();
  }

  save() {
    fs.mkdirSync(path.dirname(this.file), { recursive: true });
    const tmp = this.file + '.tmp';
    fs.writeFileSync(tmp, JSON.stringify(this.data, null, 2));
    fs.renameSync(tmp, this.file);
  }

  scheduleSave() {
    if (this._saveTimer) return;
    this._saveTimer = setTimeout(() => {
      this._saveTimer = null;
      try { this.save(); } catch {}
    }, 2000);
    if (this._saveTimer.unref) this._saveTimer.unref();
  }

  all() {
    return this.data.members.map((m) => ({ ...m, appearance: { ...m.appearance } }));
  }

  get(id) {
    if (id == null) return null;
    const num = Number(id);
    return this.data.members.find((m) => Number(m.id) === num) || null;
  }

  freeSeat() {
    const used = new Set(this.data.members.map((m) => m.seat));
    let i = 0;
    while (used.has(i)) i++;
    return i;
  }

  add(id, { name, gender = 'male', age = 25, job = 'other' }) {
    const now = new Date().toISOString();
    const member = {
      id,
      name,
      gender,
      age,
      job,
      status: 'home',
      statusAt: now,
      seat: this.freeSeat(),
      appearance: buildAppearance({ gender, age, job }),
      joinedAt: now,
      apkInstalled: false,
    };
    this.data.members.push(member);
    this.scheduleSave();
    this.emit('joined', { ...member });
    this.emit('change');
    return member;
  }

  remove(id) {
    if (id == null) return false;
    const num = Number(id);
    const idx = this.data.members.findIndex((m) => Number(m.id) === num);
    if (idx === -1) return false;
    const [removed] = this.data.members.splice(idx, 1);
    this.scheduleSave();
    this.emit('left', removed);
    this.emit('change');
    return true;
  }

  updateProfile(id, { name, gender, age, job }) {
    const m = this.get(id);
    if (!m) return null;
    if (name) m.name = name;
    if (gender) m.gender = gender;
    if (age != null) m.age = age;
    if (job) m.job = job;
    m.appearance = buildAppearance({ gender: m.gender, age: m.age, job: m.job, existing: m.appearance });
    m.updatedAt = new Date().toISOString();
    this.scheduleSave();
    this.emit('change');
    return m;
  }

  update(id, patch) {
    const m = this.get(id);
    if (!m) return null;
    const now = new Date().toISOString();
    if (patch.status && patch.status !== m.status) {
      patch.statusAt = now;
      if (!m.isAi && patch.heldItem === undefined) {
        patch.heldItem = null;
      }
    }
    Object.assign(m, patch, { updatedAt: now });
    this.scheduleSave();
    this.emit('change');
    return m;
  }

  checkAutoRevert() {
    const now = Date.now();
    let changed = false;
    for (const m of this.data.members) {
      if (m.isAi) continue;
      const limit = AUTO_REVERT_MS[m.status];
      if (!limit || !m.statusAt) continue;
      if (now - new Date(m.statusAt).getTime() >= limit) {
        const prev = m.status;
        m.status = 'home';
        m.statusAt = new Date().toISOString();
        changed = true;
        this.emit('reverted', { id: m.id, name: m.name, prev });
      }
    }
    if (changed) {
      this.scheduleSave();
      this.emit('change');
    }
  }

  say(id, text, toId = null) {
    const m = this.get(id);
    if (m) this.emit('say', { id, name: m.name, status: m.status, text, toId });
  }

  getHome() {
    return this.data.home || null;
  }

  getGroupChatId() {
    return this.data.groupChatId || null;
  }

  setGroupChatId(chatId) {
    if (this.data.groupChatId !== chatId) {
      this.data.groupChatId = chatId;
      this.scheduleSave();
    }
  }

  setHome(lat, lon, setBy) {
    this.data.home = { lat, lon, setBy, at: new Date().toISOString() };
    this.scheduleSave();
    this.emit('change');
  }

  updateLocation(id, loc) {
    const m = this.get(id);
    if (!m) return null;
    const now = new Date().toISOString();
    let lat = Number(loc.lat);
    let lon = Number(loc.lon);
    const accuracy = loc.accuracy != null ? Number(loc.accuracy) : null;

    // 1. Silliqlash (Filtr): telefon qimirlamay turganda GPS tebranishini (drift) hisobga olmaymiz
    const prev = m.location;
    if (prev && Number.isFinite(prev.lat) && Number.isFinite(prev.lon)) {
      const stepDist = distanceMeters(prev.lat, prev.lon, lat, lon);
      if (accuracy != null && accuracy > 80) {
        lat = prev.lat;
        lon = prev.lon;
      } else if (accuracy != null && accuracy > 65 && stepDist <= 25) {
        lat = prev.lat;
        lon = prev.lon;
      } else {
        const dtSec = prev.at ? Math.max(1, (Date.now() - new Date(prev.at).getTime()) / 1000) : 10;
        const spd = loc.speed != null ? Number(loc.speed) : 0;
        const isGpsMoving = loc.provider === 'gps' && accuracy != null && accuracy <= 25 && spd >= 3;
        // Turganda (spd < 3) 15 m gacha GPS tebranishini qotirib ushlaymiz; yurganda 2.5 m sezgirlik
        const minRealMove = isGpsMoving
          ? 2.5
          : (accuracy != null && accuracy > 25 ? Math.min(22, Math.max(15, accuracy * 0.6)) : 15);
        if ((stepDist / dtSec > 75 && (accuracy == null || accuracy > 12)) || stepDist <= minRealMove) {
          lat = prev.lat;
          lon = prev.lon;
        } else if (isGpsMoving && spd < 20 && stepDist < 35) {
          // Sekin/shahar ichida harakatda chap-o'ng tebranishni tekislash (30% oldingi + 70% yangi)
          lat = prev.lat * 0.3 + lat * 0.7;
          lon = prev.lon * 0.3 + lon * 0.7;
        }
      }
    } else if (accuracy != null && accuracy > 120) {
      return null;
    }

    let event = null;
    let distance = 0;
    let home = this.getHome();
    if (home) {
      // Agar uyni belgilagan a'zo uyda bo'lsa va yangi sessiyada birinchi GPS kelsa (25m atrofida), Uy markazini aniq 0m nuqtaga tekislab olamiz
      if (!prev && INDOOR_STATUSES.has(m.status) && distanceMeters(home.lat, home.lon, lat, lon) <= 25 && (!home.setBy || home.setBy === m.name)) {
        this.data.home = { lat, lon, setBy: m.name, at: now };
        home = this.data.home;
      }
      const rawDist = distanceMeters(home.lat, home.lon, lat, lon);
      const minHomeExit = accuracy != null && accuracy <= 15 ? 4 : (accuracy != null ? Math.min(16, Math.max(5, accuracy * 0.6)) : 5);
      // 2. Uy radiusi (0 m qoidasi): Uydan 25-35 metr ichida (yoki GPS tebranishi ichida) bo'lsa qat'iy 0 m ushlab turiladi
      if (rawDist <= 5 || ((!prev || prev.distance === 0) && rawDist <= minHomeExit)) {
        lat = home.lat;
        lon = home.lon;
        distance = 0;
      } else {
        distance = Math.round(rawDist);
      }

      const indoor = INDOOR_STATUSES.has(m.status);
      if (distance <= HOME_RADIUS && !indoor) {
        m.status = 'home';
        m.statusAt = now;
        event = 'arrived';
      } else if (distance > HOME_RADIUS + 50 && indoor) {
        m.status = 'out';
        m.statusAt = now;
        event = 'left';
      }
    }

    const sameSpot =
      prev &&
      Number.isFinite(prev.lat) &&
      Number.isFinite(prev.lon) &&
      distanceMeters(prev.lat, prev.lon, lat, lon) < 1.5;

    m.location = {
      ...loc,
      lat,
      lon,
      accuracy,
      distance,
      speed: sameSpot ? 0 : (loc.speed != null ? Math.round(Number(loc.speed)) : 0),
      address: sameSpot && prev?.address ? prev.address : (loc.address || prev?.address || null),
      at: now,
    };

    this.scheduleSave();
    if (event) this.emit('moved', { id, name: m.name, event });
    this.emit('change');
    this.emit('location', m);

    if (!sameSpot || !m.location.address) {
      this.resolveAddress(id, lat, lon).catch(() => {});
    }
    return event;
  }

  async resolveAddress(id, lat, lon) {
    try {
      const url = `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${encodeURIComponent(lat)}&lon=${encodeURIComponent(lon)}&zoom=18&accept-language=uz`;
      const res = await fetch(url, {
        headers: {
          'User-Agent': 'OilaviyUyApp/1.0 (https://oila-ai-ll6d.onrender.com)',
          Accept: 'application/json',
        },
      });
      if (!res.ok) return;
      const data = await res.json();
      const a = data?.address || {};
      const city = a.city || a.town || a.county || a.district || a.municipality || a.state || '';
      const area = a.suburb || a.neighbourhood || a.quarter || a.village || a.hamlet || '';
      const road = a.road || a.pedestrian || a.residential || '';
      const house = a.house_number ? `${a.house_number}-uy` : '';
      const parts = [];
      if (city) parts.push(city);
      if (area && area !== city) parts.push(area);
      if (road && road !== area && road !== city) parts.push(road);
      if (house) parts.push(house);
      const formatted = parts.join(', ') || (data?.display_name ? data.display_name.split(',').slice(0, 3).join(', ').trim() : '');
      if (!formatted) return;

      const m = this.get(id);
      if (m && m.location) {
        m.location.address = formatted;
        this.scheduleSave();
        this.emit('change');
      }
    } catch {}
  }

  createPairCode(deviceId) {
    if (!this.data.pairingCodes) this.data.pairingCodes = {};
    const dId = String(deviceId || '');
    if (dId) {
      for (const [c, info] of Object.entries(this.data.pairingCodes)) {
        if (info.deviceId === dId && !info.paired) {
          return c;
        }
      }
    }
    let code = '';
    for (let attempts = 0; attempts < 50; attempts++) {
      code = String(Math.floor(100000 + Math.random() * 900000));
      if (!this.data.pairingCodes[code]) break;
    }
    this.data.pairingCodes[code] = {
      deviceId: dId,
      createdAt: Date.now(),
      paired: false,
      uid: null,
      name: null,
    };
    this.scheduleSave();
    return code;
  }

  getPairStatus(code, deviceId) {
    if (!this.data.pairingCodes) return { paired: false };
    const clean = String(code || '').trim();
    const info = this.data.pairingCodes[clean];
    if (!info) return { paired: false };
    return {
      paired: Boolean(info.paired),
      uid: info.uid ? String(info.uid) : null,
      name: info.name || null,
    };
  }

  matchPairCode(code, uid, telegramName) {
    const cleanCode = String(code || '').replace(/[^\d]/g, '').trim();
    if (cleanCode.length !== 6) return null;
    if (!this.data.pairingCodes) this.data.pairingCodes = {};

    let info = this.data.pairingCodes[cleanCode];
    if (!info) {
      info = { deviceId: '', createdAt: Date.now(), paired: false, uid: null, name: null };
      this.data.pairingCodes[cleanCode] = info;
    }

    let m = this.get(uid);
    if (!m) {
      const name = telegramName || 'Oila a\'zosi';
      this.add(uid, { name, age: 25, job: 'other' });
      m = this.get(uid);
    }
    info.paired = true;
    info.uid = String(m.id);
    info.name = m.name;
    m.apkInstalled = true;
    m.lastApkPing = Date.now();
    m.welcomeSent = true;
    this.scheduleSave();
    this.emit('change');
    return { uid: String(m.id), name: m.name };
  }
}

const HOME_RADIUS = 150;

function distanceMeters(lat1, lon1, lat2, lon2) {
  const R = 6371000;
  const toRad = (d) => (d * Math.PI) / 180;
  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.sqrt(a));
}

module.exports = new Store(path.join(__dirname, '..', 'data', 'members.json'));
module.exports.JOBS = JOBS;
module.exports.INDOOR_STATUSES = INDOOR_STATUSES;
module.exports.distanceMeters = distanceMeters;
module.exports.HOME_RADIUS = HOME_RADIUS;

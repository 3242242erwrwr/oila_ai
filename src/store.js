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
    setInterval(() => this.checkAutoRevert(), 20_000);
  }

  load() {
    try {
      this.data = JSON.parse(fs.readFileSync(this.file, 'utf8'));
    } catch {
      this.data = { members: [] };
    }
    if (!Array.isArray(this.data.members)) this.data.members = [];
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
      if (!m.gender) { m.gender = m.appearance?.hairStyle === 1 || m.appearance?.hairStyle === 2 ? 'female' : 'male'; changed = true; }
      if (!m.age) { m.age = 25; changed = true; }
      if (!m.job) { m.job = 'other'; changed = true; }
      if (!m.appearance?.outfit || !m.appearance?.hat || m.appearance.hat === 'none' || m.appearance.hat === 'cap') {
        m.appearance = buildAppearance({ gender: m.gender, age: m.age, job: m.job, existing: m.appearance });
        changed = true;
      }
      // Noto'g'ri IP/antenna lokatsiyasi (accuracy >= 100) yoki uyda bo'la turib uzoqda qolib ketgan lokatsiyani tozalash
      if (m.location && (m.location.accuracy >= 100 || (INDOOR_STATUSES.has(m.status) && m.location.distance > 150))) {
        if (m.location.accuracy === 120 || m.location.accuracy === 150) {
          m.status = 'home';
        }
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

  all() {
    return this.data.members.map((m) => ({ ...m, appearance: { ...m.appearance } }));
  }

  get(id) {
    return this.data.members.find((m) => m.id === id) || null;
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
    };
    this.data.members.push(member);
    this.save();
    this.emit('joined', { ...member });
    this.emit('change');
    return member;
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
    this.save();
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
      // Agar a'zo uy ichidagi holatga o'tsa va lokatsiyasi uydan uzoqda qolgan bo'lsa, uy markaziga qaytaramiz
      if (!m.isAi && INDOOR_STATUSES.has(patch.status) && m.location && m.location.distance > 150) {
        delete m.location;
      }
    }
    Object.assign(m, patch, { updatedAt: now });
    this.save();
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
      this.save();
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
      this.save();
    }
  }

  setHome(lat, lon, setBy) {
    this.data.home = { lat, lon, setBy, at: new Date().toISOString() };
    this.save();
    this.emit('change');
  }

  updateLocation(id, loc) {
    const m = this.get(id);
    if (!m) return null;
    const now = new Date().toISOString();
    m.location = { ...loc, at: now };
    let event = null;
    const home = this.getHome();
    if (home) {
      const dist = distanceMeters(home.lat, home.lon, loc.lat, loc.lon);
      m.location.distance = Math.round(dist);
      const indoor = INDOOR_STATUSES.has(m.status);
      if (dist <= HOME_RADIUS && !indoor) {
        m.status = 'home';
        m.statusAt = now;
        event = 'arrived';
      } else if (dist > HOME_RADIUS + 50 && indoor) {
        m.status = 'out';
        m.statusAt = now;
        event = 'left';
      }
    }
    this.save();
    if (event) this.emit('moved', { id, name: m.name, event });
    this.emit('change');
    return event;
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

import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { OutlineEffect } from 'three/addons/effects/OutlineEffect.js';
import { CSS2DRenderer } from 'three/addons/renderers/CSS2DRenderer.js';
import { Room, DOOR } from './room.js?v=17';
import { Character, STATUS_ICON, JOB_ICON } from './character.js?v=17';
import { FamilyMap, timeAgo, formatDistance, isLive } from './map.js?v=17';

const STATUS_TEXT = {
  home: 'Mehmonxonada',
  pc: 'Kompyuterda ishlayapti',
  tv: "Televizor ko'ryapti",
  insta: "Instagram ko'ryapti",
  eat: 'Oshxonada ovqatlanyapti',
  cook: 'Ovqat pishiryapti',
  sleep: 'Yotoqxonada uxlayapti',
  wc: 'Hojatxonada',
  garage: 'Garajda',
  work: 'Ishda',
  school: "O'qishda",
  out: "Ko'chada (tashqarida)",
};

const JOB_TITLE = {
  housewife: 'Uy bekasi',
  taxi: 'Taksist',
  dev: 'Dasturchi',
  doctor: 'Shifokor',
  teacher: "O'qituvchi",
  student: 'Talaba',
  builder: 'Usta',
  robot: 'AI Yordamchi',
  cat: 'Uy mushugi',
  dog: "Uy qo'riqchisi",
  other: "Oila a'zosi",
};

const INDOOR = new Set(['home', 'pc', 'tv', 'insta', 'eat', 'cook', 'sleep', 'wc', 'garage']);

const fmap = new FamilyMap(document.getElementById('map-wrap'), document.getElementById('map'));
document.getElementById('map-btn').addEventListener('click', () => fmap.toggle());
document.getElementById('map-close').addEventListener('click', () => fmap.close());
document.getElementById('map-fit').addEventListener('click', () => fmap.fit());
document.getElementById('map-wrap').addEventListener('click', (e) => {
  if (e.target.id === 'map-wrap') fmap.close();
});
window.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') {
    fmap.close();
    closeCharModal();
  }
});

// ---------- Sahna ----------
const container = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
container.appendChild(renderer.domElement);

const outline = new OutlineEffect(renderer, { defaultThickness: 0.004, defaultColor: [0.1, 0.07, 0.12] });

const labels = new CSS2DRenderer();
labels.domElement.style.position = 'absolute';
labels.domElement.style.inset = '0';
labels.domElement.style.pointerEvents = 'none';
container.appendChild(labels.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(38, 1, 0.1, 120);
camera.position.set(4.5, 12.2, 15.8);

const controls = new OrbitControls(camera, renderer.domElement);
controls.target.set(0, 0.6, 0.2);
controls.enableDamping = true;
controls.enablePan = true;
controls.minDistance = 6;
controls.maxDistance = 30;
controls.maxPolarAngle = 1.35;

const hemi = new THREE.HemisphereLight('#fff6e8', '#b59a7a', 1.6);
scene.add(hemi);
const sun = new THREE.DirectionalLight('#ffffff', 2.2);
sun.position.set(8, 15, 10);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
Object.assign(sun.shadow.camera, { left: -12, right: 12, top: 10, bottom: -10, near: 1, far: 45 });
sun.shadow.bias = -0.0005;
scene.add(sun);

const room = new Room(scene);

function applyTime() {
  const night = room.updateTime();
  hemi.intensity = 1.6 - night * 0.85;
  sun.intensity = 2.2 - night * 1.75;
  sun.color.set(night === 1 ? '#8fa0ff' : night ? '#ffb27a' : '#ffffff');
}
applyTime();
setInterval(applyTime, 20_000);

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  renderer.setSize(w, h);
  labels.setSize(w, h);
  camera.aspect = w / h;
  camera.updateProjectionMatrix();
}
window.addEventListener('resize', resize);
resize();

// ---------- Personajlar ----------
const chars = new Map();

function sync(members, animate) {
  const spots = room.assignSpots(members);

  const ids = new Set(members.map((m) => m.id));
  for (const [id, c] of chars) {
    if (!ids.has(id)) {
      c.dispose();
      scene.remove(c.group);
      chars.delete(id);
    }
  }

  for (const m of members) {
    let c = chars.get(m.id);
    const indoor = INDOOR.has(m.status) || Boolean(m.isAi);
    const spot = spots.get(m.id);
    const car = room.getCarForMember(m.id);

    const fromState = () => ({
      pos: c.group.position.clone(),
      approach: c.state === 'posing' && c.spot?.approach ? c.spot.approach : c.group.position.clone(),
      node: c.state === 'posing' ? c.spot?.node : null,
    });

    if (!c) {
      c = new Character(m, openCharModal);
      chars.set(m.id, c);
      scene.add(c.group);
      if (indoor && spot) {
        if (animate) {
          if (car) c.enterByCar(car, room.pathBetween(car.boardSpot, spot), spot);
          else c.enter(room.pathFromDoor(spot), spot);
        } else {
          c.placeAt(spot);
        }
      } else if (!indoor && car) {
        car.targetZ = 12.0;
        car.group.position.z = 12.0;
        car.group.visible = false;
      }
      continue;
    }

    const prevHeldKey = c.heldItemKey || '';
    c.setMember(m, spot?.waitingWc);
    const heldChanged = (c.heldItemKey || '') !== prevHeldKey;

    const faceTargetNow = () => {
      if (m.job === 'robot' && m.deliverToId) {
        const targetChar = chars.get(Number(m.deliverToId));
        if (targetChar && targetChar.group.visible) {
          targetChar.lookAtPosition(spot.pos, 14000);
          c.lookAtPosition(targetChar.group.position, 14000);
        }
      }
    };

    if (indoor && spot) {
      if (!c.wantHome) {
        if (car) {
          c.enterByCar(car, room.pathBetween(car.boardSpot, spot), spot);
        } else {
          c.enter(room.pathFromDoor(spot), spot);
        }
      } else {
        const prevPos = c.spot?.pos;
        const posChanged = !prevPos || prevPos.distanceTo(spot.pos) > 0.2;
        const poseChanged = c.spot?.pose !== spot.pose;
        if (posChanged) {
          if (animate && c.group.visible) {
            c.moveTo(room.pathBetween(fromState(), spot), spot, faceTargetNow);
          } else {
            c.placeAt(spot);
            faceTargetNow();
          }
        } else if (poseChanged || heldChanged) {
          c.spot = spot;
          c.applyPose(spot.pose || 'stand', 1);
          faceTargetNow();
        } else if (m.job === 'robot' && m.deliverToId) {
          faceTargetNow();
        }
      }
    } else if (!indoor && c.wantHome) {
      if (car) {
        c.leaveByCar(room.pathBetween(fromState(), car.boardSpot), car);
      } else {
        c.leave(room.pathToDoor(fromState()));
      }
    }
  }

  renderPanel(members, spots);
  fmap.update(members);
}

// ---------- Panel ----------
const membersPanel = document.getElementById('members-panel');
const membersToggle = document.getElementById('members-toggle');
const panelArrow = document.getElementById('panel-arrow');
if (membersToggle && membersPanel) {
  membersToggle.addEventListener('click', () => {
    const isCollapsed = membersPanel.classList.toggle('collapsed');
    if (panelArrow) panelArrow.textContent = isCollapsed ? '▲' : '▼';
  });
}

let lastMembers = [];
let lastSpots = new Map();
function renderPanel(members, spots = lastSpots) {
  lastMembers = members;
  lastSpots = spots;
  const list = document.getElementById('members');
  list.replaceChildren();
  document.getElementById('count').textContent = String(members.length);
  document.getElementById('empty').style.display = members.length ? 'none' : '';
  const sorted = [...members].sort((a, b) => (INDOOR.has(a.status) ? 0 : 1) - (INDOOR.has(b.status) ? 0 : 1));
  for (const m of sorted) {
    const indoor = INDOOR.has(m.status);
    const spot = spots.get(m.id);
    const row = document.createElement('div');
    row.className = 'member clickable' + (indoor ? '' : ' away');
    row.addEventListener('click', () => openCharModal(m));
    const dot = document.createElement('div');
    dot.className = 'dot';
    dot.style.background = m.appearance?.shirt || '#ccc';
    const info = document.createElement('div');
    info.className = 'info';

    const nm = document.createElement('div');
    nm.className = 'nm';
    const jIcon = JOB_ICON[m.job] || '';
    nm.textContent = m.isAi ? `${m.name} ${jIcon}` : `${m.name} (${m.age || 25}) ${jIcon}`;

    const st = document.createElement('div');
    st.className = 'st';
    const stText = spot?.waitingWc ? '⏳ Hojatxona navbatida' : `${STATUS_ICON[m.status] || ''} ${STATUS_TEXT[m.status] || ''}`;
    st.textContent = `${JOB_TITLE[m.job] || ''} • ${stText}`;

    info.append(nm, st);
    if (!m.isAi) {
      const loc = document.createElement('div');
      loc.className = 'loc';
      if (indoor) {
        loc.textContent = '🔴 Jonli • 🏠 Uyda (0 m)';
      } else if (m.location) {
        const dist = m.location.distance != null ? ` • ${formatDistance(m.location.distance)}` : '';
        loc.textContent = `${isLive(m.location) ? '🔴' : '📍'} ${timeAgo(m.location.at)}${dist}`;
      } else {
        loc.textContent = '🔴 Jonli • 📍 Xaritada ko\'rish';
      }
      loc.addEventListener('click', (e) => {
        e.stopPropagation();
        fmap.open(m.id);
      });
      info.append(loc);
    }
    row.append(dot, info);
    list.append(row);
  }
}
setInterval(() => lastMembers.length && renderPanel(lastMembers), 30000);

function setHome(home) {
  fmap.update(null, home);
  const badge = document.getElementById('home-badge');
  badge.textContent = home ? '🏠 Uy belgilangan' : '⚠️ Uy belgilanmagan (/uy)';
}

function toast(text) {
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = text;
  document.getElementById('toasts').append(el);
  setTimeout(() => el.remove(), 5200);
}

function showBotStatus(s) {
  const el = document.getElementById('bot-status');
  if (s.ok) {
    el.className = 'bot-status ok';
    el.textContent = `🟢 @${s.username} ishlayapti`;
  } else if (s.error) {
    el.className = 'bot-status error';
    el.textContent = `🔴 Bot xatosi: ${s.error}`;
  } else {
    el.className = 'bot-status connecting';
    el.textContent = '⏳ Bot ulanmoqda...';
  }
}

// ---------- Ma'lumot oqimi (Electron + Mobil Brauzer) ----------
function createWebApi() {
  const listeners = {
    members: [],
    home: [],
    bot: [],
    joined: [],
    moved: [],
    say: [],
  };
  let lastMembersJson = '';
  let lastHomeJson = '';
  let lastBotJson = '';
  let lastEventSeq = -1;

  const dispatchTransient = (ch, data, seq) => {
    if (seq != null) {
      if (seq <= lastEventSeq) return;
      lastEventSeq = seq;
    }
    if (ch === 'member:joined') listeners.joined.forEach((fn) => fn(data));
    else if (ch === 'member:moved') listeners.moved.forEach((fn) => fn(data));
    else if (ch === 'member:say') listeners.say.forEach((fn) => fn(data));
  };

  const applyState = (s, isInitial = false) => {
    if (!s) return;
    if (s.members) {
      const mj = JSON.stringify(s.members);
      if (mj !== lastMembersJson) {
        lastMembersJson = mj;
        if (!isInitial) listeners.members.forEach((fn) => fn(s.members));
      }
    }
    if (Array.isArray(s.events) && s.events.length) {
      if (isInitial || lastEventSeq === -1) {
        lastEventSeq = s.events[s.events.length - 1].seq;
      } else {
        for (const ev of s.events) {
          dispatchTransient(ev.ch, ev.data, ev.seq);
        }
      }
    }
    if (s.home !== undefined) {
      const hj = JSON.stringify(s.home);
      if (hj !== lastHomeJson) {
        lastHomeJson = hj;
        if (!isInitial) listeners.home.forEach((fn) => fn(s.home));
      }
    }
    if (s.bot) {
      const bj = JSON.stringify(s.bot);
      if (bj !== lastBotJson) {
        lastBotJson = bj;
        if (!isInitial) listeners.bot.forEach((fn) => fn(s.bot));
      }
    }
  };

  const statePromise = fetch('/api/state', { cache: 'no-store' })
    .then((r) => r.json())
    .then((s) => {
      applyState(s, true);
      return s;
    })
    .catch(() => ({ members: [], home: null, bot: { ok: false } }));

  const pollState = () =>
    fetch('/api/state', { cache: 'no-store' })
      .then((r) => r.json())
      .then((s) => applyState(s, false))
      .catch(() => {});

  // Cloudflare tunnel ba'zan SSE oqimini buferlagani uchun har 1.2 soniyada holatni tekshirib turamiz
  setInterval(pollState, 1200);

  const es = new EventSource('/api/events');
  es.onmessage = (ev) => {
    try {
      const { ch, data, seq } = JSON.parse(ev.data);
      if (ch === 'members:update') {
        const mj = JSON.stringify(data);
        if (mj !== lastMembersJson) {
          lastMembersJson = mj;
          listeners.members.forEach((fn) => fn(data));
        }
      } else if (ch === 'home:update') {
        const hj = JSON.stringify(data);
        if (hj !== lastHomeJson) {
          lastHomeJson = hj;
          listeners.home.forEach((fn) => fn(data));
        }
      } else if (ch === 'bot:status') {
        const bj = JSON.stringify(data);
        if (bj !== lastBotJson) {
          lastBotJson = bj;
          listeners.bot.forEach((fn) => fn(data));
        }
      } else {
        dispatchTransient(ch, data, seq);
      }
    } catch {}
  };

  return {
    getMembers: () => statePromise.then((s) => s.members || []),
    getHome: () => statePromise.then((s) => s.home || null),
    getBotStatus: () => statePromise.then((s) => s.bot || { ok: false }),
    onMembers: (cb) => listeners.members.push(cb),
    onHome: (cb) => listeners.home.push(cb),
    onBotStatus: (cb) => listeners.bot.push(cb),
    onJoined: (cb) => listeners.joined.push(cb),
    onMoved: (cb) => listeners.moved.push(cb),
    onSay: (cb) => listeners.say.push(cb),
    sendRoomAction: (payload) =>
      fetch('/api/action', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      })
        .then((r) => r.json())
        .finally(() => setTimeout(pollState, 150)),
  };
}

const api = window.familyApi || createWebApi();

// ---------- Personaj ustiga bosib xabar yozish va holatni o'zgartirish ----------
const charWrap = document.getElementById('char-wrap');
const charTitle = document.getElementById('char-title');
const targetSection = document.getElementById('target-section');
const chatTargetLabel = document.getElementById('chat-target-label');
const senderList = document.getElementById('sender-list');
const chatForm = document.getElementById('chat-form');
const chatInput = document.getElementById('chat-input');
const statusSection = document.getElementById('status-section');
const statusGrid = document.getElementById('status-grid');

try {
  window.Telegram?.WebApp?.ready?.();
  window.Telegram?.WebApp?.expand?.();
} catch {}

let activeMember = null;
let selectedTargetId = '';

// Foydalanuvchining o'z Telegram ID si (birovning nomidan yozilmasligi uchun!)
const tgUserId = window.Telegram?.WebApp?.initDataUnsafe?.user?.id;
const urlUid = new URLSearchParams(window.location.search).get('uid');
let myUid = String(tgUserId || urlUid || localStorage.getItem('family_uid') || '');
if (myUid) localStorage.setItem('family_uid', myUid);

// ---------- 100% Avtomatik Real-Time Fon Lokatsiya ----------
let lastSentLocAt = 0;
let lastSentLat = null;
let lastSentLon = null;
let watchId = null;
const pageOpenedAt = Date.now();

function pushSilentLocation(lat, lon, accuracy = null, force = false) {
  if (!myUid || !api?.sendRoomAction) return;
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
  // Faqat haqiqiy aniq GPS (accuracy <= 100 metr) qabul qilinadi!
  if (accuracy == null || accuracy <= 0 || accuracy > 100) return;

  const now = Date.now();
  const movedEnough =
    lastSentLat == null ||
    Math.hypot((lat - lastSentLat) * 111000, (lon - lastSentLon) * 85000) > 18;
  if (!force && now - lastSentLocAt < 90_000 && !movedEnough) return;

  lastSentLocAt = now;
  lastSentLat = lat;
  lastSentLon = lon;
  api.sendRoomAction({
    type: 'auto_location',
    id: Number(myUid),
    lat,
    lon,
    accuracy,
  }).catch(() => {});
}

function startRealTimeWatch() {
  if (watchId != null || !navigator.geolocation) return;
  try {
    watchId = navigator.geolocation.watchPosition(
      (pos) => {
        pushSilentLocation(
          pos.coords.latitude,
          pos.coords.longitude,
          pos.coords.accuracy ?? null,
          false
        );
      },
      () => {},
      { enableHighAccuracy: true, maximumAge: 15_000, timeout: 12_000 }
    );
  } catch {}
}

async function pollLocationOnce(force = false, allowPrompt = false) {
  if (!myUid || !navigator.geolocation) return;

  let permState = 'prompt';
  try {
    if (navigator.permissions?.query) {
      const status = await navigator.permissions.query({ name: 'geolocation' });
      permState = status?.state || 'prompt';
    }
  } catch {}

  if (permState === 'denied') return;
  if (permState === 'granted') {
    startRealTimeWatch();
  } else if (!allowPrompt) {
    return;
  }

  navigator.geolocation.getCurrentPosition(
    (pos) => {
      localStorage.setItem('gps_granted_ok', '1');
      startRealTimeWatch();
      pushSilentLocation(
        pos.coords.latitude,
        pos.coords.longitude,
        pos.coords.accuracy ?? null,
        force
      );
    },
    () => {
      localStorage.setItem('gps_prompt_tried', '1');
    },
    { enableHighAccuracy: true, maximumAge: 20_000, timeout: 10_000 }
  );
}

function startSilentAutoLocation() {
  // 1. Agar ruxsat allaqachon berilgan bo'lsa, darhol Real-Time kuzatishni boshlaydi
  pollLocationOnce(true, false);

  // 2. Uyga birinchi marta kirganda (sahifa to'liq ochilgach, ekranga birinchi marta tekkanda — Android xatosi chiqmasligi uchun!) faqat 1 marta ruxsat so'raydi
  const onFirstTouch = () => {
    if (Date.now() - pageOpenedAt < 1200) return;
    window.removeEventListener('pointerup', onFirstTouch);
    if (!localStorage.getItem('gps_prompt_tried') && !localStorage.getItem('gps_granted_ok')) {
      localStorage.setItem('gps_prompt_tried', '1');
      pollLocationOnce(true, true);
    }
  };
  window.addEventListener('pointerup', onFirstTouch);

  // 3. Har 2 minutda fon rejimda yangilab turadi
  setInterval(() => pollLocationOnce(true, false), 120_000);

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'visible') {
      pollLocationOnce(true, false);
    }
  });
}

startSilentAutoLocation();

const ALL_STATUSES = [
  { key: 'home', label: '🏠 Mehmonxonada' },
  { key: 'tv', label: '📺 TV ko\'ryapman' },
  { key: 'pc', label: '💻 Kompyuterda' },
  { key: 'insta', label: '📱 Instagramda' },
  { key: 'eat', label: '🍽️ Ovqatlanyapman' },
  { key: 'cook', label: '🍳 Ovqat pishiryapman' },
  { key: 'sleep', label: '😴 Uxlayapman' },
  { key: 'wc', label: '🚽 Hojatxonada' },
  { key: 'work', label: '💼 Ishdaman' },
  { key: 'school', label: '🏫 O\'qishdaman' },
  { key: 'out', label: '🚶 Ko\'chadaman' },
];

function closeCharModal() {
  charWrap.classList.remove('open');
  activeMember = null;
}

document.getElementById('char-close').addEventListener('click', closeCharModal);
charWrap.addEventListener('click', (e) => {
  if (e.target === charWrap) closeCharModal();
});

function openCharModal(member) {
  const latest = lastMembers.find((m) => String(m.id) === String(member.id)) || member;
  activeMember = latest;
  const jIcon = JOB_ICON[latest.job] || '👤';
  const stIcon = STATUS_ICON[latest.status] || '🏠';
  charTitle.textContent = latest.isAi
    ? `${jIcon} ${latest.name} • ${stIcon} ${STATUS_TEXT[latest.status] || ''}`
    : `${jIcon} ${latest.name} (${latest.age || 25}) • ${stIcon} ${STATUS_TEXT[latest.status] || ''}`;

  const humans = lastMembers.filter((m) => !m.isAi);
  const myMember = humans.find((m) => String(m.id) === String(myUid)) || humans[0] || null;

  // 🤖 1. AI ROBOT USTIGA BOSILGANDA: Buyruq berish oynasi
  if (latest.job === 'robot') {
    chatForm.style.display = 'flex';
    if (statusSection) statusSection.style.display = 'none';
    senderList.replaceChildren();
    if (chatTargetLabel) {
      chatTargetLabel.textContent = "🤖 AI Robotga tayyor buyruq bering yoki pastga o'zingiz yozing:";
    }
    const quickCommands = [
      '🍵 Menga issiq choy olib kel',
      '💧 Muzdek suv olib kel',
      '🍌 Banan olib kel',
      '🍉 Shirin tarvuz olib kel',
      '🍽️ Issiq osh va non olib kel',
      '🍰 Tort va shirinlik olib kel',
      '🧹 Uyni supurib tozalab chiq',
      '🐾 Mushuk va itga ovqat ber',
    ];
    for (const cmd of quickCommands) {
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'sender-pill';
      pill.textContent = cmd;
      pill.addEventListener('click', async () => {
        closeCharModal();
        toast(`🤖 Buyruq yuborildi: "${cmd}"`);
        await api.sendRoomAction({
          type: 'robot_cmd',
          fromId: myMember?.id || null,
          text: cmd,
        });
      });
      senderList.append(pill);
    }
    chatInput.value = '';
    chatInput.placeholder = '🤖 Nima olib kelsin? Yozing (masalan: banan olib kel, suv olib kel)...';
    charWrap.classList.add('open');
    setTimeout(() => chatInput.focus(), 80);
    return;
  }

  // 🐱🐶 2. MUSHUK YOKI IT USTIGA BOSILGANDA: Erkalash / Chaqirish oynasi
  if (latest.job === 'cat' || latest.job === 'dog') {
    chatForm.style.display = 'flex';
    if (statusSection) statusSection.style.display = 'none';
    senderList.replaceChildren();
    const isCat = latest.job === 'cat';
    if (chatTargetLabel) {
      chatTargetLabel.textContent = isCat
        ? '🐱 Mushukchani chaqiring yoki erkalang:'
        : '🐶 Kuchukchani chaqiring yoki buyruq bering:';
    }
    const petActions = isCat
      ? ['🐾 Yonimga kel, Momiqvoy!', '🥛 Oshxonaga borib sut ich', '💤 Yotoqxonaga borib uxla']
      : ['🐾 Yonimga kel, Bobik!', '🦴 Oshxonaga borib suyak ye', "🛡️ Eshik oldini qo'riqla"];
    for (const act of petActions) {
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'sender-pill';
      pill.textContent = act;
      pill.addEventListener('click', async () => {
        closeCharModal();
        await api.sendRoomAction({
          type: 'pet_cmd',
          fromId: myMember?.id || null,
          petId: latest.id,
          text: act,
        });
      });
      senderList.append(pill);
    }
    chatInput.value = '';
    chatInput.placeholder = `${latest.name}ga nima deysiz?...`;
    charWrap.classList.add('open');
    setTimeout(() => chatInput.focus(), 80);
    return;
  }

  const strictMyMember = humans.find((m) => String(m.id) === String(myUid));

  // Agar kompyuterda ?uid= siz ochilgan bo'lsa, faqat 1 marta "Siz kimsiz?" deb so'rab bog'lab oladi
  if (!strictMyMember) {
    senderList.replaceChildren();
    if (chatTargetLabel) {
      chatTargetLabel.textContent = "🔒 Avval o'zingizni tanlang (faqat bir marta so'raladi):";
    }
    for (const m of humans) {
      const pill = document.createElement('button');
      pill.type = 'button';
      pill.className = 'sender-pill';
      pill.textContent = `🙋‍♂️ Men ${m.name}man`;
      pill.addEventListener('click', () => {
        myUid = String(m.id);
        localStorage.setItem('family_uid', myUid);
        pollLocationOnce(true);
        openCharModal(latest);
      });
      senderList.append(pill);
    }
    chatForm.style.display = 'none';
    if (statusSection) statusSection.style.display = 'none';
    charWrap.classList.add('open');
    return;
  }

  chatForm.style.display = 'flex';
  const isMe = String(latest.id) === String(strictMyMember.id);

  // 1. Boshqa odam ustiga bosilganda: faqat O'ZINGIZNING nomingizdan unga gapirasiz, uning holatini o'zgartira olmaysiz!
  if (!isMe) {
    selectedTargetId = String(latest.id);
    senderList.replaceChildren();
    if (chatTargetLabel) {
      chatTargetLabel.textContent = `💬 Siz (${strictMyMember.name}) ➡️ ${latest.name}ning yoniga borib gapirasiz:`;
    }
    if (statusSection) statusSection.style.display = 'none';
    chatInput.value = '';
    chatInput.placeholder = `${latest.name}ga nima deysiz? Yozing...`;
    charWrap.classList.add('open');
    setTimeout(() => chatInput.focus(), 80);
    return;
  }

  // 2. O'ZINGIZNING personajingiz ustiga bosilganda: o'z holatingizni o'zgartirasiz va kimga gapirishni tanlaysiz
  const others = lastMembers.filter((m) => String(m.id) !== String(strictMyMember.id));
  if (!selectedTargetId || !others.some((m) => String(m.id) === String(selectedTargetId))) {
    selectedTargetId = others[0]?.id ? String(others[0].id) : '';
  }

  senderList.replaceChildren();
  const targetObj = others.find((m) => String(m.id) === String(selectedTargetId));
  if (chatTargetLabel) {
    chatTargetLabel.textContent = targetObj
      ? `💬 Siz (${strictMyMember.name}) ➡️ ${targetObj.name}ga gapirasiz:`
      : `💬 Siz (${strictMyMember.name}):`;
  }

  for (const m of others) {
    const pill = document.createElement('button');
    pill.type = 'button';
    pill.className = 'sender-pill' + (String(m.id) === String(selectedTargetId) ? ' active' : '');
    pill.textContent = `➡️ ${JOB_ICON[m.job] || '👤'} ${m.name}`;
    pill.addEventListener('click', () => {
      selectedTargetId = String(m.id);
      for (const ch of senderList.children) ch.classList.remove('active');
      pill.classList.add('active');
      if (chatTargetLabel) {
        chatTargetLabel.textContent = `💬 Siz (${strictMyMember.name}) ➡️ ${m.name}ga gapirasiz:`;
      }
      chatInput.placeholder = `${m.name}ga nima deysiz? Yozing...`;
    });
    senderList.append(pill);
  }

  if (statusSection) statusSection.style.display = 'block';
  statusGrid.replaceChildren();
  for (const s of ALL_STATUSES) {
    const btn = document.createElement('button');
    btn.type = 'button';
    btn.className = 'status-btn' + (latest.status === s.key ? ' active' : '');
    btn.textContent = s.label;
    btn.addEventListener('click', async () => {
      await api.sendRoomAction({ type: 'status', id: strictMyMember.id, status: s.key });
      toast(`✅ ${strictMyMember.name}: ${s.label}`);
      closeCharModal();
    });
    statusGrid.append(btn);
  }

  chatInput.value = '';
  chatInput.placeholder = targetObj
    ? `${targetObj.name}ga nima deysiz? Yozing...`
    : 'Xabar yozing...';
  charWrap.classList.add('open');
  setTimeout(() => chatInput.focus(), 80);
}

chatForm.addEventListener('submit', async (e) => {
  e.preventDefault();
  if (!activeMember) return;
  const text = chatInput.value.trim();
  if (!text) return;

  const humans = lastMembers.filter((m) => !m.isAi);
  const myMember = humans.find((m) => String(m.id) === String(myUid)) || humans[0] || null;

  // 🤖 AI Robotga buyruq yuborilgan bo'lsa
  if (activeMember.job === 'robot') {
    chatInput.value = '';
    closeCharModal();
    toast(`🤖 Buyruq yuborildi: "${text}"`);
    await api.sendRoomAction({
      type: 'robot_cmd',
      fromId: myMember?.id || null,
      text,
    });
    return;
  }

  // 🐱🐶 Mushuk yoki Itga yozilgan bo'lsa
  if (activeMember.job === 'cat' || activeMember.job === 'dog') {
    const petId = activeMember.id;
    chatInput.value = '';
    closeCharModal();
    await api.sendRoomAction({
      type: 'pet_cmd',
      fromId: myMember?.id || null,
      petId,
      text,
    });
    return;
  }

  if (!myMember) return;

  // Har doim FAQAT o'z nomingizdan (myMember.id) yuboriladi!
  const fromId = myMember.id;
  const others = lastMembers.filter((m) => String(m.id) !== String(fromId));
  const toId = String(activeMember.id) !== String(fromId)
    ? activeMember.id
    : (selectedTargetId || (others[0]?.id ?? null));

  chatInput.value = '';
  closeCharModal();

  // Agar o'z oynasidan AI Robotni tanlab yozgan bo'lsa ham buyruq ishlaydi
  const targetObj = lastMembers.find((m) => String(m.id) === String(toId));
  if (targetObj?.job === 'robot') {
    toast(`🤖 Buyruq yuborildi: "${text}"`);
    await api.sendRoomAction({
      type: 'robot_cmd',
      fromId,
      text,
    });
    return;
  }
  if (targetObj?.job === 'cat' || targetObj?.job === 'dog') {
    await api.sendRoomAction({
      type: 'pet_cmd',
      fromId,
      petId: targetObj.id,
      text,
    });
    return;
  }

  await api.sendRoomAction({
    type: 'say',
    fromId,
    toId,
    text,
  });
});

// 3D sahnada personaj ustiga bosishni aniqlash (Raycaster)
const raycaster = new THREE.Raycaster();
const pointerDownPos = new THREE.Vector2();
renderer.domElement.addEventListener('pointerdown', (e) => {
  pointerDownPos.set(e.clientX, e.clientY);
});
renderer.domElement.addEventListener('pointerup', (e) => {
  const moveDist = Math.hypot(e.clientX - pointerDownPos.x, e.clientY - pointerDownPos.y);
  if (moveDist > 15) return; // Kamera aylantirilgan bo'lsa bosish hisoblanmaydi

  const rect = renderer.domElement.getBoundingClientRect();
  const mouse = new THREE.Vector2(
    ((e.clientX - rect.left) / rect.width) * 2 - 1,
    -((e.clientY - rect.top) / rect.height) * 2 + 1
  );
  raycaster.setFromCamera(mouse, camera);

  const charGroups = [];
  for (const c of chars.values()) {
    if (c.group.visible) charGroups.push(c.group);
  }
  const hits = raycaster.intersectObjects(charGroups, true);
  if (hits.length > 0) {
    let obj = hits[0].object;
    while (obj && !obj.userData?.memberId) {
      obj = obj.parent;
    }
    if (obj?.userData?.memberId) {
      const c = chars.get(obj.userData.memberId);
      if (c?.member) openCharModal(c.member);
    }
  }
});

if (api) {
  api.getMembers().then((m) => sync(m, false));
  api.getHome().then(setHome);
  api.getBotStatus().then(showBotStatus);
  api.onMembers((m) => sync(m, true));
  api.onHome(setHome);
  api.onBotStatus(showBotStatus);
  api.onJoined((m) => toast(`🎉 ${m.name} (${m.age} yosh) oilaga qo'shildi!`));
  api.onMoved(({ name, event }) => {
    toast(event === 'arrived' ? `🏠 ${name} uyga keldi!` : `👋 ${name} uydan chiqdi`);
  });
  api.onSay(({ id, name, status, text, toId }) => {
    // Mushuk va it gapirgani ko'rinmasin
    if (id === 900002 || id === 900003) return;
    const c = chars.get(id);
    if (c?.member?.job === 'cat' || c?.member?.job === 'dog') return;
    if (c && (INDOOR.has(status) || c.member?.isAi) && c.group.visible) {
      c.say(text);
      const target = toId && chars.get(toId);
      if (
        target &&
        target.group.visible &&
        target.spot?.approach &&
        c.member?.status !== 'wc' &&
        target.member?.status !== 'wc'
      ) {
        const sameRoom = room.nearestNodeInSameRoom(c.group.position).split('_')[0] ===
                         room.nearestNodeInSameRoom(target.group.position).split('_')[0];

        // Suhbatdoshning yonidagi turish nuqtasi (ustma-ust tushib qolmasligi uchun kamida 0.85m masofa)
        const talkPos = target.spot.approach.clone();
        if (talkPos.distanceTo(target.group.position) < 0.55) {
          const dir = new THREE.Vector3().subVectors(c.group.position, target.group.position);
          dir.y = 0;
          if (dir.lengthSq() < 0.01) dir.set(0, 0, 1);
          dir.normalize();
          talkPos.copy(target.group.position).addScaledVector(dir, 0.88);
        }

        const rotToTarget = Math.atan2(
          target.group.position.x - talkPos.x,
          target.group.position.z - talkPos.z
        );
        const talkSpot = {
          pos: talkPos,
          approach: talkPos,
          node: target.spot.node,
          rotY: rotToTarget,
          pose: 'stand',
        };
        const fromNow = {
          pos: c.group.position.clone(),
          approach: c.state === 'posing' && c.spot?.approach ? c.spot.approach : c.group.position.clone(),
          node: c.state === 'posing' ? c.spot?.node : null,
        };

        // Bitta xonada bo'lsa ortiqcha aylanib o'tmasdan to'g'ri yoniga boradi, boshqa xonada bo'lsa eshik orqali boradi
        const goPath = sameRoom
          ? [fromNow.approach.clone(), talkPos.clone()]
          : room.pathBetween(fromNow, talkSpot);

        const backPathFn = (tSpot, hSpot) =>
          sameRoom
            ? [tSpot.pos.clone(), (hSpot.approach || hSpot.pos).clone(), hSpot.pos.clone()]
            : room.pathBetween(tSpot, hSpot);

        c.talkTo(
          goPath,
          talkSpot,
          backPathFn,
          () => {
            // Yetib borgan zahoti ikkalasi yuzma-yuz bir-biriga qaraydi va gap pufagi yangilanadi!
            c.say(text);
            target.lookAtPosition(talkPos, 5200);
          }
        );
      }
    } else {
      toast(`${STATUS_ICON[status] || '💬'} ${name}: ${text}`);
    }
  });
} else {
  sync([], false);
}

// ---------- Asosiy sikl ----------
const timer = new THREE.Timer();
let elapsed = 0;
function loop(time) {
  timer.update(time);
  const dt = Math.min(timer.getDelta(), 0.05);
  elapsed += dt;
  let nearFrontDoor = false;
  let nearWcDoor = false;
  for (const c of chars.values()) {
    c.update(dt);
    if (c.isPassingFrontDoor()) nearFrontDoor = true;
    if (c.isPassingWcDoor()) nearWcDoor = true;
  }
  room.setDoorWanted(nearFrontDoor);
  room.setWcDoorWanted(nearWcDoor);
  room.update(dt, elapsed);
  controls.update();
  outline.render(scene, camera);
  labels.render(scene, camera);
  requestAnimationFrame(loop);
}
loop();

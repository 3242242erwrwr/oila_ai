import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { toon, woodMat, carPaintMat, glassMat, chromeMat, mesh, disposeTree } from './toon.js';

export const HOUSE = { w: 18, d: 12 }; // X: -9..9, Z: -6..6
export const DOOR = {
  x: -1.8,
  z: 6,
  width: 1.3,
  height: 2.3,
  inside: new THREE.Vector3(-1.8, 0, 5.0),
  outside: new THREE.Vector3(-1.8, 0, 7.2),
};

// Realistik laklangan eman parket teksturasi
function parquetTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const g = c.getContext('2d');
  const tones = ['#c89666', '#be8a59', '#d2a273', '#b58050', '#c49162'];
  const rows = 8;
  const rh = 512 / rows;
  for (let r = 0; r < rows; r++) {
    const y = r * rh;
    const shift = (r * 137) % 256;
    for (let k = -1; k < 3; k++) {
      const x0 = k * 256 + shift;
      g.fillStyle = tones[(r + k + 4) % tones.length];
      g.fillRect(x0, y, 256, rh);
      // Yog'och tolalari
      g.fillStyle = 'rgba(90, 50, 20, 0.08)';
      for (let f = 0; f < 6; f++) {
        g.fillRect(x0, y + f * 10 + 3, 256, 2);
      }
      g.fillStyle = 'rgba(60, 32, 12, 0.35)';
      g.fillRect(x0, y, 2, rh);
    }
    g.fillStyle = 'rgba(60, 32, 12, 0.4)';
    g.fillRect(0, y + rh - 2, 512, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  return t;
}

// Realistik marmar/kafel teksturasi
function ceramicTexture(a = '#f9f6f0', b = '#ece4d5', grout = 'rgba(120,110,95,0.35)') {
  const c = document.createElement('canvas');
  c.width = 256; c.height = 256;
  const g = c.getContext('2d');
  for (let y = 0; y < 4; y++) {
    for (let x = 0; x < 4; x++) {
      g.fillStyle = (x + y) % 2 === 0 ? a : b;
      g.fillRect(x * 64, y * 64, 64, 64);
      g.strokeStyle = grout;
      g.lineWidth = 2;
      g.strokeRect(x * 64, y * 64, 64, 64);
    }
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 3);
  return t;
}

// O'zbek naqshli gilam teksturasi
function uzbekCarpetTexture() {
  const c = document.createElement('canvas');
  c.width = 512; c.height = 512;
  const g = c.getContext('2d');
  const cx = 256, cy = 256;
  g.fillStyle = '#7b112c';
  g.fillRect(0, 0, 512, 512);

  const rings = [
    [245, '#d4a359'], [232, '#1d3557'], [215, '#7b112c'],
    [195, '#e9c46a'], [185, '#8d1b3d'], [120, '#1d3557'],
    [108, '#e9c46a'], [95, '#7b112c'], [45, '#e9c46a'],
  ];
  for (const [r, col] of rings) {
    g.beginPath();
    g.arc(cx, cy, r, 0, Math.PI * 2);
    g.fillStyle = col;
    g.fill();
  }
  // Naqsh yulduzchalari
  for (let i = 0; i < 16; i++) {
    const a = (i / 16) * Math.PI * 2;
    const x = cx + Math.cos(a) * 150;
    const y = cy + Math.sin(a) * 150;
    g.beginPath();
    g.arc(x, y, 14, 0, Math.PI * 2);
    g.fillStyle = i % 2 === 0 ? '#e9c46a' : '#2a9d8f';
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

// ==================== YO'LAK VA ESHIKLAR GRAFI (100% DEVOR/MEBELDAN AYLANIB O'TADI) ====================
const NAV_NODES = {
  // Tashqi va asosiy eshik
  door_out:    new THREE.Vector3(-1.8, 0, 7.2),
  door_in:     new THREE.Vector3(-1.8, 0, 5.1),

  // Mehmonxona halqa koridori (o'rtadagi stol va divan atrofidan aylanib o'tadi)
  hall_sw:     new THREE.Vector3(-1.8, 0, 4.4), // Garaj eshigi va Asosiy eshik oldi
  hall_w:      new THREE.Vector3(-2.0, 0, 1.8), // Stolning chap tomonidagi ochiq yo'lak
  hall_nw:     new THREE.Vector3(-2.0, 0, -1.0), // Yotoqxona eshigi oldi (100% ochiq!)
  hall_pc:     new THREE.Vector3(-1.3, 0, -3.4), // Kompyuter stullari orqasi
  hall_n:      new THREE.Vector3(0.3, 0, -1.0),  // Stolning yuqori tomoni
  hall_tv:     new THREE.Vector3(0.5, 0, -3.5),  // Divan va TV oldi yo'lagi
  hall_ne:     new THREE.Vector3(2.7, 0, -0.8),
  hall_e:      new THREE.Vector3(2.9, 0, 0.3),   // Oshxona eshigi oldi
  hall_wc_out: new THREE.Vector3(2.9, 0, 2.8),   // Hojatxona eshigi oldi
  hall_se:     new THREE.Vector3(2.6, 0, 4.5),   // Stolning o'ng-pastki tomoni
  hall_s:      new THREE.Vector3(0.3, 0, 4.6),   // Stolning pastki tomoni

  // Yotoqxona ichi (faqat hall_nw orqali eshikdan kiriladi!)
  bed_door:    new THREE.Vector3(-3.7, 0, -1.0),
  bed_e:       new THREE.Vector3(-4.6, 0, -2.5),
  bed_mid:     new THREE.Vector3(-6.2, 0, -2.5),
  bed_w:       new THREE.Vector3(-7.8, 0, -2.5),

  // Garaj ichi (faqat hall_sw orqali garaj eshigidan kiriladi!)
  gar_door:    new THREE.Vector3(-3.7, 0, 4.4),
  gar_mid:     new THREE.Vector3(-5.6, 0, 4.4),
  gar_w:       new THREE.Vector3(-7.4, 0, 4.4),

  // Oshxona ichi (faqat hall_e orqali oshxona eshigidan kiriladi!)
  kit_door:    new THREE.Vector3(4.7, 0, 0.3),
  kit_s:       new THREE.Vector3(6.6, 0, 0.3),
  kit_w:       new THREE.Vector3(4.8, 0, -2.0),
  kit_n:       new THREE.Vector3(6.6, 0, -3.9),

  // Hojatxona ichi (faqat hall_wc_out orqali hojatxona eshigidan kiriladi!)
  wc_door:     new THREE.Vector3(4.8, 0, 2.8),
  wc_mid:      new THREE.Vector3(6.6, 0, 4.3),
};

const NAV_EDGES = [
  ['door_out', 'door_in'],
  ['door_in', 'hall_sw'],

  // Mehmonxona aylanma yo'laklari
  ['hall_sw', 'hall_w'],
  ['hall_w', 'hall_nw'],
  ['hall_nw', 'hall_pc'],
  ['hall_nw', 'hall_n'],
  ['hall_pc', 'hall_tv'],
  ['hall_n', 'hall_tv'],
  ['hall_n', 'hall_ne'],
  ['hall_ne', 'hall_e'],
  ['hall_e', 'hall_wc_out'],
  ['hall_wc_out', 'hall_se'],
  ['hall_se', 'hall_s'],
  ['hall_s', 'hall_sw'],

  // Xonalararo eshiklar (devor ichidan o'tmaslik uchun YAGONA bog'lanishlar!)
  ['hall_nw', 'bed_door'],
  ['bed_door', 'bed_e'],
  ['bed_e', 'bed_mid'],
  ['bed_mid', 'bed_w'],

  ['hall_sw', 'gar_door'],
  ['gar_door', 'gar_mid'],
  ['gar_mid', 'gar_w'],

  ['hall_e', 'kit_door'],
  ['kit_door', 'kit_s'],
  ['kit_door', 'kit_w'],
  ['kit_w', 'kit_n'],

  ['hall_wc_out', 'wc_door'],
  ['wc_door', 'wc_mid'],
];

export class Room {
  constructor(scene) {
    this.group = new THREE.Group();
    scene.add(this.group);

    this.dynamicGroup = new THREE.Group();
    this.group.add(this.dynamicGroup);
    this.carsGroup = new THREE.Group();
    this.group.add(this.carsGroup);

    this.doorOpen = 0;
    this.doorTarget = 0;
    this.wcDoorOpen = 0;
    this.wcDoorTarget = 0;

    this.layoutKey = '';
    this.cars = [];

    this.spots = {
      home: [],
      pc: [],
      tv: [],
      eat: [],
      cook: [],
      sleep: [],
      wc: [],
      wc_wait: [],
    };

    this.buildFloorsAndWalls();
    this.buildDoor();
    this.buildWindowAndClock();
    this.buildStaticFurniture();
    this.buildRoomLights();
    this.buildRoomSigns();
    this.syncLayout([]);
  }

  buildFloorsAndWalls() {
    // Poydevor
    const base = mesh(new THREE.BoxGeometry(18.5, 0.26, 12.5), toon('#3d354b', { roughness: 0.7 }), { cast: false });
    base.position.y = -0.15;
    this.group.add(base);

    const addFloor = (x0, x1, z0, z1, mat) => {
      const f = mesh(new THREE.BoxGeometry(x1 - x0, 0.06, z1 - z0), mat, { cast: false });
      f.position.set((x0 + x1) / 2, -0.01, (z0 + z1) / 2);
      this.group.add(f);
    };

    // 5 ta xona pollari (Cartoon uslubida)
    addFloor(-9, -3, -6, 0, toon('#d8e2dc')); // Yotoqxona
    addFloor(-9, -3, 0, 6, toon('#adb5bd'));  // Garaj
    addFloor(-3, 4, -6, 6, toon('#ffffff', { map: parquetTexture() })); // Mehmonxona
    addFloor(4, 9, -6, 1.8, toon('#ffffff', { map: ceramicTexture('#fffdf5', '#e9dfca') })); // Oshxona
    addFloor(4, 9, 1.8, 6, toon('#ffffff', { map: ceramicTexture('#e0fbfc', '#bde0fe') }));  // Hojatxona

    const wallMat = toon('#f7e3c6');
    const partMat = toon('#eed2b3');
    const trimMat = woodMat('#b07a52');
    const H = 3.6;

    const backWall = mesh(new THREE.BoxGeometry(18.2, H, 0.22), wallMat);
    backWall.position.set(0, H / 2, -6.1);
    const leftWall = mesh(new THREE.BoxGeometry(0.22, H, 12.2), wallMat);
    leftWall.position.set(-9.1, H / 2, 0);
    this.group.add(backWall, leftWall);

    const addPartition = (x0, z0, x1, z1, h = 1.4) => {
      const len = Math.hypot(x1 - x0, z1 - z0);
      const w = mesh(new THREE.BoxGeometry(len, h, 0.16), partMat);
      w.position.set((x0 + x1) / 2, h / 2, (z0 + z1) / 2);
      w.rotation.y = Math.atan2(x1 - x0, z1 - z0) - Math.PI / 2;
      const cap = mesh(new THREE.BoxGeometry(len + 0.04, 0.06, 0.2), trimMat);
      cap.position.set((x0 + x1) / 2, h + 0.02, (z0 + z1) / 2);
      cap.rotation.y = w.rotation.y;
      this.group.add(w, cap);
    };

    // Yotoqxona va Garaj o'rtasi
    addPartition(-9, 0, -3, 0, 1.45);

    // Yotoqxona va Mehmonxona o'rtasi (Eshik: z = -1.7..-0.3, markazi z = -1.0 — 100% OCHIQ!)
    addPartition(-3, -6, -3, -1.7, 1.45);
    addPartition(-3, -0.3, -3, 0, 1.45);

    // Garaj va Mehmonxona o'rtasi (Eshik: z = 3.8..5.1, markazi z = 4.45 — 100% OCHIQ!)
    addPartition(-3, 0, -3, 3.8, 1.45);
    addPartition(-3, 5.1, -3, 6, 1.45);

    // Mehmonxona va Oshxona o'rtasi (Eshik/yo'lak: z = -0.5..1.5, markazi z = 0.3 — 100% OCHIQ!)
    addPartition(4, -6, 4, -0.5, 1.45);
    addPartition(4, 1.5, 4, 1.8, 1.45);

    // Hojatxona devorlari (Eshik: x = 4, z = 2.25..3.35, markazi z = 2.8)
    addPartition(4, 1.8, 9, 1.8, 1.7);
    addPartition(4, 1.8, 4, 2.25, 1.7);
    addPartition(4, 3.35, 4, 6, 1.7);
  }

  buildDoor() {
    const frameMat = woodMat('#6f4518', 0.35);
    const x = DOOR.x;
    const z = 5.95;
    for (const dx of [-0.65, 0.65]) {
      const post = mesh(new THREE.BoxGeometry(0.14, 2.2, 0.18), frameMat);
      post.position.set(x + dx, 1.1, z);
      this.group.add(post);
    }
    const top = mesh(new THREE.BoxGeometry(1.44, 0.14, 0.2), frameMat);
    top.position.set(x, 2.22, z);
    this.group.add(top);

    this.doorPivot = new THREE.Group();
    this.doorPivot.position.set(x - 0.6, 0, z);
    const panel = mesh(new THREE.BoxGeometry(1.2, 2.15, 0.08), woodMat('#9c6644', 0.3));
    panel.position.set(0.6, 1.075, 0);
    const knob = mesh(new THREE.SphereGeometry(0.055, 12, 10), chromeMat('#ffd166'));
    knob.position.set(1.05, 1.0, -0.07);
    this.doorPivot.add(panel, knob);
    this.group.add(this.doorPivot);

    const mat = mesh(new THREE.BoxGeometry(1.45, 0.03, 0.75), toon('#9b2226', { roughness: 0.9 }), { cast: false });
    mat.position.set(x, 0.02, 5.35);
    this.group.add(mat);
  }

  buildWindowAndClock() {
    const g = new THREE.Group();
    g.position.set(0.7, 2.15, -5.96);
    this.skyMat = new THREE.MeshBasicMaterial({ color: '#8fd3ff' });
    const glass = new THREE.Mesh(new THREE.PlaneGeometry(2.4, 1.4), this.skyMat);
    glass.position.z = 0.01;
    g.add(glass);

    this.sunMat = new THREE.MeshBasicMaterial({ color: '#fff3a0' });
    this.sun = new THREE.Mesh(new THREE.CircleGeometry(0.2, 20), this.sunMat);
    this.sun.position.set(0.6, 0.3, 0.02);
    g.add(this.sun);

    const frame = woodMat('#ffffff', 0.25);
    for (const [w, h, x, y] of [
      [2.6, 0.12, 0, 0.75], [2.6, 0.12, 0, -0.75], [0.12, 1.6, 1.25, 0], [0.12, 1.6, -1.25, 0],
      [2.4, 0.06, 0, 0], [0.06, 1.4, 0, 0],
    ]) {
      const b = mesh(new THREE.BoxGeometry(w, h, 0.1), frame);
      b.position.set(x, y, 0.05);
      g.add(b);
    }
    const curtain = toon('#9b2226', { roughness: 0.85 });
    for (const x of [-1.48, 1.48]) {
      const c = mesh(new THREE.BoxGeometry(0.4, 1.9, 0.09), curtain);
      c.position.set(x, -0.08, 0.11);
      g.add(c);
    }
    this.group.add(g);

    const cg = new THREE.Group();
    cg.position.set(3.15, 2.65, -5.95);
    const face = mesh(new THREE.CylinderGeometry(0.38, 0.38, 0.08, 28), toon('#ffffff', { roughness: 0.2 }));
    face.rotation.x = Math.PI / 2;
    const rim = mesh(new THREE.TorusGeometry(0.38, 0.04, 10, 28), chromeMat('#d4a359'));
    rim.position.z = 0.04;
    cg.add(face, rim);
    const hand = (len, w) => {
      const p = new THREE.Group();
      const h = mesh(new THREE.BoxGeometry(w, len, 0.02), toon('#1d1e2c'));
      h.position.y = len / 2;
      p.add(h);
      p.position.z = 0.07;
      cg.add(p);
      return p;
    };
    this.hourHand = hand(0.18, 0.038);
    this.minuteHand = hand(0.27, 0.028);
    this.group.add(cg);

    const lamp = new THREE.Group();
    lamp.position.set(-2.5, 0, -5.4);
    const base = mesh(new THREE.CylinderGeometry(0.24, 0.28, 0.08, 16), chromeMat('#2d3142'));
    const pole = mesh(new THREE.CylinderGeometry(0.03, 0.03, 1.75, 10), chromeMat('#d4a359'));
    pole.position.y = 0.88;
    this.lampShadeMat = toon('#ffe8a3', { emissive: '#ffcf7a', emissiveIntensity: 0.3, roughness: 0.4 });
    const shade = mesh(new THREE.CylinderGeometry(0.2, 0.38, 0.42, 20, 1, true), this.lampShadeMat);
    shade.position.y = 1.82;
    lamp.add(base, pole, shade);
    this.lampLight = new THREE.PointLight('#ffcf7a', 3, 14, 1.4);
    this.lampLight.position.set(0, 1.7, 0);
    lamp.add(this.lampLight);
    this.group.add(lamp);
  }

  buildRoomLights() {
    // Cartoon rejimda qo'shimcha shift lampalari shart emas
  }

  // O'zgarmas jihozlar (Eshiklarni umuman to'smaydigan joylarda!)
  buildStaticFurniture() {
    // 1. Kompyuter stoli: Mehmonxona orqa devorida (x = -1.1, z = -5.2)
    const desk = new THREE.Group();
    desk.position.set(-1.1, 0, -5.2);
    const top = mesh(new THREE.BoxGeometry(2.2, 0.09, 0.78), woodMat('#6f4518', 0.3));
    top.position.y = 0.76;
    desk.add(top);
    for (const [lx, lz] of [[-1.0, -0.32], [1.0, -0.32], [-1.0, 0.32], [1.0, 0.32]]) {
      const l = mesh(new THREE.BoxGeometry(0.07, 0.76, 0.07), chromeMat('#2d3142'));
      l.position.set(lx, 0.38, lz);
      desk.add(l);
    }
    for (const dx of [-0.52, 0.52]) {
      const stand = mesh(new THREE.BoxGeometry(0.12, 0.22, 0.12), chromeMat('#2d3142'));
      stand.position.set(dx, 0.9, -0.18);
      const monFrame = mesh(new THREE.BoxGeometry(0.7, 0.44, 0.05), toon('#1b1b2f', { roughness: 0.25 }));
      monFrame.position.set(dx, 1.14, -0.18);
      const screen = new THREE.Mesh(new THREE.PlaneGeometry(0.63, 0.37), new THREE.MeshBasicMaterial({ color: '#38bdf8' }));
      screen.position.set(dx, 1.14, -0.15);
      const kb = mesh(new THREE.BoxGeometry(0.38, 0.025, 0.14), toon('#1b1b2f'));
      kb.position.set(dx, 0.82, 0.12);
      desk.add(stand, monFrame, screen, kb);

      const pos = new THREE.Vector3(-1.1 + dx, 0, -4.42);
      const chair = this.makeChair('#3a506b');
      chair.position.copy(pos);
      chair.rotation.y = Math.PI;
      this.group.add(chair);
      this.spots.pc.push({
        pos,
        approach: new THREE.Vector3(-1.1 + dx, 0, -3.6),
        node: 'hall_pc',
        rotY: Math.PI,
        pose: 'pc',
      });
    }
    this.group.add(desk);

    // 2. Televizor tumbasi va katta ekran: Mehmonxonaning O'NG-YUQORI devorida (x = 3.55, z = -3.5)
    // Yotoqxona eshigini (-3.0, -1.0) UMUMAN to'smaydi!
    const tvStand = new THREE.Group();
    tvStand.position.set(3.52, 0, -3.5);
    tvStand.rotation.y = -Math.PI / 2;
    const cab = mesh(new THREE.BoxGeometry(2.1, 0.48, 0.48), woodMat('#583101', 0.3));
    cab.position.y = 0.24;
    const tvFrame = mesh(new THREE.BoxGeometry(1.9, 1.06, 0.07), toon('#111827', { roughness: 0.2, metalness: 0.5 }));
    tvFrame.position.y = 1.08;
    this.tvScreenMat = new THREE.MeshBasicMaterial({ color: '#38bdf8' });
    const tvScreen = new THREE.Mesh(new THREE.PlaneGeometry(1.78, 0.94), this.tvScreenMat);
    tvScreen.position.set(0, 1.08, 0.04);
    tvStand.add(cab, tvFrame, tvScreen);
    this.group.add(tvStand);

    // 3. Oshxona peshtaxtasi, o'zbek qozoni va muzlatgich
    const counter = mesh(new THREE.BoxGeometry(3.2, 0.82, 0.78), woodMat('#bc6c25', 0.35));
    counter.position.set(6.4, 0.41, -5.45);
    const counterTop = mesh(new THREE.BoxGeometry(3.3, 0.07, 0.84), toon('#f8f9fa', { roughness: 0.15, clearcoat: 0.8 }));
    counterTop.position.set(6.4, 0.85, -5.45);
    const stove = mesh(new THREE.BoxGeometry(0.9, 0.05, 0.62), toon('#111827', { roughness: 0.15 }));
    stove.position.set(5.85, 0.9, -5.45);
    const kazan = mesh(new THREE.SphereGeometry(0.24, 18, 12, 0, Math.PI * 2, Math.PI * 0.3, Math.PI * 0.7), chromeMat('#2b2d42'));
    kazan.position.set(5.85, 1.05, -5.45);
    const fridge = mesh(new THREE.BoxGeometry(0.9, 2.1, 0.86), carPaintMat('#e2e8f0'));
    fridge.position.set(8.38, 1.05, -5.2);
    this.group.add(counter, counterTop, stove, kazan, fridge);

    this.spots.cook.push(
      {
        pos: new THREE.Vector3(5.85, 0, -4.58),
        approach: new THREE.Vector3(5.85, 0, -4.0),
        node: 'kit_n',
        rotY: Math.PI,
        pose: 'cook',
      },
      {
        pos: new THREE.Vector3(6.95, 0, -4.58),
        approach: new THREE.Vector3(6.95, 0, -4.0),
        node: 'kit_n',
        rotY: Math.PI,
        pose: 'cook',
      }
    );

    // 4. Hojatxona jihozlari (Eshikdan uzoqda, erkin kirib-chiqiladi)
    this.wcDoorPivot = new THREE.Group();
    this.wcDoorPivot.position.set(4.0, 0, 2.25);
    const doorPanel = mesh(new THREE.BoxGeometry(0.08, 1.68, 1.1), woodMat('#8ecae6', 0.3));
    doorPanel.position.set(0, 0.84, 0.55);
    this.wcDoorPivot.add(doorPanel);
    this.group.add(this.wcDoorPivot);

    const wc = new THREE.Group();
    wc.position.set(7.85, 0, 4.65);
    wc.rotation.y = -Math.PI / 2;
    const ceramicMat = toon('#ffffff', { roughness: 0.12, clearcoat: 0.9 });
    const bowl = mesh(new THREE.CylinderGeometry(0.28, 0.22, 0.44, 18), ceramicMat);
    bowl.position.y = 0.22;
    const tank = mesh(new THREE.BoxGeometry(0.46, 0.5, 0.24), ceramicMat);
    tank.position.set(0, 0.62, -0.22);
    wc.add(bowl, tank);

    const sink = mesh(new THREE.BoxGeometry(0.74, 0.8, 0.48), ceramicMat);
    sink.position.set(6.6, 0.4, 2.22);
    const mirror = mesh(new THREE.BoxGeometry(0.68, 0.78, 0.04), chromeMat('#caf0f8'));
    mirror.position.set(6.6, 1.28, 1.92);
    this.group.add(wc, sink, mirror);

    this.spots.wc.push({
      pos: new THREE.Vector3(7.85, 0, 4.65),
      approach: new THREE.Vector3(6.7, 0, 4.4),
      node: 'wc_mid',
      rotY: -Math.PI / 2,
      pose: 'sit',
    });
    for (let i = 0; i < 6; i++) {
      const p = new THREE.Vector3(3.15, 0, 2.8 + i * 0.62);
      this.spots.wc_wait.push({
        pos: p,
        approach: p.clone(),
        node: 'hall_wc_out',
        rotY: Math.PI / 2,
        pose: 'stand',
        waitingWc: true,
      });
    }
  }

  // ==================== A'ZOLAR SONIGA MOSLASHUVCHI MEBELLAR ====================
  syncLayout(members) {
    const humans = members.filter((m) => !m.isAi);
    const n = Math.max(2, humans.length);
    const taxiMembers = humans.filter((m) => m.job === 'taxi');
    const carCount = Math.max(1, taxiMembers.length);
    const key = `${n}:${carCount}:${taxiMembers.map((m) => m.id).join(',')}`;
    if (key === this.layoutKey) return;
    this.layoutKey = key;

    disposeTree(this.dynamicGroup);
    this.dynamicGroup.clear();
    disposeTree(this.carsGroup);
    this.carsGroup.clear();

    this.spots.sleep = [];
    this.spots.tv = [];
    this.spots.home = [];
    this.spots.eat = [];

    this.buildDynamicBeds(n);
    this.buildDynamicSofa(n);
    this.buildDynamicLivingTable(n);
    this.buildDynamicKitchenTable(n);
    this.buildDynamicCars(taxiMembers);
  }

  buildDynamicBeds(n) {
    const colors = ['#3a506b', '#b5179e', '#2a9d8f', '#e07a5f', '#457b9d', '#6d597a'];
    const cols = Math.min(n, 4);
    const stepX = cols > 1 ? Math.min(1.38, 4.3 / (cols - 1)) : 0;
    const startX = -8.1;

    for (let i = 0; i < n; i++) {
      const row = Math.floor(i / 4);
      const col = i % 4;
      const bx = row === 0 ? startX + col * stepX : -7.9 + col * 1.4;
      const bz = row === 0 ? -4.65 : -1.1;

      const bed = new THREE.Group();
      bed.position.set(bx, 0, bz);
      const w = 1.08;
      const frame = mesh(new THREE.BoxGeometry(w, 0.3, 1.8), woodMat('#6f4518', 0.35));
      frame.position.y = 0.17;
      const head = mesh(new THREE.BoxGeometry(w, 0.82, 0.12), woodMat('#583101', 0.3));
      head.position.set(0, 0.43, -0.86);
      const mattress = mesh(new THREE.BoxGeometry(w - 0.08, 0.16, 1.68), toon('#ffffff', { roughness: 0.75 }));
      mattress.position.set(0, 0.38, 0.02);
      const blanket = mesh(new THREE.BoxGeometry(w - 0.05, 0.18, 1.15), toon(colors[i % colors.length], { roughness: 0.82 }));
      blanket.position.set(0, 0.4, 0.26);
      const pillow = mesh(new THREE.BoxGeometry(0.65, 0.13, 0.32), toon('#fff8eb', { roughness: 0.8 }));
      pillow.position.set(0, 0.5, -0.56);
      bed.add(frame, head, mattress, blanket, pillow);
      this.dynamicGroup.add(bed);

      const node = bx < -6.9 ? 'bed_w' : bx < -5.3 ? 'bed_mid' : 'bed_e';
      this.spots.sleep.push({
        pos: new THREE.Vector3(bx, 0, bz + 0.12),
        approach: new THREE.Vector3(bx, 0, -2.5),
        node,
        rotY: 0,
        pose: 'sleep',
      });
    }
  }

  buildDynamicSofa(n) {
    // Divan Mehmonxonaning yuqori-o'ng qismida (x = 1.45, z = -3.5) TV (x = 3.52, z = -3.5) ga qaragan!
    const sofaSeats = Math.min(n, 5);
    const totalLen = Math.max(1.75, sofaSeats * 0.52 + 0.25);
    const centerZ = -3.5;
    const sofaX = 1.45;

    const sofa = new THREE.Group();
    sofa.position.set(sofaX, 0, centerZ);
    sofa.rotation.y = Math.PI / 2; // +X (TV) tomonga qaragan
    const sMat = toon('#2a9d8f', { roughness: 0.82 });
    const seat = mesh(new THREE.BoxGeometry(totalLen, 0.38, 0.84), sMat);
    seat.position.y = 0.32;
    const backr = mesh(new THREE.BoxGeometry(totalLen, 0.74, 0.22), sMat);
    backr.position.set(0, 0.72, -0.33);
    sofa.add(seat, backr);
    for (const x of [-totalLen / 2 - 0.1, totalLen / 2 + 0.1]) {
      const arm = mesh(new THREE.BoxGeometry(0.2, 0.56, 0.84), sMat);
      arm.position.set(x, 0.44, 0);
      sofa.add(arm);
    }
    this.dynamicGroup.add(sofa);

    for (let i = 0; i < n; i++) {
      const t = sofaSeats === 1 ? 0 : (i % sofaSeats) / (sofaSeats - 1) - 0.5;
      const dz = centerZ + t * (totalLen - 0.5);
      this.spots.tv.push({
        pos: new THREE.Vector3(sofaX + 0.12, 0, dz),
        approach: new THREE.Vector3(2.25, 0, dz),
        node: 'hall_tv',
        rotY: Math.PI / 2,
        pose: 'sit',
      });
    }
  }

  buildDynamicLivingTable(n) {
    const center = new THREE.Vector3(0.45, 0, 2.0);
    const seatR = Math.max(1.3, Math.min(1.72, 0.92 + n * 0.11));
    const tableR = seatR - 0.58;

    // Haqiqiy O'zbek naqshli gilami
    const rug = mesh(
      new THREE.CylinderGeometry(seatR + 0.55, seatR + 0.55, 0.025, 48),
      toon('#ffffff', { map: uzbekCarpetTexture(), roughness: 0.88 }),
      { cast: false }
    );
    rug.position.set(center.x, 0.014, center.z);
    this.dynamicGroup.add(rug);

    const cTable = mesh(new THREE.CylinderGeometry(tableR, tableR, 0.09, 36), woodMat('#7f5539', 0.28));
    cTable.position.set(center.x, 0.68, center.z);
    const cLeg = mesh(new THREE.CylinderGeometry(0.12, 0.18, 0.65, 16), woodMat('#583101', 0.35));
    cLeg.position.set(center.x, 0.32, center.z);
    this.dynamicGroup.add(cTable, cLeg);

    // Dasturxon: ko'k choynak va tandir non
    const teapot = mesh(new THREE.SphereGeometry(0.13, 16, 12), toon('#1d3557', { roughness: 0.15, clearcoat: 0.9 }));
    teapot.position.set(center.x, 0.81, center.z);
    const non = mesh(new THREE.CylinderGeometry(0.18, 0.18, 0.05, 18), toon('#d4a359', { roughness: 0.6 }));
    non.position.set(center.x + 0.24, 0.75, center.z + 0.1);
    this.dynamicGroup.add(teapot, non);

    const chairColors = ['#9b2226', '#d4a359', '#2a9d8f', '#b5179e', '#1d3557', '#e07a5f', '#3a506b'];
    const ringNodes = ['hall_n', 'hall_ne', 'hall_e', 'hall_se', 'hall_s', 'hall_sw', 'hall_w', 'hall_nw'];

    for (let i = 0; i < n; i++) {
      const a = (i / n) * Math.PI * 2 + Math.PI / 4;
      const pos = new THREE.Vector3(center.x + Math.cos(a) * seatR, 0, center.z + Math.sin(a) * seatR);
      const approach = new THREE.Vector3(center.x + Math.cos(a) * (seatR + 0.65), 0, center.z + Math.sin(a) * (seatR + 0.65));
      const rotY = Math.atan2(-Math.cos(a), -Math.sin(a));
      const ch = this.makeChair(chairColors[i % chairColors.length]);
      ch.position.copy(pos);
      ch.rotation.y = rotY;
      this.dynamicGroup.add(ch);

      const cupR = tableR - 0.17;
      const cup = mesh(new THREE.CylinderGeometry(0.055, 0.04, 0.07, 14), toon('#1d3557', { roughness: 0.15, clearcoat: 0.8 }));
      cup.position.set(center.x + Math.cos(a) * cupR, 0.76, center.z + Math.sin(a) * cupR);
      this.dynamicGroup.add(cup);

      // Eng yaqin koridor tugunini topish
      let bestNode = 'hall_w';
      let bestDist = Infinity;
      for (const nk of ringNodes) {
        const d = approach.distanceTo(NAV_NODES[nk]);
        if (d < bestDist) {
          bestDist = d;
          bestNode = nk;
        }
      }

      this.spots.home.push({ pos, approach, node: bestNode, rotY, pose: 'sit' });
    }
  }

  buildDynamicKitchenTable(n) {
    const center = new THREE.Vector3(6.65, 0, -2.0);
    const perSide = Math.ceil(n / 2);
    const tableW = Math.max(1.45, perSide * 0.68 + 0.28);
    const tableD = 1.1;

    const dTable = mesh(new THREE.BoxGeometry(tableW, 0.09, tableD), woodMat('#8a5a3b', 0.28));
    dTable.position.set(center.x, 0.76, center.z);
    const dLeg = mesh(new THREE.CylinderGeometry(0.14, 0.2, 0.74, 14), woodMat('#583101', 0.35));
    dLeg.position.set(center.x, 0.37, center.z);
    this.dynamicGroup.add(dTable, dLeg);

    for (let i = 0; i < n; i++) {
      const side = i % 2 === 0 ? -1 : 1; // -1: yuqori qator (kit_n), +1: pastki qator (kit_s)
      const col = Math.floor(i / 2);
      const offset = perSide === 1 ? 0 : (col / (perSide - 1) - 0.5) * (tableW - 0.58);
      const pos = new THREE.Vector3(center.x + offset, 0, center.z + side * 0.88);
      const approach = new THREE.Vector3(center.x + offset, 0, side < 0 ? -3.85 : 0.25);
      const node = side < 0 ? 'kit_n' : 'kit_s';
      const rotY = side < 0 ? 0 : Math.PI;

      const ch = this.makeChair('#bc6c25');
      ch.position.copy(pos);
      ch.rotation.y = rotY;
      this.dynamicGroup.add(ch);

      const plate = mesh(new THREE.CylinderGeometry(0.17, 0.14, 0.03, 16), toon('#ffffff', { roughness: 0.15, clearcoat: 0.8 }));
      plate.position.set(pos.x, 0.83, center.z + side * 0.33);
      const osh = mesh(new THREE.SphereGeometry(0.09, 12, 10), toon('#e09f3e', { roughness: 0.5 }));
      osh.position.set(pos.x, 0.87, plate.position.z);
      osh.scale.y = 0.6;
      this.dynamicGroup.add(plate, osh);

      this.spots.eat.push({ pos, approach, node, rotY, pose: 'eat' });
    }
  }

  buildDynamicCars(taxiMembers) {
    this.cars = [];
    const count = Math.max(1, taxiMembers.length);
    const carColors = ['#f8f9fa', '#f59e0b', '#38bdf8'];
    const xs = count === 1 ? [-6.1] : count === 2 ? [-7.35, -4.75] : [-7.65, -5.95, -4.25];

    for (let i = 0; i < count; i++) {
      const ownerId = taxiMembers[i]?.id || null;
      const cx = xs[i % xs.length];
      const cz = 2.15; // Old tomonida (z = 4.4) garaj eshigiga o'tish yo'lagi 100% ochiq qoladi!
      const color = carColors[i % carColors.length];

      const carObj = this.createCarMesh(color, Boolean(taxiMembers[i] || i === 0));
      carObj.group.position.set(cx, 0, cz);
      this.carsGroup.add(carObj.group);

      const line = mesh(new THREE.BoxGeometry(0.08, 0.01, 3.8), toon('#fbbf24'), { cast: false });
      line.position.set(cx - 0.96, 0.02, cz);
      this.dynamicGroup.add(line);

      const node = cx < -6.5 ? 'gar_w' : 'gar_mid';
      const boardPos = new THREE.Vector3(cx + 1.05, 0, cz + 0.15);

      this.cars.push({
        index: i,
        ownerId,
        homeX: cx,
        homeZ: cz,
        group: carObj.group,
        doorPivot: carObj.doorPivot,
        doorAngle: 0,
        doorTarget: 0,
        targetZ: cz,
        boardSpot: {
          pos: boardPos,
          approach: new THREE.Vector3(cx + 1.05, 0, 4.35),
          node,
          rotY: -Math.PI / 2,
        },
      });
    }
  }

  createCarMesh(color, isTaxi) {
    const group = new THREE.Group();
    const bodyMat = carPaintMat(color);
    const winMat = glassMat('#93c5fd');
    const tireMat = toon('#1f2937', { roughness: 0.85 });
    const rimMat = chromeMat('#e5e7eb');

    // Kuzov (sedan shaklida)
    const lower = mesh(new THREE.BoxGeometry(1.68, 0.56, 3.25), bodyMat);
    lower.position.y = 0.46;
    const cabin = mesh(new THREE.BoxGeometry(1.46, 0.52, 1.72), bodyMat);
    cabin.position.set(0, 0.96, -0.12);
    const windFront = mesh(new THREE.BoxGeometry(1.36, 0.42, 0.06), winMat);
    windFront.position.set(0, 0.96, 0.75);
    const windBack = mesh(new THREE.BoxGeometry(1.36, 0.42, 0.06), winMat);
    windBack.position.set(0, 0.96, -0.99);

    // Old radiator panjarasi va davlat raqami
    const grille = mesh(new THREE.BoxGeometry(0.85, 0.2, 0.05), chromeMat('#374151'));
    grille.position.set(0, 0.44, 1.62);
    const plate = mesh(new THREE.BoxGeometry(0.46, 0.11, 0.04), toon('#ffffff', { roughness: 0.3 }));
    plate.position.set(0, 0.28, 1.63);
    group.add(grille, plate);

    // Ochilib-yopiladigan haydovchi eshigi
    const doorPivot = new THREE.Group();
    doorPivot.position.set(0.84, 0.46, 0.42);
    const doorPanel = mesh(new THREE.BoxGeometry(0.08, 0.52, 0.82), bodyMat);
    doorPanel.position.set(0, 0, -0.41);
    const doorGlass = mesh(new THREE.BoxGeometry(0.05, 0.36, 0.72), winMat);
    doorGlass.position.set(0, 0.42, -0.41);
    const doorHandle = mesh(new THREE.BoxGeometry(0.04, 0.04, 0.14), rimMat);
    doorHandle.position.set(0.05, 0.06, -0.68);
    doorPivot.add(doorPanel, doorGlass, doorHandle);
    group.add(doorPivot);

    if (isTaxi) {
      const signBox = mesh(new THREE.BoxGeometry(0.56, 0.18, 0.22), toon('#111827'));
      signBox.position.set(0, 1.31, -0.1);
      const glowMat = toon('#fbbf24', { emissive: '#f59e0b', emissiveIntensity: 0.7 });
      const dot1 = mesh(new THREE.BoxGeometry(0.14, 0.12, 0.24), glowMat);
      dot1.position.set(-0.12, 1.31, -0.1);
      const dot2 = mesh(new THREE.BoxGeometry(0.14, 0.12, 0.24), glowMat);
      dot2.position.set(0.12, 1.31, -0.1);
      group.add(signBox, dot1, dot2);
    }

    for (const [wx, wz] of [[-0.86, 0.98], [0.86, 0.98], [-0.86, -0.98], [0.86, -0.98]]) {
      const w = mesh(new THREE.CylinderGeometry(0.32, 0.32, 0.22, 20), tireMat);
      w.rotation.z = Math.PI / 2;
      w.position.set(wx, 0.32, wz);
      const hub = mesh(new THREE.CylinderGeometry(0.19, 0.19, 0.24, 14), rimMat);
      hub.rotation.z = Math.PI / 2;
      hub.position.set(wx, 0.32, wz);
      group.add(w, hub);
    }
    for (const hx of [-0.56, 0.56]) {
      const headLight = mesh(new THREE.SphereGeometry(0.11, 12, 10), toon('#ffffff', { emissive: '#fef08a', emissiveIntensity: 0.9 }));
      headLight.position.set(hx, 0.52, 1.62);
      group.add(headLight);
    }

    group.add(lower, cabin, windFront, windBack);
    return { group, doorPivot };
  }

  getCarForMember(memberId) {
    return this.cars.find((c) => c.ownerId === memberId) || null;
  }

  buildRoomSigns() {
    const rooms = [
      ['🛏️ Yotoqxona', -6.0, -5.6],
      ['🚗 Garaj', -6.0, 5.5],
      ['🛋️ Mehmonxona', 0.8, 5.5],
      ['🍳 Oshxona', 6.5, -5.6],
      ['🚽 Hojatxona', 6.5, 5.5],
    ];
    for (const [title, x, z] of rooms) {
      const el = document.createElement('div');
      el.className = 'room-label';
      el.textContent = title;
      const obj = new CSS2DObject(el);
      obj.position.set(x, 0.15, z);
      this.group.add(obj);
    }
  }

  makeChair(color) {
    const c = new THREE.Group();
    const cushion = toon(color, { roughness: 0.7 });
    const frame = woodMat('#583101', 0.35);
    const seat = mesh(new THREE.BoxGeometry(0.5, 0.08, 0.5), cushion);
    seat.position.y = 0.45;
    const back = mesh(new THREE.BoxGeometry(0.5, 0.56, 0.08), cushion);
    back.position.set(0, 0.75, -0.23);
    c.add(seat, back);
    for (const [x, z] of [[-0.2, -0.2], [0.2, -0.2], [-0.2, 0.2], [0.2, 0.2]]) {
      const l = mesh(new THREE.BoxGeometry(0.055, 0.45, 0.055), frame);
      l.position.set(x, 0.225, z);
      c.add(l);
    }
    return c;
  }

  assignSpots(members) {
    this.syncLayout(members);
    const used = { pc: 0, tv: 0, eat: 0, cook: 0, sleep: 0, wc: 0, home: 0 };
    const aiUsed = { pc: 0, tv: 0, eat: 0, cook: 0, sleep: 0, wc: 0, home: 0 };
    const result = new Map();

    // Doimiy AI personajlar (Robot, Mushuk, It) uchun har bir xonada odamlarning stul/karavotini band qilmaydigan ochiq joylar
    const aiRoomSpots = {
      home: [
        { pos: new THREE.Vector3(-1.85, 0, 3.2), approach: new THREE.Vector3(-1.85, 0, 3.2), node: 'hall_w', rotY: Math.PI / 4, pose: 'stand' },
        { pos: new THREE.Vector3(2.45, 0, 3.6), approach: new THREE.Vector3(2.45, 0, 3.6), node: 'hall_se', rotY: -Math.PI / 4, pose: 'stand' },
        { pos: new THREE.Vector3(-0.6, 0, 4.4), approach: new THREE.Vector3(-0.6, 0, 4.4), node: 'hall_s', rotY: Math.PI, pose: 'stand' },
      ],
      tv: [
        { pos: new THREE.Vector3(2.55, 0, -2.2), approach: new THREE.Vector3(2.55, 0, -2.2), node: 'hall_tv', rotY: -0.4, pose: 'stand' },
        { pos: new THREE.Vector3(2.55, 0, -4.6), approach: new THREE.Vector3(2.55, 0, -4.6), node: 'hall_tv', rotY: -2.4, pose: 'stand' },
        { pos: new THREE.Vector3(0.45, 0, -2.1), approach: new THREE.Vector3(0.45, 0, -2.1), node: 'hall_n', rotY: Math.PI / 2, pose: 'stand' },
      ],
      pc: [
        { pos: new THREE.Vector3(-2.35, 0, -4.2), approach: new THREE.Vector3(-2.0, 0, -3.5), node: 'hall_pc', rotY: Math.PI / 3, pose: 'stand' },
        { pos: new THREE.Vector3(0.15, 0, -4.2), approach: new THREE.Vector3(0.15, 0, -3.5), node: 'hall_pc', rotY: -Math.PI / 3, pose: 'stand' },
      ],
      eat: [
        { pos: new THREE.Vector3(5.0, 0, -0.5), approach: new THREE.Vector3(5.0, 0, 0.2), node: 'kit_door', rotY: 0.4, pose: 'stand' },
        { pos: new THREE.Vector3(7.9, 0, -0.4), approach: new THREE.Vector3(7.2, 0, 0.2), node: 'kit_s', rotY: -0.5, pose: 'stand' },
        { pos: new THREE.Vector3(4.9, 0, -3.2), approach: new THREE.Vector3(4.9, 0, -2.4), node: 'kit_w', rotY: 1.2, pose: 'stand' },
      ],
      cook: [
        { pos: new THREE.Vector3(7.55, 0, -4.45), approach: new THREE.Vector3(7.1, 0, -3.9), node: 'kit_n', rotY: Math.PI, pose: 'cook' },
        { pos: new THREE.Vector3(4.95, 0, -4.45), approach: new THREE.Vector3(5.2, 0, -3.9), node: 'kit_n', rotY: Math.PI, pose: 'stand' },
      ],
      sleep: [
        { pos: new THREE.Vector3(-4.5, 0, -2.5), approach: new THREE.Vector3(-4.5, 0, -2.5), node: 'bed_e', rotY: 0.4, pose: 'sleep' },
        { pos: new THREE.Vector3(-6.1, 0, -2.5), approach: new THREE.Vector3(-6.1, 0, -2.5), node: 'bed_mid', rotY: -0.3, pose: 'sleep' },
        { pos: new THREE.Vector3(-7.6, 0, -2.5), approach: new THREE.Vector3(-7.6, 0, -2.5), node: 'bed_w', rotY: 0.2, pose: 'sleep' },
      ],
      wc: [
        { pos: new THREE.Vector3(5.8, 0, 3.6), approach: new THREE.Vector3(5.3, 0, 3.1), node: 'wc_door', rotY: Math.PI / 2, pose: 'stand' },
        { pos: new THREE.Vector3(6.6, 0, 3.1), approach: new THREE.Vector3(6.0, 0, 3.0), node: 'wc_mid', rotY: Math.PI, pose: 'stand' },
      ],
      garage: [
        { pos: new THREE.Vector3(-4.6, 0, 4.3), approach: new THREE.Vector3(-4.2, 0, 4.4), node: 'gar_door', rotY: -Math.PI / 2, pose: 'stand' },
        { pos: new THREE.Vector3(-6.8, 0, 4.3), approach: new THREE.Vector3(-6.2, 0, 4.4), node: 'gar_mid', rotY: Math.PI, pose: 'stand' },
      ],
      out: [
        { pos: new THREE.Vector3(-0.3, 0, 8.1), approach: new THREE.Vector3(-1.8, 0, 7.3), node: 'door_out', rotY: 0, pose: 'stand' },
        { pos: new THREE.Vector3(-3.3, 0, 8.1), approach: new THREE.Vector3(-1.8, 0, 7.3), node: 'door_out', rotY: 0, pose: 'stand' },
      ],
    };

    const ordered = [
      ...members.filter((m) => !m.isAi),
      ...members.filter((m) => m.isAi && m.job !== 'robot'),
      ...members.filter((m) => m.isAi && m.job === 'robot'),
    ];

    for (const m of ordered) {
      const st = m.status;
      let spot = null;

      if (m.isAi) {
        if (m.deliverToId) {
          const targetSpot = result.get(Number(m.deliverToId));
          if (targetSpot) {
            const deliverPos = (targetSpot.approach || targetSpot.pos).clone();
            if (deliverPos.distanceTo(targetSpot.pos) < 0.55) {
              deliverPos.z += targetSpot.pos.z < 0 ? 0.85 : -0.85;
            }
            const rotY = Math.atan2(
              targetSpot.pos.x - deliverPos.x,
              targetSpot.pos.z - deliverPos.z
            );
            spot = {
              pos: deliverPos,
              approach: deliverPos,
              node: targetSpot.node,
              rotY,
              pose: m.heldItem ? 'carry' : 'stand',
            };
            result.set(m.id, spot);
            continue;
          }
        }
        const list = aiRoomSpots[st] || aiRoomSpots.home;
        const baseIdx = (aiUsed[st] = (aiUsed[st] || 0) + 1) - 1;
        const idx = baseIdx + (m.taskSeq || 0);
        const chosen = list[idx % list.length];
        const pose = m.heldItem ? 'carry' : (m.job === 'robot' && st === 'sleep' ? 'stand' : chosen.pose);
        spot = { ...chosen, pose };
        result.set(m.id, spot);
        continue;
      }

      if (st === 'pc') {
        const idx = used.pc++;
        if (idx < this.spots.pc.length) {
          spot = { ...this.spots.pc[idx] };
        } else {
          const fallback = this.spots.home[(used.home++) % this.spots.home.length];
          spot = { ...fallback, pose: 'pc' };
        }
      } else if (st === 'tv') {
        const idx = (used.tv++) % this.spots.tv.length;
        spot = { ...this.spots.tv[idx] };
      } else if (st === 'eat') {
        const idx = (used.eat++) % this.spots.eat.length;
        spot = { ...this.spots.eat[idx] };
      } else if (st === 'cook') {
        const idx = (used.cook++) % this.spots.cook.length;
        spot = { ...this.spots.cook[idx] };
      } else if (st === 'sleep') {
        const idx = (used.sleep++) % this.spots.sleep.length;
        spot = { ...this.spots.sleep[idx] };
      } else if (st === 'wc') {
        const idx = used.wc++;
        if (idx === 0) {
          spot = { ...this.spots.wc[0] };
        } else {
          const wIdx = Math.min(idx - 1, this.spots.wc_wait.length - 1);
          spot = { ...this.spots.wc_wait[wIdx] };
        }
      } else if (st === 'insta' || st === 'home') {
        const idx = (used.home++) % this.spots.home.length;
        spot = { ...this.spots.home[idx], pose: st === 'insta' ? 'insta' : 'sit' };
      }

      if (spot) result.set(m.id, spot);
    }

    this.wcDoorTarget = used.wc > 0 ? 0 : 1.1;
    return result;
  }

  // ==================== KAFOLATLANGAN YO'LAK VA ESHIKLAR BO'YLAB YURISH ====================
  // Har qanday nuqtaga eng yaqin (XUDDI O'SHA XONADAGI) koridor tugunini topadi
  nearestNodeInSameRoom(pt) {
    const inBedroom = pt.x < -3.0 && pt.z <= 0;
    const inGarage = pt.x < -3.0 && pt.z > 0;
    const inKitchen = pt.x > 4.0 && pt.z <= 1.8;
    const inWc = pt.x > 4.0 && pt.z > 1.8;

    let candidates;
    if (inBedroom) candidates = ['bed_door', 'bed_e', 'bed_mid', 'bed_w'];
    else if (inGarage) candidates = ['gar_door', 'gar_mid', 'gar_w'];
    else if (inKitchen) candidates = ['kit_door', 'kit_s', 'kit_w', 'kit_n'];
    else if (inWc) candidates = ['wc_door', 'wc_mid'];
    else if (pt.z > 6.2) candidates = ['door_out', 'door_in'];
    else candidates = ['hall_sw', 'hall_w', 'hall_nw', 'hall_pc', 'hall_n', 'hall_tv', 'hall_ne', 'hall_e', 'hall_wc_out', 'hall_se', 'hall_s'];

    let best = candidates[0];
    let bestD = Infinity;
    for (const k of candidates) {
      const d = pt.distanceTo(NAV_NODES[k]);
      if (d < bestD) {
        bestD = d;
        best = k;
      }
    }
    return best;
  }

  graphShortestPath(startKey, goalKey) {
    if (startKey === goalKey) return [NAV_NODES[startKey].clone()];
    const adj = new Map();
    for (const k of Object.keys(NAV_NODES)) adj.set(k, []);
    for (const [a, b] of NAV_EDGES) {
      const w = NAV_NODES[a].distanceTo(NAV_NODES[b]);
      adj.get(a).push({ to: b, w });
      adj.get(b).push({ to: a, w });
    }

    const dist = new Map([[startKey, 0]]);
    const prev = new Map();
    const visited = new Set();
    const queue = [{ k: startKey, d: 0 }];

    while (queue.length > 0) {
      queue.sort((a, b) => a.d - b.d);
      const { k } = queue.shift();
      if (k === goalKey) break;
      if (visited.has(k)) continue;
      visited.add(k);

      for (const { to, w } of adj.get(k) || []) {
        const nd = dist.get(k) + w;
        if (nd < (dist.get(to) ?? Infinity)) {
          dist.set(to, nd);
          prev.set(to, k);
          queue.push({ k: to, d: nd });
        }
      }
    }

    const out = [];
    let cur = goalKey;
    while (cur) {
      out.push(NAV_NODES[cur].clone());
      cur = prev.get(cur);
    }
    out.reverse();
    return out;
  }

  // fromSpotOrVec va toSpotOrVec: { pos, approach, node } yoki Vector3 bo'lishi mumkin
  pathBetween(fromInput, toInput) {
    const fromPos = fromInput.pos ? fromInput.pos : fromInput;
    const toPos = toInput.pos ? toInput.pos : toInput;
    const fromApp = fromInput.approach || fromPos;
    const toApp = toInput.approach || toPos;
    const startNode = fromInput.node || this.nearestNodeInSameRoom(fromApp);
    const goalNode = toInput.node || this.nearestNodeInSameRoom(toApp);

    const mid = this.graphShortestPath(startNode, goalNode);
    const raw = [fromPos.clone()];
    if (fromApp.distanceTo(fromPos) > 0.1) raw.push(fromApp.clone());

    let startIndex = 0;
    if (mid.length > 1 && fromPos.distanceTo(mid[1]) < fromPos.distanceTo(mid[0])) {
      startIndex = 1;
    }
    for (let i = startIndex; i < mid.length; i++) {
      const p = mid[i];
      if (raw[raw.length - 1].distanceTo(p) > 0.15) raw.push(p);
    }
    if (raw[raw.length - 1].distanceTo(toApp) > 0.15) raw.push(toApp.clone());
    if (raw[raw.length - 1].distanceTo(toPos) > 0.1) raw.push(toPos.clone());
    return raw;
  }

  pathFromDoor(spot) {
    return this.pathBetween({ pos: DOOR.outside, approach: DOOR.inside, node: 'door_in' }, spot);
  }

  pathToDoor(fromSpotOrVec) {
    return this.pathBetween(fromSpotOrVec, { pos: DOOR.outside, approach: DOOR.inside, node: 'door_in' });
  }

  setDoorWanted(open) {
    this.doorTarget = open ? 1.35 : 0;
  }

  updateTime(now = new Date()) {
    const h = now.getHours() + now.getMinutes() / 60;
    this.hourHand.rotation.z = -((h % 12) / 12) * Math.PI * 2;
    this.minuteHand.rotation.z = -(now.getMinutes() / 60) * Math.PI * 2;

    let sky, night;
    if (h >= 7 && h < 17) { sky = '#8fd3ff'; night = 0; }
    else if ((h >= 17 && h < 19.5) || (h >= 5.5 && h < 7)) { sky = '#ff9e6b'; night = 0.5; }
    else { sky = '#1b2348'; night = 1; }
    this.skyMat.color.set(sky);
    this.sunMat.color.set(night === 1 ? '#f1f1ff' : '#fff3a0');
    this.lampLight.intensity = night * 6;
    this.lampShadeMat.emissive.set(night ? '#ffb347' : '#000000');
    this.lampShadeMat.emissiveIntensity = night * 0.8;
    return night;
  }

  update(dt, time = 0) {
    this.doorOpen += (this.doorTarget - this.doorOpen) * Math.min(1, dt * 6);
    this.doorPivot.rotation.y = -this.doorOpen;

    this.wcDoorOpen += (this.wcDoorTarget - this.wcDoorOpen) * Math.min(1, dt * 6);
    this.wcDoorPivot.rotation.y = this.wcDoorOpen;

    for (const car of this.cars) {
      car.doorAngle += (car.doorTarget - car.doorAngle) * Math.min(1, dt * 7);
      car.doorPivot.rotation.y = car.doorAngle;

      car.group.position.z += (car.targetZ - car.group.position.z) * Math.min(1, dt * 3.2);
      car.group.visible = car.group.position.z < 10.5;
    }

    const tvHue = 0.55 + Math.sin(time * 2.0) * 0.05;
    this.tvScreenMat.color.setHSL(tvHue, 0.8, 0.58);
  }
}

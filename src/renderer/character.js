import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { toon, mesh } from './toon.js';

const SPEED = 2.2;
const HIP_Y = 0.42;
const SEAT_Y = 0.49;

export const STATUS_ICON = {
  home: '🏠',
  pc: '💻',
  tv: '📺',
  insta: '📱',
  eat: '🍽️',
  cook: '🍳',
  sleep: '😴',
  wc: '🚽',
  work: '💼',
  school: '🏫',
  out: '🚶',
};

export const JOB_ICON = {
  housewife: '👩‍🍳',
  taxi: '🚕',
  dev: '💻',
  doctor: '👨‍⚕️',
  teacher: '👨‍🏫',
  student: '🎓',
  builder: '👷',
  robot: '🤖',
  cat: '🐱',
  dog: '🐶',
  other: '',
};

function lerpAngle(a, b, t) {
  const d = Math.atan2(Math.sin(b - a), Math.cos(b - a));
  return a + d * t;
}

export class Character {
  constructor(member, onClick) {
    this.id = member.id;
    this.onClick = onClick;
    this.group = new THREE.Group();
    this.group.userData.memberId = this.id;
    this.body = new THREE.Group();
    this.group.add(this.body);

    this.tagEl = document.createElement('div');
    this.tagEl.className = 'tag';
    this.bubbleEl = document.createElement('div');
    this.bubbleEl.className = 'bubble';
    this.nameEl = document.createElement('div');
    this.nameEl.className = 'name';
    this.nameEl.title = 'Bosib xabar yozish yoki holatni o\'zgartirish';
    this.nameEl.addEventListener('click', (e) => {
      e.stopPropagation();
      if (this.onClick && this.member) this.onClick(this.member);
    });
    this.tagEl.append(this.bubbleEl, this.nameEl);
    this.label = new CSS2DObject(this.tagEl);
    this.label.position.y = 1.75;
    this.group.add(this.label);

    this.state = 'hidden';
    this.path = [];
    this.spot = null;
    this.opacity = 0;
    this.fade = 0;
    this.time = Math.random() * 10;
    this.blinkIn = 2 + Math.random() * 3;
    this.wantHome = false;

    this.buildRig(member);
    this.setMember(member);
    this.setVisible(false);
  }

  buildRig(member) {
    this.body.clear();
    const a = member.appearance || {};
    this.appearanceKey = JSON.stringify(a) + ':' + (member.job || '');
    this.mats = [];
    this.isQuadruped = member.job === 'cat' || member.job === 'dog';
    this.isRobot = member.job === 'robot';
    this.tail = null;

    const m = (color) => {
      const mat = toon(color);
      mat.userData.outlineParameters = { thickness: 0.006, color: [0.1, 0.07, 0.12], alpha: 1, visible: true };
      this.mats.push(mat);
      return mat;
    };

    if (member.job === 'robot') {
      this.buildRobotRig(m);
      return;
    }
    if (member.job === 'cat') {
      this.buildCatRig(m);
      return;
    }
    if (member.job === 'dog') {
      this.buildDogRig(m);
      return;
    }

    const skin = m(a.skin || '#f2c29b');
    const hair = m(a.hair || '#2b1d16');
    const shirt = m(a.shirt || '#ff6b6b');
    const pants = m(a.pants || '#3d5a80');
    const dark = m('#2b2233');
    const cheek = m('#ff9aa8');

    const sc = a.scale || 1.0;
    this.body.scale.setScalar(sc);
    this.label.position.y = 1.65 * sc + 0.16;

    // Oyoqlar
    const legGeo = new THREE.CapsuleGeometry(0.09, 0.2, 4, 10);
    legGeo.translate(0, -0.19, 0);
    const makeLeg = (x) => {
      const p = new THREE.Group();
      p.position.set(x, HIP_Y, 0);
      p.add(mesh(legGeo, pants));
      const shoe = mesh(new THREE.SphereGeometry(0.1, 12, 8), dark);
      shoe.scale.set(1, 0.6, 1.3);
      shoe.position.set(0, -0.38, 0.03);
      p.add(shoe);
      this.body.add(p);
      return p;
    };
    this.legL = makeLeg(-0.1);
    this.legR = makeLeg(0.1);

    // Tana
    const torso = mesh(new THREE.CapsuleGeometry(0.2, 0.2, 4, 12), shirt);
    torso.position.y = 0.66;
    torso.scale.z = 0.85;
    this.body.add(torso);

    // Milliy va kasbga mos kiyim bezaklari
    if (a.outfit === 'apron') {
      // Uy bekasi: xon-atlas ko'ylak ustidan oq fartuk
      const apron = mesh(new THREE.BoxGeometry(0.28, 0.34, 0.04), m('#ffffff'));
      apron.position.set(0, 0.6, 0.16);
      const trim = mesh(new THREE.BoxGeometry(0.28, 0.05, 0.045), m('#ffd166'));
      trim.position.set(0, 0.45, 0.16);
      this.body.add(apron, trim);
    } else if (a.outfit === 'atlas') {
      // O'zbek xon-atlas / adras naqshli kamzul
      const s1 = mesh(new THREE.BoxGeometry(0.32, 0.06, 0.31), m('#ffd166'));
      s1.position.set(0, 0.72, 0);
      const s2 = mesh(new THREE.BoxGeometry(0.34, 0.06, 0.31), m('#06d6a0'));
      s2.position.set(0, 0.6, 0);
      this.body.add(s1, s2);
    } else if (a.outfit === 'suit') {
      const tie = mesh(new THREE.BoxGeometry(0.06, 0.24, 0.04), m('#e63946'));
      tie.position.set(0, 0.66, 0.17);
      this.body.add(tie);
    } else if (a.outfit === 'doctor') {
      const badge = mesh(new THREE.BoxGeometry(0.09, 0.09, 0.04), m('#e63946'));
      badge.position.set(0.09, 0.72, 0.17);
      this.body.add(badge);
    } else if (a.outfit === 'vest' || a.outfit === 'taxi') {
      const stripe = mesh(new THREE.BoxGeometry(0.36, 0.07, 0.32), m('#ffd166'));
      stripe.position.set(0, 0.62, 0);
      this.body.add(stripe);
    }

    // Qo'llar
    const armGeo = new THREE.CapsuleGeometry(0.065, 0.2, 4, 8);
    armGeo.translate(0, -0.16, 0);
    const makeArm = (x) => {
      const p = new THREE.Group();
      p.position.set(x, 0.8, 0);
      p.add(mesh(armGeo, shirt));
      const hand = mesh(new THREE.SphereGeometry(0.075, 10, 8), skin);
      hand.position.y = -0.32;
      p.add(hand);
      p.rotation.z = x > 0 ? 0.12 : -0.12;
      this.body.add(p);
      return p;
    };
    this.armL = makeArm(-0.27);
    this.armR = makeArm(0.27);

    this.phoneMesh = mesh(new THREE.BoxGeometry(0.1, 0.16, 0.025), m('#118ab2'));
    this.phoneMesh.position.set(-0.04, -0.34, 0.1);
    this.phoneMesh.rotation.x = Math.PI / 3;
    this.phoneMesh.visible = false;
    this.armR.add(this.phoneMesh);

    this.spatulaMesh = mesh(new THREE.BoxGeometry(0.04, 0.26, 0.04), m('#e76f51'));
    this.spatulaMesh.position.set(0, -0.36, 0.12);
    this.spatulaMesh.rotation.x = Math.PI / 2;
    this.spatulaMesh.visible = false;
    this.armR.add(this.spatulaMesh);

    // Bosh
    this.head = new THREE.Group();
    this.head.position.y = 1.13;
    this.head.add(mesh(new THREE.SphereGeometry(0.33, 24, 18), skin));

    // Qoshlar va ko'zlar
    this.eyes = [];
    for (const x of [-0.11, 0.11]) {
      const e = mesh(new THREE.SphereGeometry(0.045, 10, 8), dark);
      e.position.set(x, 0.02, 0.31);
      e.scale.y = 1.3;
      this.head.add(e);
      this.eyes.push(e);

      const brow = mesh(new THREE.BoxGeometry(0.085, 0.022, 0.02), hair);
      brow.position.set(x, 0.11, 0.31);
      this.head.add(brow);

      const c = mesh(new THREE.SphereGeometry(0.05, 10, 8), cheek);
      c.position.set(x * 1.75, -0.08, 0.27);
      c.scale.z = 0.4;
      this.head.add(c);
    }

    if (a.glasses) {
      for (const x of [-0.11, 0.11]) {
        const rim = mesh(new THREE.TorusGeometry(0.068, 0.012, 6, 16), dark);
        rim.position.set(x, 0.02, 0.33);
        this.head.add(rim);
      }
      const bridge = mesh(new THREE.BoxGeometry(0.08, 0.015, 0.015), dark);
      bridge.position.set(0, 0.02, 0.33);
      this.head.add(bridge);
    }

    // O'zbekcha mo'ylov va oqsoqol soqoli
    if (a.mustache) {
      const must = mesh(new THREE.BoxGeometry(0.16, 0.032, 0.04), hair);
      must.position.set(0, -0.05, 0.33);
      this.head.add(must);
    }
    if (a.beard) {
      const beard = mesh(new THREE.SphereGeometry(0.15, 12, 10), hair);
      beard.scale.set(1.1, 1.2, 0.6);
      beard.position.set(0, -0.18, 0.26);
      this.head.add(beard);
    }

    const mouth = mesh(new THREE.TorusGeometry(0.04, 0.012, 6, 12, Math.PI), dark);
    mouth.position.set(0, -0.09, 0.32);
    mouth.rotation.z = Math.PI;
    this.head.add(mouth);

    this.buildHair(a.hairStyle || 0, hair);
    this.buildHat(a.hat || 'doppi', m);
    this.body.add(this.head);
  }

  buildRobotRig(m) {
    const metalWhite = m('#f1f5f9');
    const metalBlue = m('#38bdf8');
    const darkVisor = m('#0f172a');
    const cyanGlow = m('#00f5d4');
    const jointMat = m('#475569');

    this.body.scale.setScalar(1.0);
    this.label.position.y = 1.82;

    // Robot oyoqlari
    const makeLeg = (x) => {
      const p = new THREE.Group();
      p.position.set(x, HIP_Y, 0);
      const leg = mesh(new THREE.BoxGeometry(0.13, 0.34, 0.15), jointMat);
      leg.position.y = -0.17;
      const boot = mesh(new THREE.BoxGeometry(0.16, 0.12, 0.24), metalWhite);
      boot.position.set(0, -0.36, 0.03);
      p.add(leg, boot);
      this.body.add(p);
      return p;
    };
    this.legL = makeLeg(-0.11);
    this.legR = makeLeg(0.11);

    // Robot tanasi va ko'krakdagi AI yuragi
    const torso = mesh(new THREE.BoxGeometry(0.44, 0.46, 0.3), metalWhite);
    torso.position.y = 0.66;
    const chestPlate = mesh(new THREE.BoxGeometry(0.32, 0.24, 0.04), darkVisor);
    chestPlate.position.set(0, 0.68, 0.15);
    const core = mesh(new THREE.SphereGeometry(0.065, 14, 12), cyanGlow);
    core.position.set(0, 0.68, 0.17);
    const belt = mesh(new THREE.BoxGeometry(0.46, 0.07, 0.32), metalBlue);
    belt.position.set(0, 0.45, 0);
    this.body.add(torso, chestPlate, core, belt);

    // Robot qo'llari
    const makeArm = (x) => {
      const p = new THREE.Group();
      p.position.set(x, 0.82, 0);
      const shoulder = mesh(new THREE.SphereGeometry(0.085, 12, 10), metalBlue);
      const arm = mesh(new THREE.CylinderGeometry(0.055, 0.055, 0.28, 12), metalWhite);
      arm.position.y = -0.16;
      const claw = mesh(new THREE.SphereGeometry(0.075, 10, 8), jointMat);
      claw.position.y = -0.32;
      p.add(shoulder, arm, claw);
      this.body.add(p);
      return p;
    };
    this.armL = makeArm(-0.29);
    this.armR = makeArm(0.29);

    this.phoneMesh = new THREE.Group();
    this.spatulaMesh = new THREE.Group();

    // Robot boshi va ekrani
    this.head = new THREE.Group();
    this.head.position.y = 1.14;
    const helm = mesh(new THREE.BoxGeometry(0.54, 0.44, 0.46), metalWhite);
    const screen = mesh(new THREE.BoxGeometry(0.44, 0.26, 0.04), darkVisor);
    screen.position.set(0, 0.01, 0.22);
    this.head.add(helm, screen);

    // Robot ko'zlari (porlab turuvchi moviy LED)
    this.eyes = [];
    for (const x of [-0.11, 0.11]) {
      const e = mesh(new THREE.SphereGeometry(0.052, 12, 10), cyanGlow);
      e.position.set(x, 0.02, 0.24);
      e.scale.set(1.2, 0.9, 0.5);
      this.head.add(e);
      this.eyes.push(e);
    }

    // Quloq lentalari va boshidagi antenna
    for (const x of [-0.29, 0.29]) {
      const ear = mesh(new THREE.CylinderGeometry(0.08, 0.08, 0.06, 12), metalBlue);
      ear.rotation.z = Math.PI / 2;
      ear.position.set(x, 0.01, 0);
      this.head.add(ear);
    }
    const antPole = mesh(new THREE.CylinderGeometry(0.02, 0.02, 0.18, 8), jointMat);
    antPole.position.set(0, 0.3, 0);
    const antBall = mesh(new THREE.SphereGeometry(0.055, 12, 10), cyanGlow);
    antBall.position.set(0, 0.4, 0);
    this.head.add(antPole, antBall);

    this.body.add(this.head);
  }

  buildCatRig(m) {
    const orange = m('#f4a261');
    const stripe = m('#e76f51');
    const cream = m('#fff8eb');
    const pink = m('#ff8fab');
    const greenEye = m('#2ec4b6');
    const dark = m('#1e1b2e');

    this.body.scale.setScalar(1.1);
    this.label.position.y = 0.88;

    // 4 ta mushuk panjasi (uzunchoq gorizontal tana ostida)
    const makePaw = (x, z) => {
      const p = new THREE.Group();
      p.position.set(x, 0.19, z);
      const leg = mesh(new THREE.CylinderGeometry(0.042, 0.036, 0.16, 10), orange);
      leg.position.y = -0.08;
      const paw = mesh(new THREE.SphereGeometry(0.048, 10, 8), cream);
      paw.scale.set(1.0, 0.65, 1.35);
      paw.position.set(0, -0.16, 0.02);
      p.add(leg, paw);
      this.body.add(p);
      return p;
    };
    this.armL = makePaw(-0.09, 0.22);
    this.armR = makePaw(0.09, 0.22);
    this.legL = makePaw(-0.09, -0.22);
    this.legR = makePaw(0.09, -0.22);

    // Gorizontal mushuk tanasi + yo'l-yo'l chiziqlari
    const torso = mesh(new THREE.CapsuleGeometry(0.135, 0.38, 8, 14), orange);
    torso.rotation.x = Math.PI / 2;
    torso.position.set(0, 0.24, 0);
    const chest = mesh(new THREE.SphereGeometry(0.125, 12, 10), cream);
    chest.position.set(0, 0.22, 0.22);
    for (const zOff of [-0.12, 0, 0.12]) {
      const st = mesh(new THREE.TorusGeometry(0.132, 0.015, 6, 16, Math.PI * 1.2), stripe);
      st.position.set(0, 0.25, zOff);
      st.rotation.z = -Math.PI * 0.1;
      this.body.add(st);
    }
    this.body.add(torso, chest);

    // Mushuk boshi, tumshug'i va mo'ylovlari (whiskers)
    this.head = new THREE.Group();
    this.head.position.set(0, 0.36, 0.34);
    const skull = mesh(new THREE.SphereGeometry(0.165, 18, 14), orange);
    skull.scale.set(1.12, 0.92, 0.95);
    const cheekL = mesh(new THREE.SphereGeometry(0.065, 10, 8), cream);
    cheekL.position.set(-0.042, -0.04, 0.13);
    const cheekR = mesh(new THREE.SphereGeometry(0.065, 10, 8), cream);
    cheekR.position.set(0.042, -0.04, 0.13);
    const nose = mesh(new THREE.ConeGeometry(0.032, 0.03, 3), pink);
    nose.rotation.x = Math.PI / 2;
    nose.rotation.z = Math.PI;
    nose.position.set(0, -0.01, 0.19);
    this.head.add(skull, cheekL, cheekR, nose);

    // Mushuk mo'ylovlari (har ikki tomonda 2 tadan)
    for (const side of [-1, 1]) {
      for (const wy of [-0.03, -0.055]) {
        const w = mesh(new THREE.BoxGeometry(0.14, 0.008, 0.008), cream);
        w.position.set(side * 0.11, wy, 0.15);
        w.rotation.z = side * (wy === -0.03 ? 0.12 : -0.1);
        this.head.add(w);
      }
    }

    // Katta uchburchak mushuk quloqlari
    for (const x of [-0.11, 0.11]) {
      const ear = mesh(new THREE.ConeGeometry(0.072, 0.16, 4), orange);
      ear.position.set(x, 0.17, 0.01);
      ear.rotation.z = x > 0 ? -0.25 : 0.25;
      const inner = mesh(new THREE.ConeGeometry(0.042, 0.11, 4), pink);
      inner.position.set(x, 0.16, 0.03);
      inner.rotation.z = ear.rotation.z;
      this.head.add(ear, inner);
    }

    this.eyes = [];
    for (const x of [-0.07, 0.07]) {
      const eyeOuter = mesh(new THREE.SphereGeometry(0.038, 10, 8), greenEye);
      eyeOuter.position.set(x, 0.025, 0.145);
      this.head.add(eyeOuter);
      const pupil = mesh(new THREE.SphereGeometry(0.024, 8, 8), dark);
      pupil.position.set(x, 0.025, 0.168);
      pupil.scale.set(0.6, 1.3, 0.6);
      this.head.add(pupil);
      this.eyes.push(pupil);
    }

    // Yuqoriga qayrilgan uzun mushuk dumi
    this.tail = new THREE.Group();
    this.tail.position.set(0, 0.28, -0.32);
    const tailBase = mesh(new THREE.CapsuleGeometry(0.032, 0.28, 4, 8), orange);
    tailBase.position.set(0, 0.15, -0.06);
    tailBase.rotation.x = -0.45;
    const tailTip = mesh(new THREE.SphereGeometry(0.038, 8, 8), cream);
    tailTip.position.set(0, 0.29, -0.13);
    this.tail.add(tailBase, tailTip);
    this.body.add(this.tail);

    this.phoneMesh = new THREE.Group();
    this.spatulaMesh = new THREE.Group();
    this.body.add(this.head);
  }

  buildDogRig(m) {
    const brown = m('#c68b59');
    const darkBrown = m('#6f3818');
    const cream = m('#faedcd');
    const redCollar = m('#e63946');
    const goldTag = m('#ffd166');
    const pinkTongue = m('#ff758f');
    const dark = m('#1e1b2e');

    this.body.scale.setScalar(1.12);
    this.label.position.y = 1.02;

    // 4 ta kuchuk oyog'i (uzunchoq gorizontal tana ostida)
    const makeLeg = (x, z) => {
      const p = new THREE.Group();
      p.position.set(x, 0.24, z);
      const leg = mesh(new THREE.CylinderGeometry(0.052, 0.044, 0.2, 10), brown);
      leg.position.y = -0.1;
      const paw = mesh(new THREE.SphereGeometry(0.058, 10, 8), cream);
      paw.scale.set(1.0, 0.65, 1.35);
      paw.position.set(0, -0.2, 0.025);
      p.add(leg, paw);
      this.body.add(p);
      return p;
    };
    this.armL = makeLeg(-0.11, 0.25);
    this.armR = makeLeg(0.11, 0.25);
    this.legL = makeLeg(-0.11, -0.25);
    this.legR = makeLeg(0.11, -0.25);

    // Gorizontal kuchuk tanasi + bo'yinbog'i
    const torso = mesh(new THREE.CapsuleGeometry(0.165, 0.44, 8, 14), brown);
    torso.rotation.x = Math.PI / 2;
    torso.position.set(0, 0.3, 0);
    const chest = mesh(new THREE.SphereGeometry(0.155, 12, 10), cream);
    chest.position.set(0, 0.28, 0.25);
    const spotPatch = mesh(new THREE.SphereGeometry(0.12, 10, 8), darkBrown);
    spotPatch.scale.set(1.1, 0.5, 1.3);
    spotPatch.position.set(0.06, 0.41, -0.05);
    const collar = mesh(new THREE.TorusGeometry(0.15, 0.028, 8, 18), redCollar);
    collar.position.set(0, 0.35, 0.28);
    collar.rotation.x = Math.PI / 3;
    const medal = mesh(new THREE.SphereGeometry(0.04, 10, 8), goldTag);
    medal.position.set(0, 0.25, 0.41);
    this.body.add(torso, chest, spotPatch, collar, medal);

    // Kuchuk boshi, oldinga chiqqan tumshug'i va tili
    this.head = new THREE.Group();
    this.head.position.set(0, 0.45, 0.36);
    const skull = mesh(new THREE.SphereGeometry(0.19, 18, 14), brown);
    const snout = mesh(new THREE.BoxGeometry(0.15, 0.11, 0.22), cream);
    snout.position.set(0, -0.04, 0.18);
    const nose = mesh(new THREE.SphereGeometry(0.042, 10, 8), dark);
    nose.position.set(0, 0.01, 0.29);
    const tongue = mesh(new THREE.BoxGeometry(0.055, 0.02, 0.09), pinkTongue);
    tongue.position.set(0, -0.1, 0.24);
    tongue.rotation.x = 0.35;
    this.head.add(skull, snout, nose, tongue);

    // Ikki yonda osilib turgan uzun kuchuk quloqlari
    for (const x of [-0.18, 0.18]) {
      const ear = mesh(new THREE.CapsuleGeometry(0.055, 0.18, 4, 8), darkBrown);
      ear.scale.z = 1.3;
      ear.position.set(x, -0.01, 0.02);
      ear.rotation.z = x > 0 ? -0.28 : 0.28;
      this.head.add(ear);
    }

    this.eyes = [];
    for (const x of [-0.075, 0.075]) {
      const e = mesh(new THREE.SphereGeometry(0.034, 10, 8), dark);
      e.position.set(x, 0.045, 0.17);
      e.scale.y = 1.2;
      const brow = mesh(new THREE.BoxGeometry(0.06, 0.02, 0.02), darkBrown);
      brow.position.set(x, 0.1, 0.16);
      this.head.add(e, brow);
      this.eyes.push(e);
    }

    // Likillab turuvchi kuchuk dumi
    this.tail = new THREE.Group();
    this.tail.position.set(0, 0.36, -0.35);
    const tailMesh = mesh(new THREE.CapsuleGeometry(0.04, 0.22, 4, 8), darkBrown);
    tailMesh.position.set(0, 0.11, -0.05);
    tailMesh.rotation.x = -0.6;
    this.tail.add(tailMesh);
    this.body.add(this.tail);

    this.phoneMesh = new THREE.Group();
    this.spatulaMesh = new THREE.Group();
    this.body.add(this.head);
  }

  buildHair(style, mat) {
    const capGeo = new THREE.SphereGeometry(0.35, 24, 14, 0, Math.PI * 2, 0, Math.PI * 0.52);
    const cap = mesh(capGeo, mat);
    cap.rotation.x = -0.5;
    cap.position.y = 0.02;
    this.head.add(cap);
    if (style === 1) {
      // O'zbek qizlar / ayollar soch turmagi
      const bun = mesh(new THREE.SphereGeometry(0.14, 12, 10), mat);
      bun.position.set(0, 0.22, -0.26);
      this.head.add(bun);
    } else if (style === 2) {
      // Ikki o'rim kokil soch
      for (const x of [-0.18, 0.18]) {
        const braid = mesh(new THREE.CapsuleGeometry(0.06, 0.32, 4, 8), mat);
        braid.position.set(x, -0.18, -0.12);
        this.head.add(braid);
      }
    }
  }

  buildHat(hat, m) {
    if (hat === 'doppi') {
      // Haqiqiy O'zbek Chust do'ppisi (to'rtburchak qora baxmal + oq bodom naqshlar)
      const doppi = new THREE.Group();
      doppi.position.y = 0.28;
      const base = mesh(new THREE.BoxGeometry(0.46, 0.15, 0.46), m('#181824'));
      const roof = mesh(new THREE.ConeGeometry(0.32, 0.08, 4), m('#222233'));
      roof.position.y = 0.11;
      roof.rotation.y = Math.PI / 4;
      doppi.add(base, roof);

      // 4 tomonda oq bodom naqshlar va hoshiya
      const white = m('#ffffff');
      const rim = mesh(new THREE.BoxGeometry(0.47, 0.025, 0.47), white);
      rim.position.y = -0.055;
      doppi.add(rim);

      for (const [bx, bz] of [[0, 0.235], [0, -0.235], [0.235, 0], [-0.235, 0]]) {
        const bodom = mesh(new THREE.SphereGeometry(0.042, 8, 6), white);
        bodom.scale.set(1.2, 0.8, 1.2);
        bodom.position.set(bx, 0.01, bz);
        doppi.add(bodom);
      }
      this.head.add(doppi);
    } else if (hat === 'romol') {
      // O'zbek onaxonlar / uy bekalari uchun oq-gulli ro'mol
      const scarfMat = m('#fffaf0');
      const dome = mesh(new THREE.SphereGeometry(0.365, 20, 14, 0, Math.PI * 2, 0, Math.PI * 0.62), scarfMat);
      dome.rotation.x = -0.35;
      dome.position.y = 0.02;
      const knot = mesh(new THREE.BoxGeometry(0.38, 0.06, 0.38), m('#e63946'));
      knot.position.y = 0.22;
      this.head.add(dome, knot);
    } else if (hat === 'hardhat') {
      const dome = mesh(new THREE.SphereGeometry(0.37, 18, 12, 0, Math.PI * 2, 0, Math.PI * 0.48), m('#ffd166'));
      dome.position.y = 0.06;
      const brim = mesh(new THREE.CylinderGeometry(0.42, 0.42, 0.03, 20), m('#ffd166'));
      brim.position.y = 0.14;
      this.head.add(dome, brim);
    }
  }

  setMember(member, waitingWc = false) {
    const newKey = JSON.stringify(member.appearance || {}) + ':' + (member.job || '');
    if (newKey !== this.appearanceKey) {
      this.buildRig(member);
      this.setOpacity(this.opacity);
    }
    this.member = member;
    const jobIcon = JOB_ICON[member.job] || '';
    const stIcon = waitingWc ? '⏳🚽' : (STATUS_ICON[member.status] || '');
    const zzz = member.status === 'sleep' ? ' 💤' : '';
    this.nameEl.textContent = `${stIcon} ${member.name}${jobIcon ? ' ' + jobIcon : ''}${zzz}`;
  }

  setVisible(v) {
    this.group.visible = v;
    this.label.visible = v;
    this.tagEl.style.display = v ? '' : 'none';
  }

  setOpacity(o) {
    this.opacity = o;
    const transparent = o < 0.999;
    for (const mat of this.mats) {
      if (mat.transparent !== transparent) {
        mat.transparent = transparent;
        mat.needsUpdate = true;
      }
      mat.opacity = o;
      mat.userData.outlineParameters.alpha = o;
      mat.userData.outlineParameters.visible = o > 0.6;
    }
    this.tagEl.style.opacity = String(o);
  }

  say(text) {
    this.bubbleEl.textContent = text;
    this.bubbleEl.classList.add('show');
    clearTimeout(this.bubbleTimer);
    this.bubbleTimer = setTimeout(() => this.bubbleEl.classList.remove('show'), 7000);
  }

  clearTimers() {
    clearTimeout(this.carTimer1);
    clearTimeout(this.carTimer2);
    clearTimeout(this.talkReturnTimer);
    this.lookYaw = null;
    this.talkBodyRotY = null;
  }

  placeAt(spot) {
    this.clearTimers();
    this.spot = spot;
    this.wantHome = true;
    this.state = 'posing';
    this.group.position.copy(spot.pos);
    this.group.rotation.y = spot.rotY;
    this.setVisible(true);
    this.setOpacity(1);
    this.fade = 0;
    this.applyPose(spot.pose || 'sit', 1);
    this.setMember(this.member, spot.waitingWc);
  }

  enter(path, spot) {
    this.clearTimers();
    this.spot = spot;
    this.wantHome = true;
    this.path = path.slice(1);
    this.group.position.copy(path[0]);
    this.setVisible(true);
    this.setOpacity(0);
    this.fade = 1;
    this.resetBodyPose();
    this.state = 'walking';
    this.setMember(this.member, spot.waitingWc);
    this.onArrive = () => {
      this.state = 'turning';
      this.sitT = 0;
    };
  }

  // Taksist mashinada qaytib kelib, eshikni ochib tushib uyga kirishi
  enterByCar(car, pathFromCarToSpot, spot) {
    this.clearTimers();
    this.spot = spot;
    this.wantHome = true;
    this.setVisible(false);
    car.targetZ = car.homeZ;
    car.doorTarget = 0;

    // 1. Mashina garajga kirib to'xtaydi (0.8s) -> eshigi ochiladi
    this.carTimer1 = setTimeout(() => {
      car.doorTarget = -1.1; // Eshik ochiladi
      this.group.position.copy(car.boardSpot.pos);
      this.group.rotation.y = car.boardSpot.rotY;
      this.setVisible(true);
      this.setOpacity(0);
      this.fade = 1;
      this.resetBodyPose();

      // 2. Personaj tushgach eshik yopiladi va u uyga yurib kiradi
      this.carTimer2 = setTimeout(() => {
        car.doorTarget = 0;
        this.path = pathFromCarToSpot.slice(1);
        this.state = 'walking';
        this.setMember(this.member, spot.waitingWc);
        this.onArrive = () => {
          this.state = 'turning';
          this.sitT = 0;
        };
      }, 550);
    }, 850);
  }

  moveTo(path, spot) {
    this.clearTimers();
    this.spot = spot;
    this.wantHome = true;
    this.path = path.slice(1);
    this.resetBodyPose();
    this.state = 'walking';
    this.setMember(this.member, spot.waitingWc);
    this.onArrive = () => {
      this.state = 'turning';
      this.sitT = 0;
    };
  }

  // Suhbatdoshga 100% yuzma-yuz o'girilib (tanasi va boshi bilan) qarab gaplashish
  lookAtPosition(targetPos, durationMs = 5200) {
    const worldAngle = Math.atan2(
      targetPos.x - this.group.position.x,
      targetPos.z - this.group.position.z
    );
    // Uxlayotgan bo'lmasa tanasini ham suhbatdoshga buradi (yuzma-yuz!)
    if (this.spot?.pose !== 'sleep') {
      this.talkBodyRotY = worldAngle;
      this.lookYaw = 0;
    } else {
      const rel = Math.atan2(
        Math.sin(worldAngle - this.group.rotation.y),
        Math.cos(worldAngle - this.group.rotation.y)
      );
      this.lookYaw = THREE.MathUtils.clamp(rel, -1.1, 1.1);
    }
    clearTimeout(this.talkReturnTimer);
    this.talkReturnTimer = setTimeout(() => {
      this.lookYaw = null;
      this.talkBodyRotY = null;
    }, durationMs);
  }

  // Suhbatdosh boshqa xonada bo'lsa, oldiga borib yuzma-yuz gapirish va keyin o'z joyiga qaytish
  talkTo(pathThere, talkSpot, makeReturnPath, onReachedTarget) {
    if (!this.spot || this.member?.status === 'wc') return;
    const homeSpot = this.spot;
    this.clearTimers();
    this.path = pathThere.slice(1);
    this.resetBodyPose();
    this.state = 'walking';
    this.onArrive = () => {
      this.spot = talkSpot;
      this.state = 'turning';
      this.sitT = 0;
      onReachedTarget?.();
      this.talkReturnTimer = setTimeout(() => {
        if (!this.wantHome) return;
        const backPath = makeReturnPath(talkSpot, homeSpot);
        this.moveTo(backPath, homeSpot);
      }, 5200);
    };
  }

  leave(path, onGone) {
    this.clearTimers();
    this.wantHome = false;
    this.path = path.slice(1);
    this.resetBodyPose();
    this.state = 'walking';
    this.onArrive = () => {
      this.fade = -1;
      this.onFaded = () => {
        this.state = 'hidden';
        this.setVisible(false);
        onGone?.();
      };
    };
  }

  // Taksist garajga yurib borib, mashina eshigini ochib minib ketishi
  leaveByCar(pathToCar, car, onGone) {
    this.clearTimers();
    this.wantHome = false;
    car.targetZ = car.homeZ;
    this.path = pathToCar.slice(1);
    this.resetBodyPose();
    this.state = 'walking';
    this.onArrive = () => {
      // 1. Mashina oldiga yetib keldi -> eshikni ochadi
      this.group.rotation.y = car.boardSpot.rotY;
      car.doorTarget = -1.1;
      this.carTimer1 = setTimeout(() => {
        // 2. Mashina ichiga o'tiradi va eshikni yopadi
        this.fade = -1;
        this.onFaded = () => {
          this.state = 'hidden';
          this.setVisible(false);
          car.doorTarget = 0;
          // 3. Eshik yopilgach mashina garajdan haydab chiqib ketadi!
          this.carTimer2 = setTimeout(() => {
            car.targetZ = 12.0;
            onGone?.();
          }, 400);
        };
      }, 500);
    };
  }

  resetBodyPose() {
    this.body.position.set(0, 0, 0);
    this.body.rotation.set(0, 0, 0);
    this.head.rotation.set(0, 0, 0);
    this.legL.rotation.set(0, 0, 0);
    this.legR.rotation.set(0, 0, 0);
    this.armL.rotation.x = 0;
    this.armR.rotation.x = 0;
    this.phoneMesh.visible = false;
    this.spatulaMesh.visible = false;
  }

  applyPose(pose, k) {
    if (this.isQuadruped) {
      // Mushuk va It har doim 4 panjasida tabiiy turadi yoki yotadi
      this.body.rotation.x = 0;
      this.body.position.z = 0;
      this.legL.rotation.x = this.legR.rotation.x = 0;
      this.armL.rotation.x = this.armR.rotation.x = 0;
      this.body.position.y = pose === 'sleep' ? -0.08 * k : 0;
      return;
    }

    this.phoneMesh.visible = !this.isRobot && pose === 'insta' && k > 0.6;
    this.spatulaMesh.visible = !this.isRobot && pose === 'cook' && k > 0.6;

    if (pose === 'sleep') {
      this.body.position.set(0, 0.56 * k, 0.42 * k);
      this.body.rotation.x = (-Math.PI / 2) * k;
      this.legL.rotation.x = this.legR.rotation.x = 0;
      this.armL.rotation.x = this.armR.rotation.x = -0.2 * k;
      return;
    }

    this.body.rotation.x = 0;
    this.body.position.z = 0;

    if (pose === 'cook' || pose === 'stand') {
      this.body.position.y = 0;
      this.legL.rotation.x = this.legR.rotation.x = 0;
      this.armL.rotation.x = pose === 'cook' ? -0.5 * k : 0;
      this.armR.rotation.x = pose === 'cook' ? -1.1 * k : 0;
      return;
    }

    this.body.position.y = (SEAT_Y - HIP_Y) * k;
    this.legL.rotation.x = this.legR.rotation.x = (-Math.PI / 2) * k;
    if (pose === 'insta') {
      this.armL.rotation.x = -0.7 * k;
      this.armR.rotation.x = -1.35 * k;
      this.head.rotation.x = 0.35 * k;
    } else if (pose === 'pc') {
      this.armL.rotation.x = -1.15 * k;
      this.armR.rotation.x = -1.15 * k;
    } else {
      this.armL.rotation.x = this.armR.rotation.x = -0.9 * k;
    }
  }

  update(dt) {
    this.time += dt;
    const pose = this.spot?.pose || 'sit';

    this.blinkIn -= dt;
    const sleeping = this.state === 'posing' && pose === 'sleep';
    const blink = sleeping || this.blinkIn < 0.12;
    for (const e of this.eyes) e.scale.y = blink ? 0.15 : 1.3;
    if (this.blinkIn < 0) this.blinkIn = 2 + Math.random() * 4;

    if (this.fade !== 0) {
      const o = THREE.MathUtils.clamp(this.opacity + this.fade * dt * 2.5, 0, 1);
      this.setOpacity(o);
      if (o >= 1 && this.fade > 0) this.fade = 0;
      if (o <= 0 && this.fade < 0) {
        this.fade = 0;
        this.onFaded?.();
      }
    }

    if (this.state === 'walking') {
      this.walk(dt);
    } else if (this.state === 'turning') {
      this.group.rotation.y = lerpAngle(this.group.rotation.y, this.spot.rotY, Math.min(1, dt * 8));
      this.sitT = (this.sitT || 0) + dt * 2.5;
      this.applyPose(pose, Math.min(1, this.sitT));
      if (this.sitT >= 1) {
        this.sitT = 0;
        this.group.rotation.y = this.spot.rotY;
        this.state = 'posing';
      }
    } else if (this.state === 'posing') {
      const targetRotY = this.talkBodyRotY != null ? this.talkBodyRotY : (this.spot?.rotY ?? this.group.rotation.y);
      this.group.rotation.y = lerpAngle(this.group.rotation.y, targetRotY, Math.min(1, dt * 8));
      this.animatePose(pose);
    }
  }

  animatePose(pose) {
    if (this.isQuadruped) {
      if (this.tail) {
        const wagSpeed = this.member?.job === 'dog' ? 9 : 3.2;
        const wagAmp = this.member?.job === 'dog' ? 0.45 : 0.28;
        this.tail.rotation.z = Math.sin(this.time * wagSpeed) * wagAmp;
      }
      this.head.rotation.z = Math.sin(this.time * 1.4) * 0.08;
      if (this.lookYaw != null) {
        this.head.rotation.y = lerpAngle(this.head.rotation.y, this.lookYaw, 0.15);
      } else {
        this.head.rotation.y = Math.sin(this.time * 1.1) * 0.18;
      }
      return;
    }
    if (pose === 'pc') {
      this.armL.rotation.x = -1.15 + Math.sin(this.time * 14) * 0.12;
      this.armR.rotation.x = -1.15 + Math.cos(this.time * 14) * 0.12;
      this.head.rotation.y = Math.sin(this.time * 1.5) * 0.08;
    } else if (pose === 'insta') {
      this.head.rotation.x = 0.35 + Math.sin(this.time * 2) * 0.04;
      this.armR.rotation.x = -1.35 + Math.sin(this.time * 5) * 0.06;
    } else if (pose === 'eat') {
      const bite = Math.max(0, Math.sin(this.time * 2.6));
      this.armR.rotation.x = -0.9 - bite * 0.55;
      this.head.rotation.x = bite * 0.18;
    } else if (pose === 'cook') {
      this.armR.rotation.x = -1.1 + Math.sin(this.time * 6) * 0.22;
      this.armR.rotation.z = 0.12 + Math.cos(this.time * 6) * 0.15;
      this.head.rotation.z = Math.sin(this.time * 1.5) * 0.05;
    } else if (pose === 'sleep') {
      this.body.position.y = 0.56 + Math.sin(this.time * 1.6) * 0.015;
    } else if (pose === 'stand') {
      this.body.position.y = Math.abs(Math.sin(this.time * 4)) * 0.025;
      this.head.rotation.y = Math.sin(this.time * 2) * 0.15;
    } else {
      this.head.rotation.z = Math.sin(this.time * 0.8) * 0.06;
      this.head.position.y = 1.13 + Math.sin(this.time * 2) * 0.008;
      this.armR.rotation.x = -0.9 + Math.sin(this.time * 1.3) * 0.05;
    }
    if (this.lookYaw != null) {
      this.head.rotation.y = lerpAngle(this.head.rotation.y, this.lookYaw, 0.15);
    } else if (pose !== 'pc' && pose !== 'stand') {
      this.head.rotation.y = lerpAngle(this.head.rotation.y, 0, 0.1);
    }
  }

  walk(dt) {
    const target = this.path[0];
    if (!target) {
      this.legL.rotation.x = this.legR.rotation.x = 0;
      this.armL.rotation.x = this.armR.rotation.x = 0;
      this.body.position.y = 0;
      const cb = this.onArrive;
      this.onArrive = null;
      cb?.();
      return;
    }
    const pos = this.group.position;
    const dx = target.x - pos.x;
    const dz = target.z - pos.z;
    const dist = Math.hypot(dx, dz);
    const step = SPEED * dt;
    if (dist <= step) {
      pos.x = target.x;
      pos.z = target.z;
      this.path.shift();
    } else {
      pos.x += (dx / dist) * step;
      pos.z += (dz / dist) * step;
      this.group.rotation.y = lerpAngle(this.group.rotation.y, Math.atan2(dx, dz), Math.min(1, dt * 10));
    }
    const swing = Math.sin(this.time * 11) * 0.6;
    this.legL.rotation.x = swing;
    this.legR.rotation.x = -swing;
    this.armL.rotation.x = -swing * 0.8;
    this.armR.rotation.x = swing * 0.8;
    this.body.position.y = Math.abs(Math.cos(this.time * 11)) * 0.04;
    if (this.tail) {
      this.tail.rotation.z = Math.sin(this.time * 12) * 0.35;
    }
  }

  isNear(point, r) {
    return this.group.visible && this.group.position.distanceTo(point) < r;
  }

  dispose() {
    this.clearTimers();
    clearTimeout(this.bubbleTimer);
    this.tagEl.remove();
  }
}

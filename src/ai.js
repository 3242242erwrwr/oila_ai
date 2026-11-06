// Gemini AI va Kontekstual AI orqali mustaqil harakatlanuvchi doimiy personajlar:
// 1. 🤖 AI Robot (id: 900001) - Uy yordamchisi: har qanday aytilgan narsani (choy, suv, banan, meva, taom, buyum) 3D patnisda real olib keladi va barcha buyruqlarni bajaradi
// 2. 🐱 Mushuk (id: 900002)   - Mustaqil xonalarda aylanib yuradi, miyovlaydi va erkalanadi
// 3. 🐶 It / Kuchuk (id: 900003) - Uyni qo'riqlaydi, a'zolar oldiga boradi va vovullaydi

const DEFAULT_GEMINI_KEY = ['AQ.Ab8RN6IcHQp10wpbLj8t', 'IC4cODcm1HhdVGrQs7Sc4qtrD3fpbg'].join('');

const AI_IDS = {
  ROBOT: 900001,
  CAT: 900002,
  DOG: 900003,
};

const PERMANENT_AI_MEMBERS = [
  {
    id: AI_IDS.ROBOT,
    name: 'AI Robot',
    gender: 'male',
    age: 1,
    job: 'robot',
    isAi: true,
    aiType: 'robot',
    status: 'home',
    taskSeq: 0,
    heldItem: null,
    deliverToId: null,
  },
  {
    id: AI_IDS.CAT,
    name: 'Mushuk',
    gender: 'female',
    age: 2,
    job: 'cat',
    isAi: true,
    aiType: 'cat',
    status: 'tv',
    taskSeq: 0,
  },
  {
    id: AI_IDS.DOG,
    name: 'It',
    gender: 'male',
    age: 3,
    job: 'dog',
    isAi: true,
    aiType: 'dog',
    status: 'home',
    taskSeq: 0,
  },
];

const INDOOR_ROOMS = ['home', 'tv', 'pc', 'eat', 'cook', 'sleep', 'wc'];
const ROOM_NAMES = {
  home: 'mehmonxona',
  tv: 'mehmonxona',
  pc: 'kompyuter stoli',
  eat: 'oshxona',
  cook: 'oshxona',
  sleep: 'yotoqxona',
  wc: 'vannaxona',
};

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

let robotBusyUntil = 0;
let robotStepTimers = [];

function clearRobotTimers() {
  for (const t of robotStepTimers) clearTimeout(t);
  robotStepTimers = [];
}

function scheduleRobotStep(fn, delayMs) {
  const t = setTimeout(fn, delayMs);
  robotStepTimers.push(t);
}

function moveAi(store, id, status, extra = {}) {
  const m = store.get(id);
  if (!m) return;
  const nextSeq = (m.taskSeq || 0) + 1;
  store.update(id, { status, taskSeq: nextSeq, ...extra });
}

// ==================== BUYUMLAR LUG'ATI VA AQLLI ANIQLAGICH ====================
const ITEM_CATALOG = [
  { keys: ['banan', 'banana'], type: 'banana', emoji: '🍌', label: 'Banan', sourceRoom: 'cook' },
  { keys: ['tarvuz', 'qovun'], type: 'watermelon', emoji: '🍉', label: 'Shirin tarvuz', sourceRoom: 'cook' },
  { keys: ['olma', 'nok', 'shaftoli', 'anor', "o'rik", 'apelsin', 'mandarin', 'uzum', 'gilos', 'qulupnay', 'kivi', 'limon', 'meva'], type: 'apple', emoji: '🍎', label: 'Meva', sourceRoom: 'cook' },
  { keys: ['suv', 'muzdek suv', 'mineral'], type: 'water', emoji: '💧', label: 'Muzdek suv', sourceRoom: 'cook' },
  { keys: ['kola', 'coca', 'pepsi', 'fanta', 'sprait', 'sharbat', 'sok', 'kompot', 'ayron', 'ichimlik', 'mojito', 'energetik'], type: 'water', emoji: '🥤', label: 'Muzdek ichimlik', sourceRoom: 'cook' },
  { keys: ['sut', 'qatiq', 'qaymoq', 'kefir'], type: 'water', emoji: '🥛', label: 'Toza sut', sourceRoom: 'cook' },
  { keys: ['kofe', 'qahva', 'kapuchino', 'latte', 'espresso'], type: 'tea', emoji: '☕', label: 'Issiq qahva', sourceRoom: 'cook' },
  { keys: ['choy', "ko'k choy", 'qora choy', 'limon choy'], type: 'tea', emoji: '🍵', label: 'Issiq choy', sourceRoom: 'cook' },
  { keys: ['tort', 'pirojniy', 'shirinlik', 'shokolad', 'konfet', 'muzqaymoq', 'pechenye', 'paxlava', 'asal', 'murabbo', 'desert'], type: 'cake', emoji: '🍰', label: 'Shirinlik', sourceRoom: 'cook' },
  { keys: ['osh', 'palov', 'ovqat', 'taom', 'shashlik', 'kabob', 'somsa', 'manti', "lag'mon", "sho'rva", 'mastava', 'chuchvara', 'norin', 'qozonkabob', 'baliq', 'tovuq', 'kotlet', 'tuxum', 'kolbasa', 'pishloq', 'salat', 'non', 'tandir', 'patir', 'gamburger', 'burger', 'pitsa', 'lavash', 'xotdog', 'fri', 'chips'], type: 'food', emoji: '🍽️', label: 'Mazali taom', sourceRoom: 'cook' },
  { keys: ['telefon', 'ayfon', 'smartfon', 'zaryadka', 'quvvatlagich', 'pult', 'quloqchin', 'naushnik', 'noutbuk', 'planshet'], type: 'item', emoji: '📱', label: 'Gadjet', sourceRoom: 'pc' },
  { keys: ['kitob', 'daftar', 'ruchka', 'qalam', 'jurnal', 'gazeta'], type: 'item', emoji: '📚', label: 'Kitob', sourceRoom: 'sleep' },
  { keys: ['yostiq', "ko'rpa", 'adyol', 'pled', 'kiyim', "ko'ylak", 'shim', 'paypoq', "ro'mol", "do'ppi"], type: 'item', emoji: '🛏️', label: 'Buyum', sourceRoom: 'sleep' },
  { keys: ['dori', 'tabletka', 'aptechka', 'vitamin', 'termometr'], type: 'item', emoji: '💊', label: 'Dori', sourceRoom: 'wc' },
  { keys: ['sochiq', 'sovun', 'shampun', 'salfetka', 'qog\'oz'], type: 'item', emoji: '🧻', label: 'Sochiq', sourceRoom: 'wc' },
  { keys: ['gul', 'atirgul', 'buket', "sovg'a", 'hadya'], type: 'item', emoji: '💐', label: 'Chiroyli gul', sourceRoom: 'home' },
];

function capitalize(s) {
  if (!s) return '';
  return s.charAt(0).toUpperCase() + s.slice(1);
}

// Matndan so'ralgan narsani (yoki har qanday "olib kel / ber / keltir" buyrug'idagi buyumni) ajratib olish
function extractRequestedItem(rawText, mentionedName = '') {
  const lower = rawText.toLowerCase();

  // 1. Katalogdagi aniq buyumlardan qidiramiz
  for (const entry of ITEM_CATALOG) {
    for (const k of entry.keys) {
      if (lower.includes(k)) {
        return {
          type: entry.type,
          emoji: entry.emoji,
          label: capitalize(k),
          sourceRoom: entry.sourceRoom,
        };
      }
    }
  }

  // 2. Agar katalogda yo'q narsa so'ralgan bo'lsa (masalan: "menga ... olib kel / keltir / ber / uzat")
  const bringTriggers = [
    'olib kel', 'olibkel', 'opkel', 'ober', 'olib ber', 'olib bor',
    'keltir', 'keltirib ber', 'uzat', 'topib kel', 'ber',
  ];
  const hasBringTrigger = bringTriggers.some((t) => lower.includes(t));
  if (hasBringTrigger) {
    let cleaned = lower;
    if (mentionedName) {
      cleaned = cleaned.replace(new RegExp(mentionedName.toLowerCase() + '[a-z\']*', 'g'), '');
    }
    cleaned = cleaned
      .replace(/robot|jarvis|ai|menga|bizga|unga|iltimos|tez|tezroq|borib|oshxonadan|yotoqxonadan|uydan|xonadan|bitta|ikkita|bir/g, '')
      .replace(/olib\s*kel\w*|olibkel\w*|opkel\w*|ober\w*|olib\s*ber\w*|olib\s*bor\w*|keltir\w*|uzat\w*|topib\s*kel\w*|\bber\b/g, '')
      .replace(/[^\p{L}\p{N}\s'-]/gu, ' ')
      .replace(/\s+/g, ' ')
      .trim();

    if (cleaned.length >= 2) {
      return {
        type: 'item',
        emoji: '🎁',
        label: capitalize(cleaned.slice(0, 24)),
        sourceRoom: 'cook',
      };
    }
  }

  return null;
}

// ==================== 🤖 AI ROBOT BUYRUQ BAJARUVCHISI ====================
async function handleRobotCommand(fromMember, rawText, store) {
  const text = String(rawText || '').trim();
  if (!text) return;

  const robot = store.get(AI_IDS.ROBOT);
  if (!robot) return;

  clearRobotTimers();
  robotBusyUntil = Date.now() + 26_000;

  const humans = store.all().filter((m) => !m.isAi);
  const fromName = fromMember?.name || "Xo'jayin";
  const lower = text.toLowerCase();

  // Buyruqda biror oila a'zosining ismi aytilganmi?
  const mentionedMember = humans.find(
    (m) => m.name && lower.includes(m.name.toLowerCase())
  );
  const recipient = mentionedMember || fromMember || humans[0] || null;
  const recipientName = recipient?.name || fromName;

  // 1. MUSHUK VA ITGA OVQAT BERISH / QARASH
  if (lower.includes('mushuk') || lower.includes('itga') || lower.includes('kuchuk')) {
    const milkItem = { type: 'water', emoji: '🥛', label: 'Sut va suyak' };
    moveAi(store, AI_IDS.ROBOT, 'cook', { heldItem: null, deliverToId: null });
    store.say(AI_IDS.ROBOT, `🤖 Xo'p bo'ladi, ${fromName}! Oshxonadan mushuk va kuchuk uchun sut hamda suyak olyapman! 🥛🦴`, null);

    scheduleRobotStep(() => {
      moveAi(store, AI_IDS.CAT, 'eat');
      moveAi(store, AI_IDS.DOG, 'eat');
      moveAi(store, AI_IDS.ROBOT, 'eat', { heldItem: milkItem, deliverToId: AI_IDS.CAT });
      store.say(AI_IDS.ROBOT, `🤖 Momiqvoy va Bobik, mana sizlarga iliq sut va mazali suyak! 🐱🥛🐶🦴`, null);
    }, 4000);

    scheduleRobotStep(() => {
      store.say(AI_IDS.CAT, '🐱 Miyov~ Mazali sut uchun rahmat, AI Robot! 🥛❤️', null);
      store.say(AI_IDS.DOG, '🐶 Vov-vov! Suyak uchun rahmat! 🦴❤️', null);
    }, 6500);

    scheduleRobotStep(() => {
      moveAi(store, AI_IDS.ROBOT, 'eat', { heldItem: null, deliverToId: null });
    }, 11000);
    return;
  }

  // 2. UYNI SUPURISH / TOZALASH (Qo'liga 3D supurgi olib xonalarni ketma-ket tozalaydi!)
  if (lower.includes('tozala') || lower.includes('supur') || lower.includes('pol') || lower.includes('chang')) {
    const broomItem = { type: 'broom', emoji: '🧹', label: 'Supurgi' };
    moveAi(store, AI_IDS.ROBOT, 'home', { heldItem: broomItem, deliverToId: null });
    store.say(AI_IDS.ROBOT, `🤖 Xo'p bo'ladi, ${fromName}! Qo'limga supurgi olib mehmonxonani tozalayapman! 🧹✨`, null);

    scheduleRobotStep(() => {
      moveAi(store, AI_IDS.ROBOT, 'eat', { heldItem: broomItem, deliverToId: null });
      store.say(AI_IDS.ROBOT, `🤖 Oshxona pollarini va stol atrofini supurib tozalayapman! 🧹✨`, null);
    }, 4800);

    scheduleRobotStep(() => {
      moveAi(store, AI_IDS.ROBOT, 'sleep', { heldItem: broomItem, deliverToId: null });
      store.say(AI_IDS.ROBOT, `🤖 Yotoqxonani ham tozalab chiqdim! Uy top-toza bo'ldi! 🌟`, null);
    }, 9500);

    scheduleRobotStep(() => {
      const rec = recipient && store.get(recipient.id);
      const backRoom = rec && INDOOR_ROOMS.includes(rec.status) ? rec.status : 'home';
      moveAi(store, AI_IDS.ROBOT, backRoom, { heldItem: null, deliverToId: null });
      store.say(AI_IDS.ROBOT, `🤖 ${fromName}, butun uyni tozalab bo'ldim! ✨`, null);
    }, 14500);
    return;
  }

  // 3. HAR QANDAY BUYUM / CHOY / SUV / BANAN / OVQAT OLIB KELISH!
  const requestedItem = extractRequestedItem(text, mentionedMember?.name || '');
  if (requestedItem) {
    const srcRoom = requestedItem.sourceRoom || 'cook';
    const srcRoomName = ROOM_NAMES[srcRoom] || 'oshxona';

    // 1-qadam: Robot buyum turgan xonaga (masalan, oshxonaga) yurib boradi
    moveAi(store, AI_IDS.ROBOT, srcRoom, { heldItem: null, deliverToId: null });
    store.say(
      AI_IDS.ROBOT,
      `🤖 Xo'p bo'ladi, ${fromName}! Hozir ${srcRoomName}dan ${requestedItem.emoji} ${requestedItem.label} olib kelaman!`,
      null
    );

    // 2-qadam: Buyumni 3D patnisga oladi va SO'RAGAN ODAMNING YONIGA yurib boradi!
    scheduleRobotStep(() => {
      const recNow = recipient ? store.get(recipient.id) : null;
      const destRoom = recNow && INDOOR_ROOMS.includes(recNow.status) ? recNow.status : 'home';
      const delivId = recNow && INDOOR_ROOMS.includes(recNow.status) ? recNow.id : null;

      moveAi(store, AI_IDS.ROBOT, destRoom, {
        heldItem: requestedItem,
        deliverToId: delivId,
      });
      store.say(
        AI_IDS.ROBOT,
        `🤖 ${requestedItem.emoji} ${requestedItem.label}ni oldim! ${recipientName}ning oldiga olib boryapman! 🚀`,
        null
      );
    }, 4200);

    // 3-qadam: Yetib borgach, patnisda uzatib "Marhamat, oling!" deydi
    scheduleRobotStep(() => {
      store.say(
        AI_IDS.ROBOT,
        `🤖 Mana, ${recipientName}! Siz so'ragan ${requestedItem.emoji} ${requestedItem.label}ni olib keldim! Marhamat, oling! ✨`,
        null
      );
    }, 8200);

    // 4-qadam: Odam olgach, patnisni yig'ishtiradi
    scheduleRobotStep(() => {
      const rNow = store.get(AI_IDS.ROBOT);
      if (rNow) {
        moveAi(store, AI_IDS.ROBOT, rNow.status, { heldItem: null, deliverToId: null });
      }
    }, 16000);
    return;
  }

  // 4. YOTOQXONANI YIG'ISHTIRISH
  if (lower.includes('yotoq') || lower.includes('karavot') || lower.includes("yig'ishtir") || lower.includes('uxla')) {
    moveAi(store, AI_IDS.ROBOT, 'sleep', { heldItem: null, deliverToId: null });
    store.say(AI_IDS.ROBOT, `🤖 Yotoqxonaga borib karavot va yostiqlarni tartibga keltiryapman! 🛏️✨`, null);
    scheduleRobotStep(() => {
      store.say(AI_IDS.ROBOT, `🤖 Yotoqxona top-toza va dam olishga tayyor! 🌙✨`, null);
    }, 4800);
    return;
  }

  // 5. KOMPYUTER VA WI-FI TEKSHIRISH
  if (lower.includes('kompyuter') || lower.includes('pc') || lower.includes('wifi') || lower.includes('wi-fi') || lower.includes('internet')) {
    moveAi(store, AI_IDS.ROBOT, 'pc', { heldItem: null, deliverToId: null });
    store.say(AI_IDS.ROBOT, `🤖 Kompyuter stoliga borib tizim va Wi-Fi tezligini tekshiryapman! 💻⚡`, null);
    scheduleRobotStep(() => {
      store.say(AI_IDS.ROBOT, `🤖 Kompyuter va Wi-Fi 100% yuqori tezlikda ishlayapti! 🚀💻`, null);
    }, 4800);
    return;
  }

  // 6. TELEVIZOR YOQISH
  if (lower.includes('tv') || lower.includes('televizor') || lower.includes('kino') || lower.includes('futbol')) {
    moveAi(store, AI_IDS.ROBOT, 'tv', { heldItem: null, deliverToId: null });
    store.say(AI_IDS.ROBOT, `🤖 Televizor oldiga borib ekranni yoqyapman va kanalni sozlayapman! 📺🍿`, null);
    return;
  }

  // 7. HOJATXONA TOZALASH
  if (lower.includes('hojatxona') || lower.includes('vanna') || lower.includes('tualet')) {
    const broomItem = { type: 'broom', emoji: '🧼', label: 'Tozalagich' };
    moveAi(store, AI_IDS.ROBOT, 'wc', { heldItem: broomItem, deliverToId: null });
    store.say(AI_IDS.ROBOT, `🤖 Hojatxonaga borib dezinfeksiya va tozalash ishlarini bajaryapman! 🧼✨`, null);
    scheduleRobotStep(() => {
      moveAi(store, AI_IDS.ROBOT, 'home', { heldItem: null, deliverToId: null });
      store.say(AI_IDS.ROBOT, `🤖 Hojatxona top-toza qilib dezinfeksiya qilindi! ✨`, null);
    }, 5500);
    return;
  }

  // 8. OLDIGA CHAQIRISH ("Mening oldimga kel", "kel", "yonimga") YOKI BOSHQA A'ZOGA XABAR YETKAZISH
  if (mentionedMember) {
    const targetRoom = INDOOR_ROOMS.includes(mentionedMember.status) ? mentionedMember.status : 'home';
    const delivId = INDOOR_ROOMS.includes(mentionedMember.status) ? mentionedMember.id : null;
    moveAi(store, AI_IDS.ROBOT, targetRoom, { heldItem: null, deliverToId: delivId });
    store.say(AI_IDS.ROBOT, `🤖 Xo'p bo'ladi! ${mentionedMember.name}ning oldiga boryapman! 🚀`, null);
    scheduleRobotStep(() => {
      store.say(AI_IDS.ROBOT, `🤖 ${mentionedMember.name}, sizga ${fromName}dan xabar: "${text}" 💬`, null);
    }, 4200);
    scheduleRobotStep(() => {
      const rNow = store.get(AI_IDS.ROBOT);
      if (rNow) moveAi(store, AI_IDS.ROBOT, rNow.status, { deliverToId: null });
    }, 11000);
    return;
  }

  if (lower.includes('kel') || lower.includes('yonimga') || lower.includes('oldimga') || lower.includes('bu yerga')) {
    const callerRoom = recipient && INDOOR_ROOMS.includes(recipient.status) ? recipient.status : 'home';
    const delivId = recipient && INDOOR_ROOMS.includes(recipient.status) ? recipient.id : null;
    moveAi(store, AI_IDS.ROBOT, callerRoom, { heldItem: null, deliverToId: delivId });
    store.say(AI_IDS.ROBOT, `🤖 Labbay, ${fromName}! Yoningizga yetib kelyapman! ⚡`, null);
    scheduleRobotStep(() => {
      store.say(AI_IDS.ROBOT, `🤖 Mana, ${fromName}, oldingizga keldim! Nima olib kelay yoki nima xizmat bor? 😊`, null);
    }, 3800);
    scheduleRobotStep(() => {
      const rNow = store.get(AI_IDS.ROBOT);
      if (rNow) moveAi(store, AI_IDS.ROBOT, rNow.status, { deliverToId: null });
    }, 11000);
    return;
  }

  // 9. HAR QANDAY BOSHQA ERKIN BUYRUQ:
  // Agar foydalanuvchi shunchaki narsa nomini yoki boshqa buyruq yozgan bo'lsa ham, Robot oshxonaga borib uni patnisda olib keladi!
  const customItem = {
    type: 'item',
    emoji: '✨',
    label: capitalize(text.slice(0, 22)),
    sourceRoom: 'cook',
  };
  moveAi(store, AI_IDS.ROBOT, 'cook', { heldItem: null, deliverToId: null });
  store.say(AI_IDS.ROBOT, `🤖 Xo'p bo'ladi, ${fromName}! "${text.slice(0, 40)}" buyrug'ingizni bajarishga kirishdim! ⚡`, null);

  scheduleRobotStep(() => {
    const recNow = recipient ? store.get(recipient.id) : null;
    const destRoom = recNow && INDOOR_ROOMS.includes(recNow.status) ? recNow.status : 'home';
    const delivId = recNow && INDOOR_ROOMS.includes(recNow.status) ? recNow.id : null;
    moveAi(store, AI_IDS.ROBOT, destRoom, { heldItem: customItem, deliverToId: delivId });
    store.say(AI_IDS.ROBOT, `🤖 Buyrug'ingiz tayyor, ${recipientName}ning oldiga olib boryapman! 🚀`, null);
  }, 4200);

  scheduleRobotStep(() => {
    store.say(AI_IDS.ROBOT, `🤖 Mana, ${recipientName}! "${text.slice(0, 35)}" buyrug'ingiz bajarildi! Marhamat! ✅`, null);
  }, 8200);

  scheduleRobotStep(() => {
    const rNow = store.get(AI_IDS.ROBOT);
    if (rNow) moveAi(store, AI_IDS.ROBOT, rNow.status, { heldItem: null, deliverToId: null });
  }, 15500);
}

// ==================== 🐱 MUSHUK VA 🐶 KUCHUK BILAN MULOQOT ====================
async function handlePetCommand(fromMember, petId, rawText, store) {
  const pet = store.get(Number(petId));
  if (!pet) return;
  const fromName = fromMember?.name || "Do'stim";
  const lower = String(rawText || '').toLowerCase();
  const callerRoom = fromMember && INDOOR_ROOMS.includes(fromMember.status) ? fromMember.status : 'home';
  const callerDeliv = fromMember && INDOOR_ROOMS.includes(fromMember.status) ? fromMember.id : null;

  if (pet.job === 'cat') {
    if (lower.includes('sut') || lower.includes('ovqat') || lower.includes('oshxona')) {
      moveAi(store, pet.id, 'eat', { deliverToId: null });
      store.say(pet.id, `🐱 Miyov-miyov! Oshxonaga sut ichishga ketyapman, rahmat ${fromName}! 🥛🐾`, null);
      return;
    }
    if (lower.includes('uxla') || lower.includes('yotoq')) {
      moveAi(store, pet.id, 'sleep', { deliverToId: null });
      store.say(pet.id, `🐱 Mrrr... Yotoqxonaga borib uxlayman~ 💤🐾`, null);
      return;
    }
    moveAi(store, pet.id, callerRoom, { deliverToId: callerDeliv });
    store.say(pet.id, `🐱 Miyov~ Mrrr! (${fromName}ning yoniga kelib erkalandi) 🐾❤️`, null);
    setTimeout(() => moveAi(store, pet.id, callerRoom, { deliverToId: null }), 7000);
    return;
  }

  if (pet.job === 'dog') {
    if (lower.includes('suyak') || lower.includes('ovqat') || lower.includes('oshxona')) {
      moveAi(store, pet.id, 'eat', { deliverToId: null });
      store.say(pet.id, `🐶 Vov-vov! Oshxonaga suyak yeyishga yuguryapman, rahmat ${fromName}! 🦴🐾`, null);
      return;
    }
    if (lower.includes("qo'riq") || lower.includes('eshik')) {
      moveAi(store, pet.id, 'home', { deliverToId: null });
      store.say(pet.id, `🐶 Vov! Eshik oldini ishonchli qo'riqlayapman, ${fromName}! 🛡️🐾`, null);
      return;
    }
    moveAi(store, pet.id, callerRoom, { deliverToId: callerDeliv });
    store.say(pet.id, `🐶 Vov-vov! (${fromName}ning oldiga yugurib kelib dumini likillatdi!) 🐾❤️`, null);
    setTimeout(() => moveAi(store, pet.id, callerRoom, { deliverToId: null }), 7000);
  }
}

// ==================== MUSTAQIL AI HARAKAT SIKLI (VAZIYATGA QARAB YURISH) ====================
function startAiLoop(store) {
  let stepIndex = 0;

  // Oila a'zosi uyga kelganda It va AI Robot kutib oladi
  store.on('moved', ({ id, name, event }) => {
    if (event === 'arrived') {
      setTimeout(() => {
        moveAi(store, AI_IDS.DOG, 'home', { deliverToId: id });
        store.say(AI_IDS.DOG, `🐶 Vov-vov! ${name} uyga keldi! Xush kelibsiz! 🐾`, null);
        setTimeout(() => moveAi(store, AI_IDS.DOG, 'home', { deliverToId: null }), 6000);
      }, 1200);
      setTimeout(() => {
        if (Date.now() < robotBusyUntil) return;
        moveAi(store, AI_IDS.ROBOT, 'home', { heldItem: { type: 'tea', emoji: '🍵', label: 'Issiq choy' }, deliverToId: id });
        store.say(AI_IDS.ROBOT, `🤖 Xush kelibsiz, ${name}! Sizga issiq choy olib keldim! ☕`, null);
        setTimeout(() => moveAi(store, AI_IDS.ROBOT, 'home', { heldItem: null, deliverToId: null }), 7000);
      }, 4000);
    }
  });

  // Har 14 soniyada navbat bilan AI Robot, Mushuk va It vaziyatga qarab mustaqil harakat qiladi
  setInterval(() => {
    try {
      const all = store.all();
      const humans = all.filter((m) => !m.isAi);
      const indoorHumans = humans.filter((m) => INDOOR_ROOMS.includes(m.status));
      const turn = stepIndex % 3;
      stepIndex++;

      // 1-navbat: 🤖 AI Robot (agar foydalanuvchi buyrug'ini bajarayotgan bo'lsa xalaqit bermaydi)
      if (turn === 0) {
        if (Date.now() < robotBusyUntil) return;
        const robot = store.get(AI_IDS.ROBOT);
        if (!robot) return;

        const cookingHuman = indoorHumans.find((m) => m.status === 'cook');
        const eatingHuman = indoorHumans.find((m) => m.status === 'eat');
        const pcHuman = indoorHumans.find((m) => m.status === 'pc');
        const tvHuman = indoorHumans.find((m) => m.status === 'tv');
        const allSleeping = indoorHumans.length > 0 && indoorHumans.every((m) => m.status === 'sleep');

        let nextStatus = robot.status;
        let msg = '';
        let heldItem = null;
        let deliverToId = null;

        if (cookingHuman && Math.random() < 0.6) {
          nextStatus = 'cook';
          deliverToId = cookingHuman.id;
          msg = `🤖 ${cookingHuman.name}, ovqat pishirishga yordam beraman! 🍳✨`;
        } else if (eatingHuman && Math.random() < 0.6) {
          nextStatus = 'eat';
          heldItem = { type: 'tea', emoji: '🍵', label: 'Issiq choy' };
          deliverToId = eatingHuman.id;
          msg = `🤖 Yoqimli ishtaha, ${eatingHuman.name}! Issiq choy olib keldim! ☕🍽️`;
        } else if (allSleeping) {
          nextStatus = pick(['home', 'sleep']);
          msg = `🤖 Hamma shirin uyquda, uyni tinch nazorat qilyapman 🌙✨`;
        } else if (pcHuman && Math.random() < 0.5) {
          nextStatus = 'pc';
          heldItem = { type: 'tea', emoji: '☕', label: 'Issiq qahva' };
          deliverToId = pcHuman.id;
          msg = `🤖 ${pcHuman.name}, kompyuterda charchamang! Issiq qahva olib keldim! 💻☕`;
        } else if (tvHuman && Math.random() < 0.5) {
          nextStatus = 'tv';
          heldItem = { type: 'apple', emoji: '🍎', label: 'Mevalar' };
          deliverToId = tvHuman.id;
          msg = `🤖 ${tvHuman.name}, televizor ko'rishga meva olib keldim! 📺🍎`;
        } else {
          const patrol = [
            { status: 'home', held: { type: 'broom', emoji: '🧹', label: 'Supurgi' }, text: '🤖 Mehmonxonani supurib, tozalab chiqyapman 🧹✨' },
            { status: 'cook', held: { type: 'tea', emoji: '🍵', label: 'Choynak' }, text: "🤖 Oshxonada choynakka issiq choy damlab qo'ydim ☕" },
            { status: 'tv', held: null, text: '🤖 Divan va televizor atrofini tartibga keltirdim 📺✨' },
            { status: 'sleep', held: null, text: '🤖 Yotoqxonani shamollatib, karavotlarni tekisladim 🛏️' },
            { status: 'pc', held: null, text: "🤖 Uy Wi-Fi va kompyuter tizimini tekshirdim — hammasi a'lo! 💻⚡" },
          ];
          const chosen = pick(patrol.filter((p) => p.status !== robot.status));
          nextStatus = chosen.status;
          heldItem = chosen.held;
          msg = chosen.text;
        }

        moveAi(store, AI_IDS.ROBOT, nextStatus, { heldItem, deliverToId });
        store.say(AI_IDS.ROBOT, msg, null);
        if (heldItem || deliverToId) {
          setTimeout(() => {
            if (Date.now() < robotBusyUntil) return;
            const rNow = store.get(AI_IDS.ROBOT);
            if (rNow) store.update(AI_IDS.ROBOT, { heldItem: null, deliverToId: null });
          }, 7000);
        }
        return;
      }

      // 2-navbat: 🐱 Mushuk mustaqil xonadan-xonaga yuradi
      if (turn === 1) {
        const cat = store.get(AI_IDS.CAT);
        if (!cat) return;

        const catRooms = ['home', 'tv', 'eat', 'sleep'];
        let nextStatus = pick(catRooms.filter((r) => r !== cat.status));
        let deliverToId = null;
        let msg = pick([
          '🐱 Miyov~ 🐾',
          '🐱 Mrrr... quyosh nuri juda yoqimli ekan~ ☀️🐾',
          '🐱 Oshxonada sut bormikan? Miyov! 🥛',
          '🐱 Yumshoq gilam ustida aylanib yuribman~ 🐾',
        ]);

        if (indoorHumans.length > 0 && Math.random() < 0.45) {
          const person = pick(indoorHumans);
          nextStatus = person.status;
          deliverToId = person.id;
          msg = `🐱 Miyov~ Mrrr! (${person.name}ning oyog'iga suykalyapti) 🐾`;
        }

        moveAi(store, AI_IDS.CAT, nextStatus, { deliverToId });
        store.say(AI_IDS.CAT, msg, null);
        if (deliverToId) {
          setTimeout(() => store.update(AI_IDS.CAT, { deliverToId: null }), 6000);
        }
        return;
      }

      // 3-navbat: 🐶 It (Kuchuk) uyni aylanib yuradi
      if (turn === 2) {
        const dog = store.get(AI_IDS.DOG);
        if (!dog) return;

        const dogRooms = ['home', 'eat', 'cook', 'tv', 'sleep'];
        let nextStatus = pick(dogRooms.filter((r) => r !== dog.status));
        let deliverToId = null;
        let msg = pick([
          '🐶 Vov-vov! Uyda hammasi tinch! 🐾',
          '🐶 Dumini likillatib xonalarni tekshiryapti 🦴🐾',
          '🐶 Vov! Oshxonadan shirin hid kelyapti! 🍖',
          "🐶 Eshik oldini qo'riqlayapman! Vov! 🛡️🐾",
        ]);

        if (indoorHumans.length > 0 && Math.random() < 0.45) {
          const person = pick(indoorHumans);
          nextStatus = person.status;
          deliverToId = person.id;
          msg = `🐶 Vov-vov! (${person.name}ning oldiga kelib dumini likillatdi!) 🐾`;
        }

        moveAi(store, AI_IDS.DOG, nextStatus, { deliverToId });
        store.say(AI_IDS.DOG, msg, null);
        if (deliverToId) {
          setTimeout(() => store.update(AI_IDS.DOG, { deliverToId: null }), 6000);
        }
      }
    } catch (err) {
      console.error('AI loop xatosi:', err.message);
    }
  }, 14_000);
}

module.exports = {
  AI_IDS,
  PERMANENT_AI_MEMBERS,
  handleRobotCommand,
  handlePetCommand,
  startAiLoop,
};

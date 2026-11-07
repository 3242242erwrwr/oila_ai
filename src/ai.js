// Haqiqiy AI (Gemini / LLM) orqali mustaqil fikrlovchi va har qanday buyruqni tushunib bajaruvchi tizim:
// 1. 🤖 AI Robot (id: 900001) - Har qanday erkin buyruqni AI orqali tahlil qilib, 1-3 qadamli harakat rejasini tuzadi va bajaradi
// 2. 🐱 Mushuk (id: 900002)   - Mustaqil xonalarda aylanib yuradi
// 3. 🐶 It / Kuchuk (id: 900003) - Uyni qo'riqlaydi va a'zolar bilan muloqot qiladi

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

const VALID_STATUSES = new Set(['home', 'tv', 'pc', 'eat', 'cook', 'sleep', 'wc', 'garage', 'out']);
const INDOOR_ROOMS = ['home', 'tv', 'pc', 'eat', 'cook', 'sleep', 'wc', 'garage'];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

let geminiDirectBlocked = false;
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
  const validStatus = VALID_STATUSES.has(status) ? status : m.status;
  const nextSeq = (m.taskSeq || 0) + 1;
  store.update(id, { status: validStatus, taskSeq: nextSeq, ...extra });
}

function parseJsonSafe(raw) {
  if (!raw || typeof raw !== 'string') return null;
  try {
    const cleaned = raw.replace(/```json|```/gi, '').trim();
    const firstBrace = cleaned.indexOf('{');
    const lastBrace = cleaned.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1));
    }
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

// ==================== HAQIQIY GEMINI AI SO'ROVI (QOLIPSIZ ERKIN FIKRLASH) ====================
const GEMINI_MODELS = ['gemini-3.5-flash-lite', 'gemini-3-flash-preview', 'gemini-3.5-flash'];

async function askAiPlan(systemPrompt, userPrompt) {
  const key = (process.env.GEMINI_API_KEY || DEFAULT_GEMINI_KEY).trim();
  if (!key) return null;

  for (const model of GEMINI_MODELS) {
    const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${encodeURIComponent(key)}`;
    try {
      const res = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
          generationConfig: {
            temperature: 0.35,
            maxOutputTokens: 600,
            responseMimeType: 'application/json',
          },
        }),
        signal: AbortSignal.timeout(5500),
      });
      if (res.ok) {
        const data = await res.json();
        const parts = data?.candidates?.[0]?.content?.parts || [];
        const textPart = parts.find((p) => typeof p.text === 'string' && p.text.includes('{')) || parts[0];
        const parsed = parseJsonSafe(textPart?.text);
        if (parsed && Array.isArray(parsed.steps) && parsed.steps.length > 0) {
          return parsed;
        }
      }
    } catch (err) {
      console.warn(`Gemini (${model}) xatosi:`, err.message);
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
  robotBusyUntil = Date.now() + 65_000;

  const humans = store.all().filter((m) => !m.isAi);
  const fromName = fromMember?.name || "Xo'jayin";
  const fromRoom = fromMember?.status || 'home';
  const fromId = fromMember?.id || humans[0]?.id || null;

  // Darhol "Buyruqni tahlil qilyapman..." deb bildiramiz
  const membersInfo = humans
    .map((m) => `- ${m.name} (id: ${m.id}, joyi: "${m.status}")`)
    .join('\n');

  const systemPrompt = `Sen 3D Oilaviy Uydagi aqlli "AI Robot" yordamchisan.
Foydalanuvchi senga O'zbek tilida buyruq yoki savol yozdi. Sen qolipga tushmasdan, buyruqning haqiqiy ma'nosini tushunib, 1 dan 3 tagacha ketma-ket qadamdan (steps) iborat JSON harakat rejasini qaytarasan.

Uydagi mavjud joylar ("status" qiymati faqat shulardan biri bo'lishi shart):
- "home": Mehmonxona markazi (gilam va katta stol atrofi)
- "tv": Mehmonxonadagi Televizor va divan oldi
- "pc": Kompyuter stoli oldi
- "cook": Oshxona (muzlatgich, qozon va plita oldi)
- "eat": Oshxona (ovqatlanish stoli)
- "sleep": Yotoqxona (karavotlar)
- "wc": Hojatxona / Vannaxona
- "garage": Garaj (mashina turadigan xona)
- "out": Ko'cha / Tashqari (eshikni ochib uydan tashqariga chiqib ketish!)

Qo'lda ko'tarib yurish mumkin bo'lgan 3D buyum ("item"):
- Agar buyruqda hech narsa olib kelish/ko'tarish kerak bo'lmasa (masalan: "ko'chaga chiq", "garajga bor", "uxla", "oshxonaga bor", "salom", savol-javob): "item": null bo'lsin!
- Agar biror narsa olib kelish yoki tozalash buyurilgan bo'lsa:
  "item": { "type": "tea|water|banana|apple|watermelon|food|cake|broom|item", "emoji": "🍌", "label": "Buyum nomi" }
  ("tea"=choy/kofe, "water"=suv/sharbat/kola/sut, "banana"=banan, "apple"=olma/meva, "watermelon"=tarvuz/qovun, "food"=osh/ovqat/non/taom, "cake"=tort/shirinlik/muzqaymoq, "broom"=supurgi, "item"=boshqa buyum).

"deliverToId":
- Agar Robot ma'lum bir odamning patnisda narsa olib borishi yoki shaxsan yoniga borib gapirishi kerak bo'lsa: o'sha odamning ID raqami (masalan: ${fromId || 'null'}).
- Agar shunchaki biror xonaga borish ("cook", "garage", "sleep", "out" va h.k.) kerak bo'lsa: "deliverToId": null.

"wakeMemberId":
- Agar foydalanuvchi biror a'zoni uyg'otishni buyurgan bo'lsa (masalan: "Dilraboni uyg'ot"): o'sha a'zoning ID raqami.

MUHIM QOIDALAR:
1. "ko'chaga chiq", "tashqariga chiq", "uydan chiq", "ket" deyilsa -> 1 ta qadam: status: "out", item: null, deliverToId: null, reply: "🤖 Xo'p bo'ladi! Eshikni ochib ko'chaga chiqyapman! 🚪🚶".
2. "uyga kir", "qaytib kel", "ichkariga kir" deyilsa -> status: "${INDOOR_ROOMS.includes(fromRoom) ? fromRoom : 'home'}", item: null, deliverToId: ${fromId || 'null'}, reply: "🤖 Labbay! Uyga kirib yoningizga kelyapman! 🏠⚡".
3. "garajga bor", "mashinani ko'r" deyilsa -> status: "garage", item: null, deliverToId: null, reply: "🤖 Xo'p bo'ladi! Garajga yo'l oldim! 🚗🔧".
4. Biror narsa "olib kel" deyilsa (masalan: "banan olib kel", "suv olib kel", "choy olib kel", "olma olib kel", "ovqat olib kel", "tort olib kel") ->
   - 1-qadam: o'sha narsa turgan oshxonaga borish (status: "cook", item: null, deliverToId: null, reply: "🤖 Xo'p bo'ladi! Oshxonadan ... olib kelaman!")
   - 2-qadam: qo'lga buyumni olib so'ragan odamning oldiga borish (status: "${INDOOR_ROOMS.includes(fromRoom) ? fromRoom : 'home'}", item: { "type": "banana|tea|water|apple|watermelon|food|cake|item", "emoji": "...", "label": "..." }, deliverToId: ${fromId || 'null'}, reply: "🤖 Mana, siz so'ragan ...ni olib keldim! Marhamat! ✨").
5. Biror odamni "uyg'ot" yoki "chaqir" deyilsa -> status: "sleep", deliverToId: <o'sha odam IDsi>, wakeMemberId: <o'sha odam IDsi>, reply: "🤖 Xo'p bo'ladi! ...ni uyg'otgani yotoqxonaga boryapman! 🏃‍♂️".

Faqat quyidagi JSON formatda javob qaytar:
{
  "steps": [
    {
      "status": "home|tv|pc|cook|eat|sleep|wc|garage|out",
      "reply": "🤖 O'zbek tilida qisqa va aniq javob",
      "item": null,
      "deliverToId": null,
      "wakeMemberId": null
    }
  ]
}`;

  const userPrompt = `Buyruq beruvchi: ${fromName} (id: ${fromId}, hozirgi joyi: "${fromRoom}").
Robotning hozirgi joyi: "${robot.status}".
Uydagi a'zolar:
${membersInfo || 'Hech kim yoq'}

Foydalanuvchi buyrug'i: "${text}"`;

  let plan = await askAiPlan(systemPrompt, userPrompt);

  // Agar internet uzilishi sababli AI javob bermasa, ma'noni buzmaydigan zaxira mantiq
  if (!plan || !Array.isArray(plan.steps) || !plan.steps.length) {
    plan = buildFallbackPlan(fromMember, text, humans, robot);
  }

  // Rejadagi qadamlarni ketma-ket bajaramiz
  const steps = plan.steps.slice(0, 4);
  steps.forEach((step, idx) => {
    const runStep = () => {
      const targetStatus = VALID_STATUSES.has(step.status) ? step.status : robot.status;
      const heldItem = step.item && typeof step.item === 'object' && step.item.label ? step.item : null;
      const delivId = step.deliverToId ? Number(step.deliverToId) : null;

      // Agar Mushuk yoki It haqida gap ketgan bo'lsa
      if (step.callPets) {
        moveAi(store, AI_IDS.CAT, targetStatus);
        moveAi(store, AI_IDS.DOG, targetStatus);
      }

      moveAi(store, AI_IDS.ROBOT, targetStatus, {
        heldItem,
        deliverToId: targetStatus === 'out' ? null : delivId,
      });

      if (step.wakeMemberId) {
        const targetMember = store.get(Number(step.wakeMemberId));
        if (targetMember && targetMember.status === 'sleep') {
          setTimeout(() => {
            store.update(Number(step.wakeMemberId), { status: 'home' });
            store.say(Number(step.wakeMemberId), "🥱 Uyqudan turdim, xayrli kun!", null);
          }, 1500);
        }
      }

      if (step.reply) {
        store.say(AI_IDS.ROBOT, step.reply, null);
      }
    };

    if (idx === 0) {
      runStep();
    } else {
      scheduleRobotStep(runStep, idx * 8500);
    }
  });

  // Oxirgi qadamda patnisda narsa bo'lsa, foydalanuvchi ko'rib rohatlanishi uchun 45 soniyadan so'ng patnisni yig'ishtiradi
  const totalDuration = (steps.length - 1) * 8500 + 45000;
  scheduleRobotStep(() => {
    const rNow = store.get(AI_IDS.ROBOT);
    if (rNow && (rNow.heldItem || rNow.deliverToId)) {
      store.update(AI_IDS.ROBOT, { heldItem: null, deliverToId: null });
    }
  }, totalDuration);

  const replyText = steps
    .map((s) => s.reply)
    .filter(Boolean)
    .join('\n') || `🤖 Xo'p bo'ladi, buyrug'ingizni bajaryapman!`;

  return { reply: replyText, steps };
}

function buildFallbackPlan(fromMember, text, humans, robot) {
  const lower = text.toLowerCase();
  const fromName = fromMember?.name || "Xo'jayin";
  const callerRoom = fromMember && INDOOR_ROOMS.includes(fromMember.status) ? fromMember.status : 'home';
  const callerId = fromMember && INDOOR_ROOMS.includes(fromMember.status) ? fromMember.id : null;

  // Ko'chaga chiqish
  if (lower.includes("ko'cha") || lower.includes('kocha') || lower.includes('tashqari') || lower.includes('uydan chiq')) {
    return {
      steps: [
        {
          status: 'out',
          reply: `🤖 Xo'p bo'ladi, ${fromName}! Eshikni ochib ko'chaga chiqyapman! 🚪🚶`,
          item: null,
          deliverToId: null,
        },
      ],
    };
  }

  // Uyga kirish / qaytib kelish
  if (lower.includes('uyga kir') || lower.includes('ichkariga') || lower.includes('qayt') || lower.includes('kel')) {
    return {
      steps: [
        {
          status: callerRoom,
          reply: `🤖 Labbay, ${fromName}! Uyga kirib yoningizga kelyapman! 🏠⚡`,
          item: null,
          deliverToId: callerId,
        },
      ],
    };
  }

  // Garaj
  if (lower.includes('garaj') || lower.includes('mashina') || lower.includes('avto')) {
    return {
      steps: [
        {
          status: 'garage',
          reply: `🤖 Xo'p bo'ladi, ${fromName}! Garajga borib mashinani ko'zdan kechiryapman! 🚗🔧`,
          item: null,
          deliverToId: null,
        },
      ],
    };
  }

  // Yotoqxona
  if (lower.includes('yotoq') || lower.includes('uxla') || lower.includes('karavot')) {
    return {
      steps: [
        {
          status: 'sleep',
          reply: `🤖 Xo'p bo'ladi! Yotoqxonaga boryapman! 🛏️✨`,
          item: null,
          deliverToId: null,
        },
      ],
    };
  }

  // Hojatxona
  if (lower.includes('hojatxona') || lower.includes('vanna') || lower.includes('tualet')) {
    return {
      steps: [
        {
          status: 'wc',
          reply: `🤖 Hojatxonaga borib tekshiryapman! 🧼✨`,
          item: null,
          deliverToId: null,
        },
      ],
    };
  }

  // Kompyuter
  if (lower.includes('kompyuter') || lower.includes('pc') || lower.includes('wifi')) {
    return {
      steps: [
        {
          status: 'pc',
          reply: `🤖 Kompyuter stoliga borib tizimni tekshiryapman! 💻⚡`,
          item: null,
          deliverToId: null,
        },
      ],
    };
  }

  // Televizor
  if (lower.includes('tv') || lower.includes('televizor') || lower.includes('divan')) {
    return {
      steps: [
        {
          status: 'tv',
          reply: `🤖 Televizor va divan oldiga boryapman! 📺✨`,
          item: null,
          deliverToId: null,
        },
      ],
    };
  }

  // Oshxonaga borish
  if (lower.includes('oshxona') && !lower.includes('olib')) {
    return {
      steps: [
        {
          status: 'cook',
          reply: `🤖 Xo'p bo'ladi, oshxonaga ketyapman! 🍳`,
          item: null,
          deliverToId: null,
        },
      ],
    };
  }

  // Biror narsa olib kelish (choy, suv, banan, olma, ovqat, tort, supurgi va h.k.)
  if (lower.includes('olib kel') || lower.includes('keltir') || lower.includes('ber')) {
    let item = { type: 'water', emoji: '💧', label: 'Suv' };
    if (lower.includes('choy') || lower.includes('qahva') || lower.includes('kofe')) {
      item = { type: 'tea', emoji: '🍵', label: 'Issiq choy' };
    } else if (lower.includes('banan')) {
      item = { type: 'banana', emoji: '🍌', label: 'Banan' };
    } else if (lower.includes('olma') || lower.includes('meva')) {
      item = { type: 'apple', emoji: '🍎', label: 'Olma' };
    } else if (lower.includes('tarvuz') || lower.includes('qovun')) {
      item = { type: 'watermelon', emoji: '🍉', label: 'Tarvuz' };
    } else if (lower.includes('osh') || lower.includes('ovqat') || lower.includes('non')) {
      item = { type: 'food', emoji: '🍲', label: 'Issiq ovqat' };
    } else if (lower.includes('tort') || lower.includes('shirinlik')) {
      item = { type: 'cake', emoji: '🍰', label: 'Shirinlik' };
    } else if (lower.includes('supurgi')) {
      item = { type: 'broom', emoji: '🧹', label: 'Supurgi' };
    }

    return {
      steps: [
        {
          status: 'cook',
          reply: `🤖 Xo'p bo'ladi, ${fromName}! Oshxonadan ${item.label.toLowerCase()} olib kelaman! 🍳`,
          item: null,
          deliverToId: null,
        },
        {
          status: callerRoom,
          reply: `🤖 Mana, siz so'ragan ${item.label.toLowerCase()}ni olib keldim! Marhamat! ✨`,
          item,
          deliverToId: callerId,
        },
      ],
    };
  }

  // Odamni uyg'otish (masalan: "Dilraboni uyg'ot")
  if (lower.includes('uyg') || lower.includes('turgaz') || lower.includes('chaqir')) {
    const sleeping = humans.find((h) => h.status === 'sleep' || lower.includes(h.name.toLowerCase()));
    if (sleeping) {
      return {
        steps: [
          {
            status: 'sleep',
            reply: `🤖 Xo'p bo'ladi, ${fromName}! ${sleeping.name}ni uyg'otish uchun yotoqxonaga boryapman! 🏃‍♂️`,
            item: null,
            deliverToId: sleeping.id,
            wakeMemberId: sleeping.id,
          },
        ],
      };
    }
  }

  // Umumiy javob (suv yoki narsa olib kelmasdan, foydalanuvchining yoniga borib bajaradi)
  return {
    steps: [
      {
        status: callerRoom,
        reply: `🤖 Xo'p bo'ladi, ${fromName}! "${text.slice(0, 45)}" buyrug'ingizni bajaryapman! ✅`,
        item: null,
        deliverToId: callerId,
      },
    ],
  };
}

// ==================== 🐱 MUSHUK VA 🐶 KUCHUK BILAN MULOQOT (GAPIRMAYDI, FAQAT HARAKATLANADI) ====================
async function handlePetCommand(fromMember, petId, rawText, store) {
  const pet = store.get(Number(petId));
  if (!pet) return;
  const fromName = fromMember?.name || "Do'stim";
  const text = String(rawText || '').trim();
  const callerRoom = fromMember && INDOOR_ROOMS.includes(fromMember.status) ? fromMember.status : 'home';
  const callerDeliv = fromMember && INDOOR_ROOMS.includes(fromMember.status) ? fromMember.id : null;
  const isCat = pet.job === 'cat';

  const systemPrompt = `Sen 3D Oilaviy Uydagi ${isCat ? '"Mushuk"' : '"It"'}san. Hayvonlar gapirmaydi, faqat harakatlanadi.
Foydalanuvchi (${fromName}) senga buyruq berdi yoki erkalamoqda.
Buyruq ma'nosiga qarab qayerga borishingni ("status": "home|tv|pc|cook|eat|sleep|wc|garage|out") JSON formatda qaytar:
{
  "steps": [
    {
      "status": "home|tv|pc|cook|eat|sleep|wc|garage|out",
      "deliverToId": ${callerDeliv || 'null'}
    }
  ]
}
Agar "ko'chaga chiq" deyilsa status: "out", deliverToId: null bo'lsin.
Agar chaqirilsa yoki erkalansa status: "${callerRoom}", deliverToId: ${callerDeliv || 'null'} bo'lsin.`;

  const plan = await askAiPlan(systemPrompt, `Foydalanuvchi (${fromName}, joyi: "${callerRoom}") yozdi: "${text}"`);
  if (plan && Array.isArray(plan.steps) && plan.steps[0]) {
    const st = plan.steps[0];
    const targetStatus = VALID_STATUSES.has(st.status) ? st.status : callerRoom;
    const deliv = targetStatus === 'out' ? null : (st.deliverToId ? Number(st.deliverToId) : null);
    moveAi(store, pet.id, targetStatus, { deliverToId: deliv });
    if (deliv) setTimeout(() => moveAi(store, pet.id, targetStatus, { deliverToId: null }), 7000);
    return;
  }

  const lower = text.toLowerCase();
  if (lower.includes("ko'cha") || lower.includes('kocha') || lower.includes('tashqari')) {
    moveAi(store, pet.id, 'out', { deliverToId: null });
    return;
  }
  moveAi(store, pet.id, callerRoom, { deliverToId: callerDeliv });
  setTimeout(() => moveAi(store, pet.id, callerRoom, { deliverToId: null }), 7000);
}

// ==================== MUSTAQIL AI HARAKAT SIKLI (VAZIYATGA QARAB YURISH) ====================
function startAiLoop(store) {
  let stepIndex = 0;

  store.on('moved', ({ id, name, event }) => {
    if (event === 'arrived') {
      setTimeout(() => {
        // Uyga yangi a'zo kelganda it uning oldiga yugurib boradi (lekin gapirmaydi)
        moveAi(store, AI_IDS.DOG, 'home', { deliverToId: id });
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

  setInterval(() => {
    try {
      const all = store.all();
      const humans = all.filter((m) => !m.isAi);
      const indoorHumans = humans.filter((m) => INDOOR_ROOMS.includes(m.status));
      const turn = stepIndex % 3;
      stepIndex++;

      if (turn === 0) {
        if (Date.now() < robotBusyUntil) return;
        const robot = store.get(AI_IDS.ROBOT);
        if (!robot) return;

        // Agar robot ko'chaga chiqarib yuborilgan bo'lsa, o'z holicha qaytib kirmaydi
        if (robot.status === 'out') return;

        const cookingHuman = indoorHumans.find((m) => m.status === 'cook');
        const eatingHuman = indoorHumans.find((m) => m.status === 'eat');
        const pcHuman = indoorHumans.find((m) => m.status === 'pc');
        const tvHuman = indoorHumans.find((m) => m.status === 'tv');
        const allSleeping = indoorHumans.length > 0 && indoorHumans.every((m) => m.status === 'sleep');

        let nextStatus = robot.status;
        let msg = '';
        let heldItem = null;
        let deliverToId = null;

        if (cookingHuman && Math.random() < 0.45) {
          nextStatus = 'cook';
          deliverToId = cookingHuman.id;
          msg = `🤖 ${cookingHuman.name}, ovqat pishirishga yordam beraman! 🍳✨`;
        } else if (eatingHuman && Math.random() < 0.45) {
          nextStatus = 'eat';
          heldItem = { type: 'tea', emoji: '🍵', label: 'Issiq choy' };
          deliverToId = eatingHuman.id;
          msg = `🤖 Yoqimli ishtaha, ${eatingHuman.name}! Issiq choy olib keldim! ☕🍽️`;
        } else if (pcHuman && Math.random() < 0.4) {
          nextStatus = 'pc';
          heldItem = { type: 'tea', emoji: '☕', label: 'Issiq qahva' };
          deliverToId = pcHuman.id;
          msg = `🤖 ${pcHuman.name}, kompyuterda charchamang! Issiq qahva olib keldim! 💻☕`;
        } else if (tvHuman && Math.random() < 0.4) {
          nextStatus = 'tv';
          heldItem = { type: 'apple', emoji: '🍎', label: 'Mevalar' };
          deliverToId = tvHuman.id;
          msg = `🤖 ${tvHuman.name}, televizor ko'rishga meva olib keldim! 📺🍎`;
        } else {
          // Bo'sh paytda robot o'zicha soxta gaplar va harakatlar bilan buyruqlarni buzmaydi
          return;
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

      if (turn === 1) {
        const cat = store.get(AI_IDS.CAT);
        if (!cat || cat.status === 'out') return;

        const catRooms = ['home', 'tv', 'eat', 'sleep'];
        let nextStatus = pick(catRooms.filter((r) => r !== cat.status));
        let deliverToId = null;

        if (indoorHumans.length > 0 && Math.random() < 0.45) {
          const person = pick(indoorHumans);
          nextStatus = person.status;
          deliverToId = person.id;
        }

        // Mushuk gapirmaydi — faqat xonalar bo'ylab yuradi yoki odam yoniga keladi
        moveAi(store, AI_IDS.CAT, nextStatus, { deliverToId });
        if (deliverToId) {
          setTimeout(() => store.update(AI_IDS.CAT, { deliverToId: null }), 6000);
        }
        return;
      }

      if (turn === 2) {
        const dog = store.get(AI_IDS.DOG);
        if (!dog || dog.status === 'out') return;

        const dogRooms = ['home', 'eat', 'cook', 'tv', 'sleep', 'garage'];
        let nextStatus = pick(dogRooms.filter((r) => r !== dog.status));
        let deliverToId = null;

        if (indoorHumans.length > 0 && Math.random() < 0.45) {
          const person = pick(indoorHumans);
          nextStatus = person.status;
          deliverToId = person.id;
        }

        // It gapirmaydi — faqat xonalarni aylanadi yoki odam yoniga keladi
        moveAi(store, AI_IDS.DOG, nextStatus, { deliverToId });
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

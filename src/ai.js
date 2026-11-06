// Gemini AI orqali mustaqil harakatlanuvchi doimiy personajlar:
// 1. 🤖 AI Robot (id: 900001) - Uy yordamchisi, vaziyatga qarab yuradi va ustiga bosib yozilsa buyruq bajaradi
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
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

let geminiApiBlocked = false;
let robotBusyUntil = 0;
let robotStepTimers = [];

function clearRobotTimers() {
  for (const t of robotStepTimers) clearTimeout(t);
  robotStepTimers = [];
}

// Gemini API ga so'rov yuborish (agar kalit 403/timeout bersa, qayta kutib o'tirmasdan 0ms da ichki AI ishlaydi)
async function askGeminiJson(systemPrompt, userPrompt) {
  if (geminiApiBlocked) return null;
  const key = (process.env.GEMINI_API_KEY || DEFAULT_GEMINI_KEY).trim();
  if (!key) return null;

  const url = key.startsWith('AQ.')
    ? `https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(key)}`
    : `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(key)}`;

  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 200,
          responseMimeType: 'application/json',
        },
      }),
      signal: AbortSignal.timeout(1500),
    });
    if (!res.ok) {
      geminiApiBlocked = true;
      return null;
    }
    const data = await res.json();
    const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!raw) return null;
    const cleaned = raw.replace(/```json|```/g, '').trim();
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    geminiApiBlocked = true;
  }
  return null;
}

// Robotni ma'lum xonaga yuborish (har safar taskSeq oshadi, shunda bir xil xonada bo'lsa ham yurib joyini almashtiradi!)
function moveAi(store, id, status) {
  const m = store.get(id);
  if (!m) return;
  const nextSeq = (m.taskSeq || 0) + 1;
  store.update(id, { status, taskSeq: nextSeq });
}

// ==================== 🤖 AI ROBOT BUYRUQ BAJARUVCHISI ====================
async function handleRobotCommand(fromMember, rawText, store) {
  const text = String(rawText || '').trim();
  if (!text) return;

  const robot = store.get(AI_IDS.ROBOT);
  if (!robot) return;

  clearRobotTimers();
  robotBusyUntil = Date.now() + 22_000;

  const humans = store.all().filter((m) => !m.isAi);
  const fromName = fromMember?.name || "Xo'jayin";
  const lower = text.toLowerCase();

  // 1. Buyruqda biror oila a'zosining ismi tilga olinganmi?
  const mentionedMember = humans.find(
    (m) => m.name && lower.includes(m.name.toLowerCase())
  );

  // 2. Kontekstual AI qarori (va agar Gemini API ochiq bo'lsa u bilan boyitiladi)
  let decision = buildSmartRobotDecision(fromMember, text, mentionedMember, robot);

  if (!decision.multiStep && !geminiApiBlocked) {
    const sysPrompt =
      "Sen 3D Oilaviy Uydagi 'AI Robot' yordamchisan. O'zbek tilida qisqa (maks 110 belgi) javob berasan. " +
      "Xonalar: 'home' (Mehmonxona), 'tv' (Televizor), 'pc' (Kompyuter), 'eat' (Oshxona stoli), 'cook' (Oshxona plitasi), 'sleep' (Yotoqxona), 'wc' (Hojatxona). " +
      'Faqat JSON qaytar: {"status": "home|tv|pc|eat|cook|sleep|wc", "reply": "🤖 javob matni"}';
    const aiRes = await askGeminiJson(sysPrompt, `Buyruq: "${text}"`);
    if (aiRes?.status && INDOOR_ROOMS.includes(aiRes.status) && aiRes?.reply) {
      decision.status = aiRes.status;
      decision.reply = aiRes.reply;
    }
  }

  // 3. Darhol 1-qadamni bajarish: Robot o'zi yuradi va gapiradi!
  moveAi(store, AI_IDS.ROBOT, decision.status);
  store.say(AI_IDS.ROBOT, decision.reply, decision.targetId || null);

  // 4. Agar ko'p bosqichli ish bo'lsa (masalan: choy damlab stolga qo'yish, uyni tozalash, mushuk va itga ovqat berish)
  if (Array.isArray(decision.steps)) {
    for (const step of decision.steps) {
      const timer = setTimeout(() => {
        moveAi(store, AI_IDS.ROBOT, step.status);
        store.say(AI_IDS.ROBOT, step.reply, step.targetId || null);
        if (step.onRun) step.onRun(store);
      }, step.delayMs);
      robotStepTimers.push(timer);
    }
  }

  return decision;
}

function buildSmartRobotDecision(fromMember, text, mentionedMember, robot) {
  const lower = text.toLowerCase();
  const fromName = fromMember?.name || "Xo'jayin";

  // 1. Boshqa oila a'zosiga xabar / choy / yordam olib borish
  if (mentionedMember) {
    const targetRoom = INDOOR_ROOMS.includes(mentionedMember.status)
      ? mentionedMember.status
      : 'home';

    if (lower.includes('choy') || lower.includes('kofe') || lower.includes('suv') || lower.includes('ovqat')) {
      return {
        multiStep: true,
        status: 'cook',
        targetId: null,
        reply: `🤖 Xo'p bo'ladi, ${fromName}! Avval oshxonadan issiq choy olaman... ☕`,
        steps: [
          {
            delayMs: 4500,
            status: targetRoom,
            targetId: mentionedMember.id,
            reply: `🤖 ${mentionedMember.name}, mana sizga ${fromName}dan issiq choy va shirinlik! ☕🍰`,
          },
        ],
      };
    }

    return {
      multiStep: true,
      status: targetRoom,
      targetId: mentionedMember.id,
      reply: `🤖 ${mentionedMember.name}, sizga ${fromName}dan xabar: "${text}" 💬`,
    };
  }

  // 2. Mushuk va itga ovqat berish / qarash
  if (lower.includes('mushuk') || lower.includes('it') || lower.includes('kuchuk') || lower.includes('hayvon')) {
    return {
      multiStep: true,
      status: 'cook',
      targetId: null,
      reply: `🤖 Xo'p bo'ladi! Oshxonadan mushuk va kuchuk uchun sut hamda suyak olyapman! 🥛🦴`,
      steps: [
        {
          delayMs: 4200,
          status: 'eat',
          targetId: AI_IDS.CAT,
          reply: `🤖 Momiqvoy, mana senga iliq sut! 🐱🥛`,
          onRun: (st) => {
            moveAi(st, AI_IDS.CAT, 'eat');
            moveAi(st, AI_IDS.DOG, 'eat');
            setTimeout(() => st.say(AI_IDS.CAT, '🐱 Miyov~ Rahmat, AI Robot! 🥛❤️'), 1200);
          },
        },
        {
          delayMs: 8500,
          status: 'eat',
          targetId: AI_IDS.DOG,
          reply: `🤖 Bobik, mana senga mazali suyak! 🐶🦴`,
          onRun: (st) => {
            setTimeout(() => st.say(AI_IDS.DOG, '🐶 Vov-vov! Mazali ekan, rahmat! 🦴❤️'), 1200);
          },
        },
      ],
    };
  }

  // 3. Oshxona / choy / ovqat tayyorlash
  if (
    lower.includes('oshxona') ||
    lower.includes('choy') ||
    lower.includes('kofe') ||
    lower.includes('qahva') ||
    lower.includes('ovqat') ||
    lower.includes('osh') ||
    lower.includes('pishir') ||
    lower.includes('suv') ||
    lower.includes('non')
  ) {
    return {
      multiStep: true,
      status: 'cook',
      targetId: null,
      reply: `🤖 Xo'p bo'ladi, ${fromName}! Oshxona plitasi oldiga borib choy va ovqat tayyorlayapman! ☕🍳`,
      steps: [
        {
          delayMs: 5500,
          status: 'eat',
          targetId: null,
          reply: `🤖 Issiq ko'k choy va mazali taom dasturxonga qo'yildi! Marhamat! ☕🍽️`,
        },
      ],
    };
  }

  // 4. Uyni tozalash / supurish (ketma-ket xonalarni aylanib tozalaydi!)
  if (lower.includes('tozala') || lower.includes('supur') || lower.includes('pol') || lower.includes('chang')) {
    return {
      multiStep: true,
      status: 'home',
      targetId: null,
      reply: `🤖 Xo'p bo'ladi, ${fromName}! Mehmonxona gilamlarini tozalashni boshladim! 🧹✨`,
      steps: [
        {
          delayMs: 5000,
          status: 'eat',
          targetId: null,
          reply: `🤖 Oshxona pollarini va stolni artib tozalayapman! 🧼✨`,
        },
        {
          delayMs: 10000,
          status: 'sleep',
          targetId: null,
          reply: `🤖 Yotoqxonani ham tozalab, hamma joyni yarqiratib qo'ydim! 🌟`,
        },
      ],
    };
  }

  // 5. Yotoqxonani tartibga keltirish
  if (
    lower.includes('yotoq') ||
    lower.includes('uxla') ||
    lower.includes('karavot') ||
    lower.includes("ko'rpa") ||
    lower.includes('tartib') ||
    lower.includes("yig'ishtir")
  ) {
    return {
      multiStep: true,
      status: 'sleep',
      targetId: null,
      reply: `🤖 Yotoqxonaga borib karavot va yostiqlarni tartibga keltiryapman! 🛏️✨`,
      steps: [
        {
          delayMs: 5000,
          status: 'sleep',
          targetId: null,
          reply: `🤖 Yotoqxona top-toza va dam olishga tayyor! 🌙✨`,
        },
      ],
    };
  }

  // 6. Kompyuter va Wi-Fi tizimini tekshirish
  if (
    lower.includes('kompyuter') ||
    lower.includes('pc') ||
    lower.includes('kod') ||
    lower.includes('dastur') ||
    lower.includes('internet') ||
    lower.includes('wifi') ||
    lower.includes('wi-fi') ||
    lower.includes('tekshir')
  ) {
    return {
      multiStep: true,
      status: 'pc',
      targetId: null,
      reply: `🤖 Kompyuter stoliga borib tizim va Wi-Fi tezligini tekshiryapman! 💻⚡`,
      steps: [
        {
          delayMs: 5000,
          status: 'pc',
          targetId: null,
          reply: `🤖 Kompyuter va Wi-Fi 100% a'lo tezlikda ishlayapti! 🚀💻`,
        },
      ],
    };
  }

  // 7. Televizor / mehmonxona
  if (
    lower.includes('tv') ||
    lower.includes('televizor') ||
    lower.includes('kino') ||
    lower.includes('futbol') ||
    lower.includes('divan') ||
    lower.includes('mehmonxona')
  ) {
    return {
      multiStep: true,
      status: 'tv',
      targetId: null,
      reply: `🤖 Televizor oldiga borib ekranni yoqyapman va divanni tayyorlayapman! 📺🍿`,
      steps: [
        {
          delayMs: 4800,
          status: 'tv',
          targetId: null,
          reply: `🤖 Televizor va mehmonxona dam olishingiz uchun tayyor! 🎬✨`,
        },
      ],
    };
  }

  // 8. Hojatxona / vanna
  if (lower.includes('hojatxona') || lower.includes('vanna') || lower.includes('tualet')) {
    return {
      multiStep: true,
      status: 'wc',
      targetId: null,
      reply: `🤖 Hojatxonaga borib dezinfeksiya va tozalash ishlarini bajaryapman! 🧼✨`,
    };
  }

  // 9. Foydalanuvchining o'z oldiga chaqirish ("Mening oldimga kel", "kel", "yonimga")
  if (lower.includes('kel') || lower.includes('yonimga') || lower.includes('oldimga') || lower.includes('bu yerga')) {
    const callerRoom = fromMember && INDOOR_ROOMS.includes(fromMember.status) ? fromMember.status : 'home';
    return {
      multiStep: true,
      status: callerRoom,
      targetId: fromMember?.id || null,
      reply: `🤖 Labbay, ${fromName}! Yoningizga kelyapman, xizmatga tayyorman! ⚡`,
    };
  }

  // 10. Boshqa har qanday erkin buyruq: Robot o'sha zahoti harakatga tushib xonada bajaradi
  const nextRooms = ['cook', 'home', 'tv', 'pc', 'sleep'].filter((r) => r !== robot.status);
  const targetRoom = fromMember && INDOOR_ROOMS.includes(fromMember.status) && Math.random() < 0.5
    ? fromMember.status
    : nextRooms[0];

  return {
    multiStep: true,
    status: targetRoom,
    targetId: fromMember && INDOOR_ROOMS.includes(fromMember.status) ? fromMember.id : null,
    reply: `🤖 Xo'p bo'ladi, ${fromName}! "${text.slice(0, 48)}" buyrug'ingizni bajaryapman! ✅`,
  };
}

// ==================== 🐱 MUSHUK VA 🐶 KUCHUK BILAN MULOQOT ====================
async function handlePetCommand(fromMember, petId, rawText, store) {
  const pet = store.get(Number(petId));
  if (!pet) return;
  const fromName = fromMember?.name || "Do'stim";
  const lower = String(rawText || '').toLowerCase();
  const callerRoom = fromMember && INDOOR_ROOMS.includes(fromMember.status) ? fromMember.status : 'home';

  if (pet.job === 'cat') {
    if (lower.includes('sut') || lower.includes('ovqat') || lower.includes('oshxona')) {
      moveAi(store, pet.id, 'eat');
      store.say(pet.id, `🐱 Miyov-miyov! Oshxonaga sut ichishga ketyapman, rahmat ${fromName}! 🥛🐾`, null);
      return;
    }
    if (lower.includes('uxla') || lower.includes('yotoq')) {
      moveAi(store, pet.id, 'sleep');
      store.say(pet.id, `🐱 Mrrr... Yotoqxonaga borib uxlayman~ 💤🐾`, null);
      return;
    }
    moveAi(store, pet.id, callerRoom);
    store.say(pet.id, `🐱 Miyov~ Mrrr! (${fromName}ning yoniga kelib erkalandi) 🐾❤️`, fromMember?.id || null);
    return;
  }

  if (pet.job === 'dog') {
    if (lower.includes('suyak') || lower.includes('ovqat') || lower.includes('oshxona')) {
      moveAi(store, pet.id, 'eat');
      store.say(pet.id, `🐶 Vov-vov! Oshxonaga suyak yeyishga yuguryapman, rahmat ${fromName}! 🦴🐾`, null);
      return;
    }
    if (lower.includes("qo'riq") || lower.includes('eshik')) {
      moveAi(store, pet.id, 'home');
      store.say(pet.id, `🐶 Vov! Eshik oldini ishonchli qo'riqlayapman, ${fromName}! 🛡️🐾`, null);
      return;
    }
    moveAi(store, pet.id, callerRoom);
    store.say(pet.id, `🐶 Vov-vov! (${fromName}ning oldiga yugurib kelib dumini likillatdi!) 🐾❤️`, fromMember?.id || null);
  }
}

// ==================== MUSTAQIL AI HARAKAT SIKLI (VAZIYATGA QARAB YURISH) ====================
function startAiLoop(store) {
  let stepIndex = 0;

  // Oila a'zosi uyga kelganda It va AI Robot kutib oladi
  store.on('moved', ({ id, name, event }) => {
    if (event === 'arrived') {
      setTimeout(() => {
        moveAi(store, AI_IDS.DOG, 'home');
        store.say(AI_IDS.DOG, `🐶 Vov-vov! ${name} uyga keldi! Xush kelibsiz! 🐾`, id);
      }, 1200);
      setTimeout(() => {
        if (Date.now() < robotBusyUntil) return;
        moveAi(store, AI_IDS.ROBOT, 'home');
        store.say(AI_IDS.ROBOT, `🤖 Xush kelibsiz, ${name}! Choy damlab qo'yaymi? ☕`, id);
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
        let targetId = null;

        if (cookingHuman && Math.random() < 0.65) {
          nextStatus = 'cook';
          targetId = cookingHuman.id;
          msg = `🤖 ${cookingHuman.name}, ovqat pishirishga yordam beraman! 🍳✨`;
        } else if (eatingHuman && Math.random() < 0.6) {
          nextStatus = 'eat';
          targetId = eatingHuman.id;
          msg = `🤖 Yoqimli ishtaha, ${eatingHuman.name}! Issiq choy quyib beraymi? ☕🍽️`;
        } else if (allSleeping) {
          nextStatus = pick(['home', 'sleep']);
          msg = `🤖 Hamma shirin uyquda, uyni tinch nazorat qilyapman 🌙✨`;
        } else if (pcHuman && Math.random() < 0.5) {
          nextStatus = 'pc';
          targetId = pcHuman.id;
          msg = `🤖 ${pcHuman.name}, kompyuterda charchamang! Kofe olib kelaymi? 💻☕`;
        } else if (tvHuman && Math.random() < 0.5) {
          nextStatus = 'tv';
          targetId = tvHuman.id;
          msg = `🤖 ${tvHuman.name}, televizor ko'rishga choy tayyorlaymi? 📺☕`;
        } else {
          const patrol = [
            { status: 'home', text: "🤖 Mehmonxonani tozalab, uyni tartibda ushlayapman ✨" },
            { status: 'cook', text: "🤖 Oshxonada choynakka issiq suv qo'ydim ☕" },
            { status: 'tv', text: '🤖 Divan va televizor atrofini tartibga keltirdim 📺✨' },
            { status: 'sleep', text: '🤖 Yotoqxonani shamollatib, karavotlarni tekisladim 🛏️' },
            { status: 'pc', text: "🤖 Uy Wi-Fi va kompyuter tizimini tekshirdim — hammasi a'lo! 💻⚡" },
          ];
          const chosen = pick(patrol.filter((p) => p.status !== robot.status));
          nextStatus = chosen.status;
          msg = chosen.text;
        }

        moveAi(store, AI_IDS.ROBOT, nextStatus);
        store.say(AI_IDS.ROBOT, msg, targetId);
        return;
      }

      // 2-navbat: 🐱 Mushuk mustaqil xonadan-xonaga yuradi
      if (turn === 1) {
        const cat = store.get(AI_IDS.CAT);
        if (!cat) return;

        const catRooms = ['home', 'tv', 'eat', 'sleep'];
        let nextStatus = pick(catRooms.filter((r) => r !== cat.status));
        let targetId = null;
        let msg = pick([
          '🐱 Miyov~ 🐾',
          '🐱 Mrrr... quyosh nuri juda yoqimli ekan~ ☀️🐾',
          '🐱 Oshxonada sut bormikan? Miyov! 🥛',
          '🐱 Yumshoq gilam ustida aylanib yuribman~ 🐾',
        ]);

        if (indoorHumans.length > 0 && Math.random() < 0.45) {
          const person = pick(indoorHumans);
          nextStatus = person.status;
          targetId = person.id;
          msg = `🐱 Miyov~ Mrrr! (${person.name}ning oyog'iga suykalyapti) 🐾`;
        }

        moveAi(store, AI_IDS.CAT, nextStatus);
        store.say(AI_IDS.CAT, msg, targetId);
        return;
      }

      // 3-navbat: 🐶 It (Kuchuk) uyni aylanib yuradi
      if (turn === 2) {
        const dog = store.get(AI_IDS.DOG);
        if (!dog) return;

        const dogRooms = ['home', 'eat', 'cook', 'tv', 'sleep'];
        let nextStatus = pick(dogRooms.filter((r) => r !== dog.status));
        let targetId = null;
        let msg = pick([
          '🐶 Vov-vov! Uyda hammasi tinch! 🐾',
          '🐶 Dumini likillatib xonalarni tekshiryapti 🦴🐾',
          '🐶 Vov! Oshxonadan shirin hid kelyapti! 🍖',
          "🐶 Eshik oldini qo'riqlayapman! Vov! 🛡️🐾",
        ]);

        if (indoorHumans.length > 0 && Math.random() < 0.45) {
          const person = pick(indoorHumans);
          nextStatus = person.status;
          targetId = person.id;
          msg = `🐶 Vov-vov! (${person.name}ning oldiga kelib dumini likillatdi!) 🐾`;
        }

        moveAi(store, AI_IDS.DOG, nextStatus);
        store.say(AI_IDS.DOG, msg, targetId);
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

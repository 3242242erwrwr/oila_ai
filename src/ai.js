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
  },
];

const INDOOR_ROOMS = ['home', 'tv', 'pc', 'eat', 'cook', 'sleep'];

const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];

// Gemini API ga so'rov yuborish (Vertex AI / Generative Language API + tezkor fallback)
async function askGeminiJson(systemPrompt, userPrompt) {
  const key = (process.env.GEMINI_API_KEY || DEFAULT_GEMINI_KEY).trim();
  if (!key) return null;

  const endpoints = key.startsWith('AQ.')
    ? [
        `https://aiplatform.googleapis.com/v1/publishers/google/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(key)}`,
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(key)}`,
      ]
    : [
        `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${encodeURIComponent(key)}`,
      ];

  for (const url of endpoints) {
    try {
      const res = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [
            {
              role: 'user',
              parts: [{ text: `${systemPrompt}\n\n${userPrompt}` }],
            },
          ],
          generationConfig: {
            temperature: 0.7,
            maxOutputTokens: 220,
            responseMimeType: 'application/json',
          },
        }),
        signal: AbortSignal.timeout(3000),
      });
      if (!res.ok) continue;
      const data = await res.json();
      const raw = data?.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!raw) continue;
      const cleaned = raw.replace(/```json|```/g, '').trim();
      const parsed = JSON.parse(cleaned);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {
      // Keyingi endpoint yoki kontekstual AI miyaga o'tadi
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

  const humans = store.all().filter((m) => !m.isAi);
  const indoorHumans = humans.filter((m) => INDOOR_ROOMS.includes(m.status));
  const fromName = fromMember?.name || "Do'stim";
  const lower = text.toLowerCase();

  // 1. Buyruqda biror oila a'zosining ismi tilga olinganmi?
  const mentionedMember = humans.find(
    (m) => m.name && lower.includes(m.name.toLowerCase())
  );

  // 2. Avval Gemini AI dan so'rab ko'ramiz
  const sysPrompt =
    "Sen 3D Oilaviy Uydagi aqlli 'AI Robot' yordamchisan. O'zbek tilida qisqa (maksimum 120 belgi), samimiy va aniq javob berasan. " +
    "Xonalar: 'home' (Mehmonxona), 'tv' (Televizor oldi), 'pc' (Kompyuter stoli), 'eat' (Oshxona stoli), 'cook' (Oshxona plitasi), 'sleep' (Yotoqxona), 'wc' (Hojatxona). " +
    'Faqat JSON qaytar: {"status": "home|tv|pc|eat|cook|sleep|wc", "reply": "🤖 javob matni", "targetId": null yoki odam ID raqami}';

  const membersDesc = humans
    .map((m) => `${m.name} (id:${m.id}, holati:${m.status})`)
    .join(', ');
  const usrPrompt = `Buyruq beruvchi: ${fromName} (id:${fromMember?.id || 0}, holati:${fromMember?.status || 'home'}).\nUydagi a'zolar: ${membersDesc || 'yoq'}.\nBuyruq: "${text}"`;

  let decision = await askGeminiJson(sysPrompt, usrPrompt);

  // 3. Agar API kalitda cheklov bo'lsa yoki javob kelmasa — aqlli O'zbekcha AI tahlilchi ishga tushadi
  if (!decision || !decision.reply) {
    decision = buildSmartRobotDecision(fromMember, text, mentionedMember, indoorHumans, robot);
  }

  const nextStatus = INDOOR_ROOMS.includes(decision.status) || decision.status === 'wc'
    ? decision.status
    : robot.status;

  let targetId = decision.targetId ? Number(decision.targetId) : null;
  if (!targetId && mentionedMember) targetId = mentionedMember.id;
  if (!targetId && fromMember && INDOOR_ROOMS.includes(fromMember.status)) {
    // Agar robot xuddi buyruq beruvchining xonasiga kelsa yoki savolga javob bersa, uning oldiga borib aytadi
    if (nextStatus === fromMember.status || lower.includes('kel') || lower.includes('salom') || lower.includes('qalay')) {
      targetId = fromMember.id;
    }
  }

  // Robotning xonasini yangilaymiz
  if (nextStatus !== robot.status) {
    store.update(AI_IDS.ROBOT, { status: nextStatus });
  }

  // Robot javob beradi va kerakli odamning yoniga yurib boradi
  setTimeout(() => {
    store.say(AI_IDS.ROBOT, decision.reply, targetId);
  }, 250);

  return decision;
}

function buildSmartRobotDecision(fromMember, text, mentionedMember, indoorHumans, robot) {
  const lower = text.toLowerCase();
  const fromName = fromMember?.name || "Xo'jayin";

  // Agar boshqa a'zoga nimadir yetkazish / chaqirish buyurilgan bo'lsa
  if (mentionedMember) {
    const targetRoom = INDOOR_ROOMS.includes(mentionedMember.status)
      ? mentionedMember.status
      : 'home';

    if (lower.includes('choy') || lower.includes('kofe') || lower.includes('suv') || lower.includes('ovqat')) {
      return {
        status: targetRoom,
        targetId: mentionedMember.id,
        reply: `🤖 Xo'p bo'ladi, ${fromName}! ${mentionedMember.name}ga issiq choy va shirinlik olib boryapman! ☕🍰`,
      };
    }
    if (lower.includes('chaqir') || lower.includes('ayt') || lower.includes('de') || lower.includes('salom')) {
      return {
        status: targetRoom,
        targetId: mentionedMember.id,
        reply: `🤖 ${mentionedMember.name}, sizga ${fromName}dan xabar: "${text}" 💬`,
      };
    }
    return {
      status: targetRoom,
      targetId: mentionedMember.id,
      reply: `🤖 Xo'p bo'ladi! ${mentionedMember.name}ning oldiga borib yordam beraman! ✨`,
    };
  }

  // Oshxona / ovqat / choy buyruqlari
  if (
    lower.includes('oshxona') ||
    lower.includes('choy') ||
    lower.includes('kofe') ||
    lower.includes('qahva') ||
    lower.includes('ovqat') ||
    lower.includes('osh') ||
    lower.includes('pishir') ||
    lower.includes('suv')
  ) {
    const isEat = lower.includes('stol') || lower.includes('ich') || lower.includes('ye');
    return {
      status: isEat ? 'eat' : 'cook',
      targetId: null,
      reply: `🤖 Xo'p bo'ladi, ${fromName}! Oshxonaga borib issiq ko'k choy va mazali taom tayyorlayapman! ☕🍳`,
    };
  }

  // Yotoqxona / uxlash / yig'ishtirish
  if (
    lower.includes('yotoq') ||
    lower.includes('uxla') ||
    lower.includes('karavot') ||
    lower.includes("ko'rpa") ||
    lower.includes('dam ol')
  ) {
    return {
      status: 'sleep',
      targetId: null,
      reply: `🤖 Yotoqxonaga borib karavotlarni tartibga keltiryapman! 🛏️✨`,
    };
  }

  // Kompyuter / dasturlash / internet
  if (
    lower.includes('kompyuter') ||
    lower.includes('pc') ||
    lower.includes('kod') ||
    lower.includes('dastur') ||
    lower.includes('internet') ||
    lower.includes('wifi') ||
    lower.includes('ishla')
  ) {
    return {
      status: 'pc',
      targetId: null,
      reply: `🤖 Kompyuter stoliga o'tib tizim va Wi-Fi tezligini tekshiryapman! 💻⚡`,
    };
  }

  // Televizor / kino / divan
  if (
    lower.includes('tv') ||
    lower.includes('televizor') ||
    lower.includes('kino') ||
    lower.includes('futbol') ||
    lower.includes('divan')
  ) {
    return {
      status: 'tv',
      targetId: null,
      reply: `🤖 Divan oldiga borib televizorni sozlayapman! 📺🍿`,
    };
  }

  // Hojatxona / vanna tozalash
  if (lower.includes('hojatxona') || lower.includes('vanna') || lower.includes('tualet')) {
    return {
      status: 'wc',
      targetId: null,
      reply: `🤖 Hojatxonani tozalab, dezinfeksiya qilyapman! 🧼✨`,
    };
  }

  // Tozalash / supurish
  if (lower.includes('tozala') || lower.includes('supur') || lower.includes("yig'ishtir") || lower.includes('pol')) {
    const rooms = ['home', 'eat', 'sleep', 'tv'];
    const nextR = rooms[(rooms.indexOf(robot.status) + 1) % rooms.length];
    return {
      status: nextR,
      targetId: null,
      reply: `🤖 Xo'p bo'ladi, ${fromName}! Uyni tozalab, hamma joyni yarqiratib chiqyapman! 🧹✨`,
    };
  }

  // Mushuk yoki itga qarash
  if (lower.includes('mushuk') || lower.includes('pishiq')) {
    const cat = indoorHumans.find((m) => m.id === AI_IDS.CAT);
    return {
      status: cat?.status || 'tv',
      targetId: AI_IDS.CAT,
      reply: `🤖 Xo'p bo'ladi! Mushukchaning oldiga borib unga sut va ovqat beraman! 🐱🥛`,
    };
  }
  if (lower.includes('it') || lower.includes('kuchuk') || lower.includes('bobik')) {
    return {
      status: 'home',
      targetId: AI_IDS.DOG,
      reply: `🤖 Kuchukchaning oldiga borib unga suyak beraman va erkalayman! 🐶🦴`,
    };
  }

  // Oldiga chaqirish ("kel", "oldimga kel", "bu yerga")
  if (lower.includes('kel') || lower.includes('yonimga') || lower.includes('oldimga') || lower.includes('qara')) {
    const callerRoom = fromMember && INDOOR_ROOMS.includes(fromMember.status) ? fromMember.status : 'home';
    return {
      status: callerRoom,
      targetId: fromMember?.id || null,
      reply: `🤖 Labbay, ${fromName}! Yoningizga yetib keldim, nima xizmat bor? ⚡`,
    };
  }

  // Salomlashish yoki savol
  if (lower.includes('salom') || lower.includes('assalom') || lower.includes('qalay') || lower.includes('kim')) {
    const callerRoom = fromMember && INDOOR_ROOMS.includes(fromMember.status) ? fromMember.status : robot.status;
    return {
      status: callerRoom,
      targetId: fromMember?.id || null,
      reply: `🤖 Assalomu alaykum, ${fromName}! Men oilaviy AI Robotman. Xohlagan ishingizni buyurishingiz mumkin! 😊`,
    };
  }

  // Boshqa har qanday erkin buyruq
  const callerRoom = fromMember && INDOOR_ROOMS.includes(fromMember.status) ? fromMember.status : 'home';
  return {
    status: callerRoom,
    targetId: fromMember?.id || null,
    reply: `🤖 Xo'p bo'ladi, ${fromName}! "${text.slice(0, 45)}" buyrug'ini bajaryapman! ✅`,
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
    store.update(pet.id, { status: callerRoom });
    let reply = `🐱 Miyov~ Mrrr! (${fromName}ning yoniga kelib erkalandi) 🐾❤️`;
    if (lower.includes('sut') || lower.includes('ovqat') || lower.includes('baliq')) {
      store.update(pet.id, { status: 'eat' });
      reply = `🐱 Miyov-miyov! Mazali sut uchun rahmat, ${fromName}! 🥛🐾`;
    } else if (lower.includes('uxla') || lower.includes('yotoq')) {
      store.update(pet.id, { status: 'sleep' });
      reply = `🐱 Mrrr... Yotoqxonaga borib uxlayman~ 💤🐾`;
    }
    setTimeout(() => {
      store.say(pet.id, reply, fromMember?.id || null);
    }, 200);
    return;
  }

  if (pet.job === 'dog') {
    store.update(pet.id, { status: callerRoom });
    let reply = `🐶 Vov-vov! (${fromName}ning oldiga yugurib kelib dumini likillatdi!) 🐾❤️`;
    if (lower.includes('suyak') || lower.includes('ovqat') || lower.includes('go\'sht')) {
      store.update(pet.id, { status: 'eat' });
      reply = `🐶 Vov-vov! Mazali suyak uchun rahmat, ${fromName}! 🦴🐾`;
    } else if (lower.includes("qo'riq") || lower.includes('eshik')) {
      store.update(pet.id, { status: 'home' });
      reply = `🐶 Vov! Uyni ishonchli qo'riqlayapman, ${fromName}! 🛡️🐾`;
    }
    setTimeout(() => {
      store.say(pet.id, reply, fromMember?.id || null);
    }, 200);
  }
}

// ==================== MUSTAQIL AI HARAKAT SIKLI (VAZIYATGA QARAB YURISH) ====================
function startAiLoop(store) {
  let stepIndex = 0;

  // Oila a'zosi uyga kelganda It va AI Robot kutib oladi
  store.on('moved', ({ id, name, event }) => {
    if (event === 'arrived') {
      setTimeout(() => {
        store.update(AI_IDS.DOG, { status: 'home' });
        store.say(AI_IDS.DOG, `🐶 Vov-vov! ${name} uyga keldi! Xush kelibsiz! 🐾`, id);
      }, 1500);
      setTimeout(() => {
        store.update(AI_IDS.ROBOT, { status: 'home' });
        store.say(AI_IDS.ROBOT, `🤖 Xush kelibsiz, ${name}! Choy damlab qo'yaymi? ☕`, id);
      }, 4500);
    }
  });

  // Har 16 soniyada navbat bilan AI Robot, Mushuk va It vaziyatga qarab mustaqil harakat qiladi
  setInterval(async () => {
    try {
      const all = store.all();
      const humans = all.filter((m) => !m.isAi);
      const indoorHumans = humans.filter((m) => INDOOR_ROOMS.includes(m.status));
      const turn = stepIndex % 3;
      stepIndex++;

      // 1-navbat: 🤖 AI Robot vaziyatga qarab yordamchi bo'lib yuradi
      if (turn === 0) {
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
          msg = `🤖 ${cookingHuman.name}, ovqat pishirishga yordam beraman! Masalliqlar tayyor 🍳✨`;
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
          msg = `🤖 ${tvHuman.name}, televizor ko'rishga popkorn tayyorlaymi? 📺🍿`;
        } else {
          // Erkin patrul va uyni tozalash
          const patrol = [
            { status: 'home', text: '🤖 Mehmonxonani tozalab, havo haroratini mo\'tadil ushlayapman ✨' },
            { status: 'cook', text: '🤖 Oshxonada choynakka issiq suv qo\'ydim ☕' },
            { status: 'tv', text: '🤖 Divan va televizor atrofini tartibga keltirdim 📺✨' },
            { status: 'sleep', text: '🤖 Yotoqxonani shamollatib, karavotlarni tekisladim 🛏️' },
            { status: 'pc', text: '🤖 Uy Wi-Fi va kompyuter tizimini tekshirdim — hammasi a\'lo! 💻⚡' },
          ];
          const chosen = pick(patrol.filter((p) => p.status !== robot.status));
          nextStatus = chosen.status;
          msg = chosen.text;
          if (indoorHumans.length > 0 && Math.random() < 0.45) {
            const friend = pick(indoorHumans);
            nextStatus = friend.status;
            targetId = friend.id;
            msg = `🤖 ${friend.name}, biror xizmat bo'lsa ustimga bosib buyruq bering! ✨`;
          }
        }

        if (nextStatus !== robot.status) {
          store.update(AI_IDS.ROBOT, { status: nextStatus });
        }
        setTimeout(() => {
          store.say(AI_IDS.ROBOT, msg, targetId);
        }, 400);
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

        if (indoorHumans.length > 0 && Math.random() < 0.5) {
          const person = pick(indoorHumans);
          nextStatus = person.status;
          targetId = person.id;
          msg = `🐱 Miyov~ Mrrr! (${person.name}ning oyog'iga suykalyapti) 🐾`;
        }

        if (nextStatus !== cat.status) {
          store.update(AI_IDS.CAT, { status: nextStatus });
        }
        setTimeout(() => {
          store.say(AI_IDS.CAT, msg, targetId);
        }, 400);
        return;
      }

      // 3-navbat: 🐶 It (Kuchuk) uyni aylanib yuradi va a'zolardan xabar oladi
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
          '🐶 Eshik oldini qo\'riqlayapman! Vov! 🛡️🐾',
        ]);

        if (indoorHumans.length > 0 && Math.random() < 0.55) {
          const person = pick(indoorHumans);
          nextStatus = person.status;
          targetId = person.id;
          msg = `🐶 Vov-vov! (${person.name}ning oldiga kelib dumini likillatdi!) 🐾`;
        }

        if (nextStatus !== dog.status) {
          store.update(AI_IDS.DOG, { status: nextStatus });
        }
        setTimeout(() => {
          store.say(AI_IDS.DOG, msg, targetId);
        }, 400);
      }
    } catch (err) {
      console.error('AI loop xatosi:', err.message);
    }
  }, 16_000);
}

module.exports = {
  AI_IDS,
  PERMANENT_AI_MEMBERS,
  handleRobotCommand,
  handlePetCommand,
  startAiLoop,
};

// Telegram bot:
// - Barcha funksiyalar va tugmalar ("🎭 Holatni o'zgartirish" va "🏠 3D Uyni ochish") ham "Oila_3d_room" guruhida, ham lichkada ishlaydi!
// - Boshqa (eski) guruhlardan bot avtomatik chiqib ketadi.
const { Bot, Keyboard, InlineKeyboard } = require('grammy');
const store = require('./store');
const { JOBS } = store;

const ALLOWED_GROUP = 'oila_3d_room';

const STATUSES = {
  home:   { label: '🏠 Uydaman', text: 'mehmonxonada', room: 'Mehmonxona' },
  pc:     { label: '💻 Kompyuterda ishlayapman', text: 'kompyuterda ishlayapti', room: 'Mehmonxona (PC)' },
  tv:     { label: "📺 Televizor ko'ryapman", text: "televizor ko'ryapti", room: 'Mehmonxona (TV)' },
  insta:  { label: "📱 Instagram ko'ryapman", text: "Instagram ko'ryapti", room: 'Mehmonxona' },
  eat:    { label: '🍽️ Ovqatlanyapman', text: 'ovqatlanyapti', room: 'Oshxona' },
  cook:   { label: '🍳 Ovqat pishiryapman', text: 'ovqat pishiryapti', room: 'Oshxona' },
  sleep:  { label: '😴 Uxlayapman', text: 'uxlayapti', room: 'Yotoqxona' },
  wc:     { label: '🚽 Hojatxonadaman', text: 'hojatxonada', room: 'Hojatxona' },
  work:   { label: '💼 Ishdaman', text: 'ishda', room: 'Tashqarida' },
  school: { label: "🏫 O'qishdaman", text: "o'qishda", room: 'Tashqarida' },
  out:    { label: '🚶 Tashqaridaman', text: 'tashqarida', room: 'Tashqarida' },
};

const BTN_STATUS = "🎭 Holatni o'zgartirish";
const BTN_ROOM = '🏠 3D Uyni ochish';
const BTN_BACK = '🔙 Orqaga';
const LOCATION_BUTTON = '📍 Joylashuvni yuborish';

// Guruhda ham, lichkada ham chiqadigan asosiy tugmalar
function mainKeyboard() {
  return new Keyboard()
    .text(BTN_STATUS).text(BTN_ROOM)
    .resized()
    .persistent();
}

// "🎭 Holatni o'zgartirish" bosilganda chiqadigan holatlar ro'yxati (guruhda va lichkada)
function statusKeyboard(isPrivate = false) {
  const kb = new Keyboard()
    .text(STATUSES.home.label).text(STATUSES.pc.label).row()
    .text(STATUSES.tv.label).text(STATUSES.insta.label).row()
    .text(STATUSES.eat.label).text(STATUSES.cook.label).row()
    .text(STATUSES.sleep.label).text(STATUSES.wc.label).row()
    .text(STATUSES.work.label).text(STATUSES.school.label).text(STATUSES.out.label).row();
  if (isPrivate) {
    kb.requestLocation(LOCATION_BUTTON).text(BTN_BACK);
  } else {
    kb.text(BTN_ROOM).text(BTN_BACK);
  }
  return kb.resized().persistent();
}

function genderKeyboard() {
  return new Keyboard()
    .text('👨 Erkak').text('👩 Ayol')
    .resized()
    .oneTime();
}

function jobKeyboard() {
  const keys = Object.keys(JOBS);
  const kb = new Keyboard();
  for (let i = 0; i < keys.length; i += 2) {
    kb.text(JOBS[keys[i]].label);
    if (keys[i + 1]) kb.text(JOBS[keys[i + 1]].label);
    kb.row();
  }
  return kb.resized().oneTime();
}

const LIVE_HELP =
  "🔴 *Jonli joylashuvni yoqish* (joylashuvingiz o'zi yangilanib turadi):\n\n" +
  "1. Pastdagi 📎 (skrepka) tugmasini bosing\n" +
  "2. *Joylashuv* (Location) ni tanlang\n" +
  "3. *Jonli joylashuvni ulashish* (Share Live Location) ni bosing\n" +
  "4. Muddatni tanlang: eng yaxshisi *O'zim o'chirmagunimcha*\n\n" +
  "Shundan keyin uyga kelsangiz, personajingiz uyga o'zi kirib keladi 🏠";

function timeAgo(iso) {
  const min = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (min < 1) return 'hozirgina';
  if (min < 60) return `${min} daqiqa oldin`;
  const h = Math.round(min / 60);
  if (h < 24) return `${h} soat oldin`;
  return `${Math.round(h / 24)} kun oldin`;
}

function formatDistance(m) {
  if (m == null) return '';
  return m < 1000 ? `${m} m` : `${(m / 1000).toFixed(1)} km`;
}

function cleanName(text) {
  const name = text.replace(/\s+/g, ' ').trim();
  if (name.length < 2 || name.length > 20) return null;
  if (!/^[\p{L}\p{M}' ʻʼ`-]+$/u.test(name)) return null;
  return name;
}

function isAllowedGroup(chat) {
  const title = (chat.title || '').toLowerCase().replace(/\s+/g, '_');
  const uname = (chat.username || '').toLowerCase();
  return (
    title.includes(ALLOWED_GROUP) ||
    uname.includes(ALLOWED_GROUP) ||
    (title.includes('oila') && title.includes('3d'))
  );
}

let bot = null;
let getPublicUrlFn = () => 'http://localhost:3847';

async function sendRoomLink(ctx) {
  const baseUrl = getPublicUrlFn();
  const uid = ctx.from?.id || '';
  const personalUrl = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}uid=${uid}`;
  const isHttps = baseUrl.startsWith('https://');
  const isPrivate = ctx.chat?.type === 'private';

  if (isHttps) {
    if (isPrivate) {
      const ikb = new InlineKeyboard()
        .webApp('📱 3D Uyni Telegram ichida ochish', personalUrl).row()
        .url("🌐 3D Uyni telefonda / PC'da ochish", personalUrl);
      await ctx.reply(
        "🏠 *Oilaviy 3D Uy tayyor!*\n\n" +
        "Pastdagi tugmani bosib 3D uyni o'z nomingizdan oching.\n" +
        "👆 Xonadagi boshqa personaj ustiga bosib unga xabar yozsangiz, sizning personajingiz uning yoniga borib gapiradi!",
        { parse_mode: 'Markdown', reply_markup: ikb }
      );
    } else {
      // Guruhda birov boshqa odamning ?uid= havolasiga bosib qo'ymasligi uchun:
      // 1) So'ragan odamning o'z lichkasiga shaxsiy havolasini yuboramiz
      const personalIkb = new InlineKeyboard()
        .webApp('📱 3D Uyni Telegram ichida ochish', personalUrl).row()
        .url("🌐 3D Uyni telefonda / PC'da ochish", personalUrl);
      await bot.api.sendMessage(
        uid,
        "🏠 *Sizning shaxsiy 3D Uy havolangiz:*",
        { parse_mode: 'Markdown', reply_markup: personalIkb }
      ).catch(() => {});

      // 2) Guruhga esa har kimni O'Z profilidan kiritadigan bot havolasini chiqaramiz
      const botUsername = bot?.botInfo?.username || 'Temur_Biznes_bot';
      const groupIkb = new InlineKeyboard()
        .url("🏠 3D Uyni o'z nomingizdan ochish", `https://t.me/${botUsername}?start=xona`);
      await ctx.reply(
        "🏠 *Oilaviy 3D Uy*\n\n" +
        "Har kim faqat o'z nomidan yozishi uchun pastdagi tugmani bosing (shaxsiy havola lichkangizga ham yuborildi):",
        { parse_mode: 'Markdown', reply_markup: groupIkb }
      );
    }
  } else {
    await ctx.reply(
      "⏳ *Telefon uchun internet-havola tayyorlanmoqda (5-10 soniya)...*\n" +
      `Kompyuterda ko'rish: ${personalUrl}\n` +
      "Birozdan keyin yana *🏠 3D Uyni ochish* tugmasini bosing!",
      { parse_mode: 'Markdown', reply_markup: mainKeyboard() }
    );
  }
}

async function startBot(token, onStatus, options = {}) {
  if (!token || token.includes('bu_yerga')) {
    throw new Error('BOT_TOKEN topilmadi (.env faylini tekshiring)');
  }
  if (options.getPublicUrl) getPublicUrlFn = options.getPublicUrl;

  bot = new Bot(token);
  const wizard = new Map();
  const awaitingHome = new Set();

  // Guruh tekshiruvi: faqat "Oila_3d_room" guruhida qoladi va uning ID sini eslab qoladi
  bot.use(async (ctx, next) => {
    const type = ctx.chat?.type;
    if (ctx.message?.text) {
      console.log(`[TG] ${type} (${ctx.chat?.title || ctx.from?.first_name}): ${ctx.message.text}`);
    }
    if (type === 'group' || type === 'supergroup') {
      if (!isAllowedGroup(ctx.chat)) {
        console.log(`Boshqa guruhdan chiqilmoqda: ${ctx.chat.title} (${ctx.chat.id})`);
        await ctx.leaveChat().catch(() => {});
        return;
      }
      store.setGroupChatId(ctx.chat.id);
    }
    await next();
  });

  bot.command('chiq', async (ctx) => {
    if (ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup') {
      await ctx.leaveChat().catch(() => {});
    }
  });

  const beginWizard = async (ctx, isEdit) => {
    const existing = store.get(ctx.from.id);
    wizard.set(ctx.from.id, {
      step: 'name',
      isEdit,
      name: existing?.name || '',
      gender: existing?.gender || 'male',
      age: existing?.age || 25,
    });
    const intro = isEdit
      ? `✏️ *${ctx.from.first_name || ''}, profilingizni yangilaymiz!*\n\n1️⃣ Ismingizni yozing:`
      : "Assalomu alaykum! 🏠 *Oilaviy uyga xush kelibsiz.*\n\nPersonajingiz sizga o'xshashi uchun 4 ta qisqa savol:\n\n1️⃣ *Ismingizni yozing:*";
    await ctx.reply(intro, { parse_mode: 'Markdown', reply_markup: mainKeyboard() });
  };

  bot.command('start', async (ctx) => {
    const m = store.get(ctx.from.id);
    if (m) {
      if (ctx.match === 'xona') {
        await sendRoomLink(ctx);
        return;
      }
      await ctx.reply(
        `Xush kelibsiz, *${m.name}*! 👋\n` +
        `👤 Yosh: ${m.age} • Kasb: ${JOBS[m.job]?.label || m.job}\n\n` +
        `Pastdagi *🎭 Holatni o'zgartirish* yoki *🏠 3D Uyni ochish* tugmasini bosing:`,
        { parse_mode: 'Markdown', reply_markup: mainKeyboard() }
      );
      return;
    }
    await beginWizard(ctx, false);
  });

  bot.command('xona', sendRoomLink);

  bot.command('profil', async (ctx) => {
    await beginWizard(ctx, Boolean(store.get(ctx.from.id)));
  });

  bot.command('ism', async (ctx) => {
    await beginWizard(ctx, Boolean(store.get(ctx.from.id)));
  });

  bot.command('holat', async (ctx) => {
    const m = store.get(ctx.from.id);
    if (!m) return ctx.reply('Avval /start bosing.', { reply_markup: mainKeyboard() });
    const lines = store.all().map((x) => {
      const st = STATUSES[x.status];
      const jobIcon = JOBS[x.job]?.label.split(' ')[0] || '👤';
      let line = `${st?.label.split(' ')[0] || '❔'} *${x.name}* (${x.age} yosh, ${jobIcon}): ${st?.text || '?'}`;
      if (x.location) {
        const dist = x.location.distance != null ? `, uydan ${formatDistance(x.location.distance)}` : '';
        line += `\n     📍 ${timeAgo(x.location.at)}${dist}`;
      }
      return line;
    });
    await ctx.reply(`👨‍👩‍👧‍👦 *Oila a'zolari:*\n\n${lines.join('\n')}`, {
      parse_mode: 'Markdown',
      reply_markup: mainKeyboard(),
    });
  });

  bot.command('uy', async (ctx) => {
    if (!store.get(ctx.from.id)) return ctx.reply('Avval /start bosing.');
    awaitingHome.add(ctx.from.id);
    await ctx.reply(
      "🏠 *Uy manzilini belgilaymiz.*\n\n📎 (skrepka) → Joylashuv orqali uyingizni tanlab yuboring.",
      { parse_mode: 'Markdown', reply_markup: statusKeyboard(ctx.chat?.type === 'private') }
    );
  });

  bot.command('joylashuv', async (ctx) => {
    await ctx.reply(LIVE_HELP, { parse_mode: 'Markdown', reply_markup: mainKeyboard() });
  });

  const handleLocation = async (ctx, msg, edited) => {
    const id = ctx.from?.id;
    const m = id && store.get(id);
    if (!m) {
      if (!edited) await ctx.reply("Siz hali a'zo emassiz. /start bosing.");
      return;
    }
    const { latitude: lat, longitude: lon, live_period: livePeriod, horizontal_accuracy: accuracy } = msg.location;

    if (!edited && awaitingHome.has(id)) {
      awaitingHome.delete(id);
      store.setHome(lat, lon, m.name);
      await ctx.reply("✅ Uy manzili saqlandi! Endi kim uyga 150 m yaqinlashsa, uyda paydo bo'ladi.", {
        reply_markup: mainKeyboard(),
      });
      return;
    }

    const live = Boolean(livePeriod);
    const liveUntil = live ? Math.min(msg.date * 1000 + livePeriod * 1000, 8.64e15) : null;
    store.updateLocation(id, { lat, lon, accuracy: accuracy ?? null, live, liveUntil });

    if (!edited) {
      let text = live ? '🔴 Jonli joylashuv ulandi! Xaritada kuzatib boriladi.' : '📍 Joylashuvingiz saqlandi.';
      if (!store.getHome()) text += "\n\nℹ️ Hali uy manzili belgilanmagan. /uy buyrug'i bilan belgilang.";
      await ctx.reply(text, { reply_markup: mainKeyboard() });
    }
  };

  bot.on('message:location', (ctx) => handleLocation(ctx, ctx.message, false));
  bot.on('edited_message:location', (ctx) => handleLocation(ctx, ctx.editedMessage, true));

  store.on('moved', async ({ id, name, event }) => {
    const text = event === 'arrived' ? `🏠 ${name} uyga keldi` : `👋 ${name} uydan chiqdi`;
    const gId = store.getGroupChatId();
    if (gId) {
      bot.api.sendMessage(gId, text).catch(() => {});
    } else {
      for (const other of store.all()) {
        if (other.id === id) continue;
        bot.api.sendMessage(other.id, text).catch(() => {});
      }
    }
  });

  bot.on('message:text', async (ctx) => {
    const text = ctx.message.text.trim();
    if (text.startsWith('/')) return;
    const id = ctx.from.id;
    const isPrivate = ctx.chat?.type === 'private';

    // "🏠 3D Uyni ochish" tugmasi har doim ishlaydi
    if (text === BTN_ROOM) {
      await sendRoomLink(ctx);
      return;
    }

    // 1. Ro'yxatdan o'tish / Profil savol-javobi (guruhda ham, lichkada ham ishlaydi!)
    if (wizard.has(id)) {
      const state = wizard.get(id);
      if (state.step === 'name') {
        const name = cleanName(text);
        if (!name) {
          await ctx.reply("Iltimos, to'g'ri ism yozing (2-20 ta harf). Masalan: Jamshid");
          return;
        }
        state.name = name;
        state.step = 'gender';
        await ctx.reply(`2️⃣ *${name}*, jinsingizni tanlang:`, {
          parse_mode: 'Markdown',
          reply_markup: genderKeyboard(),
        });
        return;
      }

      if (state.step === 'gender') {
        const lower = text.toLowerCase();
        if (lower.includes('ayol') || lower.includes('qiz') || text.includes('👩')) {
          state.gender = 'female';
        } else if (lower.includes('erkak') || lower.includes("o'g'il") || text.includes('👨')) {
          state.gender = 'male';
        } else {
          await ctx.reply('Iltimos, pastdagi tugmalardan birini bosing: 👨 Erkak yoki 👩 Ayol', {
            reply_markup: genderKeyboard(),
          });
          return;
        }
        state.step = 'age';
        await ctx.reply('3️⃣ *Yoshingiz nechada?* (raqam bilan yozing, masalan: 28):', {
          parse_mode: 'Markdown',
        });
        return;
      }

      if (state.step === 'age') {
        const age = parseInt(text.replace(/\D/g, ''), 10);
        if (!age || age < 1 || age > 110) {
          await ctx.reply('Iltimos, yoshingizni raqamda yozing (masalan: 25):');
          return;
        }
        state.age = age;
        state.step = 'job';
        await ctx.reply('4️⃣ *Nima ish qilasiz (kasbingiz)?* Pastdagi tugmalardan tanlang:', {
          parse_mode: 'Markdown',
          reply_markup: jobKeyboard(),
        });
        return;
      }

      if (state.step === 'job') {
        const jobKey = Object.keys(JOBS).find(
          (k) => JOBS[k].label === text || text.toLowerCase().includes(JOBS[k].title.toLowerCase())
        ) || 'other';
        wizard.delete(id);

        if (store.get(id)) {
          store.updateProfile(id, { name: state.name, gender: state.gender, age: state.age, job: jobKey });
          await ctx.reply(
            `✅ *${state.name}* profili yangilandi! (${state.age} yosh, ${JOBS[jobKey].label})`,
            { parse_mode: 'Markdown', reply_markup: mainKeyboard() }
          );
        } else {
          store.add(id, { name: state.name, gender: state.gender, age: state.age, job: jobKey });
          await ctx.reply(
            `🎉 *Tabriklaymiz, ${state.name}!* Siz oilaviy uyga qo'shildingiz.\n` +
            `👤 Yosh: *${state.age}* • Kasb: *${JOBS[jobKey].label}*\n\n` +
            `Pastdagi *🎭 Holatni o'zgartirish* yoki *🏠 3D Uyni ochish* tugmasidan foydalaning!`,
            { parse_mode: 'Markdown', reply_markup: mainKeyboard() }
          );
        }
        return;
      }
    }

    // 2. Tugmalar: "🏠 3D Uyni ochish", "🎭 Holatni o'zgartirish", "🔙 Orqaga"
    if (text === BTN_ROOM) {
      await sendRoomLink(ctx);
      return;
    }

    const m = store.get(id);
    if (!m) {
      if (isPrivate || text === BTN_STATUS) {
        await ctx.reply("Siz hali a'zo emassiz. /start bosib ro'yxatdan o'ting!", { reply_markup: mainKeyboard() });
      }
      return;
    }

    if (text === BTN_STATUS) {
      await ctx.reply(`🎭 *${m.name}*, hozir nima qilyapsiz? Tanlang:`, {
        parse_mode: 'Markdown',
        reply_markup: statusKeyboard(isPrivate),
      });
      return;
    }

    if (text === BTN_BACK) {
      await ctx.reply('🏠 Asosiy menyu:', { reply_markup: mainKeyboard() });
      return;
    }

    // 3. Holat tugmalaridan biri bosilganda (guruhda ham, lichkada ham ishlaydi!)
    const statusKey = Object.keys(STATUSES).find((k) => STATUSES[k].label === text);
    if (statusKey) {
      store.update(id, { status: statusKey });
      const st = STATUSES[statusKey];
      const replies = {
        home:  `🏠 *${m.name}* mehmonxonaga o'tirdi!`,
        pc:    `💻 *${m.name}* kompyuter stoliga o'tirib ishni boshladi!`,
        tv:    `📺 *${m.name}* divanga o'tirib televizor ko'ryapti!`,
        insta: `📱 *${m.name}* qo'liga telefonni olib Instagram ko'ryapti!`,
        eat:   `🍽️ *${m.name}* oshxonaga borib ovqatlanyapti!`,
        cook:  `🍳 *${m.name}* oshxonada plita oldida ovqat pishiryapti!`,
        sleep: `😴 *${m.name}* yotoqxonaga borib karavotga yotdi. Xayrli tun!`,
        wc:    `🚽 *${m.name}* hojatxonaga kirdi.`,
        work:  m.job === 'taxi'
          ? `🚕 *${m.name}* mashinasini garajdan olib taksiga chiqib ketdi! Oq yo'l!`
          : `💼 *${m.name}* ishga ketdi. Omad!`,
        school: `🏫 *${m.name}* o'qishga ketdi!`,
        out:    `🚶 *${m.name}* ko'chaga chiqib ketdi.`,
      };
      await ctx.reply(replies[statusKey] || `Holat: ${st.text}`, {
        parse_mode: 'Markdown',
        reply_markup: mainKeyboard(),
      });
      return;
    }

    // 4. Oddiy suhbat xabari (guruhda yoki lichkada)
    const msgText = text.slice(0, 160);
    const others = store.all().filter((x) => x.id !== id);

    // Reply qilingan odam yoki ismi yozilgan odamni topish
    const replyUserId = ctx.message.reply_to_message?.from?.id;
    let target = replyUserId && others.find((x) => x.id === replyUserId);
    if (!target) {
      target = others.find((x) => msgText.toLowerCase().includes(x.name.toLowerCase()));
    }

    store.say(id, msgText, target?.id || null);
  });

  bot.catch((err) => console.error('Bot xatosi:', err.error || err));

  await bot.init();
  await bot.api.setMyCommands([
    { command: 'start', description: "A'zo bo'lish va tugmalar" },
    { command: 'xona', description: "3D Uyni telefonda / PC'da ochish" },
    { command: 'profil', description: "Ism, yosh va kasbni o'zgartirish" },
    { command: 'holat', description: "Oila a'zolari holati" },
    { command: 'uy', description: 'Uy manzilini belgilash' },
  ]).catch((err) => console.warn('setMyCommands xatosi:', err.message));

  bot.start({
    drop_pending_updates: false,
    onStart: () => {
      console.log(`🤖 Telegram bot ulandi: @${bot.botInfo.username}`);
      onStatus?.({ ok: true, username: bot.botInfo.username });
    },
  }).catch((err) => {
    console.error('Bot start xatosi:', err.message || err);
    onStatus?.({ ok: false, error: String(err.message || err) });
  });

  return bot.botInfo.username;
}

// 3D Xona ichidan personaj ustiga bosib xabar yozilganda yoki holat o'zgartirilganda
async function handleRoomAction(payload) {
  if (!payload || typeof payload !== 'object') return;

  if (payload.type === 'status') {
    const id = Number(payload.id);
    const m = store.get(id);
    if (m && STATUSES[payload.status]) {
      store.update(id, { status: payload.status });
      const gId = store.getGroupChatId();
      if (gId && bot) {
        bot.api.sendMessage(
          gId,
          `${STATUSES[payload.status].label.split(' ')[0]} *${m.name}* holatini o'zgartirdi: *${STATUSES[payload.status].text}*`,
          { parse_mode: 'Markdown' }
        ).catch(() => {});
      }
    }
    return;
  }

  if (payload.type === 'say') {
    const fromId = Number(payload.fromId);
    const toId = payload.toId ? Number(payload.toId) : null;
    const text = String(payload.text || '').trim().slice(0, 160);
    if (!text) return;

    const from = store.get(fromId);
    const to = toId ? store.get(toId) : null;
    if (!from) return;

    store.say(from.id, text, to?.id || null);

    // Guruhga (yoki qabul qiluvchiga) xabarni chiqarish
    const msg = to && to.id !== from.id
      ? `💬 *${from.name} ➡️ ${to.name}:* ${text}`
      : `💬 *${from.name}:* ${text}`;
    const gId = store.getGroupChatId();
    if (gId && bot) {
      bot.api.sendMessage(gId, msg, { parse_mode: 'Markdown' }).catch(() => {});
    } else if (to && bot) {
      bot.api.sendMessage(to.id, msg, { parse_mode: 'Markdown' }).catch(() => {});
    }
  }
}

async function stopBot() {
  if (bot) await bot.stop().catch(() => {});
}

module.exports = { startBot, stopBot, handleRoomAction, STATUSES };

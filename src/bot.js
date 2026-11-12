// Telegram bot:
// - Barcha funksiyalar va tugmalar ("🎭 Holatni o'zgartirish" va "🏠 3D Uyni ochish") ham "Oila_3d_room" guruhida, ham lichkada ishlaydi!
// - Boshqa (eski) guruhlardan bot avtomatik chiqib ketadi.
const path = require('path');
const fs = require('fs');
const { Bot, Keyboard, InlineKeyboard, InputFile } = require('grammy');
const store = require('./store');
const road = require('./road');
const { JOBS } = store;
const { handleRobotCommand, handlePetCommand, AI_IDS } = require('./ai');

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

const BTN_JOIN = "👨‍👩‍👧‍👦 Oilaga a'zo bo'lish";
const BTN_STATUS = "🎭 Holatni o'zgartirish";
const BTN_ROOM = '🏠 3D Uyni ochish';
const BTN_CHAT = '💬 Suhbat';
const BTN_PHOTO = '📸 Rasm yuklash';
const BTN_GAI = '🚔 GAI bor';
const BTN_RADAR = '📸 Radar / Kamera';
const BTN_BACK = '🔙 Orqaga';
const LOCATION_BUTTON = '📍 Joylashuvni yuborish';

// Yangi foydalanuvchi /start bosganda chiqadigan tugma
function joinKeyboard() {
  return new Keyboard()
    .text(BTN_JOIN)
    .resized()
    .persistent();
}

// Ro'yxatdan o'tgandan keyin DOIM turadigan asosiy tugmalar (hech qanday joylashuv so'rovisiz!)
function mainKeyboard() {
  return new Keyboard()
    .text(BTN_STATUS).text(BTN_ROOM).row()
    .text(BTN_CHAT).text(BTN_PHOTO).row()
    .text(BTN_GAI).text(BTN_RADAR)
    .resized()
    .persistent();
}

// Guruhda FAQAT "🏠 3D Uyni ochish" tugmasi chiqadi
function groupKeyboard() {
  return new Keyboard()
    .text(BTN_ROOM)
    .resized()
    .persistent();
}

// Lichkada "💬 Suhbat" bosilganda a'zolar ro'yxati
function chatMembersKeyboard(myId) {
  const kb = new Keyboard();
  const others = store.all().filter((m) => m.id !== myId);
  for (let i = 0; i < others.length; i += 2) {
    kb.text(`💬 ${others[i].name}`);
    if (others[i + 1]) kb.text(`💬 ${others[i + 1].name}`);
    kb.row();
  }
  kb.text(BTN_BACK);
  return kb.resized().persistent();
}

// "🎭 Holatni o'zgartirish" bosilganda chiqadigan holatlar ro'yxati (faqat lichkada)
function statusKeyboard() {
  return new Keyboard()
    .text(STATUSES.home.label).text(STATUSES.pc.label).row()
    .text(STATUSES.tv.label).text(STATUSES.insta.label).row()
    .text(STATUSES.eat.label).text(STATUSES.cook.label).row()
    .text(STATUSES.sleep.label).text(STATUSES.wc.label).row()
    .text(STATUSES.work.label).text(STATUSES.school.label).text(STATUSES.out.label).row()
    .requestLocation(LOCATION_BUTTON).text(BTN_BACK)
    .resized()
    .persistent();
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

const APK_PATH = path.join(__dirname, 'renderer', 'Oilaviy_Uy.apk');

async function sendApkToChat(chatId) {
  try {
    if (!bot || !chatId || !fs.existsSync(APK_PATH)) {
      console.warn('sendApkToChat: bot, chatId, or APK_PATH missing', { exists: fs.existsSync(APK_PATH) });
      return false;
    }
    await bot.api.sendDocument(
      chatId,
      new InputFile(APK_PATH, 'Oilaviy_Uy.apk'),
      {
        caption:
          "📲 *Oilaviy Uy — Fon GPS Datchigi (.apk)*\n\n" +
          "Bu dastur faqat Telegram yopiq paytda ham joylashuv uzatilib turishi uchun xizmat qiladi.\n\n" +
          "1️⃣ Fayl ustiga bosib *\"Установить\"* va *\"Открыть\"* qiling.\n" +
          "2️⃣ So'ralgan ruxsatlarni berib qo'ying.\n\n" +
          "✅ Bo'ldi! Shundan so'ng dasturni yopib qo'ysangiz ham bo'ladi — 3D Uy va harakatlarni Telegram orqali ko'raverasiz!",
        parse_mode: 'Markdown',
      }
    );
    return true;
  } catch (err) {
    console.error('sendApkToChat error:', err.message || err);
    return false;
  }
}

async function sendRoomLink(ctx) {
  const baseUrl = getPublicUrlFn();
  const uid = ctx.from?.id || '';
  const m = store.get(uid);
  const isPrivate = ctx.chat?.type === 'private';

  // Ilovani o'rnatib ruxsat bermaguncha 3D Uyga kirish taqiqlanadi!
  if (isPrivate && (!m || !m.apkInstalled)) {
    if (!m) {
      await ctx.reply("Siz hali oilaga a'zo bo'lmagansiz. /start bosing.");
      return;
    }
    await ctx.reply(
      `⛔️ *Avval ilovani o'rnatib oling!*\n\n` +
      `Ushbu ilova Telegramdan chiqib ketsangiz ham 24/7 Live rejimda joylashuvingizni xaritada to'g'ri ko'rsatib turishi shart.\n\n` +
      `⚠️ *Ilovani o'rnatib, ruxsat bermaguningizcha 3D Uyga kirib bo'lmaydi!*`,
      { parse_mode: 'Markdown' }
    );
    await sendApkToChat(uid);
    return;
  }

  const personalUrl = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}uid=${uid}&v=41`;
  const isHttps = baseUrl.startsWith('https://');

  if (isHttps) {
    if (isPrivate) {
      const ikb = new InlineKeyboard()
        .webApp("🏠 3D Uyni ochish", personalUrl)
        .row()
        .text("📲 Fon GPS datchigi (.apk)", 'install_apk');
      await ctx.reply(
        `🏠 *Oilaviy 3D Uy*\n\n` +
        `• 3D Uyga kirish: *🏠 3D Uyni ochish*\n` +
        `• 24/7 fon joylashuvi uchun: *📲 Fon GPS datchigi (.apk)*`,
        { parse_mode: 'Markdown', reply_markup: ikb }
      );
      await ctx.reply(
        `Pastdagi doimiy menyudan ham foydalanishingiz mumkin:`,
        { reply_markup: mainKeyboard() }
      );
    } else {
      const botUsername = bot?.botInfo?.username || 'HomeChat_3d_bot';
      const groupIkb = new InlineKeyboard()
        .url("🏠 3D Uyni ochish", `https://t.me/${botUsername}?start=xona`);
      await ctx.reply(
        "🏠 *Oilaviy 3D Uy*\n\n" +
        "3D Uyga kirish uchun pastdagi tugmani bosing:",
        { parse_mode: 'Markdown', reply_markup: groupIkb }
      );
    }
  } else {
    await ctx.reply(
      "⏳ *Ilova tayyorlanmoqda (5-10 soniya)...*\n" +
      "Birozdan keyin yana *🏠 3D Uyni ochish* tugmasini bosing!",
      { parse_mode: 'Markdown', reply_markup: isPrivate ? mainKeyboard() : groupKeyboard() }
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
  const pendingHazard = new Map();
  const activeChatTarget = new Map();
  let lastGaiHintAt = 0;

  road.removeAllListeners('alert');

  // Guruh tekshiruvi: faqat "Oila_3d_room" guruhida qoladi
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

  bot.command('chiqish', async (ctx) => {
    if (ctx.chat?.type !== 'private') return;
    const id = ctx.from.id;
    const m = store.get(id);
    if (!m || m.isAi) {
      await ctx.reply("Siz oilaviy uyda emassiz.");
      return;
    }
    store.remove(id);
    await ctx.reply(
      `🚪 *${m.name}, siz oilaviy uydan butunlay chiqdingiz.*\n\n` +
      `3D uy va xaritadan personajingiz o'chirildi.\n` +
      `Qayta qo'shilish uchun /start bosing.`,
      { parse_mode: 'Markdown', reply_markup: { remove_keyboard: true } }
    );
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
      ? `✏️ *${existing?.name || ctx.from.first_name || ''}, profilingizni yangilaymiz!*\n\n1️⃣ *Ismingiz nima?* (Ismingizni yozing):`
      : "Assalomu alaykum! 🏠 *Oilaviy uyga xush kelibsiz.*\n\n1️⃣ *Ismingiz nima?* (Ismingizni yozing):";
    await ctx.reply(intro, {
      parse_mode: 'Markdown',
      reply_markup: { remove_keyboard: true },
    });
  };

  bot.command('start', async (ctx) => {
    // Guruhda /start bosilsa faqat 3D Uyni ochish tugmasi chiqadi
    if (ctx.chat?.type !== 'private') {
      await ctx.reply('🏠 *3D Uyni ochish uchun pastdagi tugmani bosing:*', {
        parse_mode: 'Markdown',
        reply_markup: groupKeyboard(),
      });
      await sendRoomLink(ctx);
      return;
    }

    const id = ctx.from.id;
    if (ctx.match === 'xona') {
      await sendRoomLink(ctx);
      return;
    }
    if (ctx.match === 'apk') {
      await sendApkToChat(id);
      return;
    }

    // 6 xonali kod orqali ulanish: /start pair_123456 yoki /start 123456
    const pairMatch = (ctx.message?.text || '').match(/(?:pair_|\s+)(\d{6})(?:\b|$)/i);
    if (pairMatch) {
      const code = pairMatch[1];
      const paired = store.matchPairCode(code, id, ctx.from?.first_name || 'Oila a\'zosi');
      if (paired) {
        const baseUrl = getPublicUrlFn();
        const personalUrl = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}uid=${id}&v=45`;
        const ikb = new InlineKeyboard().webApp("🏠 3D Uyga kirish", personalUrl);
        await ctx.reply(
          `✅ *Qurilmangiz muvaffaqiyatli ulandi!*\n\n` +
          `👤 *${paired.name}* — Telefoningiz hisobingizga biriktirildi.\n` +
          `🟢 24/7 Fon GPS datchigi endi sizning nomingizdan ishlaydi.\n\n` +
          `🏠 3D Uyga kirish uchun pastdagi tugmani bosing:`,
          { parse_mode: 'Markdown', reply_markup: ikb }
        );
        await ctx.reply(`Pastdagi doimiy menyu tugmalaridan ham foydalanishingiz mumkin:`, {
          reply_markup: mainKeyboard(),
        });
        return;
      } else {
        await ctx.reply(
          `⚠️ *Kiritilgan ulanish kodi (${code}) topilmadi yoki muddati o'tgan.*\n\n` +
          `Iltimos, ilovani ochib, ekrandagi 6 xonali yangi kodni yuboring.`,
          { parse_mode: 'Markdown' }
        );
        return;
      }
    }

    const m = store.get(id);

    // 1. Agar a'zo bo'lgan va ilovani o'rnatgan bo'lsa: darhol uyga kirish tugmasi chiqadi
    if (m && m.apkInstalled) {
      const baseUrl = getPublicUrlFn();
      const personalUrl = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}uid=${m.id}&v=45`;
      const ikb = new InlineKeyboard().webApp("🏠 3D Uyga kirish", personalUrl);
      await ctx.reply(
        `✅ *Hammasini bajardingiz! Endi uyga kirishingiz mumkin.*\n\n` +
        `👤 *${m.name}* (${JOBS[m.job]?.label || m.job})\n` +
        `🟢 Fon GPS datchigi faol ishlamoqda.\n\n` +
        `🏠 3D Uyga kirish uchun pastdagi tugmani bosing:`,
        { parse_mode: 'Markdown', reply_markup: ikb }
      );
      await ctx.reply(
        `Pastdagi doimiy menyu tugmalaridan ham foydalanishingiz mumkin:`,
        { reply_markup: mainKeyboard() }
      );
      return;
    }

    // 2. Agar a'zo bo'lgan, lekin hali ilovani o'rnatmagan bo'lsa: ilovani talab qiladi
    if (m && !m.apkInstalled) {
      const baseUrl = getPublicUrlFn();
      const serverAppUrl = `${baseUrl}/app?uid=${id}&name=${encodeURIComponent(m.name)}`;
      const ikb = new InlineKeyboard().url("📲 Server orqali o'rnatish va ulash", serverAppUrl);
      await ctx.reply(
        `🎉 *Tabriklaymiz, ${m.name}! Oila a'zosi bo'ldingiz.*\n\n` +
        `📲 *Ilovani o'rnatib, hisobingizga bog'lang!*\n\n` +
        `Ushbu ilova Telegramdan chiqib ketsangiz ham 24/7 Live (jonli) rejimda joylashuvingizni xaritada to'g'ri ko'rsatib turish uchun kerak.\n\n` +
        `1️⃣ Pastdagi *\"📲 Server orqali o'rnatish va ulash\"* tugmasini bosing.\n` +
        `2️⃣ Sahifada ilovani yuklab oling va hisobingizga ulang.\n\n` +
        `⚠️ *Ilovani o'rnatib, ruxsat bermaguningizcha 3D Uyga kirib bo'lmaydi!*`,
        { parse_mode: 'Markdown', reply_markup: ikb }
      );
      await sendApkToChat(id);
      return;
    }

    // 3. Agar hali a'zo bo'lmagan bo'lsa: 1-Ism, 2-Yosh, 3-Kasb so'raladi
    await beginWizard(ctx, false);
  });

  bot.command('xona', sendRoomLink);

  bot.command('apk', async (ctx) => {
    await sendApkToChat(ctx.chat?.id);
  });

  bot.command('sozlama', async (ctx) => {
    const ikb = new InlineKeyboard()
      .url("🔋 1. Batareya (Cheklovlarsiz)", "oilaviyuy://battery")
      .row()
      .url("📍 2. Joylashuv (Har doim)", "oilaviyuy://settings");
    await ctx.reply(
      `⚙️ *24/7 Fon Datchigi sozlamalari*\n\n` +
      `Telefon ekrani o'chganda yoki Telegramdan chiqqanda datchik uzilib qolmasligi uchun pastdagi 2 ta tugmani bosing:\n\n` +
      `1️⃣ *Batareya:* Cheklovlarsiz (Без ограничений)\n` +
      `2️⃣ *Joylashuv:* Har doim ruxsat berish (Разрешить в любом режиме)`,
      { parse_mode: 'Markdown', reply_markup: ikb }
    );
  });

  bot.callbackQuery('install_apk', async (ctx) => {
    await ctx.answerCallbackQuery({ text: '📲 Ilova yuborilmoqda...' }).catch(() => {});
    const targetChatId = ctx.chat?.id || ctx.from?.id;
    if (targetChatId) {
      await sendApkToChat(targetChatId);
    }
  });

  bot.callbackQuery('download_apk', async (ctx) => {
    await ctx.answerCallbackQuery({ text: '📲 Ilova yuborilmoqda...' }).catch(() => {});
    const targetChatId = ctx.chat?.id || ctx.from?.id;
    if (targetChatId) {
      await sendApkToChat(targetChatId);
    }
  });

  bot.callbackQuery(/^save_cam:(.+)$/, async (ctx) => {
    const hzId = ctx.match?.[1];
    const existing = road.getActiveHazards().find((h) => h.id === hzId);
    if (existing) {
      road.addHazard({
        type: 'camera',
        lat: existing.lat,
        lon: existing.lon,
        speedLimit: existing.limit,
        reportedBy: ctx.from?.id,
        reportedByName: store.get(ctx.from?.id)?.name || 'Haydovchi',
      });
      await ctx.answerCallbackQuery({ text: '📌 Doimiy kamera sifatida saqlandi!' }).catch(() => {});
      await ctx.editMessageText('✅ *Doimiy kamera sifatida xaritaga saqlandi!*', { parse_mode: 'Markdown' }).catch(() => {});
    } else {
      await ctx.answerCallbackQuery({ text: 'Belgi topilmadi' }).catch(() => {});
    }
  });

  bot.command('profil', async (ctx) => {
    if (ctx.chat?.type !== 'private') return;
    await beginWizard(ctx, Boolean(store.get(ctx.from.id)));
  });

  bot.command('ism', async (ctx) => {
    if (ctx.chat?.type !== 'private') return;
    await beginWizard(ctx, Boolean(store.get(ctx.from.id)));
  });

  bot.command('holat', async (ctx) => {
    if (ctx.chat?.type !== 'private') return;
    const m = store.get(ctx.from.id);
    if (!m) return ctx.reply('Avval /start bosing.', { reply_markup: joinKeyboard() });
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
      reply_markup: mainKeyboard(ctx.from.id),
    });
  });

  bot.command('uy', async (ctx) => {
    if (ctx.chat?.type !== 'private') return;
    if (!store.get(ctx.from.id)) return ctx.reply('Avval /start bosing.');
    awaitingHome.add(ctx.from.id);
    await ctx.reply(
      "🏠 *Uy manzilini belgilaymiz.*\n\n📎 (skrepka) → Joylashuv orqali uyingizni tanlab yuboring.",
      { parse_mode: 'Markdown', reply_markup: statusKeyboard() }
    );
  });

  bot.command('joylashuv', async (ctx) => {
    if (ctx.chat?.type !== 'private') return;
    await ctx.reply(LIVE_HELP, { parse_mode: 'Markdown', reply_markup: mainKeyboard(ctx.from.id) });
  });

  const handleLocation = async (ctx, msg, edited) => {
    const isGroup = ctx.chat?.type === 'group' || ctx.chat?.type === 'supergroup';
    const id = ctx.from?.id;
    const m = id && store.get(id);
    const { latitude: lat, longitude: lon, live_period: livePeriod, horizontal_accuracy: accuracy } = msg.location;

    if (isGroup) {
      if (!edited && Date.now() - lastGaiHintAt < 120_000) {
        road.addHazard({ type: 'gai', lat, lon, reportedBy: id, reportedByName: m?.name || ctx.from?.first_name || 'Guruh' });
        await ctx.reply(`✅ ${m?.name || ctx.from?.first_name || 'Haydovchi'} yuborgan 🚔 GAI nuqtasi xaritaga qo'shildi (2 soat)!`).catch(() => {});
      }
      return;
    }
    if (ctx.chat?.type !== 'private') return;
    if (!m) {
      if (!edited) await ctx.reply("Siz hali a'zo emassiz. /start bosing.");
      return;
    }

    if (!edited && pendingHazard.has(id)) {
      const hType = pendingHazard.get(id);
      pendingHazard.delete(id);
      const hz = road.addHazard({ type: hType, lat, lon, reportedBy: id, reportedByName: m.name });
      const label = hType === 'gai' ? '🚔 GAI posti (2 soat)' : '📡 Radar (2 soat)';
      const extra = hType === 'radar' && hz
        ? { parse_mode: 'Markdown', reply_markup: new InlineKeyboard().text('📌 Doimiy kamera qilib saqlash', `save_cam:${hz.id}`) }
        : { parse_mode: 'Markdown', reply_markup: mainKeyboard(id) };
      await ctx.reply(`✅ *Rahmat! ${label} xaritaga qo'shildi.*\n50-60-70+ da yaqinlashgan haydovchilarni Yordamchi bot ogohlantiradi.`, extra);
      return;
    }

    if (!edited && awaitingHome.has(id)) {
      awaitingHome.delete(id);
      store.setHome(lat, lon, m.name);
      await ctx.reply("✅ Uy manzili saqlandi! Endi kim uyga 150 m yaqinlashsa, uyda paydo bo'ladi.", {
        reply_markup: mainKeyboard(id),
      });
      return;
    }

    const live = true;
    const liveUntil = livePeriod ? Math.min(msg.date * 1000 + livePeriod * 1000, 8.64e15) : Date.now() + 86_400_000;
    store.updateLocation(id, { lat, lon, accuracy: accuracy ?? null, live, liveUntil });

    if (!edited) {
      let text = '✅ Joylashuv ruxsati olindi! Endi xaritada Real-Time ko\'rinib turasiz.';
      if (!store.getHome()) {
        store.setHome(lat, lon, m.name);
      }
      await ctx.reply(text, { reply_markup: mainKeyboard(id) });
    }
  };

  bot.on('message:location', (ctx) => handleLocation(ctx, ctx.message, false));
  bot.on('edited_message:location', (ctx) => handleLocation(ctx, ctx.editedMessage, true));

  // Foydalanuvchi rasm yuborganda uni xaritadagi avatar doirasiga o'rnatish
  bot.on('message:photo', async (ctx) => {
    const id = ctx.from?.id;
    if (!id) return;
    const m = store.get(id);
    if (!m) {
      await ctx.reply("Siz hali oilaga a'zo emassiz. Avval pastdagi tugmani bosib a'zo bo'ling!", {
        reply_markup: joinKeyboard(),
      });
      return;
    }

    try {
      const photos = ctx.message.photo;
      if (!photos || !photos.length) return;
      // O'rtacha sifatli (avatar uchun optimal ~320px) rasm tanlanadi
      const chosen = photos.length >= 2 ? photos[1] : photos[0];
      const file = await ctx.api.getFile(chosen.file_id);
      if (!file || !file.file_path) {
        throw new Error("Telegram fayl yo'li topilmadi");
      }

      const fileUrl = `https://api.telegram.org/file/bot${token}/${file.file_path}`;
      const res = await fetch(fileUrl);
      if (!res.ok) throw new Error(`HTTP xatolik: ${res.status}`);
      const arrayBuffer = await res.arrayBuffer();
      const buffer = Buffer.from(arrayBuffer);

      // data/photos jildiga saqlash
      const photosDir = path.join(__dirname, '..', 'data', 'photos');
      if (!fs.existsSync(photosDir)) {
        fs.mkdirSync(photosDir, { recursive: true });
      }
      fs.writeFileSync(path.join(photosDir, `${id}.jpg`), buffer);

      // JSON bazada ham Base64 saqlanadi (disk tozalanib yuborilsa ham rasm yo'qolmaydi)
      const base64 = buffer.toString('base64');
      const photoDataUrl = `data:image/jpeg;base64,${base64}`;
      const photoUrl = `/photos/${id}.jpg?v=${Date.now()}`;

      store.update(id, {
        photo: photoDataUrl,
        photoUrl: photoUrl,
      });

      await ctx.reply(
        `✅ *${m.name}*, rasmingiz muvaffaqiyatli qabul qilindi!\n\n` +
        `🗺️ Xaritadagi nishoningiz ushbu rasmga o'rnatildi va onlayn bo'lganingizda atrofida qizil jonli signal yonib-o'chib turadi! 🔴✨`,
        {
          parse_mode: 'Markdown',
          reply_markup: mainKeyboard(id),
        }
      );
    } catch (err) {
      console.error('Foto yuklashda xatolik:', err);
      await ctx.reply(
        "❌ Rasmni yuklab olishda xatolik yuz berdi. Iltimos qaytadan urinib ko'ring.",
        { reply_markup: mainKeyboard(id) }
      );
    }
  });

  // Fon rejimda joylashuv yangilanganda chatga ortiqcha SMS yuborilmaydi (faqat 3D uy va xaritada Live ko'rinadi)

  bot.on('message:text', async (ctx) => {
    const text = ctx.message.text.trim();
    if (text.startsWith('/')) return;
    const id = ctx.from.id;
    const isPrivate = ctx.chat?.type === 'private';

    // "🏠 3D Uyni ochish" tugmasi guruhda ham, lichkada ham ishlaydi
    if (text === BTN_ROOM) {
      await sendRoomLink(ctx);
      return;
    }

    // Guruhda GAI/radar haqida yozib joylashuv tashlansa xaritaga qo'shiladi; boshqa buyruqlar yopiq
    if (!isPrivate) {
      if (/\b(gayi|gai|radar|kamera|kamra)\b/i.test(text)) {
        lastGaiHintAt = Date.now();
        const mG = store.get(id);
        const locFresh = mG?.location && Number.isFinite(mG.location.lat) && mG.location.at && (Date.now() - new Date(mG.location.at).getTime() < 120_000);
        if (locFresh) {
          const hType = /radar|kamera|kamra/i.test(text) ? 'radar' : 'gai';
          road.addHazard({ type: hType, lat: mG.location.lat, lon: mG.location.lon, reportedBy: id, reportedByName: mG.name });
          await ctx.reply(`✅ ${mG.name} turgan joyda ${hType === 'gai' ? '🚔 GAI' : '📡 Radar'} xaritaga qo'shildi (2 soat)!`).catch(() => {});
        }
      }
      return;
    }

    // "📸 Rasm yuklash" tugmasi bosilganda yo'riqnoma berish
    if (text === BTN_PHOTO) {
      await ctx.reply(
        "📸 *Xaritadagi rasmingizni o'rnatish yoki yangilash:*\n\n" +
        "Galereyangizdan xohlagan rasmingizni to'g'ridan-to'g'ri shu botga yuboring!\n\n" +
        "✨ Rasm qabul qilingach, xaritadagi nishoningiz doira shaklidagi ushbu rasmga aylanadi.",
        { parse_mode: 'Markdown', reply_markup: mainKeyboard(id) }
      );
      return;
    }

    // "👨‍👩‍👧‍👦 Oilaga a'zo bo'lish" tugmasi bosilganda savol-javob boshlanadi
    if (text === BTN_JOIN) {
      await beginWizard(ctx, Boolean(store.get(id)));
      return;
    }

    // 6 xonali ulanish kodi yuborilgan bo'lsa:
    const sixDigitMatch = text.replace(/\s+/g, '').match(/^(\d{6})$/);
    if (sixDigitMatch) {
      const code = sixDigitMatch[1];
      const paired = store.matchPairCode(code, id, ctx.from?.first_name || 'Oila a\'zosi');
      if (paired) {
        const baseUrl = getPublicUrlFn();
        const personalUrl = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}uid=${id}&v=45`;
        const ikb = new InlineKeyboard().webApp("🏠 3D Uyga kirish", personalUrl);
        await ctx.reply(
          `✅ *Qurilmangiz muvaffaqiyatli ulandi!*\n\n` +
          `👤 *${paired.name}* — Telefoningiz hisobingizga biriktirildi.\n` +
          `🟢 24/7 Fon GPS datchigi endi sizning nomingizdan ishlaydi.\n\n` +
          `🏠 3D Uyga kirish uchun pastdagi tugmani bosing:`,
          { parse_mode: 'Markdown', reply_markup: ikb }
        );
        await ctx.reply(`Pastdagi doimiy menyu tugmalaridan ham foydalanishingiz mumkin:`, {
          reply_markup: mainKeyboard(),
        });
        return;
      }
    }

    // 1. Ro'yxatdan o'tish / Profil savol-javobi: 1. Ism -> 2. Yosh -> 3. Kasb
    if (wizard.has(id)) {
      const state = wizard.get(id);

      // 1-SAVOL: Ism
      if (state.step === 'name') {
        const name = cleanName(text);
        if (!name) {
          await ctx.reply("Iltimos, to'g'ri ism yozing (2-20 ta harf). Masalan: Jamshid");
          return;
        }
        state.name = name;
        state.step = 'age';
        await ctx.reply(`2️⃣ *${name}*, yoshingiz nechada? (Raqamda yozing, masalan: 28):`, {
          parse_mode: 'Markdown',
        });
        return;
      }

      // 2-SAVOL: Yosh
      if (state.step === 'age') {
        const num = parseInt(text.replace(/[^\d]/g, ''), 10);
        if (isNaN(num) || num < 3 || num > 120) {
          await ctx.reply("Iltimos, yoshingizni faqat raqamda to'g'ri yozing (masalan: 28):");
          return;
        }
        state.age = num;
        state.step = 'job';
        await ctx.reply('3️⃣ *Kasbingiz nima?* (Tanlang):', {
          parse_mode: 'Markdown',
          reply_markup: jobKeyboard(),
        });
        return;
      }

      // 3-SAVOL: Kasb
      if (state.step === 'job') {
        const jobKey = Object.keys(JOBS).find(
          (k) => JOBS[k].label === text || text.toLowerCase().includes(JOBS[k].title.toLowerCase())
        ) || 'other';
        wizard.delete(id);

        let gender = 'male';
        const lowerName = state.name.toLowerCase();
        if (jobKey === 'housewife' || lowerName.endsWith('a') || (lowerName.endsWith('o') && lowerName.includes('dil'))) {
          gender = 'female';
        }

        const existingByName = store.all().find((x) => !x.isAi && x.name.toLowerCase() === state.name.toLowerCase());
        if (existingByName && Number(existingByName.id) !== Number(id)) {
          existingByName.id = id;
          existingByName.apkInstalled = true;
          store.updateProfile(id, { name: state.name, gender, age: state.age || 25, job: jobKey });
        } else if (store.get(id)) {
          store.updateProfile(id, { name: state.name, gender, age: state.age || 25, job: jobKey });
        } else {
          store.add(id, { name: state.name, gender, age: state.age || 25, job: jobKey });
        }

        const m = store.get(id);
        if (m) {
          m.apkInstalled = false;
          store.save();
        }

        const baseUrl = getPublicUrlFn();
        const serverAppUrl = `${baseUrl}/app?uid=${id}&name=${encodeURIComponent(state.name)}`;
        const ikb = new InlineKeyboard().url("📲 Server orqali o'rnatish va ulash", serverAppUrl);

        await ctx.reply(
          `🎉 *Tabriklaymiz, ${state.name}! Oila a'zosi bo'ldingiz.*\n\n` +
          `📲 *Ilovani o'rnatib, hisobingizga bog'lang!*\n\n` +
          `Ushbu ilova Telegramdan chiqib ketsangiz ham 24/7 Live (jonli) rejimda joylashuvingizni xaritada to'g'ri ko'rsatib turish uchun kerak.\n\n` +
          `1️⃣ Pastdagi *\"📲 Server orqali o'rnatish va ulash\"* tugmasini bosing.\n` +
          `2️⃣ Sahifada ilovani yuklab oling va hisobingizga ulang.\n\n` +
          `⚠️ *Ilovani o'rnatib, ruxsat bermaguningizcha 3D Uyga kirib bo'lmaydi!*`,
          { parse_mode: 'Markdown', reply_markup: ikb }
        );
        await sendApkToChat(id);
        return;
      }
    }

    const m = store.get(id);
    if (!m) {
      await ctx.reply(
        "Siz hali oilaga a'zo bo'lmagansiz. /start bosing.",
        { parse_mode: 'Markdown' }
      );
      return;
    }

    // Ilovani o'rnatib ruxsat bermaguncha 3D Uyga kirish va menyulardan foydalanish taqiqlanadi!
    if (!m.apkInstalled) {
      await ctx.reply(
        `⛔️ *Avval ilovani o'rnatib oling!*\n\n` +
        `Ushbu ilova Telegramdan chiqib ketsangiz ham 24/7 Live rejimda joylashuvingizni xaritada to'g'ri ko'rsatib turishi shart.\n\n` +
        `⚠️ *Ilovani o'rnatib, ruxsat bermaguningizcha 3D Uyga kirib bo'lmaydi!*`,
        { parse_mode: 'Markdown' }
      );
      await sendApkToChat(id);
      return;
    }

    if (text === BTN_GAI || text === BTN_RADAR) {
      const hType = text === BTN_GAI ? 'gai' : 'radar';
      const label = hType === 'gai' ? '🚔 GAI posti (2 soat)' : '📡 Radar (2 soat)';
      const fresh = m.location && Number.isFinite(m.location.lat) && m.location.at && (Date.now() - new Date(m.location.at).getTime() < 120_000);
      if (fresh) {
        const hz = road.addHazard({ type: hType, lat: m.location.lat, lon: m.location.lon, reportedBy: id, reportedByName: m.name });
        if (hType === 'radar' && hz) {
          await ctx.reply(
            `✅ *${label} xaritaga qo'shildi!*\n50-60-70+ da yaqinlashganlarni Yordamchi bot ogohlantiradi.`,
            { parse_mode: 'Markdown', reply_markup: new InlineKeyboard().text('📌 Doimiy kamera qilib saqlash', `save_cam:${hz.id}`) }
          );
        } else {
          await ctx.reply(
            `✅ *${label} xaritaga qo'shildi!*\n50-60-70+ da yaqinlashgan haydovchilarni Yordamchi bot ogohlantiradi.`,
            { parse_mode: 'Markdown', reply_markup: mainKeyboard(id) }
          );
        }
      } else {
        pendingHazard.set(id, hType);
        await ctx.reply(
          `📍 *${label} ni belgilash uchun joylashuvingizni yuboring* (yoki xaritadan belgilang):`,
          { parse_mode: 'Markdown', reply_markup: statusKeyboard() }
        );
      }
      return;
    }

    if (text === BTN_STATUS) {
      activeChatTarget.delete(id);
      await ctx.reply(`🎭 *${m.name}*, hozir nima qilyapsiz? Tanlang:`, {
        parse_mode: 'Markdown',
        reply_markup: statusKeyboard(),
      });
      return;
    }

    if (text === BTN_CHAT) {
      const others = store.all().filter((x) => x.id !== id);
      if (!others.length) {
        await ctx.reply("Hozircha uyda sizdan boshqa a'zo yo'q.", { reply_markup: mainKeyboard(id) });
        return;
      }
      await ctx.reply("💬 *Kim bilan lichkada gaplashmoqchisiz?* Tanlang:", {
        parse_mode: 'Markdown',
        reply_markup: chatMembersKeyboard(id),
      });
      return;
    }

    if (text === BTN_BACK) {
      activeChatTarget.delete(id);
      await ctx.reply('🏠 Asosiy menyu:', { reply_markup: mainKeyboard(id) });
      return;
    }

    // "💬 Ism" tugmasi bosilganda suhbatdoshni tanlash
    if (text.startsWith('💬 ')) {
      const targetName = text.slice(2).trim().toLowerCase();
      const target = store.all().find((x) => x.id !== id && x.name.toLowerCase() === targetName);
      if (target) {
        activeChatTarget.set(id, target.id);
        await ctx.reply(
          `💬 *${target.name}* bilan suhbat ochildi!\n` +
          `✍️ Endi shu yerga xabar yozsangiz, *${target.name}*ning lichkasiga boradi va 3D uyda personajingiz uning yoniga borib gapiradi:`,
          { parse_mode: 'Markdown', reply_markup: chatMembersKeyboard(id) }
        );
        return;
      }
    }

    // 3. Holat tugmalaridan biri bosilganda
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
        reply_markup: mainKeyboard(id),
      });
      return;
    }

    // 4. Lichkada suhbat yoki buyruq xabari
    const msgText = text.slice(0, 160);
    const lower = msgText.toLowerCase();
    const others = store.all().filter((x) => x.id !== id);
    const otherHumans = others.filter((x) => !x.isAi);

    let targetId = activeChatTarget.get(id);
    let target = targetId && others.find((x) => x.id === targetId);
    if (!target) {
      target = others.find((x) => lower.includes(x.name.toLowerCase()));
    }

    // 1. Mushuk bilan muloqot:
    if (target?.job === 'cat' || target?.id === 900002 || lower.includes('mushuk') || lower.includes('momiqvoy')) {
      store.say(id, msgText, 900002);
      const petReply = await handlePetCommand(m, 900002, msgText, store);
      await ctx.reply(petReply || `🐱 *Mushuk (Momiqvoy):* Miyovv... 🐾 (Yoningizga keldi)`, {
        parse_mode: 'Markdown',
        reply_markup: mainKeyboard(id),
      });
      return;
    }

    // 2. Kuchuk / It bilan muloqot:
    if (target?.job === 'dog' || target?.id === 900003 || lower.includes('kuchuk') || lower.includes('bobik') || lower.includes(' it ') || lower === 'it') {
      store.say(id, msgText, 900003);
      const petReply = await handlePetCommand(m, 900003, msgText, store);
      await ctx.reply(petReply || `🐶 *It (Bobik):* Vov-vov! 🐾 (Dumini likillatib keldi)`, {
        parse_mode: 'Markdown',
        reply_markup: mainKeyboard(id),
      });
      return;
    }

    // 3. Agar Robot ataylab chaqirilgan bo'lsa:
    const isExplicitRobot = target?.job === 'robot' || target?.id === 900001 ||
                            lower.startsWith('robot') || lower.includes(' robot ') ||
                            lower.includes('ey robot') || lower.includes('ey bot');

    if (isExplicitRobot) {
      store.say(id, msgText, 900001);
      const dec = await handleRobotCommand(m, msgText, store);
      await ctx.reply(dec?.reply || `🤖 Buyruq qabul qilindi va 3D uyda bajarilmoqda!`, {
        reply_markup: mainKeyboard(id),
      });
      return;
    }

    // 4. Inson bilan suhbat:
    // Agar aniq odam tanlanmagan bo'lsa, lekin uyda faqat 1 ta boshqa inson bo'lsa (masalan Jamshid va Dilrabo):
    if (!target && otherHumans.length === 1) {
      target = otherHumans[0];
    }

    if (target && !target.isAi) {
      store.say(id, msgText, target.id);
      activeChatTarget.set(id, target.id);
      activeChatTarget.set(target.id, id);
      await bot.api.sendMessage(
        target.id,
        `💬 *[Mehmonxona] ${m.name} sizga yozdi:*\n${msgText}`,
        { parse_mode: 'Markdown', reply_markup: mainKeyboard(target.id) }
      ).catch((err) => console.error('Telegramga yuborishda xatolik:', err?.description || err?.message));
      await ctx.reply(`✅ *${target.name}*ga yuborildi (3D uyda borib aytdi!)`, {
        parse_mode: 'Markdown',
        reply_markup: mainKeyboard(id),
      });
      return;
    }

    // Agar uyda bir nechta odam bo'lsa va kimga yozish tanlanmagan bo'lsa:
    if (otherHumans.length > 1 && !target) {
      await ctx.reply(
        `💬 *Xabaringizni kimga yubormoqchisiz?*\n` +
        `Iltimos, pastdagi tugmalardan birini tanlang:`,
        {
          parse_mode: 'Markdown',
          reply_markup: chatMembersKeyboard(id),
        }
      );
      return;
    }

    // Agar umuman boshqa inson bo'lmasa, robotga yo'naltirish:
    store.say(id, msgText, 900001);
    const dec = await handleRobotCommand(m, msgText, store);
    await ctx.reply(dec?.reply || `🤖 Xabar qabul qilindi va 3D uyda ko'rindi!`, {
      reply_markup: mainKeyboard(id),
    });
    return;
  });

  bot.catch((err) => console.error('Bot xatosi:', err.error || err));

  await bot.init();
  await bot.api.setChatMenuButton({
    menu_button: { type: 'commands' },
  }).catch(() => {});
  await bot.api.setMyCommands([
    { command: 'start', description: "A'zo bo'lish va tugmalar" },
    { command: 'xona', description: "3D Uyni telefonda / PC'da ochish" },
    { command: 'sozlama', description: "⚙️ 24/7 Datchik sozlamalarini ochish" },
    { command: 'profil', description: "Ism, yosh va kasbni o'zgartirish" },
    { command: 'holat', description: "Oila a'zolari holati" },
    { command: 'uy', description: 'Uy manzilini belgilash' },
  ]).catch((err) => console.warn('setMyCommands xatosi:', err.message));

  let stopped = false;
  const launchPolling = () => {
    if (stopped) return;
    bot.start({
      drop_pending_updates: false,
      onStart: () => {
        console.log(`🤖 Telegram bot ulandi: @${bot.botInfo.username}`);
        onStatus?.({ ok: true, username: bot.botInfo.username });
      },
    }).catch((err) => {
      console.error('Bot start xatosi (5s dan keyin qayta ulanadi):', err.message || err);
      if (!stopped) setTimeout(launchPolling, 5000);
    });
  };
  launchPolling();

  return bot.botInfo.username;
}

// 3D Xona ichidan personaj ustiga bosib xabar yozilganda yoki holat o'zgartirilganda
async function handleRoomAction(payload) {
  if (!payload || typeof payload !== 'object') return;

  // APK ulanishi yoki fon rejimda Real-Time keladigan GPS joylashuv
  if (payload.type === 'apk_ping' || payload.type === 'auto_location') {
    const id = Number(payload.id);
    if (!id) return;
    const m = store.get(id);
    if (!m || m.isAi) return;

    const wasInstalled = Boolean(m.apkInstalled);
    m.lastApkPing = Date.now();
    m.apkInstalled = true;
    if (payload.apkVer != null && Number.isFinite(Number(payload.apkVer))) {
      m.apkVer = Number(payload.apkVer);
    }
    store.save();

    if ((!wasInstalled || !m.welcomeSent) && bot) {
      m.welcomeSent = true;
      store.save();
      const baseUrl = getPublicUrlFn();
      const personalUrl = `${baseUrl}${baseUrl.includes('?') ? '&' : '?'}uid=${id}&v=45`;
      const ikb = new InlineKeyboard().webApp("🏠 3D Uyga kirish", personalUrl);

      bot.api.sendMessage(
        id,
        `✅ *Hammasini bajardingiz! Endi uyga kirishingiz mumkin.*\n\n` +
        `Fon GPS datchigi 24/7 jonli rejimda muvaffaqiyatli ishga tushdi.\n\n` +
        `🏠 3D Uyga kirish uchun pastdagi tugmani bosing:`,
        { parse_mode: 'Markdown', reply_markup: ikb }
      ).catch(() => {});

      bot.api.sendMessage(
        id,
        `Pastdagi doimiy menyu tugmalari ham faollashdi:`,
        { reply_markup: mainKeyboard() }
      ).catch(() => {});
    }

    if (payload.type === 'apk_ping') {
      if (m.location && Number.isFinite(m.location.lat)) {
        m.location.live = true;
        m.location.liveUntil = Date.now() + 86_400_000;
        m.location.at = new Date().toISOString();
        store.save();
        store.emit('change');
      }
      if (payload.source === 'android_apk' && Number(payload.apkVer || 0) >= 21) {
        const voice = road.consumeVoice(id);
        if (voice) return { voice };
      }
      return;
    }

    if (payload.type === 'auto_location') {
      const lat = Number(payload.lat);
      const lon = Number(payload.lon);
      const accuracy = payload.accuracy != null ? Number(payload.accuracy) : null;
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return;
      if (accuracy != null && accuracy > 120) return;
      const speed = payload.speed != null && Number.isFinite(Number(payload.speed)) ? Number(payload.speed) : null;
      const provider = typeof payload.provider === 'string' ? payload.provider : null;
      if (payload.source === 'android_apk') m.lastApkLocationAt = Date.now();
      else if (m.lastApkLocationAt && Date.now() - m.lastApkLocationAt < 120_000) return;

      if (!store.getHome()) {
        store.setHome(lat, lon, m.name);
      }
      store.updateLocation(id, {
        lat,
        lon,
        accuracy,
        speed,
        provider,
        live: true,
        liveUntil: Date.now() + 86_400_000,
      });
      if (payload.source === 'android_apk' && Number(payload.apkVer || 0) >= 21) {
        const voice = road.consumeVoice(id);
        if (voice) return { voice };
      }
    }
    return;
  }

  if (payload.type === 'voice_ack') {
    const id = Number(payload.id);
    if (id && payload.key) road.ackVoice(id, String(payload.key));
    return;
  }

  if (payload.type === 'send_apk') {
    const id = Number(payload.id);
    if (id) await sendApkToChat(id).catch(() => {});
    return;
  }

  if (payload.type === 'status') {
    const id = Number(payload.id);
    const m = store.get(id);
    if (m && STATUSES[payload.status]) {
      store.update(id, { status: payload.status });
    }
    return;
  }

  if (payload.type === 'robot_cmd') {
    const fromId = payload.fromId ? Number(payload.fromId) : null;
    const from = fromId ? store.get(fromId) : null;
    const text = String(payload.text || '').trim().slice(0, 160);
    if (!text) return;
    await handleRobotCommand(from, text, store);
    return;
  }

  if (payload.type === 'pet_cmd') {
    const fromId = payload.fromId ? Number(payload.fromId) : null;
    const from = fromId ? store.get(fromId) : null;
    const petId = Number(payload.petId);
    const text = String(payload.text || '').trim().slice(0, 160);
    await handlePetCommand(from, petId, text, store);
    return;
  }

  if (payload.type === 'say') {
    const fromId = Number(payload.fromId);
    const toId = payload.toId ? Number(payload.toId) : null;
    const text = String(payload.text || '').trim().slice(0, 160);
    if (!text) return;

    const from = store.get(fromId);
    let to = toId ? store.get(toId) : null;
    if (!from) return;

    if (to?.job === 'robot') {
      await handleRobotCommand(from, text, store);
      return;
    }
    if (to?.job === 'cat' || to?.job === 'dog') {
      await handlePetCommand(from, to.id, text, store);
      return;
    }

    // Agar kimga yozish tanlanmagan bo'lsa, lekin uyda faqat 1 ta boshqa inson bo'lsa:
    const others = store.all().filter((x) => x.id !== from.id);
    const otherHumans = others.filter((x) => !x.isAi);
    if (!to && otherHumans.length === 1) {
      to = otherHumans[0];
    }

    store.say(from.id, text, to?.id || null);

    // Faqat qabul qiluvchining o'z lichkasiga yuboriladi (guruhga chiqarilmaydi!)
    if (to && !to.isAi && to.id !== from.id && bot) {
      activeChatTarget.set(to.id, from.id);
      activeChatTarget.set(from.id, to.id);
      bot.api.sendMessage(
        to.id,
        `💬 *[Mehmonxona] ${from.name} sizga yozdi:*\n${text}`,
        { parse_mode: 'Markdown', reply_markup: mainKeyboard(to.id) }
      ).catch((err) => console.error('3D xonadan xabar yuborishda xatolik:', err?.description || err?.message));
    }
  }
}

async function stopBot() {
  if (bot) await bot.stop().catch(() => {});
}

module.exports = { startBot, stopBot, handleRoomAction, STATUSES };

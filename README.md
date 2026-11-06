# 🏠 Oilaviy Uy

Telegram bot va 3D cartoon xona. Oila a'zolari botga qo'shiladi va kompyuterdagi xonada stulda o'tirgan personaj bo'lib paydo bo'ladi.

## Ishga tushirish

1. `.env` faylida `BOT_TOKEN` bo'lishi kerak (namuna: `.env.example`)
2. `start.bat` ni ikki marta bosing (yoki `npm install`, keyin `npm start`)

## Bot buyruqlari

| Buyruq / tugma | Nima qiladi |
|---|---|
| `/start` | Ism kiritib a'zo bo'lish |
| `/holat` | Barcha a'zolar holati va uydan masofasi |
| `/ism` | Ismni o'zgartirish |
| `/uy` | Uy manzilini xaritada belgilash (150 m radius) |
| `/joylashuv` | Jonli joylashuvni (Live Location) yoqish yo'riqnomasi |
| 📍 Joylashuvni yuborish | Hozirgi joylashuvni xaritaga yuborish |
| 🏠 Uydaman | Personaj eshikdan kirib, stuliga o'tiradi |
| 💼 Ishdaman / 🏫 O'qishdaman / 🚶 Tashqaridaman | Personaj eshikdan chiqib ketadi |
| Oddiy xabar | Xonada personaj ustida gap pufagi 💬 |

## Tuzilma

```
src/
  main.js        Electron oynasi va botni ishga tushirish
  bot.js         Telegram bot (grammY)
  store.js       A'zolar bazasi (data/members.json)
  preload.js     Oyna va asosiy jarayon orasidagi ko'prik
  renderer/
    app.js       3D sahna, kamera, panel
    room.js      Xona, mebel, eshik, soat, kecha/kunduz
    character.js Chibi personaj va animatsiyalar
```

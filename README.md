# IT Park Rezident Filtri — Cloudflare Workers

Kompaniya havolasi yoki nomi berilganda — internetdan qidirib, uni Vazirlar Mahkamasining 2019-yil 15-iyuldagi **589-son** qarori bilan tasdiqlangan Nizomning 2-ilovasidagi **30 ta ruxsat etilgan faoliyat turiga** solishtiruvchi veb-sayt.

Claudedan mustaqil ishlaydi. Manzil: `https://itpark-filtr.<ismingiz>.workers.dev`

**Hamma narsa bepul.** Bank kartasi hech qayerda so'ralmaydi.

---

## Nega Cloudflare

| | Cloudflare Workers | Vercel Hobby |
|---|---|---|
| Tijoriy/tashkilot foydalanishi | **ruxsat** | ruxsat etilmagan |
| So'rovlar | 100 000/kun | cheklangan |
| Tahlil davomiyligi | **cheklanmagan** | 60 soniya |
| Statik fayllar | bepul, cheksiz | hisobga olinadi |
| Baza (KV) | bepul | alohida xizmat |

---

## Qanday ishlaydi

```
Foydalanuvchi              Sayt (brauzer)         Worker (/api)          Tashqi xizmatlar
─────────────              ──────────────         ─────────────          ────────────────
havola tashlaydi  ──────▶  POST /api/analyze ──▶  nom ajratiladi
                                                  qidiruv so'rovi  ──▶   Tavily (bepul)
                                                  dosye yig'iladi  ◀──   (6 ta manba)
                                                  prompt + 30 band ──▶   Gemini (bepul)
                           xulosa ko'rsatiladi ◀─ JSON natija      ◀──
                                                  reestrga yoziladi ──▶  Cloudflare KV
```

API kalitlari **faqat Worker ichida** turadi — brauzerga hech qachon chiqmaydi.

---

## 1-qadam. Hisoblar

To'rttasi, hammasi bepul, **karta so'ralmaydi**:

| Xizmat | Nima uchun | Qayerdan |
|---|---|---|
| GitHub | kodni saqlash | github.com |
| Cloudflare | saytni internetga chiqarish | dash.cloudflare.com |
| Google AI Studio | tahlil (Gemini) | aistudio.google.com/apikey |
| Tavily | internetdan qidirish | app.tavily.com |

**Bir tahlil:** Tavily'dan 2 kredit + Gemini'dan 1 so'rov → oyiga ~500 ta kompaniya bepul.

Gemini kalitini olayotganda model nomini ham ko'rib qo'ying. Kodda `gemini-3.5-flash` turibdi — agar bepul modellar ro'yxatida u bo'lmasa, `AI_MODEL` qiymatini o'zgartirasiz.

---

## 2-qadam. Kodni GitHub'ga yuklash

1. github.com → **New repository** → nomi `itpark-filtr` → **Private** → Create
2. **uploading an existing file** havolasini bosing
3. Shu papkadagi **hamma fayl va papkalarni** sudrab tashlang
4. **Commit changes**

---

## 3-qadam. Cloudflare'ga ulash

1. dash.cloudflare.com → chap menyuda **Compute (Workers)**
2. **Create** → **Import a repository** (yoki *Connect to Git*)
3. GitHub hisobingizni ulang → `itpark-filtr` repozitoriysini tanlang
4. Sozlamalarni tegmasdan qoldiring:
   - Build command: bo'sh
   - Deploy command: `npx wrangler deploy`
5. **Create and deploy**

Bir daqiqada manzilingiz tayyor bo'ladi: `itpark-filtr.<ismingiz>.workers.dev`

Sayt ochiladi, lekin hali ishlamaydi — kalitlar yo'q.

---

## 4-qadam. Kalitlarni kiritish

Cloudflare paneli → Worker'ingiz → **Settings** → **Variables and Secrets** → **Add**.

Oltitasini birma-bir qo'shasiz:

| Nomi | Turi | Qiymati |
|---|---|---|
| `AI_BASE_URL` | Text | `https://generativelanguage.googleapis.com/v1beta/openai` |
| `AI_MODEL` | Text | `gemini-3.5-flash` |
| `AI_API_KEY` | **Secret** | AI Studio'dan olingan kalit |
| `TAVILY_API_KEY` | **Secret** | `tvly-...` |
| `SITE_PASSWORD` | **Secret** | jamoa uchun kirish paroli |
| `SESSION_SECRET` | **Secret** | uzun tasodifiy satr |

Kalitlarni **Secret** turida qo'shing — shunda ular panelda ham ko'rinmaydi.

Saqlagandan keyin **Deploy** tugmasini bosing yoki GitHub'ga bitta o'zgarish yuboring.

---

## 5-qadam. Sinash

Saytni oching → parolni kiriting → matn maydonidagi namuna havola bilan **Tahlil qilish**.

15–40 soniyada xulosa chiqadi. Chiqmasa: Worker → **Logs** → **Begin log stream** — aniq xatolik ko'rinadi.

---

## 6-qadam (ixtiyoriy). Umumiy reestr

Bazasiz ham sayt ishlaydi, lekin reestr har kimning o'z brauzerida saqlanadi. Butun jamoa bitta ro'yxatni ko'rishi uchun:

1. Cloudflare paneli → **Storage & Databases** → **KV** → **Create namespace** → nomi `itpark-reestr`
2. Yaratilgan namespace'ning **ID** sini nusxalang
3. `wrangler.toml` faylini GitHub'da ochib tahrirlang — quyidagi uch qatordan `#` ni olib tashlang va ID ni qo'ying:

```toml
[[kv_namespaces]]
binding = "REESTR"
id = "BU_YERGA_KV_ID"
```

4. **Commit changes** — Cloudflare o'zi qayta deploy qiladi

---

## Chegaralar

| Nima | Bepul chegara | Yetganda nima bo'ladi |
|---|---|---|
| Cloudflare so'rovlar | 100 000/kun | amalda yetib bo'lmaydi |
| Cloudflare protsessor | 10 ms/so'rov | kod shunga moslangan |
| Tavily | 1000 kredit/oy (~500 tahlil) | "kredit tugadi" xabari |
| Gemini | kunlik so'rov limiti | "chegaraga yetildi" xabari |
| Cloudflare KV | 100 000 o'qish/kun | amalda yetarli |

Chegaraga yetilsa sayt buzilmaydi — foydalanuvchiga tushunarli xabar chiqadi.

**Kreditni cho'zish:** `TAVILY_DEPTH` o'zgaruvchisini `basic` qilib qo'ysangiz, bir tahlil 2 kredit o'rniga 1 kredit yeydi — oyiga ~1000 tahlil.

---

## Fayllar tuzilishi

```
itpark-filtr/
├── public/
│   └── index.html        Butun interfeys — dizayn, 30 ta band, natija chizish
├── src/
│   ├── index.js          Worker: marshrutlash + uchta endpoint
│   ├── bandlar.js        30 ta band — qonundagi to'liq matni bilan
│   ├── prompt.js         AI'ga beriladigan ko'rsatma
│   ├── qidiruv.js        Tavily / Parallel
│   ├── ai.js             AI provayder (OpenAI formatida)
│   └── auth.js           Parol va cookie (Web Crypto)
├── wrangler.toml         Cloudflare sozlamalari
├── .dev.vars.example     Lokal sinov uchun namuna
└── README.md
```

---

## Nimani qayerdan sozlash kerak

| Nima o'zgartirmoqchisiz | Qayerda |
|---|---|
| Xulosa juda yumshoq / juda qattiq | `src/prompt.js` — qoidalar ro'yxati |
| Qonun o'zgardi, band qo'shildi | `src/bandlar.js` |
| Qidiruv noto'g'ri kompaniyani topyapti | `src/qidiruv.js` — so'rov matnlari |
| Ranglar, matnlar, dizayn | `public/index.html` |
| AI modeli, parol, kalitlar | Cloudflare paneli → Variables and Secrets |

---

## O'z domeningiz kerak bo'lsa

Worker → **Settings** → **Domains & Routes** → **Add** → **Custom domain**. Domen Cloudflare'da turgan bo'lsa, boshqa hech narsa qilish shart emas.

---

## Muhim eslatma

Sayt beradigan xulosa — **dastlabki tahlil**, rasmiy qaror emas. Yakuniy qaror IT Park komissiyasi zimmasida. Bu vosita komissiyaga tayyorgarlikni tezlashtirish uchun.

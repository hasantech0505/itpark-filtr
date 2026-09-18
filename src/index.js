// Cloudflare Worker — butun backend shu bitta faylda marshrutlanadi.
//
//   /api/login    parol → cookie
//   /api/analyze  qidiruv → AI → tahlil
//   /api/reestr   tekshirilganlar ro'yxati (KV)
//   qolgani       public/ papkasidagi statik fayllar

import { ruxsatBormi, tokenYasash, tokenTekshir, cookieOqish, cookieSarlavhasi } from "./auth.js";
import { qidirish, qidiruvKerakmi } from "./qidiruv.js";
import { promptYasash } from "./prompt.js";
import { soragJSON } from "./ai.js";

const KV_KALIT = "yozuvlar";
const REESTR_CHEGARA = 100;

function javob(obj, status = 200, sarlavhalar = {}) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Cache-Control": "no-store",
      ...sarlavhalar
    }
  });
}

async function tanaOqish(request) {
  try { return await request.json(); } catch { return {}; }
}

// ── /api/login ────────────────────────────────────────────────────────

async function login(request, env) {
  const himoyaYoqmi = Boolean(env.SITE_PASSWORD);

  if (request.method === "GET") {
    return javob({
      himoya: himoyaYoqmi,
      kirgan: !himoyaYoqmi || (await tokenTekshir(cookieOqish(request), env))
    });
  }
  if (request.method !== "POST") return javob({ xato: "faqat_post" }, 405);
  if (!himoyaYoqmi) return javob({ kirgan: true });

  const { parol } = await tanaOqish(request);
  if (String(parol || "") !== env.SITE_PASSWORD) {
    await new Promise((r) => setTimeout(r, 800)); // sekinlashtiramiz
    return javob({ xato: "notogri_parol", xabar: "Parol notoʻgʻri." }, 401);
  }

  return javob({ kirgan: true }, 200, { "Set-Cookie": cookieSarlavhasi(await tokenYasash(env)) });
}

// ── /api/analyze ──────────────────────────────────────────────────────

async function analyze(request, env) {
  if (request.method !== "POST") return javob({ xato: "faqat_post" }, 405);
  if (!(await ruxsatBormi(request, env)))
    return javob({ xato: "kirish_kerak", xabar: "Avval parol bilan kiring." }, 401);

  const { kirish: xom } = await tanaOqish(request);
  const kirish = String(xom || "").trim();

  if (kirish.length < 3)
    return javob({ xato: "qisqa", xabar: "Havola, kompaniya nomi yoki tavsifini kiriting." }, 400);
  if (kirish.length > 40000)
    return javob({ xato: "uzun", xabar: "Matn juda uzun. Eng muhim qismini qoldiring." }, 400);

  try {
    let dosye = kirish;
    let manbalar = [];
    const qidirildi = qidiruvKerakmi(kirish);

    if (qidirildi) {
      const topildi = await qidirish(kirish, env);
      dosye = topildi.matn;
      manbalar = topildi.manbalar;
    }

    const natija = await soragJSON(promptYasash(dosye), env);

    natija.manbalar = manbalar;
    natija.qidirildi = qidirildi;
    natija.havola = /^(https?:\/\/|www\.)\S+$/i.test(kirish) ? kirish : "";
    natija.sana = new Date().toISOString().slice(0, 10);
    natija.vaqt = new Date().toISOString();

    return javob(natija);
  } catch (e) {
    const matn = String(e.message || e);
    console.error("analyze xatosi:", matn);

    if (matn.startsWith("LIMIT:")) {
      return javob({ xato: "limit", xabar: matn.replace("LIMIT:", "").trim() }, 429);
    }
    return javob({
      xato: "tahlil_xatosi",
      xabar: "Tahlil bajarilmadi. Bir ozdan keyin qayta urinib koʻring.",
      texnik: matn.slice(0, 300)
    }, 502);
  }
}

// ── /api/reestr ───────────────────────────────────────────────────────

async function reestr(request, env) {
  if (!(await ruxsatBormi(request, env)))
    return javob({ xato: "kirish_kerak", xabar: "Avval parol bilan kiring." }, 401);

  if (!env.REESTR) {
    return javob({ xato: "baza_yoq", xabar: "Baza ulanmagan — reestr brauzerda saqlanadi." }, 501);
  }

  try {
    if (request.method === "GET") {
      const yozuvlar = (await env.REESTR.get(KV_KALIT, { type: "json" })) || [];
      return javob({ yozuvlar });
    }

    if (request.method === "POST") {
      const y = await tanaOqish(request);
      if (!y || !y.kompaniya) return javob({ xato: "notogri_yozuv" }, 400);

      const bor = (await env.REESTR.get(KV_KALIT, { type: "json" })) || [];
      bor.unshift(y);
      await env.REESTR.put(KV_KALIT, JSON.stringify(bor.slice(0, REESTR_CHEGARA)));
      return javob({ ok: true });
    }

    return javob({ xato: "notogri_metod" }, 405);
  } catch (e) {
    console.error("reestr xatosi:", String(e.message || e));
    return javob({ xato: "baza_xatosi", texnik: String(e.message || e).slice(0, 200) }, 502);
  }
}

// ── marshrutlash ──────────────────────────────────────────────────────

export default {
  async fetch(request, env) {
    const yol = new URL(request.url).pathname;

    if (yol === "/api/login") return login(request, env);
    if (yol === "/api/analyze") return analyze(request, env);
    if (yol === "/api/reestr") return reestr(request, env);

    // Statik fayllar (public/). Odatda bu yergacha yetib kelmaydi —
    // Cloudflare ularni Worker'gacha o'zi uzatadi.
    if (env.ASSETS) return env.ASSETS.fetch(request);
    return new Response("Topilmadi", { status: 404 });
  }
};

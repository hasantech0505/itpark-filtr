// AI provayderi — OpenAI formatidagi istalgan xizmat bilan ishlaydi.
// Standart: Google Gemini bepul tarifi (bank kartasi talab qilinmaydi).
//
// Almashtirish uchun Cloudflare'dagi o'zgaruvchilarni tahrirlaysiz, kod o'zgarmaydi:
//
//   Gemini (BEPUL)  AI_BASE_URL=https://generativelanguage.googleapis.com/v1beta/openai
//                   AI_MODEL=gemini-3.5-flash
//   Groq (BEPUL)    AI_BASE_URL=https://api.groq.com/openai/v1
//                   AI_MODEL=llama-3.3-70b-versatile
//   OpenRouter      AI_BASE_URL=https://openrouter.ai/api/v1
//   OpenAI          AI_BASE_URL=https://api.openai.com/v1      AI_MODEL=gpt-4o

const STANDART_BASE = "https://generativelanguage.googleapis.com/v1beta/openai";
const STANDART_MODEL = "gemini-3.5-flash";

async function sorov(base, kalit, tana, env) {
  return fetch(`${base}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${kalit}`,
      // OpenRouter statistikasi uchun; boshqalar e'tiborsiz qoldiradi
      "HTTP-Referer": env.SITE_URL || "https://itpark-filtr.workers.dev",
      "X-Title": "IT Park Rezident Filtri"
    },
    body: JSON.stringify(tana)
  });
}

/**
 * AI'ga so'rov yuboradi va javobni JSON obyekt sifatida qaytaradi.
 * @returns {Promise<object>}
 */
export async function soragJSON(prompt, env) {
  const base = (env.AI_BASE_URL || STANDART_BASE).replace(/\/$/, "");
  const kalit = env.AI_API_KEY;
  const model = env.AI_MODEL || STANDART_MODEL;
  if (!kalit) throw new Error("AI_API_KEY o'rnatilmagan.");

  const asos = {
    model,
    messages: [{ role: "user", content: prompt }],
    temperature: 0.2,
    max_tokens: 4000
  };

  // Avval qat'iy JSON rejimida. Provayder qo'llamasa — parametrsiz qayta yuboramiz.
  let r = await sorov(base, kalit, { ...asos, response_format: { type: "json_object" } }, env);

  if (r.status === 400) {
    const matn = await r.text();
    if (/response_format|json_object|unsupported|invalid.*param/i.test(matn)) {
      r = await sorov(base, kalit, asos, env);
    } else {
      throw new Error(`AI 400: ${matn.slice(0, 300)}`);
    }
  }

  if (r.status === 429) {
    throw new Error("LIMIT: bepul tarif chegarasiga yetildi. Bir necha daqiqadan keyin qayta urinib koʻring.");
  }
  if (!r.ok) {
    throw new Error(`AI ${r.status}: ${(await r.text()).slice(0, 300)}`);
  }

  const j = await r.json();
  const javob = j?.choices?.[0]?.message?.content;
  if (!javob) throw new Error("AI bo'sh javob qaytardi.");
  return jsonAjratish(javob);
}

/** Javob ichidan JSON qiymatni bardoshli tarzda ajratib oladi. */
function jsonAjratish(matn) {
  const s = String(matn).trim();

  try { return JSON.parse(s); } catch { /* davom etamiz */ }

  const fence = s.match(/```(?:json)?\s*([\s\S]*?)```/i);
  if (fence) {
    try { return JSON.parse(fence[1].trim()); } catch { /* davom etamiz */ }
  }

  const bosh = s.indexOf("{");
  const oxir = s.lastIndexOf("}");
  if (bosh !== -1 && oxir > bosh) {
    try { return JSON.parse(s.slice(bosh, oxir + 1)); } catch { /* davom etamiz */ }
  }

  throw new Error("AI javobidan JSON ajratib bo'lmadi. Modelni kuchliroqqa almashtiring.");
}

// Internetdan kompaniya haqida ma'lumot yig'ish.
// Cloudflare bepul tarifida bir so'rovga 10 ms protsessor vaqti beriladi,
// shuning uchun natijalar darhol qisqartiriladi — katta matnlar bilan ishlamaymiz.

const MAX_NATIJA = 6;       // nechta manba olinadi
const MAX_BELGI = 3000;     // har bir manbadan nechta belgi
const UMUMIY_BUDJET = 26000; // AI so'roviga ketadigan umumiy hajm

/** Havoladan kompaniya nomini ajratib oladi. */
export function nomAjratish(kirish) {
  const s = String(kirish || "").trim();
  if (!/^(https?:\/\/|www\.)\S+$/i.test(s)) return s;
  try {
    const u = new URL(/^https?:\/\//i.test(s) ? s : "https://" + s);
    const li = u.pathname.match(/\/(?:company|school|organization)\/([^/?#]+)/i);
    if (li) return decodeURIComponent(li[1]).replace(/[-_+]+/g, " ").trim();
    return u.hostname.replace(/^www\./i, "").split(".")[0].replace(/[-_]+/g, " ").trim();
  } catch {
    return s;
  }
}

/** Kirish havola yoki qisqa nom bo'lsa — qidiruv kerak. Uzun tavsif bo'lsa — kerak emas. */
export function qidiruvKerakmi(kirish) {
  const s = String(kirish || "").trim();
  if (/^(https?:\/\/|www\.)\S+$/i.test(s)) return true;
  return !s.includes("\n") && s.length <= 120 && s.split(/\s+/).length <= 8;
}

// ── Tavily ────────────────────────────────────────────────────────────
// Bepul tarif: oyiga 1000 kredit. basic = 1 kredit, advanced = 2 kredit.

async function tavilySorov(q, env) {
  const chuqurlik = env.TAVILY_DEPTH || "advanced";
  const r = await fetch("https://api.tavily.com/search", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${env.TAVILY_API_KEY}`
    },
    body: JSON.stringify({
      query: q,
      search_depth: chuqurlik,
      ...(chuqurlik === "advanced" ? { chunks_per_source: 3 } : {}),
      max_results: MAX_NATIJA
    })
  });
  if (r.status === 429) throw new Error("LIMIT: Tavily oylik bepul krediti tugadi.");
  if (!r.ok) throw new Error(`Tavily ${r.status}: ${(await r.text()).slice(0, 200)}`);

  const j = await r.json();
  return (j.results || []).map((x) => ({
    url: x.url,
    sarlavha: x.title,
    matn: String(x.content || "").slice(0, MAX_BELGI)
  }));
}

// ── Parallel (muqobil) ────────────────────────────────────────────────

async function parallelSorov(nom, env) {
  const r = await fetch("https://api.parallel.ai/v1/search", {
    method: "POST",
    headers: { "Content-Type": "application/json", "x-api-key": env.PARALLEL_API_KEY },
    body: JSON.stringify({
      objective: `What does the company "${nom}" do: services, products, business model, revenue sources, own software, employee count`,
      search_queries: [`${nom} company about`, `${nom} services business model`],
      max_results: MAX_NATIJA
    })
  });
  if (r.status === 429) throw new Error("LIMIT: Parallel so'rov chegarasiga yetildi.");
  if (!r.ok) throw new Error(`Parallel ${r.status}: ${(await r.text()).slice(0, 200)}`);

  const j = await r.json();
  return (j.results || []).map((x) => ({
    url: x.url,
    sarlavha: x.title,
    matn: (Array.isArray(x.excerpts) ? x.excerpts.join("\n") : String(x.excerpts || "")).slice(0, MAX_BELGI)
  }));
}

/**
 * Kompaniyani qidiradi va tahlil uchun "dosye" matnini qaytaradi.
 * @returns {Promise<{matn: string, manbalar: string[], nom: string}>}
 */
export async function qidirish(kirish, env) {
  const nom = nomAjratish(kirish);

  let xom;
  if (env.TAVILY_API_KEY) {
    xom = await tavilySorov(`${nom} company about services business model`, env);
    // Natija kam bo'lsa — qo'shimcha so'rov (+kredit)
    if (xom.length < 3) {
      xom = xom.concat(await tavilySorov(`"${nom}" what the company does revenue`, env));
    }
  } else if (env.PARALLEL_API_KEY) {
    xom = await parallelSorov(nom, env);
  } else {
    throw new Error("Qidiruv kaliti yo'q: TAVILY_API_KEY yoki PARALLEL_API_KEY o'rnating.");
  }

  const korilgan = new Set();
  const manbalar = [];
  const qismlar = [`Qidirilgan nom: ${nom}`, `Berilgan havola: ${kirish}`, ""];
  let budjet = UMUMIY_BUDJET;

  for (const x of xom) {
    if (!x.url || korilgan.has(x.url)) continue;
    korilgan.add(x.url);
    if (budjet <= 500) break;
    const blok = `--- MANBA: ${x.sarlavha || "nomsiz"} (${x.url}) ---\n${x.matn}`;
    qismlar.push(blok.slice(0, budjet));
    budjet -= blok.length;
    manbalar.push(x.url);
  }

  if (!manbalar.length) throw new Error("Qidiruv hech narsa topmadi.");
  return { matn: qismlar.join("\n\n"), manbalar, nom };
}

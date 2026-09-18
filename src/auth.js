// Oddiy parol himoyasi. Cloudflare Workers'da Node yo'q, shuning uchun
// imzo Web Crypto (crypto.subtle) orqali qo'yiladi.

const COOKIE = "itp_auth";
const MUDDAT = 30 * 24 * 60 * 60 * 1000; // 30 kun

function kalitMatni(env) {
  return env.SESSION_SECRET || env.SITE_PASSWORD || "o'zgartiring";
}

async function imzo(matn, env) {
  const kodlovchi = new TextEncoder();
  const kalit = await crypto.subtle.importKey(
    "raw",
    kodlovchi.encode(kalitMatni(env)),
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );
  const xom = await crypto.subtle.sign("HMAC", kalit, kodlovchi.encode(matn));
  // base64url
  let s = "";
  for (const bayt of new Uint8Array(xom)) s += String.fromCharCode(bayt);
  return btoa(s).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Doimiy vaqtli taqqoslash — parolni belgi-belgi topishga yo'l qo'ymaydi. */
function teng(a, b) {
  if (a.length !== b.length) return false;
  let farq = 0;
  for (let i = 0; i < a.length; i++) farq |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return farq === 0;
}

export async function tokenYasash(env) {
  const exp = String(Date.now() + MUDDAT);
  return exp + "." + (await imzo(exp, env));
}

export async function tokenTekshir(token, env) {
  if (!token || typeof token !== "string") return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig) return false;
  if (Number(exp) < Date.now()) return false;
  return teng(sig, await imzo(exp, env));
}

export function cookieOqish(request) {
  const xom = request.headers.get("Cookie") || "";
  for (const qism of xom.split(";")) {
    const [k, ...v] = qism.trim().split("=");
    if (k === COOKIE) return decodeURIComponent(v.join("="));
  }
  return null;
}

export function cookieSarlavhasi(token) {
  return [
    `${COOKIE}=${encodeURIComponent(token)}`,
    "Path=/",
    "HttpOnly",
    "Secure",
    "SameSite=Lax",
    `Max-Age=${Math.floor(MUDDAT / 1000)}`
  ].join("; ");
}

/**
 * Himoyalangan endpointlar uchun qo'riqchi.
 * SITE_PASSWORD o'rnatilmagan bo'lsa — himoya o'chiq.
 * @returns {Promise<boolean>}
 */
export async function ruxsatBormi(request, env) {
  if (!env.SITE_PASSWORD) return true;
  return tokenTekshir(cookieOqish(request), env);
}

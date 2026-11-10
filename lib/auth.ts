import crypto from "node:crypto";
import { cookies } from "next/headers";
import { getSetting, setSetting } from "./db";

const COOKIE = "heli_s";
type Auth = { hash: string; salt: string; secret: string };

export async function hasPassword() {
  return !!(await getSetting<Auth>("auth"));
}

const hashPw = (pw: string, salt: string) => crypto.scryptSync(pw, salt, 32).toString("hex");

export async function setPassword(pw: string) {
  const salt = crypto.randomBytes(16).toString("hex");
  const prev = await getSetting<Auth>("auth");
  const secret = prev?.secret || crypto.randomBytes(32).toString("hex");
  await setSetting("auth", { hash: hashPw(pw, salt), salt, secret });
  // секретный адрес для коннектора Claude создаётся один раз
  if (!(await getSetting<string>("mcp_key"))) await setSetting("mcp_key", crypto.randomBytes(24).toString("hex"));
}

export async function checkPassword(pw: string) {
  const a = await getSetting<Auth>("auth");
  if (!a) return false;
  const h = Buffer.from(hashPw(pw, a.salt));
  const good = Buffer.from(a.hash);
  return h.length === good.length && crypto.timingSafeEqual(h, good);
}

const sign = (secret: string, payload: string) => crypto.createHmac("sha256", secret).update(payload).digest("hex");

export async function startSession() {
  const a = await getSetting<Auth>("auth");
  if (!a) throw new Error("no auth");
  const payload = `v1.${Date.now()}`;
  (await cookies()).set(COOKIE, `${payload}.${sign(a.secret, payload)}`, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
  });
}

export async function endSession() {
  (await cookies()).delete(COOKIE);
}

export async function isAuthed() {
  const v = (await cookies()).get(COOKIE)?.value;
  if (!v) return false;
  const a = await getSetting<Auth>("auth");
  if (!a) return false;
  const i = v.lastIndexOf(".");
  const sig = v.slice(i + 1);
  const good = sign(a.secret, v.slice(0, i));
  return sig.length === good.length && crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(good));
}

/** Обёртка для API: только для вошедшего, ошибки — понятным ответом. */
export function guard<A extends unknown[]>(fn: (...a: A) => Promise<Response>) {
  return async (...a: A) => {
    try {
      if (!(await isAuthed())) return Response.json({ error: "auth" }, { status: 401 });
      return await fn(...a);
    } catch (e: any) {
      if (e?.message === "NO_DATABASE") return Response.json({ error: "no_db" }, { status: 503 });
      console.error(e);
      return Response.json({ error: e?.message || "error" }, { status: 500 });
    }
  };
}

/** Для расписания на Vercel: CRON_SECRET в заголовке. */
export function cronOk(req: Request) {
  const s = process.env.CRON_SECRET;
  if (!s) return true;
  return req.headers.get("authorization") === `Bearer ${s}`;
}

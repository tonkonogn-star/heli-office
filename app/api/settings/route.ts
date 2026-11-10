import { guard } from "@/lib/auth";
import { getSetting, setSetting } from "@/lib/db";
import crypto from "node:crypto";
import { keyStatus } from "@/lib/ext";
import { setupStripe } from "@/lib/extra";

export const dynamic = "force-dynamic";

/** Мелкие настройки: онбординг пройден, ключи, Instagram, адрес коннектора. Ключи наружу не отдаются. */
export const GET = guard(async (req: Request) => {
  const key = await getSetting<string>("mcp_key");
  let cal = await getSetting<string>("cal_key");
  if (!cal) {
    cal = crypto.randomBytes(16).toString("hex");
    await setSetting("cal_key", cal);
  }
  let hook = await getSetting<string>("hook_key");
  if (!hook) {
    hook = crypto.randomBytes(20).toString("hex");
    await setSetting("hook_key", hook);
  }
  const h = req.headers;
  await saveOrigin(h);
  const host = h.get("x-forwarded-host") || h.get("host");
  const origin = `${h.get("x-forwarded-proto") || "https"}://${host}`;
  return Response.json({ connector: key ? `${origin}/api/mcp/${key}` : null, calendar: `webcal://${host}/api/cal/${cal}.ics`, calendarHttps: `${origin}/api/cal/${cal}.ics`,
    keys: await keyStatus(),
    make: { out: !!(await getSetting<string>("make_hook")), in: `${origin}/api/hook/${hook}` },
    whoopRedirect: `${origin}/api/whoop/callback`,
  });
});

async function saveOrigin(h: Headers) {
  const host = h.get("x-forwarded-host") || h.get("host");
  const o = `${h.get("x-forwarded-proto") || "https"}://${host}`;
  if ((await getSetting<string>("origin")) !== o) await setSetting("origin", o);
}

export const POST = guard(async (req: Request) => {
  const b = await req.json();
  await saveOrigin(req.headers);
  // новый секретный адрес: старый сразу перестаёт работать в любом Claude, где был подключён
  if (b.rotateConnector) await setSetting("mcp_key", crypto.randomBytes(24).toString("hex"));
  if (b.rotateHook) await setSetting("hook_key", crypto.randomBytes(20).toString("hex"));
  if (b.make !== undefined) {
    const u = String(b.make || "").trim();
    if (u && !/^https:\/\/[^\s]+$/.test(u)) return Response.json({ ok: false, error: "Нужен адрес вебхука, начинается с https://" }, { status: 400 });
    await setSetting("make_hook", u || null);
  }
  if (b.whoopClient) {
    const cur = (await getSetting<any>("whoop")) || {};
    await setSetting("whoop", { ...cur, clientId: String(b.whoopClient.clientId || "").trim() || undefined, clientSecret: String(b.whoopClient.clientSecret || "").trim() || undefined });
  }
  if ("onboarded" in b) await setSetting("onboarded", !!b.onboarded);
  if (b.keys) {
    const k = (await getSetting<any>("keys")) || {};
    for (const [n, v] of Object.entries(b.keys)) {
      const s = String(v || "").trim();
      if (s) k[n] = s;
      else delete k[n];
    }
    await setSetting("keys", k);
    if (b.keys.stripe) {
      try {
        await setupStripe();
      } catch (e: any) {
        delete k.stripe;
        await setSetting("keys", k);
        return Response.json({ ok: false, error: String(e?.message || e) }, { status: 400 });
      }
    }
  }
  if (b.instagram !== undefined) {
    const h = String(b.instagram || "").trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/.*$/, "");
    await setSetting("instagram", h ? { connected: true, handle: h } : { connected: false });
  }
  return Response.json({ ok: true });
});

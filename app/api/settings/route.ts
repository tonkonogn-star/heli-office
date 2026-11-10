import { guard } from "@/lib/auth";
import { getSetting, setSetting } from "@/lib/db";
import crypto from "node:crypto";

export const dynamic = "force-dynamic";

/** Мелкие настройки: онбординг пройден, ключи, Instagram, адрес коннектора. Ключи наружу не отдаются. */
export const GET = guard(async (req: Request) => {
  const key = await getSetting<string>("mcp_key");
  let cal = await getSetting<string>("cal_key");
  if (!cal) {
    cal = crypto.randomBytes(16).toString("hex");
    await setSetting("cal_key", cal);
  }
  const h = req.headers;
  const host = h.get("x-forwarded-host") || h.get("host");
  const origin = `${h.get("x-forwarded-proto") || "https"}://${host}`;
  return Response.json({ connector: key ? `${origin}/api/mcp/${key}` : null, calendar: `webcal://${host}/api/cal/${cal}.ics`, calendarHttps: `${origin}/api/cal/${cal}.ics` });
});

export const POST = guard(async (req: Request) => {
  const b = await req.json();
  // новый секретный адрес: старый сразу перестаёт работать в любом Claude, где был подключён
  if (b.rotateConnector) await setSetting("mcp_key", crypto.randomBytes(24).toString("hex"));
  if ("onboarded" in b) await setSetting("onboarded", !!b.onboarded);
  if (b.keys) {
    const k = (await getSetting<any>("keys")) || {};
    for (const [n, v] of Object.entries(b.keys)) {
      const s = String(v || "").trim();
      if (s) k[n] = s;
      else delete k[n];
    }
    await setSetting("keys", k);
  }
  if (b.instagram !== undefined) {
    const h = String(b.instagram || "").trim().replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "").replace(/\/.*$/, "");
    await setSetting("instagram", h ? { connected: true, handle: h } : { connected: false });
  }
  return Response.json({ ok: true });
});

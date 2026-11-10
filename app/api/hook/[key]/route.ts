import { getSetting, q, newId } from "@/lib/db";
import { runTool, TOOLS } from "@/lib/tools";
import { runChat, apiKey } from "@/lib/chat";
import crypto from "node:crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Входящий адрес для Make и любых сервисов.
 *  {"text": "..."} — как сообщение помощнику (например, письмо со счётом из Gmail): он сам разберёт и запишет.
 *  {"tool": "add_expense", "input": {...}} — сразу записать нужным инструментом. */
export async function POST(req: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  const real = await getSetting<string>("hook_key");
  if (!real || key.length !== real.length || !crypto.timingSafeEqual(Buffer.from(key), Buffer.from(real))) return new Response("forbidden", { status: 403 });
  const b: any = await req.json().catch(() => null);
  if (!b) return Response.json({ ok: false, error: "Нужен JSON" }, { status: 400 });
  if (b.tool) {
    if (!TOOLS.some((t) => t.name === b.tool)) return Response.json({ ok: false, error: "Нет такого инструмента" }, { status: 400 });
    const r = await runTool(b.tool, b.input || {});
    return Response.json({ ok: true, result: r.result });
  }
  const text = String(b.text || "").trim();
  if (!text) return Response.json({ ok: false, error: "Нужно поле text или tool" }, { status: 400 });
  const msg = `[Из Make${b.source ? " · " + String(b.source).slice(0, 60) : ""}]\n${text.slice(0, 20000)}`;
  if (!(await apiKey())) {
    // помощник не подключён — сохраняем как дело, чтобы не потерялось
    await q("insert into tasks(id,space,title,notes) values($1,'general',$2,$3)", [newId("t"), text.slice(0, 80), msg]);
    return Response.json({ ok: true, result: "Сохранено как дело (помощник без ключа)." });
  }
  let out = "";
  await runChat("inbox", msg, [], (ev: any) => {
    if (ev.type === "text") out += ev.text;
  });
  return Response.json({ ok: true, result: out.trim() });
}

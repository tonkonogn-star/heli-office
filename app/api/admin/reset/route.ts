import { q } from "@/lib/db";

export const dynamic = "force-dynamic";

/** Полная очистка перед подарком: все данные, пароль и адрес коннектора. Только с CRON_SECRET. */
export async function POST(req: Request) {
  const s = process.env.CRON_SECRET;
  if (!s || req.headers.get("authorization") !== `Bearer ${s}`) return new Response("forbidden", { status: 403 });
  await q("truncate charges, invoices, flights, aircraft, deals, contracts, stages, expenses, sites, tasks, documents, messages, facts, clients, settings cascade");
  return Response.json({ ok: true, note: "Пусто. Первый, кто откроет приложение, задаст пароль." });
}

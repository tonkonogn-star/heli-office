import { cronOk } from "@/lib/auth";
import { q } from "@/lib/db";
import { draftInvoices, monthName } from "@/lib/ops";
import { money } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

/** 1-го числа: хранение за новый месяц (вперёд) + всё невыставленное — в черновики. Ничего не отправляется. */
export async function GET(req: Request) {
  if (!cronOk(req)) return new Response("forbidden", { status: 403 });
  const prev = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Vienna" }).slice(0, 7);
  const made = await draftInvoices(prev);
  if (made.length) {
    const text = `Готовы черновики счетов за ${monthName(prev)}:\n${made.map((m) => `- [${m.number}](/api/invoices/${m.id}/pdf) ${m.client} — ${money(m.total, m.currency)}`).join("\n")}\n\nПроверь и отметь отправленными на экране «Счета».`;
    await q("insert into messages(thread,role,text,meta) values('inbox','assistant',$1,$2)", [text, JSON.stringify({ auto: "monthly" })]);
  }
  return Response.json({ period: prev, made });
}

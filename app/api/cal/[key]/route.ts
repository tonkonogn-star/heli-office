import crypto from "node:crypto";
import { q, getSetting } from "@/lib/db";

export const dynamic = "force-dynamic";

/* Подписка на календарь: дела, платежи, сроки — в календаре телефона. Только чтение, по секретному адресу. */

const esc = (s: string) => String(s || "").replace(/\\/g, "\\\\").replace(/\n/g, "\\n").replace(/([,;])/g, "\\$1");
const d8 = (d: string) => String(d).slice(0, 10).replace(/-/g, "");
const next = (d: string) => new Date(Date.parse(String(d).slice(0, 10) + "T00:00:00Z") + 864e5).toISOString().slice(0, 10).replace(/-/g, "");

export async function GET(_req: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  const real = await getSetting<string>("cal_key");
  const k = key.replace(/\.ics$/, "");
  if (!real || k.length !== real.length || !crypto.timingSafeEqual(Buffer.from(k), Buffer.from(real))) return new Response("forbidden", { status: 403 });
  const ev: { uid: string; day: string; title: string; note?: string }[] = [];
  const [tasks, pays, stages, invs, deals, craft, pilot] = await Promise.all([
    q<any>("select id,title,notes,due from tasks where status='open' and due is not null"),
    q<any>("select id,title,amount,currency,next_due from payments where active and next_due is not null"),
    q<any>("select st.id, st.title, st.due, s.name from stages st join sites s on s.id=st.site_id where st.status<>'done' and st.due is not null"),
    q<any>("select i.id, i.number, i.due, i.total, i.currency, c.name from invoices i join clients c on c.id=i.client_id where i.status='sent' and i.due is not null"),
    q<any>("select id,title,next_step,next_date from deals where next_date is not null and stage not in ('Закрыта','Проиграна')"),
    q<any>("select * from aircraft"),
    getSetting<any>("pilot"),
  ]);
  for (const t of tasks) ev.push({ uid: "t-" + t.id, day: t.due, title: t.title, note: t.notes });
  for (const p of pays) ev.push({ uid: "p-" + p.id + "-" + p.next_due, day: p.next_due, title: `Оплатить: ${p.title} (${Number(p.amount)} ${p.currency})` });
  for (const s of stages) ev.push({ uid: "s-" + s.id, day: s.due, title: `${s.name}: срок этапа «${s.title}»` });
  for (const i of invs) ev.push({ uid: "i-" + i.id, day: i.due, title: `Срок оплаты счёта ${i.number} — ${i.name}` });
  for (const d of deals) ev.push({ uid: "d-" + d.id, day: d.next_date, title: `${d.title}: ${d.next_step || "следующий шаг"}` });
  for (const a of craft) {
    if (a.next_service_date) ev.push({ uid: "a-s-" + a.id, day: a.next_service_date, title: `${a.reg}: ТО` });
    if (a.insurance_until) ev.push({ uid: "a-i-" + a.id, day: a.insurance_until, title: `${a.reg}: заканчивается страховка` });
    if (a.arc_until) ev.push({ uid: "a-a-" + a.id, day: a.arc_until, title: `${a.reg}: заканчивается ARC` });
  }
  if (pilot?.license_until) ev.push({ uid: "pl-l", day: pilot.license_until, title: "Заканчивается лицензия пилота" });
  if (pilot?.medical_until) ev.push({ uid: "pl-m", day: pilot.medical_until, title: "Заканчивается медкомиссия" });
  const stamp = new Date().toISOString().replace(/[-:]/g, "").replace(/\.\d+Z$/, "Z");
  const lines = ["BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//heli-office//RU", "CALSCALE:GREGORIAN", "X-WR-CALNAME:Офис", "REFRESH-INTERVAL;VALUE=DURATION:PT1H", "X-PUBLISHED-TTL:PT1H"];
  for (const e of ev) {
    lines.push("BEGIN:VEVENT", `UID:${e.uid}@heli-office`, `DTSTAMP:${stamp}`, `DTSTART;VALUE=DATE:${d8(e.day)}`, `DTEND;VALUE=DATE:${next(e.day)}`, `SUMMARY:${esc(e.title)}`);
    if (e.note) lines.push(`DESCRIPTION:${esc(e.note)}`);
    lines.push("BEGIN:VALARM", "TRIGGER:-PT15H", "ACTION:DISPLAY", `DESCRIPTION:${esc(e.title)}`, "END:VALARM", "END:VEVENT");
  }
  lines.push("END:VCALENDAR");
  return new Response(lines.join("\r\n"), { headers: { "content-type": "text/calendar; charset=utf-8", "cache-control": "no-store" } });
}

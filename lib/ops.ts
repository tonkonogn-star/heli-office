import { q, newId, today, getSetting, setSetting, money } from "./db";

/* Всё, что приложение умеет делать с данными. Этим пользуются экраны, чат, коннектор Claude и расписание. */

export type Company = { name?: string; address?: string; vat?: string; iban?: string; bic?: string; bank?: string; email?: string; phone?: string; payDays?: number; footer?: string };

export async function company(): Promise<Company> {
  return (await getSetting<Company>("company")) || {};
}

const num = (v: unknown) => (v === null || v === undefined || v === "" ? null : Number(String(v).replace(",", ".")));
const MONTHS = ["январь", "февраль", "март", "апрель", "май", "июнь", "июль", "август", "сентябрь", "октябрь", "ноябрь", "декабрь"];
const MONTHS_EN = ["January", "February", "March", "April", "May", "June", "July", "August", "September", "October", "November", "December"];
export const monthName = (p: string) => {
  const [y, m] = p.split("-").map(Number);
  return `${MONTHS[m - 1]} ${y}`;
};
const monthEn = (p: string) => {
  const [y, m] = p.split("-").map(Number);
  return `${MONTHS_EN[m - 1]} ${y}`;
};
const lastDay = (p: string) => {
  const [y, m] = p.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
};

/* ---------- клиенты ---------- */

export async function findClient(ref: string) {
  const s = String(ref || "").trim();
  if (!s) return null;
  const r = await q<any>("select * from clients where id=$1 or lower(name)=lower($1) limit 1", [s]);
  if (r[0]) return r[0];
  const like = await q<any>("select * from clients where not archived and lower(name) like lower($1) order by length(name) limit 2", [`%${s}%`]);
  return like.length === 1 ? like[0] : null;
}

export async function saveClient(c: any) {
  const id = c.id || newId("c");
  const ex = c.id ? (await q<any>("select * from clients where id=$1", [c.id]))[0] : null;
  const v = { ...(ex || {}), ...Object.fromEntries(Object.entries(c).filter(([, x]) => x !== undefined)) };
  await q(
    `insert into clients(id,name,contact,email,phone,aircraft,share,storage_rate,hour_rate,maint_rate,currency,notes,archived)
     values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13)
     on conflict(id) do update set name=$2,contact=$3,email=$4,phone=$5,aircraft=$6,share=$7,storage_rate=$8,hour_rate=$9,maint_rate=$10,currency=$11,notes=$12,archived=$13`,
    [id, v.name || "Без имени", v.contact || "", v.email || "", v.phone || "", v.aircraft || "", v.share || "", num(v.storage_rate) || 0, num(v.hour_rate) || 0, num(v.maint_rate) || 0, v.currency || "EUR", v.notes || "", !!v.archived],
  );
  return (await q<any>("select * from clients where id=$1", [id]))[0];
}

/* ---------- начисления и полёты ---------- */

export async function addCharge(o: { client: string; kind?: string; title: string; qty?: number; unit_price?: number; amount?: number; day?: string; flight_id?: string }) {
  const c = await findClient(o.client);
  if (!c) throw new Error(`Не нашёл клиента «${o.client}». Сначала добавь его или уточни имя.`);
  const qty = num(o.qty) ?? 1;
  let unit = num(o.unit_price);
  if (unit === null && o.kind === "maintenance" && Number(c.maint_rate)) unit = Number(c.maint_rate);
  if (unit === null && o.kind === "flight" && Number(c.hour_rate)) unit = Number(c.hour_rate);
  const amount = num(o.amount) ?? Math.round((unit ?? 0) * qty * 100) / 100;
  const id = newId("ch");
  await q("insert into charges(id,client_id,kind,title,qty,unit_price,amount,day,flight_id) values($1,$2,$3,$4,$5,$6,$7,$8,$9)", [
    id,
    c.id,
    o.kind || "other",
    o.title,
    qty,
    unit ?? (qty ? amount / qty : amount),
    amount,
    o.day || today(),
    o.flight_id || null,
  ]);
  return { id, client: c.name, amount, currency: c.currency };
}

/** Полёт: запись в журнал + строка в счёт клиента по его ставке за лётный час. */
export async function logFlight(o: { client?: string; hours: number; route?: string; aircraft?: string; day?: string; notes?: string; bill?: boolean }) {
  const c = o.client ? await findClient(o.client) : null;
  if (o.client && !c) throw new Error(`Не нашёл клиента «${o.client}».`);
  const id = newId("f");
  const hours = num(o.hours) || 0;
  await q("insert into flights(id,day,client_id,aircraft,route,hours,notes) values($1,$2,$3,$4,$5,$6,$7)", [id, o.day || today(), c?.id || null, o.aircraft || c?.aircraft || "", o.route || "", hours, o.notes || ""]);
  if (o.aircraft || c?.aircraft) await q("update aircraft set hours = hours + $2 where lower(reg)=lower($1)", [o.aircraft || c?.aircraft, hours]);
  let charge: any = null;
  if (c && o.bill !== false) {
    if (!Number(c.hour_rate)) return { id, warning: `У клиента ${c.name} не задана ставка за лётный час — полёт записан, но в счёт не попал. Скажи ставку, и я добавлю.` };
    charge = await addCharge({ client: c.id, kind: "flight", title: `Flight${o.route ? " " + o.route : ""}${o.aircraft || c.aircraft ? " (" + (o.aircraft || c.aircraft) + ")" : ""}`, qty: hours, unit_price: Number(c.hour_rate), day: o.day, flight_id: id });
  }
  return { id, client: c?.name, hours, charge };
}

/* ---------- счета ---------- */

async function nextNumber(year: string) {
  const r = await q<{ n: number }>("select count(*)::int n from invoices where number like $1", [`${year}-%`]);
  return `${year}-${String((r[0]?.n || 0) + 1).padStart(3, "0")}`;
}

/** Хранение за месяц: строка добавляется один раз на клиента и месяц. */
export async function ensureStorage(period: string) {
  // клиент, заведённый после конца месяца, за этот месяц хранение не платит
  const clients = await q<any>("select * from clients where not archived and storage_rate > 0 and created_at::date <= $1", [lastDay(period)]);
  let added = 0;
  for (const c of clients) {
    const title = `Hangarage — ${monthEn(period)}`;
    const ex = await q("select 1 from charges where client_id=$1 and kind='storage' and to_char(day,'YYYY-MM')=$2", [c.id, period]);
    if (ex.length) continue;
    await q("insert into charges(id,client_id,kind,title,qty,unit_price,amount,day) values($1,$2,'storage',$3,1,$4,$4,$5)", [newId("ch"), c.id, title, c.storage_rate, `${period}-01`]);
    added++;
  }
  return added;
}

/** Черновики счетов: всё невыставленное по клиенту до конца периода — в один счёт. */
export async function draftInvoices(period?: string, clientRef?: string) {
  const p = period || today().slice(0, 7);
  await ensureStorage(p);
  const end = lastDay(p);
  const co = await company();
  const payDays = co.payDays || 14;
  let clients = await q<any>("select * from clients where not archived order by name");
  if (clientRef) {
    const c = await findClient(clientRef);
    if (!c) throw new Error(`Не нашёл клиента «${clientRef}».`);
    clients = [c];
  }
  const made: any[] = [];
  for (const c of clients) {
    const open = await q<any>("select * from charges where client_id=$1 and invoice_id is null and day <= $2 order by day", [c.id, end]);
    if (!open.length) continue;
    // уже есть черновик за этот период — дополняем его, а не плодим новые
    let inv = (await q<any>("select * from invoices where client_id=$1 and status='draft' and period=$2 limit 1", [c.id, p]))[0];
    if (!inv) {
      const id = newId("inv");
      const issued = today();
      const due = new Date(Date.now() + payDays * 864e5).toISOString().slice(0, 10);
      await q("insert into invoices(id,client_id,number,period,status,issued,due,currency) values($1,$2,$3,$4,'draft',$5,$6,$7)", [id, c.id, await nextNumber(p.slice(0, 4)), p, issued, due, c.currency]);
      inv = { id };
    }
    await q("update charges set invoice_id=$1 where id = any($2)", [inv.id, open.map((x) => x.id)]);
    await recalc(inv.id);
    const fresh = (await q<any>("select * from invoices where id=$1", [inv.id]))[0];
    made.push({ id: fresh.id, number: fresh.number, client: c.name, total: Number(fresh.total), currency: fresh.currency, lines: open.length });
  }
  return made;
}

export async function recalc(invoiceId: string) {
  await q("update invoices set total = coalesce((select sum(amount) from charges where invoice_id=$1),0) where id=$1", [invoiceId]);
}

export async function setInvoiceStatus(ref: string, status: "draft" | "sent" | "paid") {
  const inv = (await q<any>("select * from invoices where id=$1 or number=$1 limit 1", [ref]))[0];
  if (!inv) throw new Error(`Нет счёта ${ref}`);
  if (status === "sent") await q("update invoices set status='sent', sent_at=coalesce(sent_at,now()) where id=$1", [inv.id]);
  else if (status === "paid") await q("update invoices set status='paid', paid_at=now(), sent_at=coalesce(sent_at,now()) where id=$1", [inv.id]);
  else await q("update invoices set status='draft' where id=$1", [inv.id]);
  return (await q<any>("select i.*, c.name client from invoices i join clients c on c.id=i.client_id where i.id=$1", [inv.id]))[0];
}

export async function invoiceFull(id: string) {
  const inv = (await q<any>("select i.*, c.name client_name, c.contact, c.email client_email, c.aircraft from invoices i join clients c on c.id=i.client_id where i.id=$1 or i.number=$1", [id]))[0];
  if (!inv) return null;
  const lines = await q<any>("select * from charges where invoice_id=$1 order by day, created_at", [inv.id]);
  return { ...inv, lines };
}

/** Кто сколько должен: выставленные и неоплаченные + ещё не выставленное. */
export async function debts() {
  const rows = await q<any>(`
    select c.id, c.name, c.currency,
      coalesce((select sum(total) from invoices i where i.client_id=c.id and i.status='sent'),0) as unpaid,
      coalesce((select sum(total) from invoices i where i.client_id=c.id and i.status='sent' and i.due < current_date),0) as overdue,
      coalesce((select sum(total) from invoices i where i.client_id=c.id and i.status='draft'),0) as drafts,
      coalesce((select sum(amount) from charges ch where ch.client_id=c.id and ch.invoice_id is null),0) as unbilled,
      (select min(due) from invoices i where i.client_id=c.id and i.status='sent' and i.due < current_date) as oldest_overdue
    from clients c where not c.archived order by c.name`);
  return rows.map((r) => ({ ...r, unpaid: Number(r.unpaid), overdue: Number(r.overdue), drafts: Number(r.drafts), unbilled: Number(r.unbilled) }));
}

/* ---------- стройка ---------- */

export async function findSite(ref: string) {
  const s = String(ref || "").trim();
  const r = await q<any>("select * from sites where id=$1 or lower(name)=lower($1) limit 1", [s]);
  if (r[0]) return r[0];
  const like = await q<any>("select * from sites where lower(name) like lower($1) or lower(address) like lower($1) limit 2", [`%${s}%`]);
  if (like.length === 1) return like[0];
  const all = await q<any>("select * from sites");
  return all.length === 1 && !s ? all[0] : null;
}

export async function siteSummary(id: string) {
  const s = (await q<any>("select * from sites where id=$1", [id]))[0];
  if (!s) return null;
  const [stages, expenses] = await Promise.all([
    q<any>("select * from stages where site_id=$1 order by sort, due nulls last", [id]),
    q<any>("select * from expenses where site_id=$1 order by day desc, created_at desc", [id]),
  ]);
  const spent = expenses.reduce((a, e) => a + Number(e.amount), 0);
  const unpaid = expenses.filter((e) => !e.paid).reduce((a, e) => a + Number(e.amount), 0);
  const done = stages.filter((x) => x.status === "done").length;
  return { ...s, budget: Number(s.budget), spent, unpaid, stages, expenses, progress: stages.length ? done / stages.length : 0 };
}

/* ---------- контролёр: что не сходится ---------- */

export type Issue = { level: "red" | "amber"; area: string; text: string };

export async function audit(): Promise<Issue[]> {
  const out: Issue[] = [];
  const period = today().slice(0, 7);
  const [stale, noStorage, overdue, oldDrafts, mismatch, dupes, sites, lateStages, noReport, craft, lateTasks, flightsNoCharge, noRate] = await Promise.all([
    q<any>("select c.name, count(*)::int n, sum(ch.amount) s, c.currency from charges ch join clients c on c.id=ch.client_id where ch.invoice_id is null and ch.day < current_date - 31 group by c.name, c.currency"),
    q<any>("select name from clients c where not archived and storage_rate>0 and current_date > date_trunc('month',current_date)::date + 4 and not exists (select 1 from charges ch where ch.client_id=c.id and ch.kind='storage' and to_char(ch.day,'YYYY-MM')=$1)", [period]),
    q<any>("select i.number, c.name, i.total, i.currency, i.due from invoices i join clients c on c.id=i.client_id where i.status='sent' and i.due < current_date order by i.due"),
    q<any>("select i.number, c.name from invoices i join clients c on c.id=i.client_id where i.status='draft' and i.created_at < now() - interval '5 days'"),
    q<any>("select i.number, i.total, coalesce(sum(ch.amount),0) s from invoices i left join charges ch on ch.invoice_id=i.id group by i.id having abs(i.total - coalesce(sum(ch.amount),0)) > 0.01"),
    q<any>("select c.name, ch.day, ch.amount, count(*)::int n from charges ch join clients c on c.id=ch.client_id group by c.name, ch.day, ch.amount, ch.title having count(*) > 1"),
    q<any>("select s.name, s.budget, coalesce(sum(e.amount),0) spent from sites s left join expenses e on e.site_id=s.id group by s.id having s.budget > 0 and coalesce(sum(e.amount),0) > s.budget * 0.9"),
    q<any>("select st.title, s.name, st.due from stages st join sites s on s.id=st.site_id where st.status <> 'done' and st.due < current_date"),
    q<any>("select st.title, s.name from stages st join sites s on s.id=st.site_id where st.status = 'done' and coalesce(st.report,'') = ''"),
    q<any>("select * from aircraft"),
    q<any>("select title, due from tasks where status='open' and due < current_date order by due limit 10"),
    q<any>("select f.day, c.name, f.hours from flights f join clients c on c.id=f.client_id where not exists (select 1 from charges ch where ch.flight_id=f.id) and f.hours > 0"),
    q<any>("select name from clients where not archived and storage_rate=0 and hour_rate=0 and maint_rate=0"),
  ]);
  for (const r of stale) out.push({ level: "amber", area: "Счета", text: `${r.name}: ${r.n} начисл. на ${money(r.s, r.currency)} лежат без счёта больше месяца` });
  for (const r of noStorage) out.push({ level: "amber", area: "Счета", text: `${r.name}: нет строки за хранение в этом месяце` });
  for (const r of overdue) out.push({ level: "red", area: "Оплаты", text: `Счёт ${r.number} (${r.name}) на ${money(r.total, r.currency)} просрочен с ${fmtDay(r.due)}` });
  for (const r of oldDrafts) out.push({ level: "amber", area: "Счета", text: `Черновик ${r.number} (${r.name}) не отправлен больше 5 дней` });
  for (const r of mismatch) out.push({ level: "red", area: "Счета", text: `Счёт ${r.number}: итог ${r.total} не равен сумме строк ${r.s}` });
  for (const r of dupes) out.push({ level: "amber", area: "Счета", text: `${r.name}: похоже на дубль — ${r.n} одинаковые строки на ${r.amount} за ${fmtDay(r.day)}` });
  for (const r of sites) out.push({ level: Number(r.spent) > Number(r.budget) ? "red" : "amber", area: "Стройка", text: `${r.name}: потрачено ${money(r.spent)} из бюджета ${money(r.budget)}` });
  for (const r of lateStages) out.push({ level: "red", area: "Стройка", text: `${r.name}: этап «${r.title}» должен был закончиться ${fmtDay(r.due)}` });
  for (const r of noReport) out.push({ level: "amber", area: "Стройка", text: `${r.name}: этап «${r.title}» закрыт без отчёта подрядчика` });
  const t = today();
  const soon = (d: string | null, days: number) => d && new Date(d).getTime() - new Date(t).getTime() < days * 864e5;
  for (const a of craft) {
    if (a.next_service_hours && Number(a.next_service_hours) - Number(a.hours) <= 25) out.push({ level: Number(a.next_service_hours) - Number(a.hours) <= 5 ? "red" : "amber", area: "Вертолёты", text: `${a.reg}: до ТО ${Math.max(0, Number(a.next_service_hours) - Number(a.hours)).toFixed(1)} ч` });
    if (soon(a.next_service_date, 30)) out.push({ level: soon(a.next_service_date, 7) ? "red" : "amber", area: "Вертолёты", text: `${a.reg}: ТО по сроку ${fmtDay(a.next_service_date)}` });
    if (soon(a.insurance_until, 30)) out.push({ level: soon(a.insurance_until, 7) ? "red" : "amber", area: "Вертолёты", text: `${a.reg}: страховка до ${fmtDay(a.insurance_until)}` });
    if (soon(a.arc_until, 30)) out.push({ level: soon(a.arc_until, 7) ? "red" : "amber", area: "Вертолёты", text: `${a.reg}: ARC (сертификат лётной годности) до ${fmtDay(a.arc_until)}` });
  }
  const pilot = (await getSetting<any>("pilot")) || {};
  if (soon(pilot.license_until, 45)) out.push({ level: soon(pilot.license_until, 10) ? "red" : "amber", area: "Пилот", text: `Лицензия пилота действует до ${fmtDay(pilot.license_until)}` });
  if (soon(pilot.medical_until, 45)) out.push({ level: soon(pilot.medical_until, 10) ? "red" : "amber", area: "Пилот", text: `Медкомиссия действует до ${fmtDay(pilot.medical_until)}` });
  for (const r of lateTasks) out.push({ level: "amber", area: "Дела", text: `Просрочено: ${r.title} (${fmtDay(r.due)})` });
  for (const r of flightsNoCharge) out.push({ level: "amber", area: "Полёты", text: `Полёт ${fmtDay(r.day)} с ${r.name} (${r.hours} ч) не попал в счёт` });
  const pays = await q<any>("select title, amount, currency, next_due from payments where active and next_due <= current_date + 3 order by next_due");
  for (const r of pays) out.push({ level: r.next_due < t ? "red" : "amber", area: "Платежи", text: `${r.title}: ${money(r.amount, r.currency)} — ${r.next_due < t ? "просрочен с" : "до"} ${fmtDay(r.next_due)}` });
  const radar = await q<any>("select a.reg, to_char(r.first_seen at time zone 'Europe/Riga','DD.MM') d, round(extract(epoch from (r.last_seen-r.first_seen))/3600.0,1)::float h from radar_flights r join aircraft a on a.id=r.aircraft_id where r.status='new' order by r.first_seen desc limit 5").catch(() => []);
  for (const r of radar) out.push({ level: "amber", area: "Полёты", text: `Радар видел ${r.reg} в воздухе ${r.d}, ≈${r.h} ч — полёт не записан` });
  for (const r of noRate) out.push({ level: "amber", area: "Клиенты", text: `${r.name}: не заданы ставки — счёт не собрать` });
  return out;
}

export function fmtDay(d: any) {
  if (!d) return "";
  const s = typeof d === "string" ? d.slice(0, 10) : new Date(d).toLocaleDateString("sv-SE", { timeZone: "Europe/Vienna" });
  const [y, m, dd] = s.split("-");
  return `${dd}.${m}.${y}`;
}

/* ---------- сводка для дашборда и для помощника ---------- */

export async function overview() {
  const [tasks, d, sites, flights, deals, issues, drafts] = await Promise.all([
    q<any>("select id,title,space,due,notes from tasks where status='open' order by due nulls last, created_at limit 40"),
    debts(),
    q<any>("select id,name,status,budget,finish_plan from sites order by created_at"),
    q<any>("select f.*, c.name client from flights f left join clients c on c.id=f.client_id order by day desc, created_at desc limit 8"),
    q<any>("select * from deals where stage not in ('Закрыта','Проиграна') order by next_date nulls last limit 20"),
    audit(),
    q<any>("select i.id, i.number, i.total, i.currency, c.name client from invoices i join clients c on c.id=i.client_id where i.status='draft' order by i.created_at desc"),
  ]);
  const owed = d.reduce((a, r) => a + r.unpaid, 0);
  const overdueSum = d.reduce((a, r) => a + r.overdue, 0);
  const unbilled = d.reduce((a, r) => a + r.unbilled + r.drafts, 0);
  return { tasks, debts: d, sites, flights, deals, issues, drafts, totals: { owed, overdue: overdueSum, unbilled } };
}

/** Короткое досье для помощника: кэшируется, поэтому меняется только когда меняются данные. */
export async function dossier() {
  const [o, clients, craft, facts, co, pilot, contracts] = await Promise.all([
    overview(),
    q<any>("select id,name,aircraft,share,storage_rate,hour_rate,maint_rate,currency,email from clients where not archived order by name"),
    q<any>("select * from aircraft order by reg"),
    q<any>("select text from facts order by id"),
    company(),
    getSetting<any>("pilot"),
    q<any>("select id,title,party,status,space from contracts order by updated_at desc limit 15"),
  ]);
  const L: string[] = [];
  L.push("## Факты, которые Максим просил помнить", facts.map((f) => "- " + f.text).join("\n") || "—");
  L.push("## Компания (для счетов)", JSON.stringify(co));
  L.push("## Пилот", JSON.stringify(pilot || {}));
  const ig = await getSetting<any>("instagram");
  if (ig?.handle) L.push("## Instagram", `Профиль Максима: instagram.com/${ig.handle} — смотри его публичные посты (web_search), только чтобы понимать, где он и чем занят. Не обсуждай его посты, если он не спросил.`);
  L.push("## Клиенты Heliclub", clients.map((c) => `- ${c.id} ${c.name}: вертолёт ${c.aircraft || "—"}, доля ${c.share || "—"}, хранение ${c.storage_rate}/мес, лётный час ${c.hour_rate}, ТО-час ${c.maint_rate} ${c.currency}${c.email ? ", " + c.email : ""}`).join("\n") || "пока нет");
  L.push("## Вертолёты", craft.map((a) => `- ${a.id} ${a.reg} ${a.model}: налёт ${a.hours} ч, ТО на ${a.next_service_hours ?? "—"} ч / ${fmtDay(a.next_service_date) || "—"}, страховка до ${fmtDay(a.insurance_until) || "—"}, ARC до ${fmtDay(a.arc_until) || "—"}`).join("\n") || "пока нет");
  L.push("## Долги и счета", o.debts.map((r) => `- ${r.name}: выставлено и не оплачено ${money(r.unpaid, r.currency)} (просрочено ${money(r.overdue, r.currency)}), черновики ${money(r.drafts, r.currency)}, ещё не в счёте ${money(r.unbilled, r.currency)}`).join("\n") || "—");
  L.push("## Черновики счетов", o.drafts.map((i) => `- ${i.number} ${i.client} ${money(i.total, i.currency)}`).join("\n") || "нет");
  L.push("## Объекты стройки", o.sites.map((s) => `- ${s.id} ${s.name} (${s.status}), бюджет ${money(s.budget)}, план сдачи ${fmtDay(s.finish_plan) || "—"}`).join("\n") || "пока нет");
  L.push("## Сделки", o.deals.map((x) => `- ${x.id} ${x.title} [${x.space}] — ${x.party}, этап ${x.stage}, ${x.value ? money(x.value, x.currency) : ""}; дальше: ${x.next_step || "—"} ${fmtDay(x.next_date)}`).join("\n") || "нет");
  L.push("## Договоры", contracts.map((c) => `- ${c.id} ${c.title} [${c.space}] — ${c.party}, ${c.status}`).join("\n") || "нет");
  L.push("## Открытые дела", o.tasks.map((t) => `- ${t.id} [${t.space}] ${t.title}${t.due ? " до " + fmtDay(t.due) : ""}`).join("\n") || "нет");
  const [pays, flagged, labDays] = await Promise.all([
    q<any>("select id,title,amount,currency,category,every,next_due from payments where active order by next_due nulls last"),
    q<any>("select distinct on (lower(test)) test, value, unit, ref_low, ref_high, day from labs order by lower(test), day desc"),
    q<any>("select day, count(*)::int n from labs group by day order by day desc limit 5"),
  ]);
  L.push("## Личное: платежи", pays.map((p) => `- ${p.id} ${p.title} [${p.category}] ${money(p.amount, p.currency)}, ${p.every}, следующий ${fmtDay(p.next_due) || "—"}`).join("\n") || "нет");
  const out = flagged.filter((r) => r.value != null && ((r.ref_low != null && Number(r.value) < Number(r.ref_low)) || (r.ref_high != null && Number(r.value) > Number(r.ref_high))));
  L.push("## Личное: анализы", (labDays.length ? `Сдавал: ${labDays.map((x) => fmtDay(x.day) + " (" + x.n + ")").join(", ")}. ` : "Анализов пока нет. ") + (out.length ? "Вне нормы в последних: " + out.map((r) => `${r.test} ${r.value} ${r.unit}`).join("; ") : ""));
  L.push("## Последние полёты", o.flights.map((f) => `- ${fmtDay(f.day)} ${f.client || "без клиента"} ${f.hours} ч ${f.route}`).join("\n") || "нет");
  L.push("## Что не сходится (контролёр)", o.issues.map((i) => `- [${i.area}] ${i.text}`).join("\n") || "всё сходится");
  return L.join("\n\n");
}

export { monthEn, lastDay };
export async function rememberFact(text: string) {
  await q("insert into facts(text) values($1)", [text]);
}
export async function setPilot(p: any) {
  const prev = (await getSetting<any>("pilot")) || {};
  await setSetting("pilot", { ...prev, ...p });
}

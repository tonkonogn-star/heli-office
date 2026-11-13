import crypto from "node:crypto";
import { q, getSetting, setSetting, newId, money, today } from "./db";
import * as ops from "./ops";
import { toMake } from "./ext";

/* Деньги и полёты без ручной работы: ссылки на файлы, сверка выписки, Stripe, радар, выгрузка бухгалтеру. */

// ---------- адрес приложения и ссылки на файлы ----------

export async function origin() {
  return (await getSetting<string>("origin")) || (process.env.VERCEL_PROJECT_PRODUCTION_URL ? "https://" + process.env.VERCEL_PROJECT_PRODUCTION_URL : "");
}

async function shareSecret() {
  let s = await getSetting<string>("share_secret");
  if (!s) {
    s = crypto.randomBytes(32).toString("hex");
    await setSetting("share_secret", s);
  }
  return s;
}

const sig = (secret: string, v: string) => crypto.createHmac("sha256", secret).update(v).digest("hex").slice(0, 32);

/** Ссылка на файл, которую можно открыть без пароля (для Make, бухгалтера, подписи). Живёт 30 дней. */
export async function shareLink(kind: "invoice" | "contract" | "doc" | "export", id: string, days = 30) {
  const e = Math.floor(Date.now() / 1000) + days * 86400;
  return `${await origin()}/api/share/${kind}/${encodeURIComponent(id)}?e=${e}&s=${sig(await shareSecret(), `${kind}/${id}/${e}`)}`;
}

export async function shareOk(kind: string, id: string, e: string, s: string) {
  if (!e || !s || Number(e) < Date.now() / 1000) return false;
  const good = sig(await shareSecret(), `${kind}/${id}/${e}`);
  return s.length === good.length && crypto.timingSafeEqual(Buffer.from(s), Buffer.from(good));
}

// ---------- отправка через Make по команде Максима ----------

/** Помощник отправляет то, что Максим сам велел: кому, каким способом, что приложить. */
export async function makeSend(i: { channel: string; to?: string; subject?: string; text: string; attach?: { kind: "invoice" | "contract" | "doc" | "export"; id: string }[] }) {
  const url = await getSetting<string>("make_hook");
  if (!url) return "Make не подключён — отправить не могу. Подключить: «Ещё → Подключения → Make». Пока могу подготовить текст и файлы, чтобы ты отправил сам.";
  const files = [];
  for (const a of i.attach || []) files.push({ kind: a.kind, id: a.id, url: await shareLink(a.kind, a.id) });
  const res = await fetch(url, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ event: "send", channel: i.channel, to: i.to || "", subject: i.subject || "", text: i.text, files, at: new Date().toISOString() }),
    signal: AbortSignal.timeout(15000),
  }).catch((e) => ({ ok: false, status: 0, text: async () => String(e) }) as any);
  if (!res.ok) return `Make не принял (${res.status}). Проверь, что сценарий включён.`;
  // отправленный счёт сразу отмечаем отправленным
  for (const a of i.attach || []) if (a.kind === "invoice") await ops.setInvoiceStatus(a.id, "sent").catch(() => {});
  return `Передал в Make: ${i.channel}${i.to ? " → " + i.to : ""}${files.length ? `, вложений ${files.length}` : ""}.`;
}

// ---------- сверка банковской выписки ----------

type Pay = { date?: string; amount: number; currency?: string; payer?: string; reference?: string };

/** Входящие платежи из выписки → какие счета оплачены. Сначала по номеру счёта в назначении, потом по сумме и плательщику. */
export async function reconcile(pays: Pay[], apply = true) {
  const open = await q<any>("select i.id, i.number, i.total, i.currency, c.name client from invoices i join clients c on c.id=i.client_id where i.status in ('sent','draft') order by i.issued");
  const used = new Set<string>();
  const matched: string[] = [];
  const unknown: string[] = [];
  const norm = (s: string) => (s || "").toLowerCase().replace(/[^a-zа-я0-9]/gi, "");
  for (const p of pays) {
    const amt = Number(p.amount) || 0;
    if (amt <= 0) continue;
    const ref = String(p.reference || "");
    let inv = open.find((o) => !used.has(o.id) && ref.includes(o.number));
    let how = "по номеру счёта";
    if (!inv) {
      const same = open.filter((o) => !used.has(o.id) && Math.abs(Number(o.total) - amt) < 0.01);
      const byName = same.filter((o) => p.payer && (norm(p.payer).includes(norm(o.client).slice(0, 5)) || norm(o.client).includes(norm(p.payer).slice(0, 5))));
      inv = byName.length === 1 ? byName[0] : same.length === 1 ? same[0] : undefined;
      how = byName.length === 1 ? "по сумме и плательщику" : "по сумме";
    }
    const label = `${p.date || ""} ${money(amt, p.currency || "EUR")}${p.payer ? " от " + p.payer : ""}`.trim();
    if (!inv) {
      unknown.push(label + (ref ? ` («${ref.slice(0, 60)}»)` : ""));
      continue;
    }
    used.add(inv.id);
    if (apply) await ops.setInvoiceStatus(inv.id, "paid");
    matched.push(`${inv.number} ${inv.client} ${money(inv.total, inv.currency)} ← ${label} (${how})`);
  }
  const still = open.filter((o) => !used.has(o.id) && o.status !== "draft");
  return (
    (matched.length ? `Оплачены${apply ? " (отметил)" : ""}:\n- ${matched.join("\n- ")}` : "Ни один платёж не подошёл к открытым счетам.") +
    (unknown.length ? `\n\nНе понял, за что:\n- ${unknown.join("\n- ")}` : "") +
    `\n\nЕщё не оплачено отправленных счетов: ${(await q<any>("select count(*)::int n from invoices where status='sent'"))[0].n}.` +
    (still.length ? "" : "")
  );
}

// ---------- Stripe: оплата картой по ссылке ----------

async function stripe(path: string, body?: Record<string, string>, method?: string) {
  const key = (await getSetting<any>("keys"))?.stripe || process.env.STRIPE_SECRET_KEY;
  if (!key) throw new Error("Stripe не подключён");
  const res = await fetch("https://api.stripe.com/v1/" + path, {
    method: method || (body ? "POST" : "GET"),
    headers: { authorization: `Bearer ${key}`, ...(body ? { "content-type": "application/x-www-form-urlencoded" } : {}) },
    body: body ? new URLSearchParams(body).toString() : undefined,
    signal: AbortSignal.timeout(20000),
  });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error("Stripe: " + (j?.error?.message || res.status));
  return j;
}

/** Вставили ключ — сами заводим в Stripe адрес, куда он сообщит об оплате. */
export async function setupStripe() {
  const url = `${await origin()}/api/stripe`;
  const list = await stripe("webhook_endpoints?limit=100");
  for (const w of (list.data || []).filter((w: any) => w.url === url)) await stripe(`webhook_endpoints/${w.id}`, undefined, "DELETE").catch(() => {});
  const w = await stripe("webhook_endpoints", { url, "enabled_events[0]": "checkout.session.completed", description: "Офис Максима — оплата счетов" });
  await setSetting("stripe_whsec", w.secret);
  return true;
}

/** Ссылка на оплату счёта картой. Делается один раз на счёт и печатается в PDF. */
export async function payLink(ref: string) {
  const inv = (await q<any>("select i.*, c.name client from invoices i join clients c on c.id=i.client_id where i.id=$1 or i.number=$1", [ref]))[0];
  if (!inv) throw new Error("Нет такого счёта");
  if (inv.pay_url) return inv.pay_url as string;
  const price = await stripe("prices", {
    currency: String(inv.currency || "EUR").toLowerCase(),
    unit_amount: String(Math.round(Number(inv.total) * 100)),
    "product_data[name]": `Invoice ${inv.number} — ${inv.client}`,
  });
  const link = await stripe("payment_links", {
    "line_items[0][price]": price.id,
    "line_items[0][quantity]": "1",
    "metadata[invoice]": inv.id,
    "payment_intent_data[metadata][invoice]": inv.id,
    "payment_intent_data[description]": `Invoice ${inv.number}`,
  });
  await q("update invoices set pay_url=$2, pay_link_id=$3 where id=$1", [inv.id, link.url, link.id]);
  return link.url as string;
}

/** Stripe сообщил об оплате: проверяем подпись и отмечаем счёт оплаченным. */
export async function stripeEvent(raw: string, header: string) {
  const secret = await getSetting<string>("stripe_whsec");
  if (!secret) return false;
  const parts = Object.fromEntries(header.split(",").map((p) => p.split("=") as [string, string]));
  const t = parts.t;
  const v1s = header.split(",").filter((p) => p.startsWith("v1=")).map((p) => p.slice(3));
  const good = crypto.createHmac("sha256", secret).update(`${t}.${raw}`).digest("hex");
  if (!t || !v1s.some((v) => v.length === good.length && crypto.timingSafeEqual(Buffer.from(v), Buffer.from(good)))) return false;
  if (Math.abs(Date.now() / 1000 - Number(t)) > 600) return false;
  const ev = JSON.parse(raw);
  if (ev.type === "checkout.session.completed") {
    const s = ev.data.object;
    if (s.payment_status && s.payment_status !== "paid") return true;
    const inv = (await q<any>("select id from invoices where pay_link_id=$1 or id=$2 limit 1", [s.payment_link || "-", s.metadata?.invoice || "-"]))[0];
    if (inv) {
      const r = await ops.setInvoiceStatus(inv.id, "paid");
      await q("insert into messages(thread,role,text,meta) values('inbox','assistant',$1,$2)", [`💳 Счёт ${r.number} (${r.client}) оплачен картой: ${money(r.total, r.currency)}.`, JSON.stringify({ auto: "stripe" })]);
    }
  }
  return true;
}

// ---------- полёты по радару (OpenSky) ----------

async function openskyToken() {
  const c = (await getSetting<any>("keys")) || {};
  if (!c.opensky_id || !c.opensky_secret) return null;
  const res = await fetch("https://auth.opensky-network.org/auth/realms/opensky-network/protocol/openid-connect/token", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "client_credentials", client_id: c.opensky_id, client_secret: c.opensky_secret }).toString(),
    signal: AbortSignal.timeout(15000),
  });
  if (!res.ok) throw new Error("OpenSky не пустил: проверь Client ID и Secret");
  return (await res.json()).access_token as string;
}

/** Раз в сутки: что видели радары по бортам с транспондером за последние два дня. Новое — в «Полёты» как «замечено радаром». */
export async function syncRadar() {
  const craft = await q<any>("select id, reg, icao24 from aircraft where coalesce(icao24,'') <> ''");
  if (!craft.length) return "Ни у одного борта не указан код транспондера (ICAO24).";
  const token = await openskyToken().catch(() => null);
  const end = Math.floor(Date.now() / 1000);
  const begin = end - 2 * 86400 + 60;
  let found = 0;
  const errs: string[] = [];
  for (const a of craft) {
    const hex = String(a.icao24).toLowerCase().trim();
    try {
      const res = await fetch(`https://opensky-network.org/api/flights/aircraft?icao24=${hex}&begin=${begin}&end=${end}`, { headers: token ? { authorization: `Bearer ${token}` } : {}, signal: AbortSignal.timeout(20000) });
      if (res.status === 404) continue;
      if (!res.ok) throw new Error(String(res.status));
      for (const f of (await res.json()) as any[]) {
        const id = `${hex}-${f.firstSeen}`;
        const r = await q("insert into radar_flights(id,aircraft_id,first_seen,last_seen,dep,arr) values($1,$2,to_timestamp($3),to_timestamp($4),$5,$6) on conflict(id) do nothing returning id", [id, a.id, f.firstSeen, f.lastSeen, f.estDepartureAirport || "", f.estArrivalAirport || ""]);
        if (!r.length) continue;
        found++;
        await journal(id, a.reg, f);
      }
    } catch (e: any) {
      errs.push(`${a.reg}: ${e?.message || e}`);
    }
  }
  return `Радар: новых полётов ${found}.` + (errs.length ? " Ошибки: " + errs.join("; ") : "");
}

/** Радар увидел полёт — сразу в журнал налёта борта (часы идут в счётчики ТО и оверхола).
 *  Если такой полёт уже записан вручную в тот же день — второй раз не пишем. Кто летал и кому счёт — уточняется потом. */
async function journal(radarId: string, reg: string, f: any) {
  const hours = Math.max(0.1, Math.round(((Number(f.lastSeen) - Number(f.firstSeen)) / 3600) * 10) / 10);
  const day = new Date(Number(f.firstSeen) * 1000).toLocaleDateString("sv-SE", { timeZone: "Europe/Riga" });
  const route = f.estDepartureAirport || f.estArrivalAirport ? `${f.estDepartureAirport || "?"} — ${f.estArrivalAirport || "?"}` : "";
  const manual = (await q<any>("select id from flights where source<>'radar' and lower(aircraft)=lower($1) and day=$2 and abs(hours-$3) <= 0.5 limit 1", [reg, day, hours]))[0];
  if (manual) {
    await q("update radar_flights set status='logged' where id=$1", [radarId]);
    return;
  }
  await q("insert into flights(id,day,aircraft,route,hours,notes,source,radar_id) values($1,$2,$3,$4,$5,'по радару','radar',$6)", [newId("f"), day, reg, route, hours, radarId]);
  await q("update aircraft set hours = hours + $2 where lower(reg)=lower($1)", [reg, hours]);
}

export async function radarPending() {
  return q<any>(
    `select r.*, a.reg, (select id from flights f where f.radar_id=r.id limit 1) flight_id, round(extract(epoch from (r.last_seen - r.first_seen))/3600.0, 1)::float hours,
       to_char(r.first_seen at time zone 'Europe/Riga','YYYY-MM-DD') as day, to_char(r.first_seen at time zone 'Europe/Riga','HH24:MI') t1, to_char(r.last_seen at time zone 'Europe/Riga','HH24:MI') t2
     from radar_flights r join aircraft a on a.id=r.aircraft_id where r.status='new' order by r.first_seen desc limit 30`,
  );
}

export async function radarResolve(id: string, status: "logged" | "skip") {
  await q("update radar_flights set status=$2 where id=$1", [id, status]);
}

// ---------- выгрузка для бухгалтера ----------

const csvCell = (v: unknown) => {
  const s = v === null || v === undefined ? "" : String(v);
  return /[;"\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
};

/** Месяц одним файлом для Excel: счета, оплаты, расходы стройки, личные траты. */
export async function accountingCsv(period: string) {
  const [inv, exp, spend] = await Promise.all([
    q<any>("select i.number, c.name client, i.issued, i.due, i.total, i.currency, i.status, i.paid_at from invoices i join clients c on c.id=i.client_id where to_char(i.issued,'YYYY-MM')=$1 or to_char(i.paid_at,'YYYY-MM')=$1 order by i.issued", [period]),
    q<any>("select e.day, s.name site, e.title, e.vendor, e.amount, e.paid from expenses e join sites s on s.id=e.site_id where to_char(e.day,'YYYY-MM')=$1 order by e.day", [period]),
    q<any>("select l.day, l.title, l.amount, l.currency from payment_log l where to_char(l.day,'YYYY-MM')=$1 order by l.day", [period]).catch(() => []),
  ]);
  const rows: unknown[][] = [];
  rows.push([`Выгрузка за ${period}`]);
  rows.push([]);
  rows.push(["СЧЕТА HELICLUB"]);
  rows.push(["Номер", "Клиент", "Выставлен", "Срок", "Сумма", "Валюта", "Статус", "Оплачен", "PDF"]);
  for (const r of inv) rows.push([r.number, r.client, ops.fmtDay(r.issued), ops.fmtDay(r.due), String(r.total).replace(".", ","), r.currency, r.status === "paid" ? "оплачен" : r.status === "sent" ? "отправлен" : "черновик", r.paid_at ? ops.fmtDay(r.paid_at) : "", await shareLink("invoice", r.number, 90)]);
  rows.push([]);
  rows.push(["РАСХОДЫ СТРОЙКИ"]);
  rows.push(["Дата", "Объект", "Что", "Подрядчик", "Сумма", "Оплачено"]);
  for (const r of exp) rows.push([ops.fmtDay(r.day), r.site, r.title, r.vendor, String(r.amount).replace(".", ","), r.paid ? "да" : "нет"]);
  if (spend.length) {
    rows.push([]);
    rows.push(["ЛИЧНЫЕ ПЛАТЕЖИ"]);
    rows.push(["Дата", "Что", "Сумма", "Валюта"]);
    for (const r of spend) rows.push([ops.fmtDay(r.day), r.title || "", String(r.amount).replace(".", ","), r.currency || "EUR"]);
  }
  return "﻿" + rows.map((r) => r.map(csvCell).join(";")).join("\r\n");
}

export function lastMonth() {
  const d = new Date(today());
  d.setDate(1);
  d.setMonth(d.getMonth() - 1);
  return d.toISOString().slice(0, 7);
}

export { toMake, newId };

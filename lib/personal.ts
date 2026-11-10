import { q, newId, today, money } from "./db";

/* Личное: платежи (школа, счета, семья), анализы. */

export const CATEGORIES = ["Семья", "Школа", "Дом и счета", "Здоровье", "Машина", "Подписки", "Другое"];
const EVERY: Record<string, string> = { month: "каждый месяц", quarter: "раз в квартал", year: "раз в год", once: "разово" };
export const everyLabel = (e: string) => EVERY[e] || e;

function addPeriod(d: string, every: string) {
  const [y, m, dd] = d.split("-").map(Number);
  const add = every === "year" ? 12 : every === "quarter" ? 3 : 1;
  const t = new Date(Date.UTC(y, m - 1 + add, 1));
  const last = new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth() + 1, 0)).getUTCDate();
  t.setUTCDate(Math.min(dd, last));
  return t.toISOString().slice(0, 10);
}

/** Отметить платёж оплаченным: запись в историю, следующий срок сдвигается сам. Разовый — закрывается. */
export async function payPayment(id: string, amount?: number, day?: string) {
  const p = (await q<any>("select * from payments where id=$1", [id]))[0];
  if (!p) throw new Error("Нет такого платежа");
  const sum = amount ?? Number(p.amount);
  await q("insert into payment_log(payment_id,title,amount,currency,category,day) values($1,$2,$3,$4,$5,$6)", [p.id, p.title, sum, p.currency, p.category, day || today()]);
  if (p.every === "once") await q("update payments set active=false where id=$1", [id]);
  else await q("update payments set next_due=$2 where id=$1", [id, addPeriod(String(p.next_due || today()), p.every)]);
  const fresh = (await q<any>("select * from payments where id=$1", [id]))[0];
  return `Оплачено: ${p.title} — ${money(sum, p.currency)}.${fresh.active ? ` Следующий раз: ${fresh.next_due}.` : ""}`;
}

/** Анализы: по каждому показателю — значения во времени и выход за норму. */
export async function labTrends() {
  const rows = await q<any>("select * from labs order by lower(test), day");
  const by = new Map<string, any[]>();
  for (const r of rows) {
    const k = r.test.trim().toLowerCase();
    (by.get(k) || by.set(k, []).get(k)!).push(r);
  }
  return [...by.values()].map((list) => {
    const last = list[list.length - 1];
    const v = last.value != null ? Number(last.value) : null;
    const lo = last.ref_low != null ? Number(last.ref_low) : null;
    const hi = last.ref_high != null ? Number(last.ref_high) : null;
    const flag = v == null ? null : lo != null && v < lo ? "low" : hi != null && v > hi ? "high" : null;
    return { test: last.test, unit: last.unit, ref_low: lo, ref_high: hi, flag, points: list.map((r) => ({ id: r.id, day: r.day, value: r.value != null ? Number(r.value) : null, text: r.value_text })) };
  });
}

export async function recordLabs(day: string, items: any[], lab = "", doc_id?: string) {
  let n = 0;
  for (const it of items || []) {
    if (!it?.test) continue;
    const v = it.value === "" || it.value == null ? null : Number(String(it.value).replace(",", "."));
    await q("insert into labs(id,day,test,value,value_text,unit,ref_low,ref_high,lab,doc_id,note) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)", [
      newId("l"),
      it.day || day || today(),
      String(it.test).trim(),
      Number.isFinite(v as number) ? v : null,
      Number.isFinite(v as number) ? "" : String(it.value ?? ""),
      it.unit || "",
      it.ref_low ?? null,
      it.ref_high ?? null,
      lab,
      doc_id || null,
      it.note || "",
    ]);
    n++;
  }
  return n;
}

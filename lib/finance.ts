import { q } from "./db";

/* Финансы Heliclub: сколько приносит каждый клиент и вертолёт. Доход — по начислениям (то, что выставлено или будет выставлено). */

const n = (v: unknown) => Number(v) || 0;

export async function clientFinance() {
  const rows = await q<any>(`
    select c.id, c.name, c.currency,
      coalesce((select sum(amount) from charges ch where ch.client_id=c.id and ch.day > current_date - 365),0) as revenue,
      coalesce((select sum(amount) from charges ch where ch.client_id=c.id and ch.kind='flight' and ch.day > current_date - 365),0) as flights,
      coalesce((select sum(amount) from charges ch where ch.client_id=c.id and ch.kind='storage' and ch.day > current_date - 365),0) as storage,
      coalesce((select sum(amount) from charges ch where ch.client_id=c.id and ch.kind='maintenance' and ch.day > current_date - 365),0) as maintenance,
      coalesce((select sum(qty) from charges ch where ch.client_id=c.id and ch.kind='flight' and ch.day > current_date - 365),0) as hours,
      coalesce((select sum(total) from invoices i where i.client_id=c.id and i.status='paid' and i.paid_at > now() - interval '365 days'),0) as paid,
      coalesce((select sum(total) from invoices i where i.client_id=c.id and i.status='sent'),0) as debt,
      (select avg(extract(epoch from (paid_at - issued::timestamptz))/86400) from invoices i where i.client_id=c.id and i.status='paid') as pay_days
    from clients c where not c.archived order by c.name`);
  const out = rows.map((r) => ({ ...r, revenue: n(r.revenue), flights: n(r.flights), storage: n(r.storage), maintenance: n(r.maintenance), hours: n(r.hours), paid: n(r.paid), debt: n(r.debt), pay_days: r.pay_days == null ? null : Math.round(n(r.pay_days)) }));
  const total = out.reduce((a, r) => a + r.revenue, 0);
  return out.map((r) => ({ ...r, share: total ? r.revenue / total : 0 })).sort((a, b) => b.revenue - a.revenue);
}

/** По вертолёту: доход (полёты на нём + хранение и обслуживание у его владельцев) минус расходы на него; окупаемость от цены покупки. */
export async function aircraftFinance() {
  const craft = await q<any>("select * from aircraft order by reg");
  const out = [];
  for (const a of craft) {
    const rev = (since: string) =>
      q<{ s: string }>(
        `select coalesce(sum(ch.amount),0) s from charges ch
         left join flights f on f.id=ch.flight_id
         join clients c on c.id=ch.client_id
         where ch.day >= ${since} and (lower(f.aircraft)=lower($1) or (ch.flight_id is null and lower(c.aircraft) like '%'||lower($1)||'%'))`,
        [a.reg],
      );
    const cost = (since: string) => q<{ s: string }>(`select coalesce(sum(amount),0) s from aircraft_costs where aircraft_id=$1 and day >= ${since}`, [a.id]);
    const from = a.purchase_date ? `'${String(a.purchase_date).slice(0, 10)}'::date` : "'1900-01-01'::date";
    const [r12, c12, r6, c6, rAll, cAll, hrs, costs] = await Promise.all([
      rev("current_date - 365"),
      cost("current_date - 365"),
      rev("current_date - 182"),
      cost("current_date - 182"),
      rev(from),
      cost(from),
      q<{ h: string }>("select coalesce(sum(hours),0) h from flights where lower(aircraft)=lower($1) and day > current_date - 365", [a.reg]),
      q<any>("select kind, sum(amount) s from aircraft_costs where aircraft_id=$1 and day > current_date - 365 group by kind order by sum(amount) desc", [a.id]),
    ]);
    const revenue = n(r12[0].s);
    const costsSum = n(c12[0].s);
    const profit = revenue - costsSum;
    const monthly = (n(r6[0].s) - n(c6[0].s)) / 6;
    const earned = n(rAll[0].s) - n(cAll[0].s);
    const price = a.purchase_price != null ? n(a.purchase_price) : null;
    const left = price != null ? Math.max(0, price - earned) : null;
    out.push({
      id: a.id,
      reg: a.reg,
      model: a.model,
      hours: n(hrs[0].h),
      revenue,
      costs: costsSum,
      profit,
      perHour: n(hrs[0].h) ? profit / n(hrs[0].h) : null,
      costBreakdown: costs.map((c) => ({ kind: c.kind, sum: n(c.s) })),
      price,
      earned,
      payback: price ? Math.min(1, Math.max(0, earned / price)) : null,
      monthsLeft: left != null && monthly > 0 ? Math.ceil(left / monthly) : null,
      monthly,
    });
  }
  return out;
}

/** Рынок вокруг объекта: медиана цены за м² у похожих домов и где наш план продажи. */
export async function siteMarket(siteId: string) {
  const site = (await q<any>("select * from sites where id=$1", [siteId]))[0];
  const comps = await q<any>("select * from comps where site_id=$1 order by day desc, price", [siteId]);
  const ppm = comps.filter((c) => n(c.price) && n(c.area_m2)).map((c) => n(c.price) / n(c.area_m2)).sort((a, b) => a - b);
  const median = ppm.length ? (ppm.length % 2 ? ppm[(ppm.length - 1) / 2] : (ppm[ppm.length / 2 - 1] + ppm[ppm.length / 2]) / 2) : null;
  const ours = site?.sale_target && site?.area_m2 ? n(site.sale_target) / n(site.area_m2) : null;
  return { comps, median, min: ppm[0] ?? null, max: ppm[ppm.length - 1] ?? null, ours, diff: median && ours ? ours / median - 1 : null, updated: comps[0]?.day || null };
}

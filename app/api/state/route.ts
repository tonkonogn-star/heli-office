import { guard } from "@/lib/auth";
import { q, getSetting } from "@/lib/db";
import { overview, company } from "@/lib/ops";
import { whoopStatus, whoopDays, syncIfStale } from "@/lib/whoop";
import { apiKey } from "@/lib/chat";
import { labTrends } from "@/lib/personal";
import { clientFinance, aircraftFinance, siteMarket } from "@/lib/finance";

export const dynamic = "force-dynamic";

/** Всё для экранов одним запросом. */
export const GET = guard(async () => {
  await syncIfStale(180);
  const [o, clients, invoices, sites, stages, expenses, contracts, aircraft, docs, pilot, co, base, onboarded, ws, wd, health, usage, google, insta] = await Promise.all([
    overview(),
    q<any>("select * from clients where not archived order by name"),
    q<any>("select i.*, c.name client from invoices i join clients c on c.id=i.client_id order by i.created_at desc limit 200"),
    q<any>("select * from sites order by created_at"),
    q<any>("select * from stages order by sort, due nulls last"),
    q<any>("select * from expenses order by day desc, created_at desc"),
    q<any>("select id,space,title,party,status,amount,currency,checks,updated_at from contracts order by updated_at desc"),
    q<any>("select * from aircraft order by reg"),
    q<any>("select id,space,shelf,name,title,mime,size,created_at from documents where not archived order by created_at desc limit 300"),
    getSetting("pilot"),
    company(),
    getSetting("base"),
    getSetting("onboarded"),
    whoopStatus(),
    whoopDays(7).catch(() => []),
    getSetting("claude_health"),
    getSetting("api_usage"),
    getSetting("google"),
    getSetting("instagram"),
  ]);
  const demo = await getSetting("demo");
  const [finC, finA] = await Promise.all([clientFinance(), aircraftFinance()]);
  const market: Record<string, any> = {};
  for (const x of sites) market[x.id] = await siteMarket(x.id);
  const [payments, spends, labs] = await Promise.all([
    q<any>("select * from payments where active order by next_due nulls last, title"),
    q<any>("select * from payment_log where day >= date_trunc('month', current_date) - interval '2 months' order by day desc, id desc"),
    labTrends(),
  ]);
  const charges = await q<any>("select ch.*, c.name client from charges ch join clients c on c.id=ch.client_id where ch.invoice_id is null order by ch.day desc limit 200");
  return Response.json({
    ...o,
    clients,
    invoices,
    charges,
    payments,
    spends,
    labs,
    finance: { clients: finC, aircraft: finA },
    market,
    sites,
    stages,
    expenses,
    contracts,
    aircraft,
    docs,
    pilot: pilot || {},
    company: co,
    base,
    onboarded: !!onboarded,
    // в режиме примера показываем выдуманный WHOOP, чтобы было видно, как выглядят виджеты
    whoop: !ws.connected && demo ? { connected: true, demo: true, available: true, days: DEMO_WHOOP() } : { ...ws, days: wd, available: !!(process.env.WHOOP_CLIENT_ID || ws.hasClient) },
    google: { connected: !!(google as any)?.connected, available: !!process.env.GOOGLE_CLIENT_ID },
    instagram: { connected: !!(insta as any)?.connected, handle: (insta as any)?.handle || "" },
    claude: { hasKey: !!(await apiKey()), health },
    usage,
    demo: !!demo,
  });
});

function DEMO_WHOOP() {
  const rec = [72, 58, 81, 44, 67, 75, 63];
  const sleep = [7.4, 6.6, 8.1, 5.9, 7.0, 7.6, 6.8];
  return rec.map((r, i) => ({ d: new Date(Date.now() - i * 864e5).toISOString().slice(0, 10), recovery: r, sleep_hours: sleep[i], sleep_perf: 70 + ((i * 7) % 25), strain: 9 + ((i * 3) % 8), rhr: 52 + (i % 4), hrv: 60 + ((i * 5) % 20) }));
}

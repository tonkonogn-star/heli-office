import { guard } from "@/lib/auth";
import { q, getSetting } from "@/lib/db";
import { overview, company } from "@/lib/ops";
import { whoopStatus, whoopDays, syncIfStale } from "@/lib/whoop";
import { apiKey } from "@/lib/chat";

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
  const charges = await q<any>("select ch.*, c.name client from charges ch join clients c on c.id=ch.client_id where ch.invoice_id is null order by ch.day desc limit 200");
  return Response.json({
    ...o,
    clients,
    invoices,
    charges,
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
    whoop: { ...ws, days: wd, available: !!(process.env.WHOOP_CLIENT_ID || ws.hasClient) },
    google: { connected: !!(google as any)?.connected, available: !!process.env.GOOGLE_CLIENT_ID },
    instagram: { connected: !!(insta as any)?.connected, handle: (insta as any)?.handle || "" },
    claude: { hasKey: !!(await apiKey()), health },
    usage,
  });
});

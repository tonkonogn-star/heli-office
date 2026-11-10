import { guard } from "@/lib/auth";
import { accountingCsv, lastMonth } from "@/lib/extra";

export const dynamic = "force-dynamic";

/** Выгрузка для бухгалтера: ?period=YYYY-MM, по умолчанию прошлый месяц. */
export const GET = guard(async (req: Request) => {
  const p = new URL(req.url).searchParams.get("period") || lastMonth();
  return new Response(await accountingCsv(p), { headers: { "content-type": "text/csv; charset=utf-8", "content-disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`Выгрузка ${p}.csv`)}` } });
});

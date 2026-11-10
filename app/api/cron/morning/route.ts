import { cronOk } from "@/lib/auth";
import { q } from "@/lib/db";
import { morningBrief } from "@/lib/morning";
import { syncRadar } from "@/lib/extra";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

/** Каждое утро: сводка дня в общий чат — погода для полёта, самочувствие, что горит. */
export async function GET(req: Request) {
  if (!cronOk(req)) return new Response("forbidden", { status: 403 });
  // сначала радар: новые полёты попадут в сводку как «записать?»
  await syncRadar().catch(() => null);
  const text = await morningBrief();
  if (text) await q("insert into messages(thread,role,text,meta) values('inbox','assistant',$1,$2)", [text, JSON.stringify({ auto: "morning" })]);
  return Response.json({ ok: true, text });
}

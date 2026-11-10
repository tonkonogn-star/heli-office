import { guard } from "@/lib/auth";
import { q } from "@/lib/db";
import { textPdf } from "@/lib/pdf";

export const dynamic = "force-dynamic";

export const GET = guard(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const c = (await q<any>("select * from contracts where id=$1", [id]))[0];
  if (!c) return new Response("Нет договора", { status: 404 });
  const buf = await textPdf(c.title, c.body || "(текста пока нет)");
  const dl = new URL(req.url).searchParams.has("download");
  return new Response(new Uint8Array(buf), { headers: { "content-type": "application/pdf", "content-disposition": `${dl ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(c.title + ".pdf")}`, "cache-control": "no-store" } });
});

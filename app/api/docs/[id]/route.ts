import { guard } from "@/lib/auth";
import { q } from "@/lib/db";

export const dynamic = "force-dynamic";

export const GET = guard(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const d = (await q<any>("select name,mime,data from documents where id=$1", [id]))[0];
  if (!d?.data) return new Response("Нет файла", { status: 404 });
  const dl = new URL(req.url).searchParams.has("download");
  return new Response(new Uint8Array(d.data), {
    headers: { "content-type": d.mime, "content-disposition": `${dl ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(d.name)}`, "cache-control": "private, max-age=300" },
  });
});

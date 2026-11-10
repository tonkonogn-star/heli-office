import { guard } from "@/lib/auth";
import { invoicePdf } from "@/lib/pdf";

export const dynamic = "force-dynamic";

export const GET = guard(async (req: Request, ctx: { params: Promise<{ id: string }> }) => {
  const { id } = await ctx.params;
  const { buf, name } = await invoicePdf(id);
  const dl = new URL(req.url).searchParams.has("download");
  return new Response(new Uint8Array(buf), { headers: { "content-type": "application/pdf", "content-disposition": `${dl ? "attachment" : "inline"}; filename*=UTF-8''${encodeURIComponent(name)}`, "cache-control": "no-store" } });
});

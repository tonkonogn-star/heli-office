import { q } from "@/lib/db";
import { invoicePdf, textPdf } from "@/lib/pdf";
import { shareOk, accountingCsv } from "@/lib/extra";

export const dynamic = "force-dynamic";

/** Файл по подписанной ссылке — без пароля, но только тот, на который дали ссылку, и не дольше срока. */
export async function GET(req: Request, ctx: { params: Promise<{ kind: string; id: string }> }) {
  const { kind, id } = await ctx.params;
  const u = new URL(req.url).searchParams;
  if (!(await shareOk(kind, id, u.get("e") || "", u.get("s") || ""))) return new Response("Ссылка устарела или неверна", { status: 403 });
  const out = (buf: Uint8Array | string, type: string, name: string) =>
    new Response(buf as any, { headers: { "content-type": type, "content-disposition": `inline; filename*=UTF-8''${encodeURIComponent(name)}`, "cache-control": "no-store" } });
  if (kind === "invoice") {
    const { buf, name } = await invoicePdf(id);
    return out(new Uint8Array(buf), "application/pdf", name);
  }
  if (kind === "contract") {
    const c = (await q<any>("select * from contracts where id=$1", [id]))[0];
    if (!c) return new Response("Нет договора", { status: 404 });
    return out(new Uint8Array(await textPdf(c.title, c.body || "")), "application/pdf", c.title + ".pdf");
  }
  if (kind === "doc") {
    const d = (await q<any>("select name,mime,data from documents where id=$1", [id]))[0];
    if (!d?.data) return new Response("Нет файла", { status: 404 });
    return out(new Uint8Array(d.data), d.mime, d.name);
  }
  if (kind === "export") return out(await accountingCsv(id), "text/csv; charset=utf-8", `Выгрузка ${id}.csv`);
  return new Response("Не найдено", { status: 404 });
}

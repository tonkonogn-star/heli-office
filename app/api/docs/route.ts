import { guard } from "@/lib/auth";
import { q, newId } from "@/lib/db";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

function guessShelf(name: string) {
  const n = name.toLowerCase();
  if (/договор|contract|agreement|spa\b/.test(n)) return "Договоры";
  if (/счет|счёт|invoice|rechnung/.test(n)) return "Счета";
  if (/спец|spec|прайс|price|опци|option/.test(n)) return "Спецификации";
  if (/смет|estimate|кошторис/.test(n)) return "Сметы";
  if (/акт|отчет|отчёт|report/.test(n)) return "Акты";
  if (/\.(jpe?g|png|heic|webp)$/.test(n)) return "Фото";
  return "Разное";
}

export const POST = guard(async (req: Request) => {
  const form = await req.formData();
  const space = String(form.get("space") || "general");
  const out: any[] = [];
  for (const f of form.getAll("file")) {
    if (!(f instanceof File)) continue;
    const buf = Buffer.from(await f.arrayBuffer());
    if (buf.length > 25 * 1024 * 1024) throw new Error(`${f.name}: больше 25 МБ`);
    let content: string | null = null;
    const mime = f.type || "application/octet-stream";
    if (/^text\//.test(mime) || /\.(txt|md|csv)$/i.test(f.name)) content = buf.toString("utf8");
    else if (/wordprocessingml/.test(mime) || /\.docx$/i.test(f.name)) {
      try {
        const mammoth: any = await import("mammoth");
        content = (await mammoth.extractRawText({ buffer: buf })).value;
      } catch {}
    }
    const id = newId("doc");
    await q("insert into documents(id,space,shelf,name,title,mime,size,data,content) values($1,$2,$3,$4,$4,$5,$6,$7,$8)", [id, space, guessShelf(f.name), f.name, mime, buf.length, buf, content]);
    out.push({ id, name: f.name, mime });
  }
  return Response.json({ docs: out });
});

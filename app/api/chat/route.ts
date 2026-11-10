import { guard } from "@/lib/auth";
import { q } from "@/lib/db";
import { runChat, ndjsonStream } from "@/lib/chat";

export const maxDuration = 300;
export const dynamic = "force-dynamic";

export const POST = guard(async (req: Request) => {
  const { thread, text, docs } = await req.json();
  if (!String(text || "").trim()) return Response.json({ error: "empty" }, { status: 400 });
  const stream = ndjsonStream((emit) => runChat(String(thread || "inbox"), String(text).trim(), Array.isArray(docs) ? docs : [], emit));
  return new Response(stream, { headers: { "content-type": "application/x-ndjson; charset=utf-8", "cache-control": "no-store" } });
});

export const GET = guard(async (req: Request) => {
  const thread = new URL(req.url).searchParams.get("thread") || "inbox";
  const rows = await q<any>("select id,role,text,meta,created_at from (select * from messages where thread=$1 order by id desc limit 80) x order by id", [thread]);
  return Response.json({ messages: rows });
});

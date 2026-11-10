import { TOOLS, runTool } from "@/lib/tools";
import { getSetting, q } from "@/lib/db";
import { buildSystem } from "@/lib/chat";
import crypto from "node:crypto";

export const dynamic = "force-dynamic";
export const maxDuration = 300;

// Коннектор для Claude (claude.ai, телефон, компьютер): всё, что Максим говорит Claude, записывается сюда же.
const EXTRA = [
  {
    name: "heli_context",
    description: "Все данные Максима из его приложения: клиенты Heliclub, ставки, долги и счета, вертолёты, объекты стройки, сделки, договоры, дела, что не сходится. Вызывай в начале любого разговора о его работе.",
    input_schema: { type: "object", properties: {} },
  },
  {
    name: "heli_chat_read",
    description: "Прочитать переписку Максима в приложении (общий чат или чат помощника), чтобы не переспрашивать. thread: inbox или a:billing, a:contracts, a:build, a:tech, a:finance, a:deals, a:flip, a:devil.",
    input_schema: { type: "object", properties: { thread: { type: "string" }, limit: { type: "integer" } } },
  },
  {
    name: "heli_app_wishes",
    description: "Пожелания Максима к самому приложению (что поменять или добавить), которые он оставил в чате. Нужны, когда он просит Claude Code доработать приложение.",
    input_schema: { type: "object", properties: {} },
  },
];

const tools = () => [...EXTRA, ...TOOLS].map((t: any) => ({ name: t.name, description: t.description, inputSchema: t.input_schema }));

async function call(name: string, args: any) {
  if (name === "heli_context") return buildSystem("inbox");
  if (name === "heli_chat_read") {
    const rows = await q<any>("select role,text,to_char(created_at at time zone 'Europe/Vienna','DD.MM HH24:MI') at from (select * from messages where thread=$1 order by id desc limit $2) x order by id", [args?.thread || "inbox", Math.min(Number(args?.limit) || 30, 100)]);
    return rows.map((r) => `[${r.at}] ${r.role === "user" ? "Максим" : "Помощник"}: ${r.text}`).join("\n\n") || "Переписки нет.";
  }
  if (name === "heli_app_wishes") {
    const rows = await q<any>("select id,title,notes,status,to_char(created_at,'DD.MM.YYYY') at from tasks where title ilike 'Приложение:%' order by created_at desc limit 50");
    return rows.map((r) => `${r.id} [${r.status}] ${r.at} ${r.title}${r.notes ? " — " + r.notes : ""}`).join("\n") || "Пожеланий нет.";
  }
  const r = await runTool(name, args || {});
  return r.result;
}

const ok = (id: any, result: any) => Response.json({ jsonrpc: "2.0", id, result });
const err = (id: any, code: number, message: string) => Response.json({ jsonrpc: "2.0", id, error: { code, message } });

export async function POST(req: Request, ctx: { params: Promise<{ key: string }> }) {
  const { key } = await ctx.params;
  const real = await getSetting<string>("mcp_key");
  if (!real || key.length !== real.length || !crypto.timingSafeEqual(Buffer.from(key), Buffer.from(real))) return new Response("forbidden", { status: 403 });
  const m = await req.json().catch(() => null);
  if (!m || Array.isArray(m)) return err(null, -32600, "Invalid request");
  if (m.id === undefined || String(m.method || "").startsWith("notifications/")) return new Response(null, { status: 202 });
  switch (m.method) {
    case "initialize":
      return ok(m.id, {
        protocolVersion: m.params?.protocolVersion || "2025-06-18",
        capabilities: { tools: { listChanged: false } },
        serverInfo: { name: "heli-office", title: "Офис Максима", version: "1.0.0" },
        instructions: "Это рабочее приложение Максима Лунева: Heliclub (клиенты, хранение, полёты, обслуживание, счета, вертолёты, сделки Bell) и стройка (флип-хаусы). В начале разговора о его работе вызови heli_context. Всё, что он сообщает (полёт, работа, расход, дело), сразу записывай инструментами. Счета только готовь черновиками, никому ничего не отправляй.",
      });
    case "ping":
      return ok(m.id, {});
    case "tools/list":
      return ok(m.id, { tools: tools() });
    case "tools/call":
      try {
        return ok(m.id, { content: [{ type: "text", text: (await call(m.params?.name, m.params?.arguments)) || "Готово." }] });
      } catch (e: any) {
        return ok(m.id, { content: [{ type: "text", text: "Ошибка: " + (e?.message || e) }], isError: true });
      }
    default:
      return err(m.id, -32601, "Method not found");
  }
}

export async function GET() {
  return new Response("Method Not Allowed", { status: 405, headers: { Allow: "POST" } });
}

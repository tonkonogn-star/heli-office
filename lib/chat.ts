import Anthropic from "@anthropic-ai/sdk";
import { q, getSetting, setSetting } from "./db";
import { TOOLS, runTool } from "./tools";
import { AGENTS, agentById, BASE } from "./agents";
import { dossier } from "./ops";
import { DEPTH, RESEARCH_Q } from "./depth";

export type Emit = (ev: Record<string, unknown>) => void;

export const MODELS = { chat: "claude-sonnet-5-5", deep: "claude-opus-5-5" };

export async function apiKey() {
  return process.env.ANTHROPIC_API_KEY || (await getSetting<any>("keys"))?.anthropic || "";
}

const NOW_MARK = "\n\n## Сейчас\n";
const EPH = { type: "ephemeral" } as const;

/** Кэш промпта: роль, досье и инструменты одинаковы между сообщениями — повтор стоит ~10% цены. */
export function addCache(body: any) {
  if (!body?.messages) return body;
  if (Array.isArray(body.tools)) {
    for (let i = body.tools.length - 1; i >= 0; i--) {
      if (!body.tools[i].type || body.tools[i].type === "custom") {
        body.tools[i] = { ...body.tools[i], cache_control: EPH };
        break;
      }
    }
  }
  if (typeof body.system === "string") {
    const i = body.system.indexOf(NOW_MARK);
    body.system = i > 0 ? [{ type: "text", text: body.system.slice(0, i), cache_control: EPH }, { type: "text", text: body.system.slice(i) }] : [{ type: "text", text: body.system, cache_control: EPH }];
  }
  const m = body.messages[body.messages.length - 1];
  if (m) {
    if (typeof m.content === "string" && m.content) m.content = [{ type: "text", text: m.content, cache_control: EPH }];
    else if (Array.isArray(m.content)) {
      for (let i = m.content.length - 1; i >= 0; i--) {
        const b = m.content[i];
        if (["text", "tool_result", "image", "document"].includes(b?.type) && !(b.type === "text" && !b.text)) {
          m.content[i] = { ...b, cache_control: EPH };
          break;
        }
      }
    }
  }
  return body;
}

/** Расходы по дням — видно в настройках, сколько стоит помощник. */
async function noteUsage(model: string, u: any) {
  if (!u) return;
  try {
    const day = new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Vienna" });
    const all: any = (await getSetting("api_usage")) || {};
    const r = ((all[day] ||= {})[model] ||= { in: 0, out: 0, cr: 0, cw: 0, n: 0 });
    r.in += u.input_tokens || 0;
    r.out += u.output_tokens || 0;
    r.cr += u.cache_read_input_tokens || 0;
    r.cw += u.cache_creation_input_tokens || 0;
    r.n++;
    const keep = Object.keys(all).sort().slice(-60);
    await setSetting("api_usage", Object.fromEntries(keep.map((k) => [k, all[k]])));
  } catch {}
}

const watchedFetch: typeof fetch = async (input: any, init?: any) => {
  const url = typeof input === "string" ? input : input?.url || "";
  if (init && typeof init.body === "string" && /\/v1\/messages(\?|$)/.test(url)) {
    try {
      init = { ...init, body: JSON.stringify(addCache(JSON.parse(init.body))) };
    } catch {}
  }
  const res = await fetch(input, init);
  if (!res.ok && [400, 401, 403].includes(res.status)) {
    const body = await res.clone().text().catch(() => "");
    if (/credit balance is too low/i.test(body)) await setSetting("claude_health", { ok: false, reason: "credits", at: new Date().toISOString() });
    else if (res.status === 401) await setSetting("claude_health", { ok: false, reason: "key", at: new Date().toISOString() });
  } else if (res.ok) await setSetting("claude_health", { ok: true }).catch(() => {});
  return res;
};

export function client(key: string) {
  return new Anthropic({ apiKey: key, baseURL: process.env.ANTHROPIC_BASE_URL || undefined, fetch: watchedFetch as any });
}

const WEB_SEARCH = { type: "web_search_20260318", name: "web_search", max_uses: 5 };

export async function buildSystem(thread: string) {
  const a = thread.startsWith("a:") ? agentById(thread.slice(2)) : null;
  const team = AGENTS.map((x) => `- ${x.name}: ${x.about}`).join("\n");
  const now = new Date().toLocaleString("ru-RU", { timeZone: "Europe/Vienna", weekday: "long", day: "numeric", month: "long", year: "numeric", hour: "2-digit", minute: "2-digit" });
  return (
    BASE +
    DEPTH +
    (a ? `\n\n## Твоя роль: ${a.name}\n${a.role}` : `\n\n## Ты — секретарь в общем чате\nОтвечаешь на всё сам. Команда помощников (у каждого свой чат в приложении), можешь посоветовать Максиму зайти к нужному:\n${team}`) +
    "\n\n# Данные Максима\n" +
    (await dossier()) +
    NOW_MARK +
    `${now} (Вена).`
  );
}

async function history(thread: string, limit = 24) {
  const rows = await q<{ role: string; text: string }>("select role,text from (select id,role,text from messages where thread=$1 order by id desc limit $2) x order by id", [thread, limit]);
  const out: { role: "user" | "assistant"; content: any }[] = [];
  for (const r of rows) {
    if (!r.text.trim()) continue;
    const role = r.role as "user" | "assistant";
    if (out.length && out[out.length - 1].role === role) out[out.length - 1].content += "\n\n" + r.text;
    else out.push({ role, content: r.text });
  }
  while (out.length && out[0].role !== "user") out.shift();
  return out;
}

/** Приложенные файлы: PDF и фото Claude читает сам, Word и текст — как текст. */
async function attachments(ids: string[]) {
  if (!ids?.length) return [];
  const docs = await q<any>("select id,name,mime,data,content from documents where id = any($1)", [ids]);
  const blocks: any[] = [];
  for (const d of docs) {
    if (d.mime === "application/pdf" && d.data) blocks.push({ type: "document", source: { type: "base64", media_type: "application/pdf", data: Buffer.from(d.data).toString("base64") }, title: d.name });
    else if (/^image\/(jpeg|png|gif|webp)$/.test(d.mime) && d.data) blocks.push({ type: "image", source: { type: "base64", media_type: d.mime, data: Buffer.from(d.data).toString("base64") } });
    else if (d.content) blocks.push({ type: "text", text: `[Документ ${d.id} «${d.name}»]\n${String(d.content).slice(0, 60000)}` });
    else blocks.push({ type: "text", text: `[Документ ${d.id} «${d.name}» — этот формат не прочитать]` });
  }
  return blocks;
}

const DEEP = /(договор|спецификац|сверь|проверь цифры|оцени дом|оценка|прогноз|подумай глубоко|разбери подробно|риск|анализ)/i;

export async function runChat(thread: string, text: string, docIds: string[], emit: Emit) {
  const key = await apiKey();
  if (!key) {
    emit({ type: "error", text: "Помощник ещё не подключён: нет ключа Claude. Его вставляют один раз в «Настройках»." });
    return;
  }
  const docNames = docIds?.length ? (await q<{ name: string }>("select name from documents where id=any($1)", [docIds])).map((d) => d.name) : [];
  const um = await q<{ id: number }>("insert into messages(thread,role,text,meta) values($1,'user',$2,$3) returning id", [thread, text, JSON.stringify({ docs: docIds || [], docNames })]);
  emit({ type: "user_saved", id: um[0].id });
  const actions: string[] = [];
  let full = "";
  let changed = false;
  try {
    const [system, msgs, att] = await Promise.all([buildSystem(thread), history(thread), attachments(docIds)]);
    if (att.length && msgs.length) {
      const last = msgs[msgs.length - 1];
      last.content = [...att, { type: "text", text: typeof last.content === "string" ? last.content : "" }];
    }
    const heavy = !!docIds?.length || DEEP.test(text) || RESEARCH_Q.test(text) || thread === "a:contracts" || thread === "a:flip";
    const r = await agentLoop({ key, system, msgs, heavy, emit: (ev) => {
      if (ev.type === "text") full += String(ev.text || "");
      if (ev.type === "action") actions.push(String(ev.text));
      emit(ev);
    } });
    full = r.full;
    changed = r.changed;
  } catch (e: any) {
    console.error("chat", e);
    const why = friendly(e);
    full = (full.trim() ? full.trim() + "\n\n" : "") + why;
    // ответ всегда остаётся в разговоре, даже если связь оборвалась
    const saved = await q<{ id: number }>("insert into messages(thread,role,text,meta) values($1,'assistant',$2,$3) returning id", [thread, full, JSON.stringify({ error: true, actions })]);
    emit({ type: "error", text: why, id: saved[0]?.id, changed: actions.length > 0 });
    return;
  }
  const saved = await q<{ id: number }>("insert into messages(thread,role,text,meta) values($1,'assistant',$2,$3) returning id", [thread, full.trim(), JSON.stringify({ actions })]);
  emit({ type: "done", id: saved[0].id, changed });
}

function friendly(e: any) {
  const m = String(e?.message || e);
  if (/credit balance/i.test(m)) return "Закончились деньги на счёте Claude API — пополни баланс в настройках (кнопка «Пополнить»).";
  if (/401|api.key|authentication/i.test(m)) return "Ключ Claude не подходит — проверь его в настройках.";
  if (/overloaded|529/i.test(m)) return "Claude сейчас перегружен. Повтори через минуту.";
  return "Не получилось закончить ответ: " + m.slice(0, 160);
}

const ACTION_LABEL: Record<string, string> = {
  save_client: "Клиент сохранён",
  log_flight: "Полёт записан",
  add_charge: "Добавлено в счёт",
  delete_charge: "Строка удалена",
  draft_invoices: "Черновики счетов готовы",
  invoice_status: "Статус счёта изменён",
  save_aircraft: "Вертолёт обновлён",
  set_pilot: "Документы пилота обновлены",
  save_task: "Дело записано",
  save_deal: "Сделка обновлена",
  save_contract: "Договор сохранён",
  save_site: "Объект сохранён",
  save_stage: "Этап обновлён",
  add_expense: "Расход записан",
  set_company: "Реквизиты сохранены",
  remember: "Запомнил",
  file_document: "Документ разложен",
  save_payment: "Платёж сохранён",
  pay_payment: "Оплата отмечена",
  log_spend: "Трата записана",
  record_labs: "Анализы записаны",
};

/** Цикл модели с инструментами: чат, коннектор и утренняя сводка. */
export async function agentLoop(o: { key: string; system: string; msgs: any[]; heavy?: boolean; emit: Emit; maxTurns?: number; deadline?: number }) {
  const c = client(o.key);
  const msgs = [...o.msgs];
  let full = "";
  let changed = false;
  const deadline = o.deadline || Date.now() + 230_000;
  for (let turn = 0; turn < (o.maxTurns || 12); turn++) {
    if (turn > 0 && Date.now() > deadline) break;
    const model = o.heavy ? MODELS.deep : MODELS.chat;
    const stream = c.messages.stream({ model, max_tokens: o.heavy ? 12000 : 6000, system: o.system, messages: msgs, tools: [{ ...WEB_SEARCH, max_uses: o.heavy ? 15 : 5 } as any, ...(TOOLS as any)] });
    for await (const ev of stream as any) {
      if (ev.type === "content_block_delta" && ev.delta?.type === "text_delta") {
        full += ev.delta.text;
        o.emit({ type: "text", text: ev.delta.text });
      } else if (ev.type === "content_block_start" && ev.content_block?.type === "server_tool_use") o.emit({ type: "status", text: "Ищу в интернете…" });
    }
    const msg: any = await stream.finalMessage();
    noteUsage(model, msg.usage);
    msgs.push({ role: "assistant", content: msg.content });
    const uses = msg.content.filter((b: any) => b.type === "tool_use");
    if (msg.stop_reason === "pause_turn") continue;
    if (!uses.length) break;
    const results: any[] = [];
    for (const u of uses) {
      o.emit({ type: "status", text: ACTION_LABEL[u.name] ? "Записываю…" : "Смотрю данные…" });
      try {
        const r = await runTool(u.name, u.input || {});
        if (r.changed) {
          changed = true;
          if (ACTION_LABEL[u.name]) o.emit({ type: "action", text: ACTION_LABEL[u.name] });
        }
        results.push({ type: "tool_result", tool_use_id: u.id, content: r.result || "Готово." });
      } catch (e: any) {
        results.push({ type: "tool_result", tool_use_id: u.id, content: "Ошибка: " + (e?.message || e), is_error: true });
      }
    }
    msgs.push({ role: "user", content: results });
    if (full && !full.endsWith("\n")) {
      full += "\n\n";
      o.emit({ type: "text", text: "\n\n" });
    }
  }
  return { full, changed };
}

export function ndjsonStream(run: (emit: Emit) => Promise<void>) {
  const enc = new TextEncoder();
  return new ReadableStream({
    async start(ctrl) {
      const emit: Emit = (ev) => {
        try {
          ctrl.enqueue(enc.encode(JSON.stringify(ev) + "\n"));
        } catch {}
      };
      // держим соединение живым, пока модель думает
      const ping = setInterval(() => emit({ type: "ping" }), 10_000);
      try {
        await run(emit);
      } catch (e: any) {
        emit({ type: "error", text: String(e?.message || e) });
      } finally {
        clearInterval(ping);
        try {
          ctrl.close();
        } catch {}
      }
    },
  });
}

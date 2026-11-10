import { getSetting } from "./db";

/* Внешние подключения, которые Максим вставляет сам: Gemini, ChatGPT, Make. Ключи наружу не отдаются. */

export const OTHER_MODELS = { openai: "gpt-6.1-sol", gemini: "gemini-4-argon", geminiFallback: "gemini-3.8-flash" };

export async function keys() {
  const k = (await getSetting<any>("keys")) || {};
  return {
    anthropic: process.env.ANTHROPIC_API_KEY || k.anthropic || "",
    openai: k.openai || process.env.OPENAI_API_KEY || "",
    gemini: k.gemini || process.env.GEMINI_API_KEY || "",
    windy: process.env.WINDY_KEY || k.windy || "",
    stripe: k.stripe || process.env.STRIPE_SECRET_KEY || "",
    opensky: k.opensky_id || "",
  };
}

/** Для экрана настроек: есть ли ключ и его последние 4 знака. */
export async function keyStatus() {
  const k = await keys();
  const m = (s: string) => (s ? "…" + s.slice(-4) : "");
  return { anthropic: m(k.anthropic), openai: m(k.openai), gemini: m(k.gemini), windy: m(k.windy), stripe: m(k.stripe), opensky: k.opensky ? "…" + k.opensky.slice(-4) : "" };
}

async function readJson(res: Response, who: string) {
  const t = await res.text().catch(() => "");
  try {
    return JSON.parse(t);
  } catch {
    throw new Error(`${who} ${res.status}: ${t.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 120)}`);
  }
}

async function askOpenAI(key: string, system: string, question: string) {
  const call = (tools: boolean) =>
    fetch("https://api.openai.com/v1/responses", {
      method: "POST",
      headers: { "content-type": "application/json", authorization: `Bearer ${key}` },
      body: JSON.stringify({ model: OTHER_MODELS.openai, instructions: system, input: question, ...(tools ? { tools: [{ type: "web_search" }] } : {}) }),
      signal: AbortSignal.timeout(90000),
    });
  let res = await call(true);
  if (res.status === 400) res = await call(false);
  const j: any = await readJson(res, "ChatGPT");
  if (!res.ok) throw new Error(j?.error?.message || `ChatGPT ${res.status}`);
  if (typeof j.output_text === "string") return j.output_text.trim();
  const parts: string[] = [];
  for (const o of j.output || []) for (const c of o.content || []) if (c.type === "output_text" && c.text) parts.push(c.text);
  return parts.join("\n").trim();
}

async function askGeminiModel(key: string, model: string, system: string, question: string) {
  const call = (tools: boolean) =>
    fetch(`https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
      method: "POST",
      headers: { "content-type": "application/json", "x-goog-api-key": key },
      body: JSON.stringify({ systemInstruction: { parts: [{ text: system }] }, contents: [{ role: "user", parts: [{ text: question }] }], ...(tools ? { tools: [{ google_search: {} }] } : {}) }),
      signal: AbortSignal.timeout(90000),
    });
  let res = await call(true);
  if (res.status === 400) res = await call(false);
  const j: any = await readJson(res, "Gemini");
  if (!res.ok) throw Object.assign(new Error(j?.error?.message || `Gemini ${res.status}`), { status: res.status });
  const text = (j.candidates?.[0]?.content?.parts || []).map((p: any) => p.text || "").join("").trim();
  if (!text) throw new Error("Gemini вернул пустой ответ");
  return text;
}

/** Старшая модель Gemini требует оплаты; на бесплатном ключе отвечает Flash. */
async function askGemini(key: string, system: string, question: string) {
  try {
    return await askGeminiModel(key, OTHER_MODELS.gemini, system, question);
  } catch (e: any) {
    if (e?.status === 401 || /API key/i.test(String(e?.message))) throw e;
    return askGeminiModel(key, OTHER_MODELS.geminiFallback, system, question);
  }
}

/** Второе мнение: тот же вопрос — Gemini и ChatGPT параллельно. Итог сводит Claude. */
export async function secondOpinion(question: string, context: string) {
  const k = await keys();
  const system =
    "Ты независимый советник Максима Лунева: Heliclub (доли в вертолётах, хранение, обслуживание, полёты, представительство Bell) и стройка флип-хаусов в Roquebrune-Cap-Martin. Отвечай по-русски, по существу, до 200 слов: твоя позиция, 2–3 главных аргумента, главный риск. Если не хватает данных — скажи каких." +
    (context ? "\n\nКонтекст:\n" + context.slice(0, 6000) : "");
  const who: [string, string, (k: string, s: string, q: string) => Promise<string>][] = [
    ["Gemini", k.gemini, askGemini],
    ["ChatGPT", k.openai, askOpenAI],
  ];
  if (!k.gemini && !k.openai) return "Gemini и ChatGPT не подключены. Ключи вставляются в «Ещё → Подключения». Пока отвечаю сам.";
  const out = await Promise.all(
    who.map(async ([name, key, ask]) => {
      if (!key) return `## ${name}\nНе подключён.`;
      try {
        return `## ${name}\n${await ask(key, system, question)}`;
      } catch (e: any) {
        return `## ${name}\nНе ответил: ${String(e?.message || e).slice(0, 160)}`;
      }
    }),
  );
  return out.join("\n\n") + "\n\nСведи мнения в один ответ Максиму: где они совпадают с твоим, где спорят и что в итоге делать. Отметь, кто что сказал.";
}

/** Make: события из приложения уходят на его сценарий (вебхук), дальше он сам решает, куда — Telegram, бухгалтерия, таблица. */
export async function toMake(event: string, data: Record<string, unknown>) {
  const url = await getSetting<string>("make_hook").catch(() => null);
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ event, at: new Date().toISOString(), ...data }),
      signal: AbortSignal.timeout(8000),
    });
  } catch {}
}

export const MAKE_EVENTS = [
  ["flight", "записан полёт"],
  ["invoices_drafted", "готовы черновики счетов"],
  ["invoice_status", "счёт отправлен или оплачен"],
  ["expense", "расход по стройке"],
  ["task", "новое дело"],
  ["morning", "утренняя сводка"],
] as const;

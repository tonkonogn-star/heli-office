import { apiKey, buildSystem, agentLoop } from "./chat";
import { forecast } from "./weather";
import { whoopDays, whoopStatus, syncIfStale } from "./whoop";

/** Утренняя сводка: коротко, что сегодня важно. Если ключа Claude нет — собирается без модели. */
export async function morningBrief() {
  await syncIfStale(60);
  const [f, ws] = await Promise.all([forecast().catch(() => null), whoopStatus()]);
  const days = ws.connected ? await whoopDays(3) : [];
  const wx = f?.hours?.length
    ? `Погода ${f.base.name} (${f.source}): ` + f.hours.filter((_: any, i: number) => i % 2 === 0).slice(0, 7).map((h: any) => `${h.local} ${h.wind}/${h.gust} уз, обл ${h.lowCloud}%, ${h.verdict}`).join("; ")
    : "База для погоды не задана.";
  const body = days[0] ? `WHOOP сегодня: восстановление ${days[0].recovery ?? "—"}%, сон ${days[0].sleep_hours ?? "—"} ч, нагрузка вчера ${days[1]?.strain ?? "—"}.` : "WHOOP не подключён.";
  const key = await apiKey();
  if (!key) return null;
  const system = await buildSystem("inbox");
  const msgs = [
    {
      role: "user",
      content: `Составь мою утреннюю сводку на сегодня. Максимум 8 строк, без вступления:\n1) можно ли сегодня лететь — по погоде и по моему восстановлению (если восстановление ниже 33% — прямо скажи, что лучше не лететь самому);\n2) что горит: просрочки, счета, ТО, документы;\n3) три главных дела на сегодня.\nНичего не записывай, только сводка.\n\n${wx}\n${body}`,
    },
  ];
  let text = "";
  await agentLoop({ key, system, msgs, emit: () => {}, maxTurns: 3 }).then((r) => (text = r.full));
  return text.trim() ? "**Доброе утро.**\n\n" + text.trim() : null;
}

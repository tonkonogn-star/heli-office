import { q, newId, money, setSetting, getSetting, today } from "./db";
import * as ops from "./ops";
import { forecast } from "./weather";
import { whoopDays, whoopStatus } from "./whoop";

const S = (description: string, extra: Record<string, unknown> = {}) => ({ type: "string", description, ...extra });
const N = (description: string) => ({ type: "number", description });
const B = (description: string) => ({ type: "boolean", description });
const SPACE = S("heli — Heliclub, build — стройка и флип-хаусы, general — личное и прочее", { enum: ["heli", "build", "general"] });

export const TOOLS = [
  {
    name: "save_client",
    description: "Добавить или изменить клиента Heliclub (владельца доли, чартерного клиента). Без id — новый. Ставки: storage_rate — хранение в месяц, hour_rate — лётный час, maint_rate — час работ по обслуживанию.",
    input_schema: { type: "object", properties: { id: S("id клиента, если меняем"), name: S("Имя или компания"), contact: S("Контактное лицо"), email: S("email"), phone: S("телефон"), aircraft: S("Бортовой номер или модель"), share: S("Доля, например 1/8"), storage_rate: N("Хранение в месяц"), hour_rate: N("Лётный час"), maint_rate: N("Час обслуживания"), currency: S("EUR, USD, UAH"), notes: S("Заметки"), archived: B("Убрать в архив") } },
  },
  {
    name: "log_flight",
    description: "Записать полёт. Если указан клиент — сразу добавляет строку в его будущий счёт по ставке лётного часа. Налёт прибавляется вертолёту.",
    input_schema: { type: "object", properties: { client: S("Имя или id клиента"), hours: N("Часы, можно 1.5"), route: S("Маршрут, например Рига — Юрмала"), aircraft: S("Борт"), day: S("Дата YYYY-MM-DD, если не сегодня"), notes: S("Заметки"), bill: B("false — не выставлять клиенту") }, required: ["hours"] },
  },
  {
    name: "add_charge",
    description: "Добавить строку в будущий счёт клиента: обслуживание, запчасти, топливо, хранение, сбор и т.д. Сумма = qty × unit_price, если amount не задан. Для обслуживания без цены берётся ставка клиента.",
    input_schema: { type: "object", properties: { client: S("Имя или id"), kind: S("storage, flight, maintenance, other", { enum: ["storage", "flight", "maintenance", "other"] }), title: S("Что именно"), qty: N("Количество"), unit_price: N("Цена за единицу"), amount: N("Итоговая сумма"), day: S("YYYY-MM-DD") }, required: ["client", "title"] },
  },
  { name: "delete_charge", description: "Удалить ошибочную строку начисления (только если она ещё не в отправленном счёте).", input_schema: { type: "object", properties: { id: S("id начисления") }, required: ["id"] } },
  { name: "list_charges", description: "Начисления: по клиенту и/или только ещё не выставленные.", input_schema: { type: "object", properties: { client: S("Имя или id"), unbilled: B("Только без счёта") } } },
  {
    name: "draft_invoices",
    description: "Собрать черновики счетов: хранение за месяц + всё невыставленное по каждому клиенту (или одному). Счета остаются черновиками — Максим проверяет и отправляет сам.",
    input_schema: { type: "object", properties: { period: S("Месяц YYYY-MM, по умолчанию текущий"), client: S("Только этот клиент") } },
  },
  { name: "invoice_get", description: "Счёт целиком: строки, сумма, статус, ссылка на PDF.", input_schema: { type: "object", properties: { invoice: S("id или номер") }, required: ["invoice"] } },
  { name: "invoice_status", description: "Отметить счёт: sent — отправлен, paid — оплачен, draft — вернуть в черновик. Только когда Максим сказал.", input_schema: { type: "object", properties: { invoice: S("id или номер"), status: S("draft, sent, paid", { enum: ["draft", "sent", "paid"] }) }, required: ["invoice", "status"] } },
  { name: "debts", description: "Кто сколько должен: выставлено и не оплачено, просрочено, черновики, ещё не выставлено.", input_schema: { type: "object", properties: {} } },
  {
    name: "save_aircraft",
    description: "Вертолёт: борт, модель, налёт, когда ТО (по часам и по дате), страховка, ARC. Без id — новый.",
    input_schema: { type: "object", properties: { id: S("id"), reg: S("Бортовой номер"), model: S("Модель, например Bell 505"), hours: N("Налёт сейчас"), next_service_hours: N("ТО на налёте"), next_service_date: S("ТО по дате YYYY-MM-DD"), insurance_until: S("YYYY-MM-DD"), arc_until: S("YYYY-MM-DD"), notes: S("Заметки") } },
  },
  { name: "set_pilot", description: "Документы пилота: сроки лицензии и медкомиссии.", input_schema: { type: "object", properties: { license_type: S("Тип лицензии"), license_until: S("YYYY-MM-DD"), medical_until: S("YYYY-MM-DD"), notes: S("Заметки") } } },
  {
    name: "save_task",
    description: "Дело: добавить, изменить, закрыть (status done). Срок только если он реально есть.",
    input_schema: { type: "object", properties: { id: S("id, если меняем"), title: S("Коротко, что сделать"), notes: S("Подробности"), due: S("YYYY-MM-DD или пусто"), space: SPACE, status: S("open или done", { enum: ["open", "done"] }) } },
  },
  {
    name: "save_deal",
    description: "Сделка: продажа вертолёта Bell, продажа доли, продажа или покупка дома. Этапы: Новая, Переговоры, Договор, Оплата, Закрыта, Проиграна.",
    input_schema: { type: "object", properties: { id: S("id"), space: SPACE, title: S("Что за сделка"), party: S("С кем"), stage: S("Этап"), value: N("Сумма"), currency: S("Валюта"), next_step: S("Следующий шаг"), next_date: S("YYYY-MM-DD"), notes: S("Заметки") } },
  },
  {
    name: "save_contract",
    description: "Договор: сохранить черновик текста (markdown) и результат сверки. Когда Максим присылает спецификацию или прайс — собери договор, сверь каждую цифру, модель и комплектацию и запиши в checks, что не сходится.",
    input_schema: { type: "object", properties: { id: S("id"), space: SPACE, title: S("Название"), party: S("Контрагент"), status: S("Черновик, На подписи, Подписан"), amount: N("Сумма"), currency: S("Валюта"), body: S("Полный текст договора в markdown"), checks: S("Что сверено и что не сходится") } },
  },
  { name: "contract_get", description: "Прочитать договор целиком.", input_schema: { type: "object", properties: { id: S("id") }, required: ["id"] } },
  {
    name: "save_site",
    description: "Объект стройки или флип-хауса: адрес, бюджет, цена покупки, план продажи, сроки. Без id — новый.",
    input_schema: { type: "object", properties: { id: S("id"), name: S("Название"), address: S("Адрес"), status: S("Оценка, Покупка, Стройка, Продажа, Продан"), budget: N("Бюджет ремонта"), buy_price: N("Цена покупки"), sale_target: N("Цена продажи (план)"), start: S("YYYY-MM-DD"), finish_plan: S("YYYY-MM-DD"), notes: S("Заметки") } },
  },
  { name: "site_get", description: "Объект целиком: этапы, расходы, сколько потрачено, прогресс.", input_schema: { type: "object", properties: { site: S("id или название") }, required: ["site"] } },
  {
    name: "save_stage",
    description: "Этап стройки: добавить, изменить, закрыть (status done) с отчётом подрядчика.",
    input_schema: { type: "object", properties: { id: S("id этапа"), site: S("Объект"), title: S("Этап"), contractor: S("Подрядчик"), due: S("YYYY-MM-DD"), status: S("open, done", { enum: ["open", "done"] }), report: S("Отчёт: что сделано, фото, акт") } },
  },
  {
    name: "add_expense",
    description: "Расход по объекту: материалы, работы, счёт подрядчика. paid=false — ещё не оплачено.",
    input_schema: { type: "object", properties: { site: S("Объект"), title: S("За что"), vendor: S("Кому"), amount: N("Сумма"), day: S("YYYY-MM-DD"), paid: B("Оплачено") }, required: ["site", "title", "amount"] },
  },
  { name: "audit", description: "Контролёр: всё, что не сходится — просроченные оплаты, забытые начисления, дубли, перерасход бюджета, просроченные этапы, сроки ТО, страховок, лицензии.", input_schema: { type: "object", properties: {} } },
  {
    name: "set_company",
    description: "Реквизиты для счетов: название, адрес, VAT, банк, IBAN, BIC, срок оплаты в днях, подвал.",
    input_schema: { type: "object", properties: { name: S(""), address: S(""), vat: S(""), bank: S(""), iban: S(""), bic: S(""), email: S(""), phone: S(""), payDays: N("Дней на оплату"), footer: S("") } },
  },
  { name: "remember", description: "Запомнить факт о работе Максима, который пригодится потом (не то, что уже лежит в данных).", input_schema: { type: "object", properties: { text: S("Факт") }, required: ["text"] } },
  { name: "list_documents", description: "Документы Максима: по пространству или словам в названии.", input_schema: { type: "object", properties: { space: SPACE, query: S("Слова") } } },
  { name: "read_document", description: "Прочитать текст документа (Word, текст). PDF и фото приходят в разговор целиком, когда он их прикладывает.", input_schema: { type: "object", properties: { id: S("id") }, required: ["id"] } },
  { name: "file_document", description: "Разложить документ: пространство, полка, переименовать, в архив.", input_schema: { type: "object", properties: { id: S("id"), space: SPACE, shelf: S("Полка: Договоры, Счета, Спецификации, Сметы, Акты, Фото, Разное"), title: S("Название"), archived: B("В архив") }, required: ["id"] } },
  { name: "weather", description: "Погода для полёта на базе: ветер, порывы, облачность, видимость по часам и подсказка GO / ОСТОРОЖНО / НЕТ.", input_schema: { type: "object", properties: {} } },
  { name: "whoop", description: "Самочувствие Максима из WHOOP: восстановление, сон, нагрузка за последние дни.", input_schema: { type: "object", properties: {} } },
];

const d = (s: unknown) => (s === "" ? null : (s as string) ?? undefined);

/** Выполняет инструмент. changed=true — данные поменялись, экраны надо обновить. */
export async function runTool(name: string, i: any): Promise<{ result: string; changed?: boolean }> {
  switch (name) {
    case "save_client": {
      const c = await ops.saveClient(i);
      return { result: `Клиент сохранён: ${c.id} ${c.name}. Хранение ${money(c.storage_rate, c.currency)}/мес, час ${money(c.hour_rate, c.currency)}, обслуживание ${money(c.maint_rate, c.currency)}/ч.`, changed: true };
    }
    case "log_flight":
      return { result: JSON.stringify(await ops.logFlight(i)), changed: true };
    case "add_charge":
      return { result: JSON.stringify(await ops.addCharge(i)), changed: true };
    case "delete_charge": {
      const r = await q("delete from charges where id=$1 and (invoice_id is null or invoice_id in (select id from invoices where status='draft')) returning invoice_id", [i.id]);
      if (r[0]?.invoice_id) await ops.recalc(r[0].invoice_id);
      return { result: r.length ? "Удалено." : "Не удалено: строки нет или она в отправленном счёте.", changed: r.length > 0 };
    }
    case "list_charges": {
      const c = i.client ? await ops.findClient(i.client) : null;
      const rows = await q<any>(
        `select ch.*, c.name client, c.currency from charges ch join clients c on c.id=ch.client_id where ($1::text is null or ch.client_id=$1) and ($2::boolean is not true or ch.invoice_id is null) order by ch.day desc limit 80`,
        [c?.id || null, !!i.unbilled],
      );
      return { result: rows.map((r) => `${r.id} ${ops.fmtDay(r.day)} ${r.client}: ${r.title} — ${money(r.amount, r.currency)}${r.invoice_id ? " (в счёте)" : ""}`).join("\n") || "Нет начислений." };
    }
    case "draft_invoices": {
      const made = await ops.draftInvoices(i.period, i.client);
      return { result: made.length ? made.map((m) => `${m.number} ${m.client}: ${money(m.total, m.currency)} (${m.lines} строк) — черновик, PDF: /api/invoices/${m.id}/pdf`).join("\n") : "Нечего выставлять: новых начислений нет.", changed: made.length > 0 };
    }
    case "invoice_get": {
      const inv = await ops.invoiceFull(i.invoice);
      if (!inv) return { result: "Нет такого счёта." };
      return { result: `${inv.number} ${inv.client_name}, ${inv.status}, срок ${ops.fmtDay(inv.due)}, итого ${money(inv.total, inv.currency)}\n${inv.lines.map((l: any) => `- ${l.id} ${ops.fmtDay(l.day)} ${l.title}: ${l.qty} × ${l.unit_price} = ${l.amount}`).join("\n")}\nPDF: /api/invoices/${inv.id}/pdf` };
    }
    case "invoice_status": {
      const r = await ops.setInvoiceStatus(i.invoice, i.status);
      return { result: `Счёт ${r.number} (${r.client}) теперь: ${r.status}.`, changed: true };
    }
    case "debts":
      return { result: JSON.stringify(await ops.debts()) };
    case "save_aircraft": {
      const id = i.id || newId("a");
      const ex = (await q<any>("select * from aircraft where id=$1", [id]))[0] || {};
      const v = { ...ex, ...Object.fromEntries(Object.entries(i).filter(([, x]) => x !== undefined)) };
      await q(
        `insert into aircraft(id,reg,model,hours,next_service_hours,next_service_date,insurance_until,arc_until,notes) values($1,$2,$3,$4,$5,$6,$7,$8,$9)
         on conflict(id) do update set reg=$2,model=$3,hours=$4,next_service_hours=$5,next_service_date=$6,insurance_until=$7,arc_until=$8,notes=$9`,
        [id, v.reg || "?", v.model || "", Number(v.hours) || 0, v.next_service_hours ?? null, d(v.next_service_date) ?? null, d(v.insurance_until) ?? null, d(v.arc_until) ?? null, v.notes || ""],
      );
      return { result: `Вертолёт сохранён: ${id} ${v.reg}.`, changed: true };
    }
    case "set_pilot":
      await ops.setPilot(i);
      return { result: "Документы пилота сохранены.", changed: true };
    case "save_task": {
      if (i.id) {
        const ex = (await q<any>("select * from tasks where id=$1", [i.id]))[0];
        if (!ex) return { result: "Нет такого дела." };
        const v = { ...ex, ...Object.fromEntries(Object.entries(i).filter(([, x]) => x !== undefined)) };
        await q("update tasks set title=$2,notes=$3,due=$4,space=$5,status=$6,done_at=case when $6='done' then coalesce(done_at,now()) else null end where id=$1", [i.id, v.title, v.notes || "", d(v.due) ?? null, v.space || "general", v.status || "open"]);
        return { result: `Дело обновлено: ${v.title} (${v.status}).`, changed: true };
      }
      const id = newId("t");
      await q("insert into tasks(id,space,title,notes,due) values($1,$2,$3,$4,$5)", [id, i.space || "general", i.title || "Дело", i.notes || "", d(i.due) ?? null]);
      return { result: `Дело добавлено: ${id} ${i.title}.`, changed: true };
    }
    case "save_deal": {
      const id = i.id || newId("d");
      const ex = (await q<any>("select * from deals where id=$1", [id]))[0] || {};
      const v = { ...ex, ...Object.fromEntries(Object.entries(i).filter(([, x]) => x !== undefined)) };
      await q(
        `insert into deals(id,space,title,party,stage,value,currency,next_step,next_date,notes) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         on conflict(id) do update set space=$2,title=$3,party=$4,stage=$5,value=$6,currency=$7,next_step=$8,next_date=$9,notes=$10,updated_at=now()`,
        [id, v.space || "heli", v.title || "Сделка", v.party || "", v.stage || "Новая", v.value ?? null, v.currency || "EUR", v.next_step || "", d(v.next_date) ?? null, v.notes || ""],
      );
      return { result: `Сделка сохранена: ${id} ${v.title} — ${v.stage || "Новая"}.`, changed: true };
    }
    case "save_contract": {
      const id = i.id || newId("k");
      const ex = (await q<any>("select * from contracts where id=$1", [id]))[0] || {};
      const v = { ...ex, ...Object.fromEntries(Object.entries(i).filter(([, x]) => x !== undefined)) };
      await q(
        `insert into contracts(id,space,title,party,status,amount,currency,body,checks) values($1,$2,$3,$4,$5,$6,$7,$8,$9)
         on conflict(id) do update set space=$2,title=$3,party=$4,status=$5,amount=$6,currency=$7,body=$8,checks=$9,updated_at=now()`,
        [id, v.space || "heli", v.title || "Договор", v.party || "", v.status || "Черновик", v.amount ?? null, v.currency || "EUR", v.body || "", v.checks || ""],
      );
      return { result: `Договор сохранён: ${id} «${v.title}». PDF: /api/contracts/${id}/pdf`, changed: true };
    }
    case "contract_get": {
      const c = (await q<any>("select * from contracts where id=$1", [i.id]))[0];
      return { result: c ? `${c.title} — ${c.party}, ${c.status}\nСверка: ${c.checks || "—"}\n\n${c.body}` : "Нет такого договора." };
    }
    case "save_site": {
      const id = i.id || newId("s");
      const ex = (await q<any>("select * from sites where id=$1", [id]))[0] || {};
      const v = { ...ex, ...Object.fromEntries(Object.entries(i).filter(([, x]) => x !== undefined)) };
      await q(
        `insert into sites(id,name,address,status,budget,buy_price,sale_target,start,finish_plan,notes) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)
         on conflict(id) do update set name=$2,address=$3,status=$4,budget=$5,buy_price=$6,sale_target=$7,start=$8,finish_plan=$9,notes=$10`,
        [id, v.name || "Объект", v.address || "", v.status || "Стройка", Number(v.budget) || 0, v.buy_price ?? null, v.sale_target ?? null, d(v.start) ?? null, d(v.finish_plan) ?? null, v.notes || ""],
      );
      return { result: `Объект сохранён: ${id} ${v.name}.`, changed: true };
    }
    case "site_get": {
      const s = await ops.findSite(i.site);
      if (!s) return { result: "Не нашёл объект." };
      return { result: JSON.stringify(await ops.siteSummary(s.id)) };
    }
    case "save_stage": {
      if (i.id) {
        const ex = (await q<any>("select * from stages where id=$1", [i.id]))[0];
        if (!ex) return { result: "Нет такого этапа." };
        const v = { ...ex, ...Object.fromEntries(Object.entries(i).filter(([, x]) => x !== undefined)) };
        await q("update stages set title=$2,contractor=$3,due=$4,status=$5,report=$6,done_at=case when $5='done' then coalesce(done_at,now()) else null end where id=$1", [i.id, v.title, v.contractor || "", d(v.due) ?? null, v.status || "open", v.report || ""]);
        return { result: `Этап обновлён: ${v.title} (${v.status}).`, changed: true };
      }
      const s = await ops.findSite(i.site);
      if (!s) return { result: "Не нашёл объект — уточни название." };
      const id = newId("st");
      const n = (await q<{ n: number }>("select count(*)::int n from stages where site_id=$1", [s.id]))[0].n;
      await q("insert into stages(id,site_id,title,contractor,due,status,report,sort) values($1,$2,$3,$4,$5,$6,$7,$8)", [id, s.id, i.title || "Этап", i.contractor || "", d(i.due) ?? null, i.status || "open", i.report || "", n]);
      return { result: `Этап добавлен: ${id} ${i.title} (${s.name}).`, changed: true };
    }
    case "add_expense": {
      const s = await ops.findSite(i.site);
      if (!s) return { result: "Не нашёл объект — уточни название." };
      const id = newId("e");
      await q("insert into expenses(id,site_id,title,vendor,amount,day,paid) values($1,$2,$3,$4,$5,$6,$7)", [id, s.id, i.title, i.vendor || "", Number(i.amount) || 0, d(i.day) || today(), !!i.paid]);
      const sum = await ops.siteSummary(s.id);
      return { result: `Расход записан: ${money(i.amount)} — ${i.title}. По объекту потрачено ${money(sum!.spent)} из ${money(sum!.budget)}.`, changed: true };
    }
    case "audit": {
      const issues = await ops.audit();
      return { result: issues.length ? issues.map((x) => `[${x.level === "red" ? "срочно" : "внимание"}] ${x.area}: ${x.text}`).join("\n") : "Всё сходится." };
    }
    case "set_company": {
      const prev = (await getSetting<any>("company")) || {};
      await setSetting("company", { ...prev, ...Object.fromEntries(Object.entries(i).filter(([, x]) => x !== undefined && x !== "")) });
      return { result: "Реквизиты сохранены.", changed: true };
    }
    case "remember":
      await ops.rememberFact(i.text);
      return { result: "Запомнил." };
    case "list_documents": {
      const rows = await q<any>(
        "select id,space,shelf,name,title,mime,created_at from documents where not archived and ($1::text is null or space=$1) and ($2::text is null or lower(name||' '||title||' '||summary) like lower('%'||$2||'%')) order by created_at desc limit 50",
        [i.space || null, i.query || null],
      );
      return { result: rows.map((r) => `${r.id} [${r.space}/${r.shelf}] ${r.title || r.name} (${r.mime}, ${ops.fmtDay(r.created_at)})`).join("\n") || "Документов нет." };
    }
    case "read_document": {
      const r = (await q<any>("select name,mime,content from documents where id=$1", [i.id]))[0];
      if (!r) return { result: "Нет такого документа." };
      return { result: r.content ? String(r.content).slice(0, 60000) : `«${r.name}» (${r.mime}) — текста нет; попроси Максима приложить его в чат, тогда я прочитаю его целиком.` };
    }
    case "file_document": {
      const ex = (await q<any>("select * from documents where id=$1", [i.id]))[0];
      if (!ex) return { result: "Нет такого документа." };
      await q("update documents set space=$2, shelf=$3, title=$4, archived=$5 where id=$1", [i.id, i.space || ex.space, i.shelf || ex.shelf, i.title ?? ex.title, i.archived ?? ex.archived]);
      return { result: "Документ разложен.", changed: true };
    }
    case "weather": {
      const f = await forecast();
      if (!f) return { result: "База не задана — спроси Максима, где он летает, и он выберет её на главном экране." };
      return { result: `${f.base.name}, источник ${f.source}:\n` + f.hours.map((h: any) => `${h.local} ветер ${h.wind} уз, порывы ${h.gust}, низкая облачность ${h.lowCloud}%, видимость ${h.vis ? Math.round(h.vis / 1000) + " км" : "—"}, осадки ${h.precip} мм → ${h.verdict}`).join("\n") };
    }
    case "whoop": {
      const st = await whoopStatus();
      if (!st.connected) return { result: "WHOOP не подключён." };
      return { result: JSON.stringify(await whoopDays(7)) };
    }
  }
  throw new Error("Нет такого инструмента: " + name);
}

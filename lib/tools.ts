import { q, newId, money, setSetting, getSetting, today } from "./db";
import * as ops from "./ops";
import { forecast } from "./weather";
import { whoopDays, whoopStatus } from "./whoop";
import { payPayment, recordLabs, labTrends, CATEGORIES } from "./personal";
import { clientFinance, aircraftFinance, siteMarket } from "./finance";
import { secondOpinion } from "./ext";
import * as extra from "./extra";

const S = (description: string, extra: Record<string, unknown> = {}) => ({ type: "string", description, ...extra });
const N = (description: string) => ({ type: "number", description });
const B = (description: string) => ({ type: "boolean", description });
const SPACE = S("heli — Heliclub, build — стройка и флип-хаусы, general — личное: семья, здоровье, свои дела", { enum: ["heli", "build", "general"] });

export const TOOLS = [
  {
    name: "send",
    description: "Отправить что-то через Make — ТОЛЬКО когда Максим прямо велел отправить (кому и что). Каждый раз он сам говорит, куда: письмо клиенту или бухгалтеру, Telegram, WhatsApp, на подпись. Приложи файлы: счёт, договор, документ, выгрузку. Отправленный счёт сам станет «отправлен». Перед отправкой клиенту покажи текст и получи «да».",
    input_schema: {
      type: "object",
      properties: {
        channel: S("Куда: email, telegram, whatsapp, sign (на подпись), sheet (в таблицу) или другое, как сказал Максим"),
        to: S("Кому: email, телефон, имя"),
        subject: S("Тема письма"),
        text: S("Текст сообщения"),
        attach: { type: "array", items: { type: "object", properties: { kind: S("invoice, contract, doc, export", { enum: ["invoice", "contract", "doc", "export"] }), id: S("id или номер счёта; для export — месяц YYYY-MM") }, required: ["kind", "id"] } },
      },
      required: ["channel", "text"],
    },
  },
  {
    name: "reconcile",
    description: "Сверить банковскую выписку со счетами: передай входящие платежи из выписки (PDF, CSV, скриншот, который прислал Максим). Сам отметит оплаченные счета и скажет, какие платежи непонятно за что. apply=false — только показать.",
    input_schema: {
      type: "object",
      properties: {
        payments: { type: "array", items: { type: "object", properties: { date: S("YYYY-MM-DD"), amount: N("Сумма прихода"), currency: S("Валюта"), payer: S("Плательщик"), reference: S("Назначение платежа") }, required: ["amount"] } },
        apply: B("false — не отмечать, только показать"),
      },
      required: ["payments"],
    },
  },
  { name: "pay_link", description: "Сделать ссылку на оплату счёта картой (Stripe). Когда клиент оплатит, счёт сам станет «оплачен». Нужен подключённый Stripe.", input_schema: { type: "object", properties: { invoice: S("id или номер счёта") }, required: ["invoice"] } },
  { name: "file_link", description: "Ссылка на файл, которая открывается без пароля 30 дней: счёт, договор, документ или выгрузка для бухгалтера за месяц (kind export, id YYYY-MM).", input_schema: { type: "object", properties: { kind: S("invoice, contract, doc, export", { enum: ["invoice", "contract", "doc", "export"] }), id: S("id; для export — месяц YYYY-MM") }, required: ["kind"] } },
  { name: "aircraft_log", description: "Журнал налёта борта: все полёты (дата, часы, кто летал, клиент, выставлен ли счёт, записан вручную или радаром), налёт за месяц и год, сколько осталось до ТО и до оверхола.", input_schema: { type: "object", properties: { aircraft: S("Бортовой номер или id") }, required: ["aircraft"] } },
  { name: "radar", description: "Полёты, которые радар (OpenSky) уже записал в журнал борта, но без пилота и клиента. Спроси Максима, кто летал и для кого, и дополни через log_flight с flight_id. Свой полёт без счёта — resolve=id радара, status skip (в журнале он остаётся). sync=true — проверить радар сейчас.", input_schema: { type: "object", properties: { sync: B("Проверить сейчас"), resolve: S("id полёта радара"), status: S("logged или skip", { enum: ["logged", "skip"] }) } } },
  {
    name: "second_opinion",
    description: "Спросить второе мнение у Gemini и ChatGPT (если Максим подключил их ключи). Вызывай, когда он просит «спроси Gemini/ChatGPT», «собери совет», «что скажут другие», и сам — перед крупным решением: покупка борта или дома, большая сделка, спорный договор. Передай вопрос и короткий контекст с цифрами. Потом сведи мнения в один ответ.",
    input_schema: { type: "object", properties: { question: S("Вопрос, как его надо задать советникам"), context: S("Факты и цифры, нужные для ответа") }, required: ["question"] },
  },
  {
    name: "save_client",
    description: "Добавить или изменить клиента Heliclub (владельца доли, чартерного клиента). Без id — новый. Ставки: storage_rate — хранение в месяц, hour_rate — лётный час, maint_rate — час работ по обслуживанию.",
    input_schema: { type: "object", properties: { id: S("id клиента, если меняем"), name: S("Имя или компания"), contact: S("Контактное лицо"), email: S("email"), phone: S("телефон"), aircraft: S("Бортовой номер или модель"), share: S("Доля, например 1/8"), storage_rate: N("Хранение в месяц"), hour_rate: N("Лётный час"), maint_rate: N("Час обслуживания"), currency: S("EUR, USD, UAH"), notes: S("Заметки"), archived: B("Убрать в архив") } },
  },
  {
    name: "log_flight",
    description: "Записать полёт в журнал борта. Если указан клиент — сразу добавляет строку в его будущий счёт по ставке лётного часа. Налёт прибавляется вертолёту (счётчики ТО и оверхола). Если этот полёт уже записал радар — дополняет его (клиент, пилот), а не пишет второй раз; для полёта из списка радара передай flight_id.",
    input_schema: { type: "object", properties: { client: S("Имя или id клиента; пусто — свой полёт без счёта"), pilot: S("Кто летал (пилот)"), flight_id: S("id полёта, записанного радаром, если дополняешь его"), hours: N("Часы, можно 1.5"), route: S("Маршрут, например Рига — Юрмала"), aircraft: S("Борт"), day: S("Дата YYYY-MM-DD, если не сегодня"), notes: S("Заметки"), bill: B("false — не выставлять клиенту") }, required: ["hours"] },
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
    input_schema: { type: "object", properties: { id: S("id"), reg: S("Бортовой номер"), model: S("Модель, например Bell 505"), hours: N("Налёт сейчас"), next_service_hours: N("ТО на налёте"), next_service_date: S("ТО по дате YYYY-MM-DD"), insurance_until: S("YYYY-MM-DD"), arc_until: S("YYYY-MM-DD"), purchase_price: N("Цена покупки — для окупаемости"), purchase_date: S("Дата покупки YYYY-MM-DD"), overhaul_at_hours: N("При каком общем налёте оверхол (капремонт), часов"), overhaul_date: S("Оверхол по сроку не позже YYYY-MM-DD"), icao24: S("Код транспондера Mode S (ICAO24, 6 знаков hex, например 502c4f) — чтобы радар сам находил полёты"), notes: S("Заметки") } },
  },
  {
    name: "add_aircraft_cost",
    description: "Расход на вертолёт: топливо, ТО, запчасти, страховка, ангар, пилот, сборы, лизинг. Нужен, чтобы считать прибыль и окупаемость каждого борта.",
    input_schema: { type: "object", properties: { aircraft: S("Борт"), kind: S("Топливо, ТО, Запчасти, Страховка, Ангар, Пилот, Сборы, Лизинг, Другое"), title: S("Что именно"), amount: N("Сумма"), day: S("YYYY-MM-DD") }, required: ["aircraft", "amount"] },
  },
  { name: "finance_report", description: "Финансы Heliclub за 12 месяцев: по каждому клиенту (доход, часы, оплачено, долг, сколько дней платит) и по каждому вертолёту (доход, расходы, прибыль, прибыль на лётный час, окупаемость от цены покупки).", input_schema: { type: "object", properties: {} } },
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
    input_schema: { type: "object", properties: { id: S("id"), name: S("Название"), address: S("Адрес"), status: S("Оценка, Покупка, Стройка, Продажа, Продан"), budget: N("Бюджет ремонта"), buy_price: N("Цена покупки"), city: S("Город или район — для рынка"), area_m2: N("Площадь, м²"), sale_target: N("Цена продажи (план)"), start: S("YYYY-MM-DD"), finish_plan: S("YYYY-MM-DD"), notes: S("Заметки") } },
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
  {
    name: "save_comps",
    description: "Сохранить похожие объекты на рынке рядом с домом Максима (найденные через web_search): название, ссылка, цена, площадь, статус (в продаже / продан). Перед сохранением старые записи по объекту можно заменить (replace=true).",
    input_schema: {
      type: "object",
      properties: {
        site: S("Объект Максима"),
        replace: B("Заменить прошлую выборку"),
        items: { type: "array", items: { type: "object", properties: { title: S("Что за объект: тип, район"), url: S("Ссылка на объявление"), price: N("Цена"), area_m2: N("Площадь, м²"), status: S("в продаже или продан"), note: S("Состояние, год, участок") }, required: ["title"] } },
      },
      required: ["site", "items"],
    },
  },
  { name: "market_get", description: "Рынок вокруг объекта: сохранённые похожие объекты, медиана цены за м², где наш план продажи относительно рынка.", input_schema: { type: "object", properties: { site: S("Объект") }, required: ["site"] } },
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
  {
    name: "save_payment",
    description: "Личный регулярный или разовый платёж: школа, аренда, коммуналка, страховка, подписки, семья. every: month, quarter, year, once. next_due — когда платить в следующий раз. Без id — новый; active=false — больше не платим.",
    input_schema: { type: "object", properties: { id: S("id"), title: S("Что"), amount: N("Сумма"), currency: S("Валюта"), category: S("Категория", { enum: CATEGORIES }), every: S("month, quarter, year, once", { enum: ["month", "quarter", "year", "once"] }), next_due: S("YYYY-MM-DD"), notes: S("Заметки"), active: B("Ещё платим") } },
  },
  { name: "pay_payment", description: "Отметить платёж оплаченным: попадёт в историю расходов, следующий срок сдвинется сам.", input_schema: { type: "object", properties: { id: S("id платежа"), amount: N("Если сумма отличалась"), day: S("YYYY-MM-DD") }, required: ["id"] } },
  { name: "log_spend", description: "Разовая личная или семейная трата, которая не повторяется (подарок, поездка, врач).", input_schema: { type: "object", properties: { title: S("Что"), amount: N("Сумма"), currency: S("Валюта"), category: S("Категория", { enum: CATEGORIES }), day: S("YYYY-MM-DD") }, required: ["title", "amount"] } },
  {
    name: "record_labs",
    description: "Записать результаты анализов. Когда Максим прикладывает бланк анализов — выпиши КАЖДЫЙ показатель: название как в бланке, значение, единицы, референсные границы. Дата — дата забора из бланка.",
    input_schema: {
      type: "object",
      properties: {
        day: S("Дата анализа YYYY-MM-DD"),
        lab: S("Лаборатория"),
        doc_id: S("id приложенного документа"),
        items: { type: "array", items: { type: "object", properties: { test: S("Показатель"), value: S("Значение"), unit: S("Единицы"), ref_low: N("Нижняя граница нормы"), ref_high: N("Верхняя граница нормы"), note: S("") }, required: ["test", "value"] } },
      },
      required: ["day", "items"],
    },
  },
  { name: "lab_trends", description: "Все анализы Максима по показателям во времени, с отметкой выхода за норму. Для комплексного разбора здоровья.", input_schema: { type: "object", properties: {} } },
];

const d = (s: unknown) => (s === "" ? null : (s as string) ?? undefined);

/** Выполняет инструмент. changed=true — данные поменялись, экраны надо обновить. */
export async function runTool(name: string, i: any): Promise<{ result: string; changed?: boolean }> {
  switch (name) {
    case "send":
      return { result: await extra.makeSend(i), changed: true };
    case "reconcile": {
      const list = Array.isArray(i.payments) ? i.payments : [];
      return { result: await extra.reconcile(list, i.apply !== false), changed: i.apply !== false };
    }
    case "pay_link":
      return { result: "Ссылка на оплату картой: " + (await extra.payLink(i.invoice)) + "\nОна напечатана и в PDF счёта.", changed: true };
    case "file_link": {
      if (i.kind === "export") return { result: "Выгрузка (CSV для Excel, ссылка 30 дней): " + (await extra.shareLink("export", i.id || extra.lastMonth())) };
      return { result: "Ссылка на файл (открывается без пароля 30 дней): " + (await extra.shareLink(i.kind, i.id)) };
    }
    case "aircraft_log":
      return { result: JSON.stringify(await ops.aircraftLog(i.aircraft)) };
    case "radar": {
      const sync = i.sync ? (await extra.syncRadar()) + "\n" : "";
      if (i.resolve) {
        await extra.radarResolve(i.resolve, i.status === "skip" ? "skip" : "logged");
        return { result: sync + "Отмечено.", changed: true };
      }
      const p = await extra.radarPending();
      return { result: sync + (p.map((r) => `${r.id}: ${r.reg} ${r.day} ${r.t1}–${r.t2}, ≈${r.hours} ч${r.dep || r.arr ? `, ${r.dep || "?"} → ${r.arr || "?"}` : ""}`).join("\n") || "Радар не видел незаписанных полётов.") };
    }
    case "second_opinion":
      return { result: await secondOpinion(String(i.question || ""), String(i.context || "")) };
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
        `insert into aircraft(id,reg,model,hours,next_service_hours,next_service_date,insurance_until,arc_until,notes,purchase_price,purchase_date,icao24,overhaul_at_hours,overhaul_date) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14)
         on conflict(id) do update set reg=$2,model=$3,hours=$4,next_service_hours=$5,next_service_date=$6,insurance_until=$7,arc_until=$8,notes=$9,purchase_price=$10,purchase_date=$11,icao24=$12,overhaul_at_hours=$13,overhaul_date=$14`,
        [id, v.reg || "?", v.model || "", Number(v.hours) || 0, v.next_service_hours ?? null, d(v.next_service_date) ?? null, d(v.insurance_until) ?? null, d(v.arc_until) ?? null, v.notes || "", v.purchase_price ?? null, d(v.purchase_date) ?? null, v.icao24 ? String(v.icao24).toLowerCase().trim() : null, v.overhaul_at_hours === "" ? null : (v.overhaul_at_hours ?? null), d(v.overhaul_date) ?? null],
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
        `insert into sites(id,name,address,status,budget,buy_price,sale_target,start,finish_plan,notes,city,area_m2) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
         on conflict(id) do update set name=$2,address=$3,status=$4,budget=$5,buy_price=$6,sale_target=$7,start=$8,finish_plan=$9,notes=$10,city=$11,area_m2=$12`,
        [id, v.name || "Объект", v.address || "", v.status || "Стройка", Number(v.budget) || 0, v.buy_price ?? null, v.sale_target ?? null, d(v.start) ?? null, d(v.finish_plan) ?? null, v.notes || "", v.city || "", v.area_m2 ?? null],
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
    case "add_aircraft_cost": {
      const a = (await q<any>("select * from aircraft where id=$1 or lower(reg)=lower($1) limit 1", [i.aircraft]))[0];
      if (!a) return { result: `Не нашёл борт «${i.aircraft}» — сначала добавь его.` };
      await q("insert into aircraft_costs(id,aircraft_id,kind,title,amount,day) values($1,$2,$3,$4,$5,$6)", [newId("ac"), a.id, i.kind || "Другое", i.title || i.kind || "Расход", Number(i.amount) || 0, d(i.day) || today()]);
      return { result: `Расход по ${a.reg} записан: ${money(i.amount)}.`, changed: true };
    }
    case "finance_report":
      return { result: JSON.stringify({ clients: await clientFinance(), aircraft: await aircraftFinance() }) };
    case "save_comps": {
      const site = await ops.findSite(i.site);
      if (!site) return { result: "Не нашёл объект." };
      if (i.replace) await q("delete from comps where site_id=$1", [site.id]);
      let k = 0;
      for (const c of i.items || []) {
        if (!c?.title) continue;
        await q("insert into comps(id,site_id,title,url,price,area_m2,status,note) values($1,$2,$3,$4,$5,$6,$7,$8)", [newId("m"), site.id, c.title, c.url || "", c.price ?? null, c.area_m2 ?? null, c.status || "в продаже", c.note || ""]);
        k++;
      }
      const m = await siteMarket(site.id);
      return { result: `Сохранено объектов: ${k}. Медиана ${m.median ? money(Math.round(m.median)) + "/м²" : "—"}${m.ours ? `, наш план ${money(Math.round(m.ours))}/м²` : ""}.`, changed: k > 0 };
    }
    case "market_get": {
      const site = await ops.findSite(i.site);
      if (!site) return { result: "Не нашёл объект." };
      return { result: JSON.stringify({ site: { name: site.name, city: site.city, area_m2: site.area_m2, sale_target: site.sale_target }, ...(await siteMarket(site.id)) }) };
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
      if (!f) return { result: "Место неизвестно: попроси Максима открыть приложение и разрешить геопозицию или выбрать базу." };
      return { result: `${f.base.name}, источник ${f.source}:\n` + f.hours.map((h: any) => `${h.local} ветер ${h.wind} уз, порывы ${h.gust}, низкая облачность ${h.lowCloud}%, видимость ${h.vis ? Math.round(h.vis / 1000) + " км" : "—"}, осадки ${h.precip} мм → ${h.verdict}`).join("\n") };
    }
    case "whoop": {
      const st = await whoopStatus();
      if (!st.connected) return { result: "WHOOP не подключён." };
      return { result: JSON.stringify(await whoopDays(7)) };
    }
    case "save_payment": {
      const id = i.id || newId("p");
      const ex = (await q<any>("select * from payments where id=$1", [id]))[0] || {};
      const v = { ...ex, ...Object.fromEntries(Object.entries(i).filter(([, x]) => x !== undefined)) };
      await q(
        `insert into payments(id,title,amount,currency,category,every,next_due,notes,active) values($1,$2,$3,$4,$5,$6,$7,$8,$9)
         on conflict(id) do update set title=$2,amount=$3,currency=$4,category=$5,every=$6,next_due=$7,notes=$8,active=$9`,
        [id, v.title || "Платёж", Number(v.amount) || 0, v.currency || "EUR", v.category || "Другое", v.every || "month", d(v.next_due) ?? null, v.notes || "", v.active ?? true],
      );
      return { result: `Платёж сохранён: ${id} ${v.title}, ${money(v.amount, v.currency || "EUR")}.`, changed: true };
    }
    case "pay_payment":
      return { result: await payPayment(i.id, i.amount != null ? Number(i.amount) : undefined, i.day), changed: true };
    case "log_spend":
      await q("insert into payment_log(title,amount,currency,category,day) values($1,$2,$3,$4,$5)", [i.title, Number(i.amount) || 0, i.currency || "EUR", i.category || "Другое", d(i.day) || today()]);
      return { result: `Записано: ${i.title} — ${money(i.amount, i.currency || "EUR")}.`, changed: true };
    case "record_labs": {
      const n = await recordLabs(i.day, i.items, i.lab || "", i.doc_id);
      return { result: `Записано показателей: ${n}.`, changed: n > 0 };
    }
    case "lab_trends":
      return { result: JSON.stringify(await labTrends()) };
  }
  throw new Error("Нет такого инструмента: " + name);
}

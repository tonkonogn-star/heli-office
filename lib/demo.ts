import { q, setSetting, today } from "./db";
import { runTool } from "./tools";
import { draftInvoices, setInvoiceStatus } from "./ops";

/* Пример, чтобы посмотреть приложение «живым». Перед подарком всё стирается. */

const plus = (days: number) => new Date(Date.now() + days * 864e5).toISOString().slice(0, 10);

export async function loadDemo() {
  await clearDemo();
  const t = (n: string, i: any) => runTool(n, i);
  await t("set_company", { name: "Heliclub Airborne", address: "Rīga, Latvia", iban: "LV00 HABA 0000 0000 0000 0", bic: "HABALV22", payDays: 14, footer: "Heliclub Airborne · heliclub.com" });
  await t("set_pilot", { license_type: "CPL(H)", license_until: plus(220), medical_until: plus(32) });
  await t("save_client", { name: "Петров Air", contact: "Игорь Петров", aircraft: "YL-HCB", share: "1/8", storage_rate: 900, hour_rate: 650, maint_rate: 95, email: "petrov@example.com" });
  await t("save_client", { name: "Baltic Charter", contact: "Martins Ozols", aircraft: "YL-HCC", share: "1/4", storage_rate: 1200, hour_rate: 700, maint_rate: 95 });
  await t("save_client", { name: "Иванов", aircraft: "YL-HCB", share: "1/8", storage_rate: 900, hour_rate: 650, maint_rate: 95 });
  await t("save_aircraft", { reg: "YL-HCB", model: "Bell 505", hours: 812, next_service_hours: 830, next_service_date: plus(48), insurance_until: plus(21), arc_until: plus(140), purchase_price: 650000, purchase_date: plus(-900) });
  await t("save_aircraft", { reg: "YL-HCC", model: "Bell 407GXi", hours: 1430, next_service_hours: 1500, insurance_until: plus(190), arc_until: plus(260) });
  // история за год, чтобы финансы были не пустыми
  for (let m = 11; m >= 1; m--) {
    const dd = plus(-m * 30);
    await t("log_flight", { client: "Петров Air", hours: 3 + (m % 3), route: "Рига — побережье", day: dd });
    await t("log_flight", { client: "Baltic Charter", hours: 4 + (m % 4), route: "Rīga — Cēsis", day: dd });
    await t("add_charge", { client: "Петров Air", kind: "storage", title: "Hangarage", qty: 1, unit_price: 900, day: dd });
    await t("add_charge", { client: "Baltic Charter", kind: "storage", title: "Hangarage", qty: 1, unit_price: 1200, day: dd });
    await t("add_aircraft_cost", { aircraft: "YL-HCB", kind: "Топливо", title: "Jet A-1", amount: 520 + (m % 3) * 60, day: dd });
    await t("add_aircraft_cost", { aircraft: "YL-HCC", kind: "Топливо", title: "Jet A-1", amount: 780 + (m % 4) * 70, day: dd });
    await t("add_aircraft_cost", { aircraft: "YL-HCB", kind: "Ангар", title: "Аренда места", amount: 250, day: dd });
    await t("add_aircraft_cost", { aircraft: "YL-HCC", kind: "Ангар", title: "Аренда места", amount: 300, day: dd });
  }
  await t("add_aircraft_cost", { aircraft: "YL-HCB", kind: "Страховка", title: "Годовая", amount: 8200, day: plus(-200) });
  await t("add_aircraft_cost", { aircraft: "YL-HCC", kind: "Страховка", title: "Годовая", amount: 12500, day: plus(-150) });
  await t("add_aircraft_cost", { aircraft: "YL-HCB", kind: "ТО", title: "100-часовое", amount: 5200, day: plus(-120) });
  await t("add_aircraft_cost", { aircraft: "YL-HCC", kind: "ТО", title: "Годовое", amount: 9400, day: plus(-90) });
  // прошлые месяцы выставлены и оплачены — как будто так было весь год
  for (let m = 11; m >= 1; m--) {
    const period = plus(-m * 30).slice(0, 7);
    for (const [name, delay] of [["Петров Air", 15], ["Baltic Charter", 9]] as const) {
      const made = await draftInvoices(period, name);
      for (const inv of made) {
        const end = new Date(Date.UTC(+period.slice(0, 4), +period.slice(5, 7), 0)).toISOString().slice(0, 10);
        await q("update invoices set status='paid', issued=$2, due=($2::date + 14), sent_at=$2::date, paid_at=($2::date + $3::int) where id=$1", [inv.id, end, delay + (m % 5)]);
      }
    }
  }
  // налёт бортов — как на сегодня (история полётов выше его не должна сдвигать)
  await q("update aircraft set hours = 812 where reg='YL-HCB'");
  await q("update aircraft set hours = 1430 where reg='YL-HCC'");
  // прошлый месяц: счёт отправлен и просрочен
  const lastMonth = new Date(Date.now() - 32 * 864e5).toISOString().slice(0, 10);
  await t("log_flight", { client: "Иванов", hours: 1.5, route: "Рига — побережье", day: lastMonth });
  const old = await draftInvoices(lastMonth.slice(0, 7), "Иванов");
  if (old[0]) {
    await setInvoiceStatus(old[0].id, "sent");
    await q("update invoices set due=$2, issued=$3 where id=$1", [old[0].id, plus(-6), plus(-20)]);
  }
  // этот месяц: полёты и работы, ещё без счёта
  await t("log_flight", { client: "Петров Air", hours: 2, route: "Rīga — Sigulda — Rīga", day: plus(-3) });
  await t("log_flight", { client: "Baltic Charter", hours: 1.2, route: "Rīga — Cēsis", day: plus(-1) });
  await t("log_flight", { hours: 0.8, route: "Тренировочный круг", aircraft: "YL-HCB", day: plus(-2) });
  await t("add_charge", { client: "Baltic Charter", kind: "maintenance", title: "Замена фильтров, проверка", qty: 3, unit_price: 95 });
  await t("draft_invoices", { client: "Петров Air" });
  await t("save_deal", { title: "Bell 505 для AeroBaltic", party: "AeroBaltic", stage: "Переговоры", value: 1450000, currency: "USD", next_step: "Отправить спецификацию с опциями", next_date: plus(1) });
  await t("save_deal", { title: "Доля 1/8 в YL-HCC", party: "Андрей К.", stage: "Новая", value: 95000, next_step: "Показать вертолёт", next_date: plus(6) });
  await t("save_contract", {
    title: "Договор купли-продажи Bell 505",
    party: "AeroBaltic",
    status: "Черновик",
    amount: 1450000,
    currency: "USD",
    body: "# Договор купли-продажи вертолёта\n\n## 1. Предмет договора\nПродавец передаёт в собственность Покупателя вертолёт Bell 505 Jet Ranger X, серийный номер [ЗАПОЛНИТЬ], в комплектации согласно Приложению 1.\n\n## 2. Цена\n- Цена вертолёта: 1 450 000 USD\n- Опции согласно спецификации включены в цену\n\n## 3. Оплата\n- 30% предоплата в течение 5 банковских дней\n- 70% до передачи вертолёта\n\n## 4. Передача\nПередача — в Риге после приёмочного облёта.",
    checks: "- Серийный номер не указан в спецификации — нужно взять у Bell\n- Garmin G1000H NXi: в прайсе 86 000 USD, в спецификации 82 000 USD\n- Срок поставки в договоре не указан",
  });
  await t("save_task", { title: "Созвон с Bell по 505-му", space: "heli", due: plus(2) });
  await t("save_task", { title: "Продлить страховку YL-HCB", space: "heli", due: plus(-1) });
  await t("save_site", { name: "Дом №1 (пример)", address: "", city: "", area_m2: 160, status: "Стройка", budget: 60000, buy_price: 180000, sale_target: 290000, finish_plan: plus(110) });
  await t("save_comps", {
    site: "Дом №1",
    items: [
      { title: "Дом 150 м², соседняя улица (пример)", price: 265000, area_m2: 150, status: "в продаже", note: "после ремонта" },
      { title: "Дом 172 м², участок 8 соток (пример)", price: 298000, area_m2: 172, status: "в продаже" },
      { title: "Дом 140 м², требует ремонта (пример)", price: 189000, area_m2: 140, status: "в продаже", note: "без ремонта" },
      { title: "Дом 165 м² (пример)", price: 281000, area_m2: 165, status: "продан", note: "3 мес. на рынке" },
      { title: "Таунхаус 120 м² (пример)", price: 214000, area_m2: 120, status: "продан" },
      { title: "Дом 190 м², новый (пример)", price: 349000, area_m2: 190, status: "в продаже", note: "новострой" },
    ],
  });
  await t("save_stage", { site: "Дом №1", title: "Демонтаж", contractor: "Bygg SIA", due: plus(-25), status: "done", report: "Вывезено 4 контейнера, акт подписан" });
  await t("save_stage", { site: "Дом №1", title: "Электрика", contractor: "Volt", due: plus(-4) });
  await t("save_stage", { site: "Дом №1", title: "Сантехника", contractor: "Aqua", due: plus(30) });
  await t("save_stage", { site: "Дом №1", title: "Отделка", contractor: "—", due: plus(75) });
  await t("add_expense", { site: "Дом №1", title: "Демонтаж и вывоз", vendor: "Bygg SIA", amount: 8200, paid: true, day: plus(-24) });
  await t("add_expense", { site: "Дом №1", title: "Кабель и щиток", vendor: "Volt", amount: 5400, day: plus(-6) });
  await t("add_expense", { site: "Дом №1", title: "Окна, предоплата", vendor: "Logi", amount: 12500, paid: true, day: plus(-10) });
  await t("save_task", { title: "Выбрать плитку для ванной", space: "build" });
  await t("save_payment", { title: "Школа", amount: 1200, category: "Школа", every: "month", next_due: plus(2) });
  await t("save_payment", { title: "Коммуналка", amount: 240, category: "Дом и счета", every: "month", next_due: plus(-2) });
  await t("save_payment", { title: "Страховка машины", amount: 640, category: "Машина", every: "year", next_due: plus(80) });
  await t("save_payment", { title: "Спортзал", amount: 90, category: "Здоровье", every: "month", next_due: plus(12) });
  await t("log_spend", { title: "Подарок", amount: 180, category: "Семья" });
  await t("record_labs", {
    day: plus(-180),
    lab: "Synlab",
    items: [
      { test: "Ферритин", value: "48", unit: "нг/мл", ref_low: 30, ref_high: 400 },
      { test: "Витамин D", value: "21", unit: "нг/мл", ref_low: 30, ref_high: 100 },
      { test: "Холестерин общий", value: "5.1", unit: "ммоль/л", ref_low: 0, ref_high: 5.2 },
      { test: "Тестостерон", value: "18.4", unit: "нмоль/л", ref_low: 8.6, ref_high: 29 },
      { test: "Глюкоза", value: "5.0", unit: "ммоль/л", ref_low: 3.9, ref_high: 5.6 },
    ],
  });
  await t("record_labs", {
    day: plus(-40),
    lab: "Synlab",
    items: [
      { test: "Ферритин", value: "62", unit: "нг/мл", ref_low: 30, ref_high: 400 },
      { test: "Витамин D", value: "27", unit: "нг/мл", ref_low: 30, ref_high: 100 },
      { test: "Холестерин общий", value: "5.6", unit: "ммоль/л", ref_low: 0, ref_high: 5.2 },
      { test: "Тестостерон", value: "21.1", unit: "нмоль/л", ref_low: 8.6, ref_high: 29 },
      { test: "Глюкоза", value: "5.2", unit: "ммоль/л", ref_low: 3.9, ref_high: 5.6 },
    ],
  });
  await t("save_task", { title: "Пересдать витамин D", space: "general", due: plus(20) });
  await q("insert into messages(thread,role,text,meta) values('inbox','user',$1,'{}'),('inbox','assistant',$2,$3)", [
    "Полетели с Baltic Charter, час двенадцать, Рига — Цесис",
    "Записал полёт Baltic Charter: 1,2 ч, Rīga — Cēsis. В счёт за этот месяц добавлено 840 € (1,2 × 700 €).\n\nКстати: у Иванова просрочен счёт 2026-001 на 975 €, а страховка YL-HCB заканчивается через 3 недели.",
    JSON.stringify({ actions: ["Полёт записан"] }),
  ]);
  await setSetting("demo", { at: today() });
  return { ok: true };
}

/** Стереть пример (и вообще все данные), оставив пароль и адреса подключений. */
export async function clearDemo() {
  await q("truncate charges, invoices, flights, aircraft_costs, comps, aircraft, deals, contracts, stages, expenses, sites, tasks, documents, messages, facts, clients, payments, payment_log, labs cascade");
  await q("delete from settings where key in ('company','pilot','demo','api_usage')");
}

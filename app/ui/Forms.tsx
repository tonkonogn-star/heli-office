"use client";
import { useState } from "react";
import { act, Sheet, Field, toast, todayIso } from "./kit";
import type { Nav } from "./App";

export type F = { k: string; label: string; type?: "text" | "number" | "date" | "area" | "select" | "check"; options?: [string, string][]; half?: boolean; placeholder?: string };

/** Одна форма на все случаи: сохраняет тем же действием, что и помощник. */
export function FormSheet({ title, fields, initial, tool, fixed, onClose, done, submit, danger }: { title: string; fields: F[]; initial?: any; tool: string; fixed?: any; onClose: () => void; done: () => void; submit?: string; danger?: { label: string; input: any } }) {
  const [v, setV] = useState<any>(() => {
    const o: any = {};
    for (const f of fields) {
      const x = initial?.[f.k];
      o[f.k] = f.type === "date" && x ? String(x).slice(0, 10) : f.type === "check" ? !!x : x ?? "";
    }
    return o;
  });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");
  const save = async (input: any) => {
    setBusy(true);
    setErr("");
    try {
      const r = await act(tool, input);
      toast(r.result.split("\n")[0].slice(0, 120));
      done();
      onClose();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  const onSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const out: any = { ...(fixed || {}) };
    if (initial?.id) out.id = initial.id;
    for (const f of fields) {
      const x = v[f.k];
      if (f.type === "number") out[f.k] = x === "" ? undefined : Number(String(x).replace(",", "."));
      else if (f.type === "check") out[f.k] = !!x;
      else out[f.k] = x === "" && !initial?.id ? undefined : x;
    }
    save(out);
  };
  const rows: F[][] = [];
  for (const f of fields) {
    const last = rows[rows.length - 1];
    if (f.half && last && last.length === 1 && last[0].half) last.push(f);
    else rows.push([f]);
  }
  return (
    <Sheet title={title} onClose={onClose}>
      <form onSubmit={onSubmit}>
        {rows.map((r, i) => (
          <div key={i} className={r.length === 2 ? "two" : undefined}>
            {r.map((f) => (
              <Field key={f.k} label={f.label}>
                {f.type === "area" ? (
                  <textarea className="input" value={v[f.k]} placeholder={f.placeholder} onChange={(e) => setV({ ...v, [f.k]: e.target.value })} />
                ) : f.type === "select" ? (
                  <select className="input" value={v[f.k]} onChange={(e) => setV({ ...v, [f.k]: e.target.value })}>
                    {f.options!.map(([val, l]) => (
                      <option key={val} value={val}>
                        {l}
                      </option>
                    ))}
                  </select>
                ) : f.type === "check" ? (
                  <span className="row">
                    <input type="checkbox" checked={v[f.k]} onChange={(e) => setV({ ...v, [f.k]: e.target.checked })} style={{ width: 22, height: 22 }} /> да
                  </span>
                ) : (
                  <input className="input" type={f.type === "number" ? "text" : f.type || "text"} inputMode={f.type === "number" ? "decimal" : undefined} placeholder={f.placeholder} value={v[f.k]} onChange={(e) => setV({ ...v, [f.k]: e.target.value })} />
                )}
              </Field>
            ))}
          </div>
        ))}
        {err && <p style={{ color: "var(--red)" }}>{err}</p>}
        <div className="btns" style={{ marginTop: 6 }}>
          <button className="btn primary" disabled={busy} style={{ flex: 1 }}>
            {submit || "Сохранить"}
          </button>
          {danger && (
            <button type="button" className="btn" disabled={busy} onClick={() => save({ ...danger.input })}>
              {danger.label}
            </button>
          )}
        </div>
      </form>
    </Sheet>
  );
}

const CATS: [string, string][] = ["Семья", "Школа", "Дом и счета", "Здоровье", "Машина", "Подписки", "Другое"].map((x) => [x, x]);
const clientOpts = (s: any): [string, string][] => s.clients.map((c: any) => [c.id, c.name]);
const siteOpts = (s: any): [string, string][] => s.sites.map((x: any) => [x.id, x.name]);
const SPACES: [string, string][] = [
  ["heli", "Heliclub"],
  ["build", "Стройка"],
  ["general", "Личное"],
];

export const FORMS = {
  client: (): F[] => [
    { k: "name", label: "Клиент или компания" },
    { k: "contact", label: "Контактное лицо", half: true },
    { k: "phone", label: "Телефон", half: true },
    { k: "email", label: "Email" },
    { k: "aircraft", label: "Вертолёт", half: true, placeholder: "YL-HCB, Bell 505" },
    { k: "share", label: "Доля", half: true, placeholder: "1/8" },
    { k: "storage_rate", label: "Хранение, в месяц", type: "number", half: true },
    { k: "hour_rate", label: "Лётный час", type: "number", half: true },
    { k: "maint_rate", label: "Час обслуживания", type: "number", half: true },
    { k: "currency", label: "Валюта", type: "select", half: true, options: [["EUR", "EUR"], ["USD", "USD"], ["UAH", "UAH"]] },
    { k: "notes", label: "Заметки", type: "area" },
  ],
  flight: (s: any): F[] => [
    { k: "client", label: "Клиент", type: "select", options: [["", "Без клиента — свой полёт"], ...clientOpts(s)] },
    { k: "hours", label: "Часы", type: "number", half: true, placeholder: "1,5" },
    { k: "day", label: "Дата", type: "date", half: true },
    { k: "route", label: "Маршрут", placeholder: "Рига — Юрмала — Рига" },
    { k: "aircraft", label: "Борт (если не его обычный)" },
  ],
  charge: (s: any): F[] => [
    { k: "client", label: "Клиент", type: "select", options: clientOpts(s) },
    { k: "kind", label: "Что", type: "select", options: [["maintenance", "Обслуживание"], ["other", "Другое: запчасти, топливо, сбор"], ["flight", "Полёт"], ["storage", "Хранение"]] },
    { k: "title", label: "Описание", placeholder: "Замена фильтров, 3 ч" },
    { k: "qty", label: "Количество", type: "number", half: true, placeholder: "1" },
    { k: "unit_price", label: "Цена за единицу", type: "number", half: true },
    { k: "day", label: "Дата", type: "date" },
  ],
  task: (): F[] => [
    { k: "title", label: "Что сделать" },
    { k: "space", label: "Где", type: "select", options: SPACES },
    { k: "due", label: "Срок, если есть", type: "date" },
    { k: "notes", label: "Подробности", type: "area" },
  ],
  site: (): F[] => [
    { k: "name", label: "Название" },
    { k: "address", label: "Адрес" },
    { k: "city", label: "Город, район (для рынка)", half: true },
    { k: "area_m2", label: "Площадь, м²", type: "number", half: true },
    { k: "status", label: "Статус", type: "select", options: ["Оценка", "Покупка", "Стройка", "Продажа", "Продан"].map((x) => [x, x] as [string, string]) },
    { k: "buy_price", label: "Цена покупки", type: "number", half: true },
    { k: "budget", label: "Бюджет ремонта", type: "number", half: true },
    { k: "sale_target", label: "План продажи", type: "number", half: true },
    { k: "finish_plan", label: "Сдать к", type: "date", half: true },
    { k: "notes", label: "Заметки", type: "area" },
  ],
  stage: (s: any): F[] => [
    { k: "site", label: "Объект", type: "select", options: siteOpts(s) },
    { k: "title", label: "Этап", placeholder: "Электрика" },
    { k: "contractor", label: "Подрядчик", half: true },
    { k: "due", label: "Срок", type: "date", half: true },
    { k: "status", label: "Статус", type: "select", options: [["open", "В работе"], ["done", "Готово"]] },
    { k: "report", label: "Отчёт подрядчика", type: "area", placeholder: "Что сделано, акт, фото" },
  ],
  expense: (s: any): F[] => [
    { k: "site", label: "Объект", type: "select", options: siteOpts(s) },
    { k: "title", label: "За что", placeholder: "Плитка, ванная" },
    { k: "vendor", label: "Кому", half: true },
    { k: "amount", label: "Сумма", type: "number", half: true },
    { k: "day", label: "Дата", type: "date", half: true },
    { k: "paid", label: "Оплачено", type: "check", half: true },
  ],
  aircraft: (): F[] => [
    { k: "reg", label: "Бортовой номер", half: true },
    { k: "model", label: "Модель", half: true, placeholder: "Bell 505" },
    { k: "hours", label: "Налёт сейчас, ч", type: "number", half: true },
    { k: "next_service_hours", label: "ТО на налёте, ч", type: "number", half: true },
    { k: "next_service_date", label: "ТО по дате", type: "date", half: true },
    { k: "insurance_until", label: "Страховка до", type: "date", half: true },
    { k: "arc_until", label: "ARC до", type: "date" },
    { k: "purchase_price", label: "Цена покупки (для окупаемости)", type: "number", half: true },
    { k: "purchase_date", label: "Куплен", type: "date", half: true },
    { k: "notes", label: "Заметки", type: "area" },
  ],
  aircraftCost: (s: any): F[] => [
    { k: "aircraft", label: "Борт", type: "select", options: s.aircraft.map((a: any) => [a.id, a.reg] as [string, string]) },
    { k: "kind", label: "Что", type: "select", options: ["Топливо", "ТО", "Запчасти", "Страховка", "Ангар", "Пилот", "Сборы", "Лизинг", "Другое"].map((x) => [x, x] as [string, string]) },
    { k: "title", label: "Подробнее", placeholder: "100-часовое ТО" },
    { k: "amount", label: "Сумма", type: "number", half: true },
    { k: "day", label: "Дата", type: "date", half: true },
  ],
  pilot: (): F[] => [
    { k: "license_type", label: "Лицензия", placeholder: "PPL(H) / CPL(H)" },
    { k: "license_until", label: "Лицензия до", type: "date", half: true },
    { k: "medical_until", label: "Медкомиссия до", type: "date", half: true },
  ],
  deal: (): F[] => [
    { k: "title", label: "Сделка", placeholder: "Bell 505 для …" },
    { k: "party", label: "С кем" },
    { k: "stage", label: "Этап", type: "select", options: ["Новая", "Переговоры", "Договор", "Оплата", "Закрыта", "Проиграна"].map((x) => [x, x] as [string, string]) },
    { k: "value", label: "Сумма", type: "number", half: true },
    { k: "currency", label: "Валюта", type: "select", half: true, options: [["EUR", "EUR"], ["USD", "USD"], ["UAH", "UAH"]] },
    { k: "next_step", label: "Следующий шаг" },
    { k: "next_date", label: "Когда", type: "date" },
    { k: "notes", label: "Заметки", type: "area" },
  ],
  payment: (): F[] => [
    { k: "title", label: "Что платим", placeholder: "Школа Марка" },
    { k: "amount", label: "Сумма", type: "number", half: true },
    { k: "currency", label: "Валюта", type: "select", half: true, options: [["EUR", "EUR"], ["USD", "USD"], ["UAH", "UAH"]] },
    { k: "every", label: "Как часто", type: "select", half: true, options: [["month", "Каждый месяц"], ["quarter", "Раз в квартал"], ["year", "Раз в год"], ["once", "Один раз"]] },
    { k: "next_due", label: "Когда платить", type: "date", half: true },
    { k: "category", label: "Категория", type: "select", options: CATS },
    { k: "notes", label: "Заметки (реквизиты, номер договора)", type: "area" },
  ],
  spend: (): F[] => [
    { k: "title", label: "На что", placeholder: "Подарок, врач, поездка" },
    { k: "amount", label: "Сумма", type: "number", half: true },
    { k: "currency", label: "Валюта", type: "select", half: true, options: [["EUR", "EUR"], ["USD", "USD"], ["UAH", "UAH"]] },
    { k: "category", label: "Категория", type: "select", half: true, options: CATS },
    { k: "day", label: "Дата", type: "date", half: true },
  ],
  company: (): F[] => [
    { k: "name", label: "Компания в счетах" },
    { k: "address", label: "Адрес", type: "area" },
    { k: "vat", label: "VAT / рег. номер", half: true },
    { k: "payDays", label: "Дней на оплату", type: "number", half: true },
    { k: "bank", label: "Банк" },
    { k: "iban", label: "IBAN", half: true },
    { k: "bic", label: "BIC", half: true },
    { k: "footer", label: "Строка внизу счёта" },
  ],
};

/** Быстро добавить с любого экрана. */
export function QuickAdd({ s, onClose, done, go }: { s: any; onClose: () => void; done: () => void; go: (n: Nav) => void }) {
  const [form, setForm] = useState<null | "flight" | "charge" | "task" | "expense" | "spend">(null);
  if (form === "flight") return <FormSheet title="Полёт" tool="log_flight" fields={FORMS.flight(s)} initial={{ day: todayIso() }} onClose={onClose} done={done} submit="Записать полёт" />;
  if (form === "charge") return <FormSheet title="В счёт клиенту" tool="add_charge" fields={FORMS.charge(s)} initial={{ day: todayIso(), kind: "maintenance", client: s.clients[0]?.id }} onClose={onClose} done={done} submit="Добавить в счёт" />;
  if (form === "task") return <FormSheet title="Дело" tool="save_task" fields={FORMS.task()} initial={{ space: "heli" }} onClose={onClose} done={done} />;
  if (form === "expense") return <FormSheet title="Расход по стройке" tool="add_expense" fields={FORMS.expense(s)} initial={{ day: todayIso(), site: s.sites[0]?.id }} onClose={onClose} done={done} submit="Записать расход" />;
  if (form === "spend") return <FormSheet title="Личная трата" tool="log_spend" fields={FORMS.spend()} initial={{ day: todayIso(), category: "Семья", currency: "EUR" }} onClose={onClose} done={done} submit="Записать" />;
  const noClients = s.clients.length === 0;
  const noSites = s.sites.length === 0;
  return (
    <Sheet title="Добавить" onClose={onClose}>
      <div className="panel list">
        <button className="item" onClick={() => setForm("flight")}>
          <div className="grow">
            <div className="t">Полёт</div>
            <div className="s">Сразу попадёт в счёт клиента по его ставке</div>
          </div>
        </button>
        <button className="item" onClick={() => (noClients ? toast("Сначала добавь клиента в Heliclub → Клиенты") : setForm("charge"))}>
          <div className="grow">
            <div className="t">В счёт клиенту</div>
            <div className="s">Обслуживание, запчасти, топливо, сбор</div>
          </div>
        </button>
        <button className="item" onClick={() => (noSites ? toast("Сначала добавь объект в разделе Стройка") : setForm("expense"))}>
          <div className="grow">
            <div className="t">Расход по стройке</div>
            <div className="s">Материалы, работы, счёт подрядчика</div>
          </div>
        </button>
        <button className="item" onClick={() => setForm("spend")}>
          <div className="grow">
            <div className="t">Личная трата</div>
            <div className="s">Семья, школа, врач, подарки</div>
          </div>
        </button>
        <button className="item" onClick={() => setForm("task")}>
          <div className="grow">
            <div className="t">Дело</div>
          </div>
        </button>
        <button
          className="item"
          onClick={() => {
            onClose();
            go({ tab: "chat", thread: "inbox" });
          }}
        >
          <div className="grow">
            <div className="t">Надиктовать помощнику</div>
            <div className="s">Скажи как есть — он сам разложит</div>
          </div>
        </button>
      </div>
    </Sheet>
  );
}

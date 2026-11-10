"use client";
import { useState } from "react";
import { act, money, short, day, isPast, openFile, toast, Sheet, todayIso } from "./kit";
import { FormSheet, FORMS } from "./Forms";
import { Seg, Deals, Contracts, Docs, Tiles } from "./Shared";
import type { Nav } from "./App";

type Sub = "money" | "finance" | "clients" | "flights" | "aircraft" | "deals" | "contracts" | "docs";
const SUBS: [Sub, string][] = [
  ["money", "Счета"],
  ["finance", "Финансы"],
  ["clients", "Клиенты"],
  ["flights", "Полёты"],
  ["aircraft", "Вертолёты"],
  ["deals", "Сделки"],
  ["contracts", "Договоры"],
  ["docs", "Документы"],
];
const STATUS: Record<string, [string, string]> = { draft: ["Черновик", "amber"], sent: ["Отправлен", ""], paid: ["Оплачен", "go"] };

export default function Heli({ s, nav, go, reload }: { s: any; nav: Nav; go: (n: Nav) => void; reload: () => void }) {
  const sub = (nav.sub as Sub) || "money";
  return (
    <>
      <h1>Heliclub</h1>
      <HeliTiles s={s} go={go} />
      <div style={{ height: 14 }} />
      <Seg items={SUBS} value={sub} set={(v) => go({ tab: "heli", sub: v })} />
      {sub === "money" && <Money s={s} reload={reload} />}
      {sub === "finance" && <Finance s={s} go={go} reload={reload} />}
      {sub === "clients" && <Clients s={s} reload={reload} />}
      {sub === "flights" && <Flights s={s} reload={reload} />}
      {sub === "aircraft" && <Aircraft s={s} reload={reload} />}
      {sub === "deals" && <Deals s={s} space="heli" reload={reload} />}
      {sub === "contracts" && <Contracts s={s} space="heli" go={go} />}
      {sub === "docs" && <Docs s={s} space="heli" reload={reload} />}
    </>
  );
}

function Money({ s, reload }: { s: any; reload: () => void }) {
  const [busy, setBusy] = useState(false);
  const [inv, setInv] = useState<any>(null);
  const [all, setAll] = useState(false);
  const drafts = s.invoices.filter((i: any) => i.status === "draft");
  const sent = s.invoices.filter((i: any) => i.status === "sent");
  const paid = s.invoices.filter((i: any) => i.status === "paid");
  const owing = s.debts.filter((d: any) => d.unpaid || d.unbilled || d.drafts);

  const collect = async () => {
    setBusy(true);
    try {
      const r = await act("draft_invoices", { period: todayIso().slice(0, 7) });
      toast(r.changed ? "Черновики готовы — проверь их ниже" : "Нечего выставлять: новых начислений нет");
      reload();
    } catch (e: any) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <div className="panel pad">
        <div className="row between wrap">
          <div>
            <div className="muted small">Ещё не в счетах</div>
            <div style={{ fontSize: 24, fontWeight: 650 }} className="num">
              {money(s.debts.reduce((a: number, d: any) => a + d.unbilled, 0))}
            </div>
          </div>
          <button className="btn primary" disabled={busy || s.clients.length === 0} onClick={collect}>
            {busy ? "Собираю…" : "Собрать черновики счетов"}
          </button>
        </div>
        <p className="small muted" style={{ marginBottom: 0 }}>
          Хранение добавляется само 1-го числа. Полёты и работы — когда ты их записываешь. Счета остаются черновиками, пока ты их не проверишь.
        </p>
      </div>

      {drafts.length > 0 && (
        <>
          <h2>Проверить и отправить</h2>
          <div className="panel list">
            {drafts.map((i: any) => (
              <InvRow key={i.id} i={i} onOpen={() => setInv(i)} />
            ))}
          </div>
        </>
      )}

      <h2>Кто сколько должен</h2>
      <div className="panel list">
        {owing.length === 0 && <div className="empty">{s.clients.length ? "Никто ничего не должен." : "Добавь клиентов во вкладке «Клиенты» — здесь появятся их долги."}</div>}
        {owing.map((d: any) => (
          <div key={d.id} className="item" style={{ cursor: "default", alignItems: "flex-start" }}>
            <div className="grow">
              <div className="t">{d.name}</div>
              <div className="s">
                {d.unbilled ? `не выставлено ${money(d.unbilled, d.currency)}` : ""}
                {d.unbilled && d.drafts ? " · " : ""}
                {d.drafts ? `в черновике ${money(d.drafts, d.currency)}` : ""}
              </div>
            </div>
            <div className="right">
              <div className="num" style={{ fontWeight: 600 }}>
                {money(d.unpaid, d.currency)}
              </div>
              {d.overdue > 0 && <span className="pill red">просрочено {money(d.overdue, d.currency)}</span>}
            </div>
          </div>
        ))}
      </div>

      {sent.length > 0 && (
        <>
          <h2>Ждут оплаты</h2>
          <div className="panel list">
            {sent.map((i: any) => (
              <InvRow key={i.id} i={i} onOpen={() => setInv(i)} />
            ))}
          </div>
        </>
      )}

      {s.charges.length > 0 && (
        <>
          <h2>Начисления без счёта</h2>
          <div className="panel list">
            {s.charges.slice(0, all ? 200 : 8).map((c: any) => (
              <div key={c.id} className="item" style={{ cursor: "default" }}>
                <div className="grow">
                  <div className="t">{c.title}</div>
                  <div className="s">
                    {c.client} · {day(c.day)}
                  </div>
                </div>
                <span className="num">{money(c.amount)}</span>
              </div>
            ))}
            {s.charges.length > 8 && !all && (
              <button className="item small muted" onClick={() => setAll(true)}>
                Показать все {s.charges.length}
              </button>
            )}
          </div>
        </>
      )}

      {paid.length > 0 && (
        <>
          <h2>Оплаченные</h2>
          <div className="panel list">
            {paid.slice(0, 10).map((i: any) => (
              <InvRow key={i.id} i={i} onOpen={() => setInv(i)} />
            ))}
          </div>
        </>
      )}

      {inv && <InvoiceSheet i={inv} onClose={() => setInv(null)} reload={reload} />}
    </>
  );
}

function InvRow({ i, onOpen }: { i: any; onOpen: () => void }) {
  const [label, tone] = STATUS[i.status] || [i.status, ""];
  const late = i.status === "sent" && isPast(i.due);
  return (
    <button className="item" onClick={onOpen}>
      <div className="grow">
        <div className="t">{i.client}</div>
        <div className="s">
          № {i.number}
          {i.status === "sent" ? ` · оплатить до ${day(i.due)}` : ""}
        </div>
      </div>
      <div className="right">
        <div className="num" style={{ fontWeight: 600 }}>
          {money(i.total, i.currency)}
        </div>
        <span className={"pill " + (late ? "red" : tone)}>{late ? "Просрочен" : label}</span>
      </div>
    </button>
  );
}

function InvoiceSheet({ i, onClose, reload }: { i: any; onClose: () => void; reload: () => void }) {
  const [busy, setBusy] = useState(false);
  const set = async (status: string, msg: string) => {
    setBusy(true);
    try {
      await act("invoice_status", { invoice: i.id, status });
      toast(msg);
      reload();
      onClose();
    } catch (e: any) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <Sheet title={`Счёт № ${i.number}`} onClose={onClose}>
      <p style={{ marginTop: 0 }}>
        <b>{i.client}</b> — <span className="num">{money(i.total, i.currency)}</span>
        <br />
        <span className="muted small">
          Выставлен {day(i.issued, true)}, оплатить до {day(i.due, true)}
        </span>
      </p>
      <div className="btns">
        <button className="btn primary" onClick={() => openFile(`/api/invoices/${i.id}/pdf`, `Счёт ${i.number}`, "application/pdf")}>
          Открыть PDF
        </button>
        {i.status === "draft" && (
          <button className="btn" disabled={busy} onClick={() => set("sent", "Отмечен отправленным")}>
            Я отправил
          </button>
        )}
        {i.status !== "paid" && (
          <button className="btn" disabled={busy} onClick={() => set("paid", "Отмечен оплаченным")}>
            Оплачен
          </button>
        )}
        {i.status !== "draft" && (
          <button className="btn ghost" disabled={busy} onClick={() => set("draft", "Вернул в черновики")}>
            Вернуть в черновик
          </button>
        )}
      </div>
      <p className="small muted">Чтобы поправить строки, напиши помощнику «Счета»: «убери из счёта {i.number} замену фильтра» — он пересчитает итог.</p>
    </Sheet>
  );
}

function Clients({ s, reload }: { s: any; reload: () => void }) {
  const [edit, setEdit] = useState<any>(null);
  return (
    <>
      <div className="row between">
        <h2 style={{ marginTop: 6 }}>Клиенты</h2>
        <button className="btn small" onClick={() => setEdit({ currency: "EUR" })}>
          Новый клиент
        </button>
      </div>
      <div className="panel list">
        {s.clients.length === 0 && (
          <div className="empty">
            Добавь клиентов со ставками — хранение в месяц, лётный час, час обслуживания. Или пришли помощнику список файлом, он заведёт всех сам.
          </div>
        )}
        {s.clients.map((c: any) => {
          const d = s.debts.find((x: any) => x.id === c.id);
          return (
            <button key={c.id} className="item" onClick={() => setEdit(c)}>
              <div className="grow">
                <div className="t">{c.name}</div>
                <div className="s">
                  {[c.aircraft, c.share && "доля " + c.share, Number(c.storage_rate) ? `хранение ${money(c.storage_rate, c.currency)}` : null, Number(c.hour_rate) ? `час ${money(c.hour_rate, c.currency)}` : null].filter(Boolean).join(" · ") || "Ставки не заданы"}
                </div>
              </div>
              {d?.overdue > 0 && <span className="pill red">просрочка</span>}
            </button>
          );
        })}
      </div>
      {edit && (
        <FormSheet
          title={edit.id ? edit.name : "Новый клиент"}
          tool="save_client"
          fields={FORMS.client()}
          initial={edit}
          onClose={() => setEdit(null)}
          done={reload}
          danger={edit.id ? { label: "В архив", input: { id: edit.id, archived: true } } : undefined}
        />
      )}
    </>
  );
}

function Flights({ s, reload }: { s: any; reload: () => void }) {
  const [add, setAdd] = useState(false);
  return (
    <>
      <div className="row between">
        <h2 style={{ marginTop: 6 }}>Последние полёты</h2>
        <button className="btn small" onClick={() => setAdd(true)}>
          Записать полёт
        </button>
      </div>
      <div className="panel list">
        {s.flights.length === 0 && (
          <div className="empty">
            После полёта скажи помощнику голосом: <b>«полетели с Ивановым, полтора часа, Рига — Юрмала»</b>. Полёт запишется и сразу попадёт в счёт.
          </div>
        )}
        {s.flights.map((f: any) => (
          <div key={f.id} className="item" style={{ cursor: "default" }}>
            <div className="grow">
              <div className="t">{f.client || "Свой полёт"}</div>
              <div className="s">{[day(f.day), f.route, f.aircraft].filter(Boolean).join(" · ")}</div>
            </div>
            <span className="num">{Number(f.hours)} ч</span>
          </div>
        ))}
      </div>
      {add && <FormSheet title="Полёт" tool="log_flight" fields={FORMS.flight(s)} initial={{ day: todayIso() }} onClose={() => setAdd(false)} done={reload} submit="Записать полёт" />}
    </>
  );
}

function Aircraft({ s, reload }: { s: any; reload: () => void }) {
  const [edit, setEdit] = useState<any>(null);
  const [pilot, setPilot] = useState(false);
  const p = s.pilot || {};
  return (
    <>
      <div className="row between">
        <h2 style={{ marginTop: 6 }}>Вертолёты</h2>
        <button className="btn small" onClick={() => setEdit({})}>
          Добавить борт
        </button>
      </div>
      <div className="panel list">
        {s.aircraft.length === 0 && <div className="empty">Добавь борта с налётом и сроками ТО, страховки и ARC — техконтроль предупредит заранее.</div>}
        {s.aircraft.map((a: any) => {
          const left = a.next_service_hours != null ? Number(a.next_service_hours) - Number(a.hours) : null;
          return (
            <button key={a.id} className="item" onClick={() => setEdit(a)}>
              <div className="grow">
                <div className="t">
                  {a.reg} <span className="muted">{a.model}</span>
                </div>
                <div className="s">
                  налёт {Number(a.hours)} ч{a.insurance_until ? ` · страховка до ${day(a.insurance_until, true)}` : ""}
                </div>
              </div>
              {left != null && <span className={"pill " + (left <= 5 ? "red" : left <= 25 ? "amber" : "go")}>ТО через {left.toFixed(0)} ч</span>}
            </button>
          );
        })}
      </div>
      <h2>Пилот</h2>
      <button className="panel pad item" onClick={() => setPilot(true)}>
        <div className="grow">
          <div className="t">{p.license_type || "Лицензия пилота"}</div>
          <div className="s">
            {p.license_until ? `лицензия до ${day(p.license_until, true)}` : "срок лицензии не указан"} · {p.medical_until ? `медкомиссия до ${day(p.medical_until, true)}` : "медкомиссия не указана"}
          </div>
        </div>
      </button>
      {edit && <FormSheet title={edit.id ? edit.reg : "Новый борт"} tool="save_aircraft" fields={FORMS.aircraft()} initial={edit} onClose={() => setEdit(null)} done={reload} />}
      {pilot && <FormSheet title="Документы пилота" tool="set_pilot" fields={FORMS.pilot()} initial={p} onClose={() => setPilot(false)} done={reload} />}
    </>
  );
}

function HeliTiles({ s, go }: { s: any; go: (n: Nav) => void }) {
  const craft = s.aircraft
    .filter((a: any) => a.next_service_hours != null)
    .map((a: any) => ({ reg: a.reg, left: Number(a.next_service_hours) - Number(a.hours) }))
    .sort((a: any, b: any) => a.left - b.left)[0];
  const month = todayIso().slice(0, 7);
  const hours = s.flights.filter((f: any) => String(f.day).startsWith(month)).reduce((a: number, f: any) => a + Number(f.hours), 0);
  return (
    <Tiles
      go={go}
      items={[
        { label: "Должны вам", value: short(s.totals.owed), sub: s.totals.overdue ? "просрочка" : "всё в срок", tone: s.totals.overdue ? "red" : undefined, go: { tab: "heli", sub: "money" } },
        { label: "Ждёт счёта", value: short(s.totals.unbilled), sub: s.drafts.length ? `черновиков: ${s.drafts.length}` : "полёты и работы", tone: s.drafts.length ? "amber" : undefined, go: { tab: "heli", sub: "money" } },
        craft
          ? { label: "До ТО", value: `${Math.max(0, craft.left).toFixed(0)} ч`, sub: craft.reg, tone: craft.left <= 5 ? "red" : craft.left <= 25 ? "amber" : undefined, go: { tab: "heli", sub: "aircraft" } }
          : { label: "Налёт", value: `${hours.toFixed(1)} ч`, sub: "в этом месяце", go: { tab: "heli", sub: "flights" } },
      ]}
    />
  );
}

/* Финансы: сколько приносит каждый вертолёт и клиент, окупаемость. */
function Finance({ s, go, reload }: { s: any; go: (n: Nav) => void; reload: () => void }) {
  const [cost, setCost] = useState(false);
  const [open, setOpen] = useState<any>(null);
  const A = s.finance.aircraft;
  const C = s.finance.clients.filter((c: any) => c.revenue || c.debt);
  const max = Math.max(1, ...C.map((c: any) => c.revenue));
  return (
    <>
      <div className="row between">
        <h2 style={{ marginTop: 6 }}>Вертолёты за 12 месяцев</h2>
        <button className="btn small" disabled={!s.aircraft.length} onClick={() => setCost(true)}>
          Расход по борту
        </button>
      </div>
      <div className="panel list">
        {A.length === 0 && <div className="empty">Добавь вертолёты во вкладке «Вертолёты» — здесь появится доход, расходы и окупаемость каждого.</div>}
        {A.map((a: any) => (
          <button key={a.id} className="item" style={{ display: "block" }} onClick={() => setOpen(a)}>
            <div className="row between">
              <div className="t">
                {a.reg} <span className="muted">{a.model}</span>
              </div>
              <b className="num" style={{ color: a.profit < 0 ? "var(--red)" : undefined }}>
                {a.profit >= 0 ? "+" : ""}
                {money(Math.round(a.profit))}
              </b>
            </div>
            <div className="s" style={{ margin: "3px 0 8px" }}>
              доход {money(Math.round(a.revenue))} · расходы {money(Math.round(a.costs))}
              {a.hours ? ` · ${a.hours.toFixed(1)} ч` : ""}
              {a.perHour != null ? ` · ${money(Math.round(a.perHour))} за час` : ""}
            </div>
            {a.payback != null ? (
              <>
                <div className="progress">
                  <div style={{ width: a.payback * 100 + "%" }} />
                </div>
                <div className="s" style={{ marginTop: 5 }}>
                  окупился на {Math.round(a.payback * 100)}% из {short(a.price)}
                  {a.monthsLeft != null
                    ? a.monthsLeft > 180
                      ? " · полётами и хранением за 15 лет не окупится — нужны продажи долей"
                      : ` · при нынешнем темпе ещё ≈ ${a.monthsLeft > 24 ? Math.round(a.monthsLeft / 12) + " г." : a.monthsLeft + " мес."}`
                    : a.payback < 1
                      ? " · пока не в плюсе — срок не посчитать"
                      : ""}
                </div>
              </>
            ) : (
              <div className="s">Укажи цену покупки борта — посчитаю окупаемость.</div>
            )}
          </button>
        ))}
      </div>
      {A.length > 0 && !A.some((a: any) => a.costs) && <p className="small muted">Расходов по бортам пока нет — без них прибыль равна доходу. Скажи помощнику «заправка YL-HCB 640 €», и он запишет.</p>}

      <h2>Клиенты за 12 месяцев</h2>
      <div className="panel list">
        {C.length === 0 && <div className="empty">Когда появятся полёты и счета, здесь будет видно, кто сколько приносит и как платит.</div>}
        {C.map((c: any) => (
          <div key={c.id} className="item" style={{ display: "block", cursor: "default" }}>
            <div className="row between">
              <div className="t">{c.name}</div>
              <b className="num">{money(Math.round(c.revenue), c.currency)}</b>
            </div>
            <div className="progress" style={{ margin: "7px 0 6px", background: "transparent" }}>
              <div style={{ width: (c.revenue / max) * 100 + "%", background: "var(--ink)" }} />
            </div>
            <div className="s">
              {[c.hours ? `${c.hours.toFixed(1)} ч` : null, c.storage ? `хранение ${short(c.storage)}` : null, c.maintenance ? `ТО ${short(c.maintenance)}` : null, `${Math.round(c.share * 100)}% дохода`].filter(Boolean).join(" · ")}
            </div>
            <div className="s">
              оплачено {money(Math.round(c.paid), c.currency)}
              {c.debt ? ` · должен ${money(Math.round(c.debt), c.currency)}` : ""}
              {c.pay_days != null ? ` · платит за ${c.pay_days} дн.` : ""}
            </div>
          </div>
        ))}
      </div>
      <p className="small muted">Доход — по начислениям: полёты, хранение и обслуживание, выставленные и ещё нет.</p>
      <button className="btn" style={{ marginTop: 4 }} onClick={() => go({ tab: "chat", thread: "a:finance", draft: "Разбери финансы Heliclub: какой вертолёт и какой клиент приносят больше всего, где теряю деньги." })}>
        Разобрать с помощником «Финансы»
      </button>
      {cost && <FormSheet title="Расход по вертолёту" tool="add_aircraft_cost" fields={FORMS.aircraftCost(s)} initial={{ aircraft: s.aircraft[0]?.id, kind: "Топливо", day: todayIso() }} onClose={() => setCost(false)} done={reload} />}
      {open && (
        <Sheet title={`${open.reg} — расходы за год`} onClose={() => setOpen(null)}>
          <div className="panel list">
            {open.costBreakdown.length === 0 && <div className="empty">Расходов не записано.</div>}
            {open.costBreakdown.map((c: any) => (
              <div key={c.kind} className="item" style={{ cursor: "default" }}>
                <div className="grow">{c.kind}</div>
                <span className="num">{money(Math.round(c.sum))}</span>
              </div>
            ))}
          </div>
          {open.monthly ? <p className="small muted">Средняя прибыль за последние полгода: {money(Math.round(open.monthly))} в месяц.</p> : null}
        </Sheet>
      )}
    </>
  );
}

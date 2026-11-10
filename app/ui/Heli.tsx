"use client";
import { useState } from "react";
import { act, money, day, isPast, openFile, toast, Sheet, todayIso } from "./kit";
import { FormSheet, FORMS } from "./Forms";
import { Seg, Deals, Contracts, Docs } from "./Shared";
import type { Nav } from "./App";

type Sub = "money" | "clients" | "flights" | "aircraft" | "deals" | "contracts" | "docs";
const SUBS: [Sub, string][] = [
  ["money", "Счета"],
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
      <Seg items={SUBS} value={sub} set={(v) => go({ tab: "heli", sub: v })} />
      {sub === "money" && <Money s={s} reload={reload} />}
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

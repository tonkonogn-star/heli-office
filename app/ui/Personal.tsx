"use client";
import { useRef, useState } from "react";
import { act, api, money, day, isPast, toast, todayIso, Sheet, DoneCheck } from "./kit";
import { FormSheet, FORMS } from "./Forms";
import { Seg, Docs } from "./Shared";
import type { Nav } from "./App";

type Sub = "pay" | "health" | "tasks" | "docs";
const SUBS: [Sub, string][] = [
  ["pay", "Платежи"],
  ["health", "Здоровье"],
  ["tasks", "Дела"],
  ["docs", "Документы"],
];
const EVERY: Record<string, string> = { month: "каждый месяц", quarter: "раз в квартал", year: "раз в год", once: "разово" };

export default function Personal({ s, nav, go, reload }: { s: any; nav: Nav; go: (n: Nav) => void; reload: () => void }) {
  const sub = (nav.sub as Sub) || "pay";
  return (
    <>
      <h1>Личное</h1>
      <Seg items={SUBS} value={sub} set={(v) => go({ tab: "personal", sub: v })} />
      {sub === "pay" && <Payments s={s} reload={reload} />}
      {sub === "health" && <Health s={s} go={go} reload={reload} />}
      {sub === "tasks" && <Tasks s={s} reload={reload} />}
      {sub === "docs" && <Docs s={s} space="general" reload={reload} />}
    </>
  );
}

function Payments({ s, reload }: { s: any; reload: () => void }) {
  const [edit, setEdit] = useState<any>(null);
  const [spend, setSpend] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const month = todayIso().slice(0, 7);
  const thisMonth = s.spends.filter((x: any) => String(x.day).startsWith(month));
  const byCat = new Map<string, number>();
  for (const x of thisMonth) byCat.set(x.category, (byCat.get(x.category) || 0) + Number(x.amount));
  const total = [...byCat.values()].reduce((a, b) => a + b, 0);
  const soon = s.payments.filter((p: any) => p.next_due && p.next_due <= new Date(Date.now() + 10 * 864e5).toISOString().slice(0, 10));
  const later = s.payments.filter((p: any) => !soon.includes(p));

  const pay = async (p: any) => {
    setBusy(p.id);
    try {
      const r = await act("pay_payment", { id: p.id });
      toast(r.result.split(".")[0]);
      reload();
    } catch (e: any) {
      toast(e.message);
    } finally {
      setBusy(null);
    }
  };

  const Row = ({ p }: { p: any }) => (
    <div className="item" style={{ cursor: "default" }}>
      <button className="grow" style={{ background: "none", border: 0, padding: 0, textAlign: "left", cursor: "pointer" }} onClick={() => setEdit(p)}>
        <div className="t">{p.title}</div>
        <div className="s">
          {money(p.amount, p.currency)} · {EVERY[p.every] || p.every}
          {p.next_due ? ` · ${isPast(p.next_due) ? "просрочен с" : "до"} ${day(p.next_due)}` : ""}
        </div>
      </button>
      <button className={"btn small" + (isPast(p.next_due) ? " primary" : "")} disabled={busy === p.id} onClick={() => pay(p)}>
        Оплатил
      </button>
    </div>
  );

  return (
    <>
      <div className="panel pad">
        <div className="row between wrap">
          <div>
            <div className="muted small">Потрачено в этом месяце</div>
            <div style={{ fontSize: 24, fontWeight: 650 }} className="num">
              {money(total)}
            </div>
          </div>
          <button className="btn" onClick={() => setSpend(true)}>
            Записать трату
          </button>
        </div>
        {byCat.size > 0 && (
          <div className="small muted" style={{ marginTop: 8 }}>
            {[...byCat.entries()]
              .sort((a, b) => b[1] - a[1])
              .map(([c, v]) => `${c} ${money(v)}`)
              .join(" · ")}
          </div>
        )}
      </div>

      <div className="row between">
        <h2>Скоро платить</h2>
        <button className="btn small" onClick={() => setEdit({ every: "month", category: "Семья", currency: "EUR" })}>
          Новый платёж
        </button>
      </div>
      <div className="panel list">
        {soon.length === 0 && <div className="empty">{s.payments.length ? "В ближайшие 10 дней платить нечего." : "Добавь регулярные платежи — школа, аренда, счета, страховки. Когда подойдёт срок, они появятся здесь и в календаре."}</div>}
        {soon.map((p: any) => (
          <Row key={p.id} p={p} />
        ))}
      </div>

      {later.length > 0 && (
        <>
          <h2>Все платежи</h2>
          <div className="panel list">
            {later.map((p: any) => (
              <Row key={p.id} p={p} />
            ))}
          </div>
        </>
      )}

      {thisMonth.length > 0 && (
        <>
          <h2>История за месяц</h2>
          <div className="panel list">
            {thisMonth.slice(0, 15).map((x: any) => (
              <div key={x.id} className="item" style={{ cursor: "default" }}>
                <div className="grow">
                  <div className="t">{x.title}</div>
                  <div className="s">
                    {x.category} · {day(x.day)}
                  </div>
                </div>
                <span className="num">{money(x.amount, x.currency)}</span>
              </div>
            ))}
          </div>
        </>
      )}

      {edit && (
        <FormSheet
          title={edit.id ? edit.title : "Новый платёж"}
          tool="save_payment"
          fields={FORMS.payment()}
          initial={edit}
          onClose={() => setEdit(null)}
          done={reload}
          danger={edit.id ? { label: "Больше не платим", input: { id: edit.id, active: false } } : undefined}
        />
      )}
      {spend && <FormSheet title="Трата" tool="log_spend" fields={FORMS.spend()} initial={{ day: todayIso(), category: "Семья", currency: "EUR" }} onClose={() => setSpend(false)} done={reload} submit="Записать" />}
    </>
  );
}

/** Мини-график показателя: точки во времени и полоса нормы. */
function Spark({ t }: { t: any }) {
  const pts = t.points.filter((p: any) => p.value != null);
  if (pts.length < 2) return null;
  const vals = pts.map((p: any) => p.value);
  const lo = Math.min(...vals, t.ref_low ?? Infinity);
  const hi = Math.max(...vals, t.ref_high ?? -Infinity);
  const pad = (hi - lo) * 0.15 || 1;
  const y = (v: number) => 28 - ((v - (lo - pad)) / (hi - lo + 2 * pad)) * 28;
  const x = (i: number) => 2 + (i / (pts.length - 1)) * 92;
  return (
    <svg viewBox="0 0 96 30" width="96" height="30" aria-hidden style={{ flex: "none" }}>
      {t.ref_low != null && t.ref_high != null && <rect x="0" width="96" y={y(t.ref_high)} height={Math.max(1, y(t.ref_low) - y(t.ref_high))} fill="var(--go-bg)" />}
      <polyline points={pts.map((p: any, i: number) => `${x(i)},${y(p.value)}`).join(" ")} fill="none" stroke="var(--steel)" strokeWidth="1.5" />
      {pts.map((p: any, i: number) => (
        <circle key={i} cx={x(i)} cy={y(p.value)} r={i === pts.length - 1 ? 2.6 : 1.6} fill={i === pts.length - 1 ? (t.flag ? "var(--red)" : "var(--ink)") : "var(--steel)"} />
      ))}
    </svg>
  );
}

function Health({ s, go, reload }: { s: any; go: (n: Nav) => void; reload: () => void }) {
  const inp = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [open, setOpen] = useState<any>(null);
  const flagged = s.labs.filter((t: any) => t.flag);
  const rest = s.labs.filter((t: any) => !t.flag);
  const wd = s.whoop?.days || [];

  // бланк анализов → помощнику «Здоровье», он сам выпишет все показатели
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("space", "general");
      for (const f of Array.from(files)) fd.append("file", f);
      const r = await api("/api/docs", { method: "POST", body: fd });
      go({ tab: "chat", thread: "a:health", files: r.docs, draft: "Новые анализы. Запиши все показатели и скажи, что изменилось." });
    } catch (e: any) {
      toast(e.message);
    } finally {
      setBusy(false);
    }
  };

  const Row = ({ t }: { t: any }) => {
    const last = t.points[t.points.length - 1];
    return (
      <button className="item" onClick={() => setOpen(t)}>
        <div className="grow">
          <div className="t">{t.test}</div>
          <div className="s">
            {t.ref_low != null || t.ref_high != null ? `норма ${t.ref_low ?? "…"}–${t.ref_high ?? "…"} ${t.unit}` : t.unit || " "} · {day(last.day, true)}
          </div>
        </div>
        <Spark t={t} />
        <div className="right" style={{ minWidth: 64 }}>
          <div className="num" style={{ fontWeight: 600, color: t.flag ? "var(--red)" : undefined }}>
            {last.value ?? last.text}
          </div>
          {t.flag && <span className="pill red">{t.flag === "high" ? "выше" : "ниже"}</span>}
        </div>
      </button>
    );
  };

  return (
    <>
      <div className="panel pad">
        <div>
          <div className="t" style={{ fontWeight: 600 }}>
            Анализы в одном месте
          </div>
          <div className="small muted" style={{ margin: "2px 0 12px" }}>
            Пришли бланк или фото — помощник выпишет все показатели и сравнит с прошлыми.
          </div>
          <button className="btn primary" style={{ width: "100%" }} disabled={busy} onClick={() => inp.current?.click()}>
            {busy ? "Загружаю…" : "Загрузить анализы"}
          </button>
          <input ref={inp} type="file" accept="application/pdf,image/*" multiple hidden onChange={(e) => upload(e.target.files)} />
        </div>
      </div>

      {s.whoop?.connected && wd.length > 0 && (
        <>
          <h2>WHOOP за неделю</h2>
          <div className="figs">
            <div className="fig">
              <span>Восстановление</span>
              <b className="num">{Math.round(avg(wd, "recovery"))}%</b>
            </div>
            <div className="fig">
              <span>Сон</span>
              <b className="num">{avg(wd, "sleep_hours").toFixed(1)} ч</b>
            </div>
            <div className="fig">
              <span>Пульс покоя</span>
              <b className="num">{Math.round(avg(wd, "rhr"))}</b>
            </div>
          </div>
        </>
      )}

      {flagged.length > 0 && (
        <>
          <h2>Вне нормы</h2>
          <div className="panel list">
            {flagged.map((t: any) => (
              <Row key={t.test} t={t} />
            ))}
          </div>
        </>
      )}
      <h2>{flagged.length ? "Остальные показатели" : "Показатели"}</h2>
      <div className="panel list">
        {s.labs.length === 0 && <div className="empty">Здесь будет каждый показатель с динамикой: ферритин, витамин D, холестерин, тестостерон — всё, что ты сдаёшь.</div>}
        {rest.map((t: any) => (
          <Row key={t.test} t={t} />
        ))}
      </div>
      {s.labs.length > 0 && (
        <button className="btn" style={{ marginTop: 12 }} onClick={() => go({ tab: "chat", thread: "a:health", draft: "Разбери мои анализы и WHOOP комплексно: что меняется, что пересдать." })}>
          Разобрать всё с помощником
        </button>
      )}
      {open && (
        <Sheet title={open.test} onClose={() => setOpen(null)}>
          <p className="muted" style={{ marginTop: 0 }}>
            {open.ref_low != null || open.ref_high != null ? `Норма ${open.ref_low ?? "…"}–${open.ref_high ?? "…"} ${open.unit}` : open.unit}
          </p>
          <div className="panel list">
            {[...open.points].reverse().map((p: any) => (
              <div key={p.id} className="item" style={{ cursor: "default" }}>
                <div className="grow">{day(p.day, true)}</div>
                <span className="num">
                  {p.value ?? p.text} {open.unit}
                </span>
              </div>
            ))}
          </div>
        </Sheet>
      )}
    </>
  );
}

const avg = (rows: any[], k: string) => {
  const v = rows.map((r) => r[k]).filter((x) => x != null);
  return v.length ? v.reduce((a, b) => a + b, 0) / v.length : 0;
};

function Tasks({ s, reload }: { s: any; reload: () => void }) {
  const [edit, setEdit] = useState<any>(null);
  const list = s.tasks.filter((t: any) => t.space === "general");
  return (
    <>
      <div className="row between">
        <h2 style={{ marginTop: 6 }}>Свои дела</h2>
        <button className="btn small" onClick={() => setEdit({ space: "general" })}>
          Новое дело
        </button>
      </div>
      <div className="panel list">
        {list.length === 0 && <div className="empty">Личные дела без привязки к работе: записаться к врачу, продлить паспорт, купить подарок.</div>}
        {list.map((t: any) => (
          <div key={t.id} className="item" style={{ cursor: "default" }}>
            <DoneCheck label={"Готово: " + t.title} run={() => act("save_task", { id: t.id, status: "done" })} after={reload} />
            <button className="grow" style={{ background: "none", border: 0, padding: 0, textAlign: "left", cursor: "pointer" }} onClick={() => setEdit(t)}>
              <div className="t">{t.title}</div>
              {t.notes && <div className="s">{t.notes}</div>}
            </button>
            {t.due && <span className={"pill" + (isPast(t.due) ? " red" : "")}>{day(t.due)}</span>}
          </div>
        ))}
      </div>
      {edit && <FormSheet title={edit.id ? edit.title : "Новое дело"} tool="save_task" fields={FORMS.task()} initial={edit} onClose={() => setEdit(null)} done={reload} />}
    </>
  );
}

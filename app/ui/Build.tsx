"use client";
import { useState } from "react";
import { act, money, short, day, isPast, toast, todayIso, Icon } from "./kit";
import { FormSheet, FORMS } from "./Forms";
import { Seg, Deals, Contracts, Docs, Tiles } from "./Shared";
import type { Nav } from "./App";

type Sub = "sites" | "deals" | "contracts" | "docs";
const SUBS: [Sub, string][] = [
  ["sites", "Объекты"],
  ["deals", "Сделки"],
  ["contracts", "Договоры"],
  ["docs", "Документы"],
];

export default function Build({ s, nav, go, reload }: { s: any; nav: Nav; go: (n: Nav) => void; reload: () => void }) {
  const sub = (nav.sub as Sub) || "sites";
  if (nav.id) {
    const site = s.sites.find((x: any) => x.id === nav.id);
    if (site) return <Site s={s} site={site} back={() => go({ tab: "build" })} go={go} reload={reload} />;
  }
  return (
    <>
      <h1>Стройка</h1>
      <BuildTiles s={s} go={go} />
      <div style={{ height: 14 }} />
      <Seg items={SUBS} value={sub} set={(v) => go({ tab: "build", sub: v })} />
      {sub === "sites" && <Sites s={s} go={go} reload={reload} />}
      {sub === "deals" && <Deals s={s} space="build" reload={reload} />}
      {sub === "contracts" && <Contracts s={s} space="build" go={go} />}
      {sub === "docs" && <Docs s={s} space="build" reload={reload} />}
    </>
  );
}

function spentOf(s: any, id: string) {
  return s.expenses.filter((e: any) => e.site_id === id).reduce((a: number, e: any) => a + Number(e.amount), 0);
}

function Sites({ s, go, reload }: { s: any; go: (n: Nav) => void; reload: () => void }) {
  const [add, setAdd] = useState(false);
  return (
    <>
      <div className="row between">
        <h2 style={{ marginTop: 6 }}>Объекты</h2>
        <button className="btn small" onClick={() => setAdd(true)}>
          Новый объект
        </button>
      </div>
      <div className="panel list">
        {s.sites.length === 0 && <div className="empty">Добавь дом, который строишь: бюджет, этапы и подрядчиков. Расходы и отчёты помощник запишет сам, если надиктовать.</div>}
        {s.sites.map((x: any) => {
          const st = s.stages.filter((y: any) => y.site_id === x.id);
          const done = st.filter((y: any) => y.status === "done").length;
          const late = st.filter((y: any) => y.status !== "done" && isPast(y.due)).length;
          const spent = spentOf(s, x.id);
          const budget = Number(x.budget);
          return (
            <button key={x.id} className="item" onClick={() => go({ tab: "build", id: x.id })} style={{ display: "block" }}>
              <div className="row between">
                <div className="t">{x.name}</div>
                <span className="pill">{x.status}</span>
              </div>
              <div className="s" style={{ margin: "4px 0 8px" }}>
                этапы {done} из {st.length}
                {late ? ` · просрочено ${late}` : ""} · потрачено {money(spent)}
                {budget ? ` из ${money(budget)}` : ""}
              </div>
              {budget > 0 && (
                <div className={"progress" + (spent > budget ? " over" : "")}>
                  <div style={{ width: Math.min(100, (spent / budget) * 100) + "%" }} />
                </div>
              )}
            </button>
          );
        })}
      </div>
      <button className="btn" style={{ marginTop: 12 }} onClick={() => go({ tab: "chat", thread: "a:flip" })}>
        Оценить дом перед покупкой
      </button>
      {add && <FormSheet title="Новый объект" tool="save_site" fields={FORMS.site()} initial={{ status: "Стройка" }} onClose={() => setAdd(false)} done={reload} />}
    </>
  );
}

function Site({ s, site, back, go, reload }: { s: any; site: any; back: () => void; go: (n: Nav) => void; reload: () => void }) {
  const [form, setForm] = useState<null | { kind: "edit" | "stage" | "expense"; v?: any }>(null);
  const stages = s.stages.filter((y: any) => y.site_id === site.id);
  const exps = s.expenses.filter((e: any) => e.site_id === site.id);
  const spent = spentOf(s, site.id);
  const unpaid = exps.filter((e: any) => !e.paid).reduce((a: number, e: any) => a + Number(e.amount), 0);
  const budget = Number(site.budget);

  const close = async (st: any) => {
    if (!st.report) {
      setForm({ kind: "stage", v: { ...st, status: "done" } });
      toast("Этап закрывается с отчётом — допиши, что сделано");
      return;
    }
    await act("save_stage", { id: st.id, status: st.status === "done" ? "open" : "done" });
    reload();
  };

  return (
    <>
      <button className="btn ghost small" onClick={back} style={{ marginLeft: -10 }}>
        <Icon n="back" size={18} /> Объекты
      </button>
      <div className="row between" style={{ alignItems: "flex-start" }}>
        <h1 style={{ marginBottom: 4 }}>{site.name}</h1>
        <button className="btn small" onClick={() => setForm({ kind: "edit", v: site })}>
          Изменить
        </button>
      </div>
      <p className="muted" style={{ marginTop: 0 }}>
        {[site.address, site.status, site.finish_plan && "сдать к " + day(site.finish_plan, true)].filter(Boolean).join(" · ")}
      </p>

      <div className="figs">
        <div className="fig">
          <span>Потрачено</span>
          <b className="num">{money(spent)}</b>
        </div>
        <div className={"fig" + (budget && spent > budget ? " alert" : "")}>
          <span>Бюджет</span>
          <b className="num">{budget ? money(budget) : "—"}</b>
        </div>
        <div className={"fig" + (unpaid ? " alert" : "")}>
          <span>Не оплачено</span>
          <b className="num">{money(unpaid)}</b>
        </div>
      </div>

      <div className="row between">
        <h2>Этапы</h2>
        <button className="btn small" onClick={() => setForm({ kind: "stage", v: { site: site.id, status: "open" } })}>
          Добавить этап
        </button>
      </div>
      <div className="panel list">
        {stages.length === 0 && <div className="empty">Разбей стройку на этапы со сроками и подрядчиками: демонтаж, электрика, сантехника, отделка…</div>}
        {stages.map((st: any) => (
          <div key={st.id} className="item" style={{ cursor: "default" }}>
            <button className="btn small" style={{ width: 34, padding: 0, background: st.status === "done" ? "var(--go-bg)" : undefined }} onClick={() => close(st)} aria-label={st.status === "done" ? "Открыть снова" : "Закрыть этап"}>
              {st.status === "done" ? "✓" : ""}
            </button>
            <button className="grow" style={{ background: "none", border: 0, padding: 0, textAlign: "left", cursor: "pointer" }} onClick={() => setForm({ kind: "stage", v: { ...st, site: site.id } })}>
              <div className="t" style={{ textDecoration: st.status === "done" ? "line-through" : undefined, opacity: st.status === "done" ? 0.6 : 1 }}>
                {st.title}
              </div>
              <div className="s">{[st.contractor, st.status === "done" && !st.report ? "нет отчёта" : null].filter(Boolean).join(" · ") || " "}</div>
            </button>
            {st.due && st.status !== "done" && <span className={"pill" + (isPast(st.due) ? " red" : "")}>{day(st.due)}</span>}
          </div>
        ))}
      </div>

      <div className="row between">
        <h2>Расходы</h2>
        <button className="btn small" onClick={() => setForm({ kind: "expense", v: { site: site.id, day: todayIso() } })}>
          Записать расход
        </button>
      </div>
      <div className="panel list">
        {exps.length === 0 && <div className="empty">Каждый чек и счёт подрядчика — сюда. Помощник покажет, сколько осталось от бюджета.</div>}
        {exps.map((e: any) => (
          <div key={e.id} className="item" style={{ cursor: "default" }}>
            <div className="grow">
              <div className="t">{e.title}</div>
              <div className="s">{[e.vendor, day(e.day)].filter(Boolean).join(" · ")}</div>
            </div>
            <div className="right">
              <div className="num">{money(e.amount)}</div>
              {!e.paid && <span className="pill amber">не оплачено</span>}
            </div>
          </div>
        ))}
      </div>
      <button className="btn" style={{ marginTop: 12 }} onClick={() => go({ tab: "chat", thread: "a:build" })}>
        Спросить помощника «Стройка»
      </button>

      {form?.kind === "edit" && <FormSheet title={site.name} tool="save_site" fields={FORMS.site()} initial={form.v} onClose={() => setForm(null)} done={reload} />}
      {form?.kind === "stage" && <FormSheet title={form.v.id ? form.v.title : "Новый этап"} tool="save_stage" fields={FORMS.stage(s)} initial={form.v} onClose={() => setForm(null)} done={reload} />}
      {form?.kind === "expense" && <FormSheet title="Расход" tool="add_expense" fields={FORMS.expense(s)} initial={form.v} onClose={() => setForm(null)} done={reload} />}
    </>
  );
}

function BuildTiles({ s, go }: { s: any; go: (n: Nav) => void }) {
  const budget = s.sites.reduce((a: number, x: any) => a + Number(x.budget || 0), 0);
  const spent = s.expenses.reduce((a: number, e: any) => a + Number(e.amount), 0);
  const unpaid = s.expenses.filter((e: any) => !e.paid).reduce((a: number, e: any) => a + Number(e.amount), 0);
  const late = s.stages.filter((x: any) => x.status !== "done" && isPast(x.due));
  const one = s.sites.length === 1 ? s.sites[0].id : undefined;
  return (
    <Tiles
      go={go}
      items={[
        { label: "Потрачено", value: short(spent), sub: budget ? `из ${short(budget)}` : "бюджет не задан", tone: budget && spent > budget ? "red" : undefined, go: { tab: "build", id: one } },
        { label: "Просрочки", value: String(late.length), sub: late[0] ? late[0].title : `${s.stages.filter((x: any) => x.status !== "done").length} в работе`, tone: late.length ? "red" : "go", go: { tab: "build", id: one } },
        { label: "Не оплачено", value: short(unpaid), sub: "подрядчикам", tone: unpaid ? "amber" : undefined, go: { tab: "build", id: one } },
      ]}
    />
  );
}

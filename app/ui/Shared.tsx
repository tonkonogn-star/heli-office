"use client";
import { useRef, useState } from "react";
import { api, money, day, isPast, openFile, toast, Sheet } from "./kit";
import { FormSheet, FORMS } from "./Forms";
import type { Nav } from "./App";

export function Seg<T extends string>({ items, value, set }: { items: [T, string][]; value: T; set: (v: T) => void }) {
  return (
    <div className="seg" role="tablist">
      {items.map(([k, l]) => (
        <button key={k} aria-pressed={value === k} onClick={() => set(k)}>
          {l}
        </button>
      ))}
    </div>
  );
}

export function Deals({ s, space, reload }: { s: any; space: string; reload: () => void }) {
  const [edit, setEdit] = useState<any>(null);
  const list = s.deals.filter((d: any) => d.space === space);
  return (
    <>
      <div className="row between">
        <h2 style={{ marginTop: 6 }}>Сделки</h2>
        <button className="btn small" onClick={() => setEdit({ space, stage: "Новая", currency: "EUR" })}>
          Новая сделка
        </button>
      </div>
      <div className="panel list">
        {list.length === 0 && <div className="empty">{space === "heli" ? "Продажи Bell и долей появятся здесь. У каждой сделки — следующий шаг с датой." : "Покупка и продажа домов. У каждой сделки — следующий шаг с датой."}</div>}
        {list.map((d: any) => (
          <button key={d.id} className="item" onClick={() => setEdit(d)}>
            <div className="grow">
              <div className="t">{d.title}</div>
              <div className="s">
                {d.stage}
                {d.party ? " · " + d.party : ""}
                {d.next_step ? " — " + d.next_step : ""}
              </div>
            </div>
            <div className="right">
              {d.value != null && <div className="num small">{money(d.value, d.currency)}</div>}
              {d.next_date && <span className={"pill" + (isPast(d.next_date) ? " red" : "")}>{day(d.next_date)}</span>}
            </div>
          </button>
        ))}
      </div>
      {edit && <FormSheet title={edit.id ? edit.title : "Новая сделка"} tool="save_deal" fields={FORMS.deal()} initial={edit} fixed={{ space }} onClose={() => setEdit(null)} done={reload} />}
    </>
  );
}

export function Contracts({ s, space, go }: { s: any; space: string; go: (n: Nav) => void }) {
  const list = s.contracts.filter((c: any) => c.space === space);
  const [open, setOpen] = useState<any>(null);
  return (
    <>
      <h2 style={{ marginTop: 6 }}>Договоры</h2>
      <div className="panel list">
        {list.length === 0 && (
          <div className="empty">
            Договоров пока нет. Приложи помощнику «Договоры» шаблон и спецификацию — он соберёт договор и сверит каждую цифру.
          </div>
        )}
        {list.map((c: any) => (
          <button key={c.id} className="item" onClick={() => setOpen(c)}>
            <div className="grow">
              <div className="t">{c.title}</div>
              <div className="s">
                {c.party || "—"} · {c.status}
              </div>
            </div>
            {c.checks && <span className="pill amber">Сверка</span>}
          </button>
        ))}
      </div>
      <button className="btn" style={{ marginTop: 10 }} onClick={() => go({ tab: "chat", thread: "a:contracts" })}>
        Собрать договор с помощником
      </button>
      {open && (
        <Sheet title={open.title} onClose={() => setOpen(null)}>
          <p className="muted" style={{ marginTop: 0 }}>
            {open.party || "—"} · {open.status}
            {open.amount != null ? " · " + money(open.amount, open.currency) : ""}
          </p>
          {open.checks && (
            <div className="panel pad" style={{ background: "var(--caution-bg)", borderColor: "transparent" }}>
              <h3>Сверка</h3>
              <div style={{ whiteSpace: "pre-wrap" }}>{open.checks}</div>
            </div>
          )}
          <div className="btns" style={{ marginTop: 14 }}>
            <button className="btn primary" onClick={() => openFile(`/api/contracts/${open.id}/pdf`, open.title, "application/pdf")}>
              Открыть PDF
            </button>
            <button
              className="btn"
              onClick={() => {
                setOpen(null);
                go({ tab: "chat", thread: "a:contracts" });
              }}
            >
              Править с помощником
            </button>
          </div>
        </Sheet>
      )}
    </>
  );
}

const SHELVES = ["Договоры", "Счета", "Спецификации", "Сметы", "Акты", "Фото", "Разное"];

export function Docs({ s, space, reload }: { s: any; space: string; reload: () => void }) {
  const [shelf, setShelf] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const inp = useRef<HTMLInputElement>(null);
  const all = s.docs.filter((d: any) => d.space === space);
  const shelves = SHELVES.filter((x) => all.some((d: any) => d.shelf === x));
  const list = shelf ? all.filter((d: any) => d.shelf === shelf) : all;
  const upload = async (files: FileList | null) => {
    if (!files?.length) return;
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("space", space);
      for (const f of Array.from(files)) fd.append("file", f);
      const r = await api("/api/docs", { method: "POST", body: fd });
      toast(`Загружено: ${r.docs.length}`);
      reload();
    } catch (e: any) {
      toast(e.message);
    } finally {
      setBusy(false);
      if (inp.current) inp.current.value = "";
    }
  };
  return (
    <>
      <div className="row between">
        <h2 style={{ marginTop: 6 }}>Документы</h2>
        <button className="btn small" disabled={busy} onClick={() => inp.current?.click()}>
          {busy ? "Загружаю…" : "Добавить файл"}
        </button>
        <input ref={inp} type="file" multiple hidden onChange={(e) => upload(e.target.files)} />
      </div>
      {shelves.length > 1 && <Seg items={[["", "Все"], ...shelves.map((x) => [x, x] as [string, string])]} value={shelf} set={setShelf} />}
      <div className="panel list">
        {list.length === 0 && <div className="empty">Здесь будут договоры, спецификации, сметы, акты и фото. Новые файлы сами раскладываются по полкам.</div>}
        {list.map((d: any) => (
          <button key={d.id} className="item" onClick={() => openFile(`/api/docs/${d.id}`, d.title || d.name, d.mime)}>
            <div className="grow">
              <div className="t">{d.title || d.name}</div>
              <div className="s">
                {d.shelf} · {day(d.created_at, true)}
              </div>
            </div>
          </button>
        ))}
      </div>
    </>
  );
}

export type Tile = { label: string; value: string; sub?: string; tone?: "red" | "amber" | "go"; go?: Nav };

/** Виджеты: каждый ведёт туда, где про это подробнее. */
export function Tiles({ items, go }: { items: Tile[]; go: (n: Nav) => void }) {
  return (
    <div className="tiles">
      {items.map((t) => (
        <button key={t.label} className={"tile" + (t.tone ? " " + t.tone : "")} onClick={() => t.go && go(t.go)}>
          <span className="l">{t.label}</span>
          <b className="num">{t.value}</b>
          {t.sub && <span className="s">{t.sub}</span>}
        </button>
      ))}
    </div>
  );
}

/** Список, свёрнутый до трёх строк, — разворачивается по нажатию. */
export function Fold<T>({ items, render, empty, show = 3 }: { items: T[]; render: (x: T, i: number) => React.ReactNode; empty: React.ReactNode; show?: number }) {
  const [open, setOpen] = useState(false);
  const list = open ? items : items.slice(0, show);
  return (
    <div className="panel list">
      {items.length === 0 && <div className="empty">{empty}</div>}
      {list.map((x, i) => render(x, i))}
      {items.length > show && (
        <button className="item more" onClick={() => setOpen(!open)} aria-expanded={open}>
          {open ? "Свернуть" : `Показать все — ещё ${items.length - show}`}
        </button>
      )}
    </div>
  );
}

"use client";
import { useEffect, useState } from "react";
import { api, act, money, day, isPast, Sheet, toast, Icon } from "./kit";
import type { Nav } from "./App";

const DIRS = ["С", "СВ", "В", "ЮВ", "Ю", "ЮЗ", "З", "СЗ"];
const dir = (d: number) => DIRS[Math.round((d % 360) / 45) % 8];

export default function Today({ s, go, reload }: { s: any; go: (n: Nav) => void; reload: () => void }) {
  const now = new Date();
  const hour = now.getHours();
  const hello = hour < 5 ? "Доброй ночи" : hour < 12 ? "Доброе утро" : hour < 18 ? "Добрый день" : "Добрый вечер";
  const red = s.issues.filter((i: any) => i.level === "red");
  const amber = s.issues.filter((i: any) => i.level !== "red");
  const tasks = s.tasks.slice(0, 7);

  const done = async (id: string) => {
    await act("save_task", { id, status: "done" });
    toast("Дело закрыто");
    reload();
  };

  return (
    <>
      <p className="muted small" style={{ margin: "4px 0 0" }}>
        {now.toLocaleDateString("ru-RU", { weekday: "long", day: "numeric", month: "long" })}
      </p>
      <div className="row between" style={{ alignItems: "flex-start" }}>
        <h1>{hello}, Максим</h1>
        <button className="btn ghost small" aria-label="Настройки и подключения" onClick={() => go({ tab: "more" })} style={{ marginTop: 2 }}>
          <Icon n="gear" />
        </button>
      </div>

      {s.demo && (
        <div className="panel pad row between" style={{ marginBottom: 12, background: "var(--caution-bg)", borderColor: "transparent" }}>
          <span className="small">Это пример с выдуманными данными.</span>
          <button
            className="btn small"
            onClick={async () => {
              await api("/api/demo", { method: "POST", json: { action: "clear" } });
              toast("Пример убран");
              reload();
            }}
          >
            Убрать пример
          </button>
        </div>
      )}
      <Board s={s} reload={reload} />

      <div className="figs">
        <button className="fig" onClick={() => go({ tab: "heli", sub: "money" })}>
          <span>Должны</span>
          <b className="num">{money(s.totals.owed)}</b>
        </button>
        <button className={"fig" + (s.totals.overdue > 0 ? " alert" : "")} onClick={() => go({ tab: "heli", sub: "money" })}>
          <span>Просрочено</span>
          <b className="num">{money(s.totals.overdue)}</b>
        </button>
        <button className="fig" onClick={() => go({ tab: "heli", sub: "money" })}>
          <span>Без счёта</span>
          <b className="num">{money(s.totals.unbilled)}</b>
        </button>
      </div>

      {s.drafts.length > 0 && (
        <button className="panel pad item" style={{ marginTop: 12 }} onClick={() => go({ tab: "heli", sub: "money" })}>
          <div className="grow">
            <div className="t">
              {s.drafts.length === 1 ? "Готов черновик счёта" : `Готовы черновики счетов: ${s.drafts.length}`}
            </div>
            <div className="s">Проверь и отметь отправленными</div>
          </div>
          <span className="pill amber">Проверить</span>
        </button>
      )}

      <h2>Что не сходится</h2>
      <div className="panel list">
        {s.issues.length === 0 && <div className="empty">Всё сходится: счета, сроки, бюджеты и документы в порядке.</div>}
        {[...red, ...amber].slice(0, 8).map((i: any, k: number) => (
          <div key={k} className="issue">
            <i className={i.level === "red" ? "red" : ""} />
            <div>
              <div>{i.text}</div>
              <div className="small muted">{i.area}</div>
            </div>
          </div>
        ))}
        {s.issues.length > 8 && (
          <button className="item small muted" onClick={() => go({ tab: "chat", thread: "inbox" })}>
            Ещё {s.issues.length - 8} — спроси помощника
          </button>
        )}
      </div>

      <h2>Дела</h2>
      <div className="panel list">
        {tasks.length === 0 && (
          <div className="empty">
            Открытых дел нет. Надиктуй помощнику что угодно — <b>«в четверг созвон с Bell по 505-му»</b> — и он запишет.
          </div>
        )}
        {tasks.map((t: any) => (
          <div key={t.id} className="item" style={{ cursor: "default" }}>
            <button className="btn small" aria-label={"Готово: " + t.title} onClick={() => done(t.id)} style={{ width: 34, padding: 0 }}>
              ✓
            </button>
            <div className="grow">
              <div className="t">{t.title}</div>
              <div className="s">{t.space === "heli" ? "Heliclub" : t.space === "build" ? "Стройка" : "Личное"}</div>
            </div>
            {t.due && <span className={"pill" + (isPast(t.due) ? " red" : "")}>{day(t.due)}</span>}
          </div>
        ))}
      </div>

      {s.deals.length > 0 && (
        <>
          <h2>Сделки: следующий шаг</h2>
          <div className="panel list">
            {s.deals.slice(0, 5).map((d: any) => (
              <button key={d.id} className="item" onClick={() => go({ tab: d.space === "build" ? "build" : "heli", sub: "deals" })}>
                <div className="grow">
                  <div className="t">{d.title}</div>
                  <div className="s">{d.next_step || "Нет следующего шага"}</div>
                </div>
                {d.next_date && <span className={"pill" + (isPast(d.next_date) ? " red" : "")}>{day(d.next_date)}</span>}
              </button>
            ))}
          </div>
        </>
      )}
    </>
  );
}

/* Борт: можно ли сегодня лететь — погода и собственное восстановление. */
function Board({ s, reload }: { s: any; reload: () => void }) {
  const [w, setW] = useState<any>(null);
  const [err, setErr] = useState("");
  const [pick, setPick] = useState(false);
  const [geo, setGeo] = useState<"wait" | "ok" | "no">("wait");
  useEffect(() => {
    // погода там, где он сейчас: координаты телефона; не разрешил — его база
    const fallback = () => {
      setGeo("no");
      if (s.base) api("/api/weather").then(setW).catch((e) => setErr(e.message));
    };
    if (!navigator.geolocation) return fallback();
    navigator.geolocation.getCurrentPosition(
      (p) => {
        setGeo("ok");
        api("/api/weather", { method: "POST", json: { here: true, lat: +p.coords.latitude.toFixed(3), lon: +p.coords.longitude.toFixed(3) } })
          .then(setW)
          .catch((e) => setErr(e.message));
      },
      fallback,
      { timeout: 8000, maximumAge: 30 * 60e3 },
    );
  }, [s.base]);
  const wd = s.whoop?.days?.[0];

  if (geo === "no" && !s.base)
    return (
      <div className="board">
        <div className="place">Погода для полёта</div>
        <p style={{ fontSize: 18, margin: "14px 0" }}>Разреши доступ к геопозиции — и здесь будет ветер, облачность и подсказка, можно ли лететь там, где ты сейчас. Или выбери базу вручную.</p>
        <button className="btn" onClick={() => setPick(true)}>
          Выбрать базу
        </button>
        {pick && <BasePicker onClose={() => setPick(false)} done={(f) => (setW(f), reload())} />}
      </div>
    );

  const n = w?.now;
  const why = n ? `Ветер ${dir(n.dir)} ${n.wind} уз, порывы ${n.gust}. Низкая облачность ${n.lowCloud}%${n.vis != null ? `, видимость ${n.vis >= 10000 ? "10+" : Math.round(n.vis / 1000)} км` : ""}.` : err || "Загружаю погоду…";
  const max = Math.max(30, ...(w?.hours || []).map((h: any) => h.gust));
  return (
    <div className="board">
      <div className="place">
        <span>{w?.base?.name || (geo === "wait" ? "Определяю, где ты…" : s.base?.name)}</span>
        {!w?.base?.here && <button onClick={() => setPick(true)}>сменить</button>}
      </div>
      <div className={"verdict v-" + (n?.verdict || "GO")} aria-live="polite">
        {n ? n.verdict : "…"}
      </div>
      <div className="why">{why}</div>
      {w?.hours && (
        <div className="strip" aria-label="Прогноз по часам">
          {w.hours.map((h: any) => (
            <div key={h.t} className={"hr v-" + h.verdict} title={`${h.local}: ${h.wind} уз, порывы ${h.gust}`}>
              <span className="k">{h.wind}</span>
              <div className="bar" style={{ height: Math.max(4, (h.wind / max) * 64) }}>
                <span className="gust" style={{ bottom: (h.gust / max) * 64 + "px" }} />
              </div>
              <span className="k">{dir(h.dir)}</span>
              <span className="h">{h.local}</span>
            </div>
          ))}
        </div>
      )}
      {s.whoop?.connected && wd && (
        <div className="ready">
          <div>
            <b>{wd.recovery != null ? Math.round(wd.recovery) + "%" : "—"}</b>восстановление
          </div>
          <div>
            <b>{wd.sleep_hours ?? "—"} ч</b>сон
          </div>
          <div>
            <b>{s.whoop.days[1]?.strain ?? "—"}</b>нагрузка вчера
          </div>
        </div>
      )}
      <div className="note">Подсказка по {w?.source || "прогнозу"}, не разрешение на вылет. Решение — за пилотом.</div>
      {pick && <BasePicker onClose={() => setPick(false)} done={(f) => (setW(f), reload())} />}
    </div>
  );
}

export function BasePicker({ onClose, done }: { onClose: () => void; done: (f: any) => void }) {
  const [qv, setQ] = useState("");
  const [res, setRes] = useState<any[]>([]);
  const [busy, setBusy] = useState(false);
  const find = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    try {
      setRes((await api(`/api/weather?find=${encodeURIComponent(qv)}`)).places);
    } finally {
      setBusy(false);
    }
  };
  const choose = async (p: any) => {
    const f = await api("/api/weather", { method: "POST", json: p });
    done(f);
    onClose();
  };
  return (
    <Sheet title="Где база" onClose={onClose}>
      <form onSubmit={find} className="row">
        <input className="input grow" placeholder="Город или аэродром" value={qv} onChange={(e) => setQ(e.target.value)} autoFocus />
        <button className="btn primary" disabled={!qv.trim() || busy}>
          Найти
        </button>
      </form>
      <div className="panel list" style={{ marginTop: 12 }}>
        {res.length === 0 && <div className="empty">Например: Рига, Киев, Вена.</div>}
        {res.map((p) => (
          <button key={p.lat + "," + p.lon} className="item" onClick={() => choose(p)}>
            {p.name}
          </button>
        ))}
      </div>
    </Sheet>
  );
}

"use client";
import { useEffect, useState } from "react";
import { api, act, money, short, day, isPast, Sheet, toast, Icon, DoneCheck } from "./kit";
import type { Nav } from "./App";
import { Tiles, Fold } from "./Shared";

const AREA_GO: Record<string, Nav> = {
  Счета: { tab: "heli", sub: "money" },
  Оплаты: { tab: "heli", sub: "money" },
  Клиенты: { tab: "heli", sub: "clients" },
  Полёты: { tab: "heli", sub: "flights" },
  Вертолёты: { tab: "heli", sub: "aircraft" },
  Пилот: { tab: "heli", sub: "aircraft" },
  Стройка: { tab: "build" },
  Платежи: { tab: "personal", sub: "pay" },
};

const DIRS = ["С", "СВ", "В", "ЮВ", "Ю", "ЮЗ", "З", "СЗ"];
const dir = (d: number) => DIRS[Math.round((d % 360) / 45) % 8];

export default function Today({ s, go, reload }: { s: any; go: (n: Nav) => void; reload: () => void }) {
  const now = new Date();
  const hour = now.getHours();
  const hello = hour < 5 ? "Доброй ночи" : hour < 12 ? "Доброе утро" : hour < 18 ? "Добрый день" : "Добрый вечер";
  const wd = s.whoop?.connected ? s.whoop.days?.[0] : null;
  const weekAhead = new Date(Date.now() + 7 * 864e5).toISOString().slice(0, 10);
  const payWeek = s.payments.filter((p: any) => p.next_due && p.next_due <= weekAhead);
  // что требует участия: черновики счетов + всё, что нашла команда; каждая строка ведёт туда, где это поправить
  const attention = [
    ...s.drafts.map((d: any) => ({ level: "amber", area: "Счета", text: `Черновик счёта ${d.number} (${d.client}) на ${money(d.total, d.currency)} — проверить и отправить`, go: { tab: "heli", sub: "money" } })),
    ...s.issues
      .filter((i: any) => i.area !== "Дела")
      .sort((a: any, b: any) => (a.level === "red" ? 0 : 1) - (b.level === "red" ? 0 : 1))
      .map((i: any) => ({ ...i, go: AREA_GO[i.area] })),
  ];

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

      <Tiles
        items={[
          wd
            ? { label: "Готовность", value: wd.recovery != null ? Math.round(wd.recovery) + "%" : "—", sub: "WHOOP", tone: wd.recovery != null && wd.recovery < 34 ? "red" : wd.recovery != null && wd.recovery < 67 ? "amber" : "go", go: { tab: "personal", sub: "health" } }
            : { label: "WHOOP", value: "Подключить", sub: "сон и восстановление", go: { tab: "more" } },
          wd ? { label: "Сон", value: wd.sleep_hours != null ? wd.sleep_hours + " ч" : "—", sub: wd.sleep_perf != null ? `качество ${Math.round(wd.sleep_perf)}%` : "этой ночью", go: { tab: "personal", sub: "health" } } : { label: "Анализы", value: String(s.labs.length), sub: "показателей", go: { tab: "personal", sub: "health" } },
          { label: "Платежи", value: short(payWeek.reduce((a: number, p: any) => a + Number(p.amount), 0)), sub: payWeek.length ? `${payWeek.length} на неделе` : "на неделе нет", tone: payWeek.some((p: any) => isPast(p.next_due)) ? "red" : undefined, go: { tab: "personal", sub: "pay" } },
        ]}
        go={go}
      />

      <h2>Требует внимания</h2>
      <Fold
        items={attention}
        empty="Всё в порядке: счета, сроки, бюджеты и документы."
        render={(i: any, k: number) => (
          <button key={k} className="item issue" style={{ display: "grid" }} onClick={() => i.go && go(i.go)}>
            <i className={i.level === "red" ? "red" : ""} />
            <div>
              <div>{i.text}</div>
              <div className="small muted">{i.area}</div>
            </div>
          </button>
        )}
      />

      <h2>Дела</h2>
      <Fold
        items={s.tasks}
        empty={
          <>
            Открытых дел нет. Надиктуй помощнику что угодно — <b>«в четверг созвон с Bell по 505-му»</b> — и он запишет.
          </>
        }
        render={(t: any) => (
          <div key={t.id} className="item" style={{ cursor: "default" }}>
            <DoneCheck label={"Готово: " + t.title} run={() => act("save_task", { id: t.id, status: "done" })} after={reload} />
            <div className="grow">
              <div className="t">{t.title}</div>
              <div className="s">{t.space === "heli" ? "Heliclub" : t.space === "build" ? "Стройка" : "Личное"}</div>
            </div>
            {t.due && <span className={"pill" + (isPast(t.due) ? " red" : "")}>{day(t.due)}</span>}
          </div>
        )}
      />
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

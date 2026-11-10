"use client";
import { useState } from "react";
import { api, toast, Sheet } from "./kit";
import { ClaudeConnect, ConnList } from "./Connections";
import { FormSheet, FORMS } from "./Forms";
import { Reel } from "./Onboarding";
import type { Nav } from "./App";

export default function More({ s, reload, go }: { s: any; reload: () => void; go: (n: Nav) => void }) {
  const [co, setCo] = useState(false);
  const [reel, setReel] = useState(false);
  const [key, setKey] = useState(false);
  const month = new Date().toLocaleDateString("sv-SE").slice(0, 7);
  let calls = 0;
  let cached = 0;
  let input = 0;
  for (const [d, models] of Object.entries<any>(s.usage || {})) {
    if (!d.startsWith(month)) continue;
    for (const u of Object.values<any>(models)) {
      calls += u.n;
      cached += u.cr;
      input += u.in + u.cr + u.cw;
    }
  }
  const h = s.claude?.health;
  return (
    <>
      <h1>Ещё</h1>

      <h2>Подключения</h2>
      <ConnList s={s} reload={reload} />

      <h2>Claude на телефоне и компьютере</h2>
      <div className="panel pad">
        <ClaudeConnect />
      </div>

      <h2>Счета</h2>
      <button className="panel pad item" onClick={() => setCo(true)}>
        <div className="grow">
          <div className="t">{s.company?.name || "Реквизиты для счетов"}</div>
          <div className="s">{s.company?.iban ? "IBAN " + s.company.iban : "Название, адрес, банк — они печатаются в PDF"}</div>
        </div>
      </button>

      <h2>Помощник</h2>
      <div className="panel list">
        <div className="item" style={{ cursor: "default" }}>
          <div className="grow">
            <div className="t">Claude</div>
            <div className="s">
              {!s.claude.hasKey ? "Ключ не вставлен — помощник не отвечает" : h?.ok === false ? (h.reason === "credits" ? "Закончились деньги на счёте Claude API" : "Ключ не подходит") : "Работает"}
              {calls > 0 && ` · в этом месяце ${calls} обращений, из кэша ${Math.round((cached / Math.max(1, input)) * 100)}% текста`}
            </div>
          </div>
          {h?.ok === false && h.reason === "credits" ? (
            <a className="btn small primary" href="https://console.anthropic.com/settings/billing" target="_blank" rel="noreferrer">
              Пополнить
            </a>
          ) : (
            <button className="btn small" onClick={() => setKey(true)}>
              Ключ
            </button>
          )}
        </div>
        <button className="item" onClick={() => setReel(true)}>
          <div className="grow">
            <div className="t">Что умеет приложение</div>
            <div className="s">Короткий рассказ с первого запуска</div>
          </div>
        </button>
        <button className="item" onClick={() => go({ tab: "chat", thread: "inbox" })}>
          <div className="grow">
            <div className="t">Улучшить приложение</div>
            <div className="s">Напиши секретарю, что поменять или добавить — пожелание сохранится</div>
          </div>
        </button>
      </div>

      <button
        className="btn ghost"
        style={{ marginTop: 24, color: "var(--steel)" }}
        onClick={async () => {
          await api("/api/auth", { method: "POST", json: { action: "logout" } });
          location.reload();
        }}
      >
        Выйти
      </button>

      {co && <FormSheet title="Реквизиты" tool="set_company" fields={FORMS.company()} initial={s.company} onClose={() => setCo(false)} done={reload} />}
      {reel && (
        <Sheet title="Что умеет приложение" onClose={() => setReel(false)}>
          <Reel onEnd={() => setReel(false)} />
        </Sheet>
      )}
      {key && <KeySheet onClose={() => setKey(false)} done={reload} />}
    </>
  );
}

function KeySheet({ onClose, done }: { onClose: () => void; done: () => void }) {
  const [v, setV] = useState("");
  return (
    <Sheet title="Ключ Claude API" onClose={onClose}>
      <p className="muted" style={{ marginTop: 0 }}>
        Ключ нужен, чтобы помощник отвечал прямо в приложении. Его берут в <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">консоли Anthropic</a>. Обычно его вставляют один раз при установке.
      </p>
      <input className="input" placeholder="sk-ant-…" value={v} onChange={(e) => setV(e.target.value)} />
      <button
        className="btn primary"
        style={{ width: "100%", marginTop: 12 }}
        disabled={!v.trim().startsWith("sk-")}
        onClick={async () => {
          await api("/api/settings", { method: "POST", json: { keys: { anthropic: v.trim() } } });
          toast("Ключ сохранён");
          done();
          onClose();
        }}
      >
        Сохранить
      </button>
    </Sheet>
  );
}

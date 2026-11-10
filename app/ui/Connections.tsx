"use client";
import { useEffect, useState } from "react";
import { api, toast, Sheet } from "./kit";
import { BasePicker } from "./Today";

/** Адрес коннектора и как добавить его в Claude. */
export function ClaudeConnect() {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    api("/api/settings").then((r) => setUrl(r.connector));
  }, []);
  const copy = async () => {
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      toast("Адрес скопирован");
    } catch {
      toast("Не получилось скопировать — выдели адрес и скопируй вручную");
    }
  };
  return (
    <>
      <div className="copy">
        <code>{url || "…"}</code>
        <button className="btn small primary" onClick={copy}>
          Скопировать
        </button>
      </div>
      <ol className="how small">
        <li>
          Открой <a href="https://claude.ai/settings/connectors" target="_blank" rel="noreferrer">claude.ai → Настройки → Коннекторы</a>.
        </li>
        <li>Нажми «Добавить свой коннектор», назови его «Офис» и вставь адрес.</li>
        <li>Готово: в любом чате Claude можно сказать «запиши полёт» или «кто мне должен» — всё попадёт сюда.</li>
      </ol>
      <p className="small muted" style={{ margin: 0 }}>
        Адрес секретный, как пароль: не пересылай его никому.{" "}
        <button
          className="btn ghost small"
          style={{ padding: 0, minHeight: 0, textDecoration: "underline", color: "inherit" }}
          onClick={async () => {
            if (!confirm("Сменить адрес? Старый перестанет работать везде, где он подключён.")) return;
            await api("/api/settings", { method: "POST", json: { rotateConnector: true } });
            setUrl((await api("/api/settings")).connector);
            toast("Адрес сменён — подключи новый в своём Claude");
          }}
        >
          Сменить адрес
        </button>
      </p>
    </>
  );
}

export function ConnList({ s, reload }: { s: any; reload: () => void }) {
  const [base, setBase] = useState(false);
  const [ig, setIg] = useState(false);
  const rows = [
    {
      logo: "G",
      name: "Почта и Google Drive",
      what: "Помощник находит в письмах и на диске договоры, счета, сметы и раскладывает их сюда.",
      state: s.google.connected ? "Подключено" : null,
      action: s.google.available ? (
        <a className="btn small" href="/api/google/connect">
          Подключить
        </a>
      ) : (
        <span className="pill">Скоро</span>
      ),
    },
    {
      logo: "W",
      name: "WHOOP",
      what: "Сон и восстановление — в утренней сводке и в подсказке, лететь ли сегодня самому.",
      state: s.whoop.connected ? "Подключено" : null,
      action: s.whoop.connected ? null : s.whoop.available ? (
        <a className="btn small" href="/api/whoop/connect">
          Подключить
        </a>
      ) : (
        <span className="pill">Скоро</span>
      ),
    },
    {
      logo: "IG",
      name: "Instagram",
      what: "Помощник смотрит твои публичные посты, чтобы понимать, где ты и чем занят. Только для ответов, больше никому.",
      state: s.instagram.connected ? "@" + s.instagram.handle : null,
      action: (
        <button className="btn small" onClick={() => setIg(true)}>
          {s.instagram.connected ? "Изменить" : "Подключить"}
        </button>
      ),
    },
    {
      logo: "≈",
      name: "Погода Windy",
      what: "Уже работает. Нужно только выбрать базу, где ты летаешь.",
      state: s.base ? s.base.name : null,
      action: (
        <button className="btn small" onClick={() => setBase(true)}>
          {s.base ? "Сменить" : "Выбрать базу"}
        </button>
      ),
    },
  ];
  return (
    <>
      <div className="panel list">
        {rows.map((r) => (
          <div key={r.name} className="conn">
            <div className="logo">{r.logo}</div>
            <div>
              <div style={{ fontWeight: 600 }}>{r.name}</div>
              <div className="small muted">{r.state ? <span style={{ color: "var(--go)" }}>{r.state}</span> : r.what}</div>
            </div>
            <div>{r.action}</div>
          </div>
        ))}
      </div>
      {base && <BasePicker onClose={() => setBase(false)} done={() => reload()} />}
      {ig && <IgSheet cur={s.instagram.handle} onClose={() => setIg(false)} done={reload} />}
    </>
  );
}

function IgSheet({ cur, onClose, done }: { cur: string; onClose: () => void; done: () => void }) {
  const [v, setV] = useState(cur || "");
  const save = async (val: string) => {
    await api("/api/settings", { method: "POST", json: { instagram: val } });
    toast(val ? "Instagram подключён" : "Instagram отключён");
    done();
    onClose();
  };
  return (
    <Sheet title="Instagram" onClose={onClose}>
      <p className="muted" style={{ marginTop: 0 }}>
        Напиши свой ник. Пароль не нужен: помощник видит только то, что видно всем.
      </p>
      <input className="input" placeholder="@maxim" value={v} onChange={(e) => setV(e.target.value)} autoFocus />
      <div className="btns" style={{ marginTop: 12 }}>
        <button className="btn primary" style={{ flex: 1 }} disabled={!v.trim()} onClick={() => save(v)}>
          Сохранить
        </button>
        {cur && (
          <button className="btn" onClick={() => save("")}>
            Отключить
          </button>
        )}
      </div>
    </Sheet>
  );
}

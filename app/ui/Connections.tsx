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

/** Подписка на календарь: всё со сроками — в календаре телефона, обновляется само. */
export function CalendarConnect() {
  const [c, setC] = useState<any>(null);
  useEffect(() => {
    api("/api/settings").then(setC);
  }, []);
  return (
    <>
      <p className="small muted" style={{ marginTop: 0 }}>
        Дела, платежи, сроки этапов и счетов, ТО и страховки появятся в календаре телефона и будут обновляться сами. Напоминание — накануне.
      </p>
      <div className="btns">
        <a className="btn primary" href={c?.calendar || "#"}>
          Добавить в календарь iPhone
        </a>
        <a className="btn" href={c ? `https://calendar.google.com/calendar/r?cid=${encodeURIComponent(c.calendar)}` : "#"} target="_blank" rel="noreferrer">
          Google Календарь
        </a>
      </div>
    </>
  );
}

type Row = { logo: string; name: string; what: string; state: string | null; action: React.ReactNode };

export function ConnList({ s, reload }: { s: any; reload: () => void }) {
  const [base, setBase] = useState(false);
  const [ig, setIg] = useState(false);
  const [sheet, setSheet] = useState<null | "anthropic" | "gemini" | "openai" | "windy" | "make" | "whoop">(null);
  const [c, setC] = useState<any>(null);
  const load = () => api("/api/settings").then(setC).catch(() => {});
  useEffect(() => {
    load();
  }, []);
  const k = c?.keys || {};
  const btn = (label: string, on: () => void) => (
    <button className="btn small" onClick={on}>
      {label}
    </button>
  );
  const groups: [string, Row[]][] = [
    [
      "Мозги помощника",
      [
        {
          logo: "C",
          name: "Claude",
          what: "Главный помощник: отвечает в чате, читает договоры и счета, ведёт дела. Без него чат в приложении молчит.",
          state: k.anthropic ? "Подключён " + k.anthropic : null,
          action: btn(k.anthropic ? "Сменить" : "Подключить", () => setSheet("anthropic")),
        },
        {
          logo: "G",
          name: "Gemini",
          what: "Второе мнение от Google перед крупным решением: покупка борта, дом, большая сделка. Бесплатный ключ тоже подойдёт.",
          state: k.gemini ? "Подключён " + k.gemini : null,
          action: btn(k.gemini ? "Сменить" : "Подключить", () => setSheet("gemini")),
        },
        {
          logo: "AI",
          name: "ChatGPT",
          what: "Третье мнение. Помощник спросит Gemini и ChatGPT и сведёт, где они согласны, а где спорят.",
          state: k.openai ? "Подключён " + k.openai : null,
          action: btn(k.openai ? "Сменить" : "Подключить", () => setSheet("openai")),
        },
      ],
    ],
    [
      "Данные",
      [
        {
          logo: "@",
          name: "Почта и Google Drive",
          what: "Напоминаю о важном, пересказываю длинные письма, сам записываю дела и готовлю ответы — экономит ≈ 6 ч в месяц. Пока можно через Make: письма со счетами пересылаются сюда сами.",
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
          what: "Сон и восстановление — в утренней сводке, разборе здоровья и в подсказке, лететь ли сегодня самому.",
          state: s.whoop.connected && !s.whoop.demo ? "Подключено" : null,
          action:
            s.whoop.connected && !s.whoop.demo ? null : s.whoop.available ? (
              <a className="btn small" href="/api/whoop/connect">
                Подключить
              </a>
            ) : (
              btn("Настроить", () => setSheet("whoop"))
            ),
        },
        {
          logo: "IG",
          name: "Instagram",
          what: "Помощник смотрит твои публичные посты, чтобы понимать, где ты и чем занят. Только для ответов, больше никому.",
          state: s.instagram.connected ? "@" + s.instagram.handle : null,
          action: btn(s.instagram.connected ? "Изменить" : "Подключить", () => setIg(true)),
        },
        {
          logo: "≈",
          name: "Погода",
          what: "Уже работает. Выбери базу, где летаешь; а с ключом Windy прогноз станет точнее.",
          state: s.base ? s.base.name + (k.windy ? " · Windy" : "") : null,
          action: (
            <span className="btns" style={{ flexWrap: "nowrap" }}>
              {btn(s.base ? "База" : "Выбрать базу", () => setBase(true))}
              {btn("Windy", () => setSheet("windy"))}
            </span>
          ),
        },
      ],
    ],
    [
      "Автоматизация",
      [
        {
          logo: "M",
          name: "Make",
          what: "Связывает приложение с чем угодно: письма со счетами из Gmail — сюда, оплаченные счета — бухгалтеру, утренняя сводка — в Telegram.",
          state: c?.make?.out ? "Подключён" : null,
          action: btn(c?.make?.out ? "Настроить" : "Подключить", () => setSheet("make")),
        },
      ],
    ],
  ];
  const done = () => {
    load();
    reload();
  };
  return (
    <>
      {groups.map(([title, rows]) => (
        <div key={title}>
          <div className="small muted" style={{ margin: "14px 4px 6px", textTransform: "uppercase", letterSpacing: ".06em" }}>
            {title}
          </div>
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
        </div>
      ))}
      {base && <BasePicker onClose={() => setBase(false)} done={() => reload()} />}
      {ig && <IgSheet cur={s.instagram.handle} onClose={() => setIg(false)} done={reload} />}
      {sheet && sheet in KEY_INFO && <KeySheet id={sheet as keyof typeof KEY_INFO} has={!!k[sheet]} onClose={() => setSheet(null)} done={done} />}
      {sheet === "make" && c && <MakeSheet c={c} onClose={() => setSheet(null)} done={done} />}
      {sheet === "whoop" && c && <WhoopSheet redirect={c.whoopRedirect} onClose={() => setSheet(null)} done={done} />}
    </>
  );
}

const KEY_INFO = {
  anthropic: {
    title: "Claude",
    ph: "sk-ant-…",
    ok: (v: string) => v.startsWith("sk-"),
    how: (
      <>
        <li>
          Открой <a href="https://console.anthropic.com/settings/keys" target="_blank" rel="noreferrer">консоль Anthropic → API Keys</a> и войди (можно тем же аккаунтом, что и Claude).
        </li>
        <li>«Create Key», назови «Офис», скопируй ключ и вставь сюда.</li>
        <li>
          В <a href="https://console.anthropic.com/settings/billing" target="_blank" rel="noreferrer">Billing</a> пополни баланс — это отдельно от подписки Claude. Расход виден здесь же, в «Ещё».
        </li>
      </>
    ),
  },
  gemini: {
    title: "Gemini",
    ph: "AIza…",
    ok: (v: string) => v.length > 20,
    how: (
      <>
        <li>
          Открой <a href="https://aistudio.google.com/apikey" target="_blank" rel="noreferrer">Google AI Studio → API keys</a> и войди своим Google.
        </li>
        <li>«Create API key», скопируй и вставь сюда. Бесплатный ключ подойдёт.</li>
      </>
    ),
  },
  openai: {
    title: "ChatGPT",
    ph: "sk-…",
    ok: (v: string) => v.startsWith("sk-"),
    how: (
      <>
        <li>
          Открой <a href="https://platform.openai.com/api-keys" target="_blank" rel="noreferrer">OpenAI → API keys</a> и войди.
        </li>
        <li>«Create new secret key», скопируй и вставь сюда.</li>
        <li>Баланс пополняется там же, в Billing — это отдельно от подписки ChatGPT.</li>
      </>
    ),
  },
  windy: {
    title: "Windy",
    ph: "ключ Point Forecast API",
    ok: (v: string) => v.length > 10,
    how: (
      <>
        <li>
          Открой <a href="https://api.windy.com/keys" target="_blank" rel="noreferrer">api.windy.com → Keys</a> и войди.
        </li>
        <li>Создай ключ для «Point Forecast API», скопируй и вставь сюда.</li>
        <li>Без ключа погода тоже работает — по открытым данным Open-Meteo.</li>
      </>
    ),
  },
};

function KeySheet({ id, has, onClose, done }: { id: keyof typeof KEY_INFO; has: boolean; onClose: () => void; done: () => void }) {
  const info = KEY_INFO[id];
  const [v, setV] = useState("");
  const save = async (val: string) => {
    await api("/api/settings", { method: "POST", json: { keys: { [id]: val } } });
    toast(val ? `${info.title} подключён` : `${info.title} отключён`);
    done();
    onClose();
  };
  return (
    <Sheet title={info.title} onClose={onClose}>
      <ol className="how small" style={{ marginTop: 0 }}>
        {info.how}
      </ol>
      <input className="input" placeholder={info.ph} value={v} onChange={(e) => setV(e.target.value)} autoFocus />
      <div className="btns" style={{ marginTop: 12 }}>
        <button className="btn primary" style={{ flex: 1 }} disabled={!info.ok(v.trim())} onClick={() => save(v.trim())}>
          Сохранить
        </button>
        {has && (
          <button className="btn" onClick={() => save("")}>
            Отключить
          </button>
        )}
      </div>
      <p className="small muted">Ключ хранится только в твоём приложении и никому не показывается.</p>
    </Sheet>
  );
}

function Copy({ text }: { text: string }) {
  return (
    <div className="copy">
      <code>{text}</code>
      <button
        className="btn small primary"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(text);
            toast("Скопировано");
          } catch {
            toast("Выдели и скопируй вручную");
          }
        }}
      >
        Скопировать
      </button>
    </div>
  );
}

function MakeSheet({ c, onClose, done }: { c: any; onClose: () => void; done: () => void }) {
  const [v, setV] = useState("");
  const save = async (val: string) => {
    try {
      await api("/api/settings", { method: "POST", json: { make: val } });
      toast(val ? "Make подключён — туда ушло пробное событие" : "Make отключён");
      done();
      onClose();
    } catch (e: any) {
      toast(e.message);
    }
  };
  return (
    <Sheet title="Make" onClose={onClose}>
      <p className="muted" style={{ marginTop: 0 }}>
        <a href="https://www.make.com" target="_blank" rel="noreferrer">Make</a> — конструктор связок между сервисами. Бесплатного тарифа хватит. Связь работает в обе стороны.
      </p>
      <h3 style={{ margin: "14px 0 6px" }}>Из приложения → в Make</h3>
      <ol className="how small" style={{ marginTop: 0 }}>
        <li>В Make создай сценарий, первым модулем — «Webhooks → Custom webhook», скопируй его адрес.</li>
        <li>Вставь адрес сюда. Туда будут приходить события: полёт записан, черновики счетов готовы, счёт отправлен или оплачен, расход по стройке, новое дело, утренняя сводка.</li>
        <li>Дальше в Make добавь, куда их нести: Telegram, Google Таблица, письмо бухгалтеру.</li>
      </ol>
      <input className="input" placeholder={c.make?.out ? "Подключено — вставь новый адрес, чтобы сменить" : "https://hook.eu1.make.com/…"} value={v} onChange={(e) => setV(e.target.value)} />
      <div className="btns" style={{ marginTop: 10 }}>
        <button className="btn primary" style={{ flex: 1 }} disabled={!v.trim().startsWith("https://")} onClick={() => save(v.trim())}>
          Сохранить
        </button>
        {c.make?.out && (
          <button className="btn" onClick={() => save("")}>
            Отключить
          </button>
        )}
      </div>
      <h3 style={{ margin: "20px 0 6px" }}>Из Make → в приложение</h3>
      <p className="small muted" style={{ marginTop: 0 }}>
        В сценарии добавь модуль «HTTP → Make a request»: метод POST, тип JSON, адрес ниже. Тело <code>{'{"text": "…"}'}</code> — помощник прочитает как сообщение и сам разложит: например, письмо со счётом из Gmail или сообщение из Telegram.
      </p>
      <Copy text={c.make?.in || "…"} />
      <p className="small muted">Адрес секретный, как пароль.</p>
    </Sheet>
  );
}

function WhoopSheet({ redirect, onClose, done }: { redirect: string; onClose: () => void; done: () => void }) {
  const [id, setId] = useState("");
  const [sec, setSec] = useState("");
  return (
    <Sheet title="WHOOP" onClose={onClose}>
      <p className="muted" style={{ marginTop: 0 }}>
        Один раз нужно создать своё маленькое «приложение» в кабинете разработчика WHOOP — это бесплатно и занимает пару минут.
      </p>
      <ol className="how small">
        <li>
          Открой <a href="https://developer-dashboard.whoop.com" target="_blank" rel="noreferrer">developer-dashboard.whoop.com</a> и войди аккаунтом WHOOP.
        </li>
        <li>Создай приложение «Офис», отметь все разрешения read (recovery, sleep, cycles, profile).</li>
        <li>В Redirect URL вставь адрес ниже.</li>
        <li>Скопируй сюда Client ID и Client Secret, сохрани — и нажми «Подключить».</li>
      </ol>
      <Copy text={redirect} />
      <input className="input" style={{ marginTop: 12 }} placeholder="Client ID" value={id} onChange={(e) => setId(e.target.value)} />
      <input className="input" style={{ marginTop: 8 }} placeholder="Client Secret" value={sec} onChange={(e) => setSec(e.target.value)} />
      <button
        className="btn primary"
        style={{ width: "100%", marginTop: 12 }}
        disabled={!id.trim() || !sec.trim()}
        onClick={async () => {
          await api("/api/settings", { method: "POST", json: { whoopClient: { clientId: id, clientSecret: sec } } });
          location.href = "/api/whoop/connect";
        }}
      >
        Сохранить и подключить
      </button>
    </Sheet>
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

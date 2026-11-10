"use client";
import { useEffect, useState } from "react";
import { api, toast } from "./kit";
import { ClaudeConnect, ConnList, CalendarConnect } from "./Connections";

/* Первый запуск: привет и короткий рассказ, подключение к Claude, подключения, первые данные. */

export const SLIDES: { big: string; p: string; art: React.ReactNode }[] = [
  {
    big: "Три пространства",
    p: "Heliclub, Стройка и Личное. В каждом — свои счета, договоры, дела и документы, в личном — платежи, здоровье и анализы. Утром всё важное — на одном экране.",
    art: (
      <svg viewBox="0 0 300 160" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" opacity=".9">
        <rect x="6" y="30" width="88" height="100" rx="12" />
        <rect x="106" y="30" width="88" height="100" rx="12" />
        <rect x="206" y="30" width="88" height="100" rx="12" />
        <path d="M24 66h52M50 66v9M32 84h34a7 7 0 0 0 7-7H40a8 8 0 0 0-8 8zM38 84v8m24-8v8M30 92h40" />
        <path d="M126 106V84l24-16 24 16v22M142 106V92h16v14M120 106h60" />
        <circle cx="250" cy="66" r="10" />
        <path d="M230 106c0-12 9-20 20-20s20 8 20 20" />
      </svg>
    ),
  },
  {
    big: "Счета собираются сами",
    p: "Хранение начисляется 1-го числа. Полёт и работы — одной фразой после события. В конце месяца ты только проверяешь черновики и отправляешь.",
    art: (
      <svg viewBox="0 0 300 160" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity=".9">
        <rect x="90" y="10" width="120" height="146" rx="8" />
        <path d="M108 38h60M108 60h84M108 78h84M108 96h84M108 114h50" />
        <path d="M150 134h42" strokeWidth="4" />
        <circle cx="60" cy="60" r="20" />
        <path d="M60 48v12l8 6" />
        <path d="M240 80l12 12 24-26" strokeWidth="3" />
      </svg>
    ),
  },
  {
    big: "Скажи — и записано",
    p: "Пиши или диктуй в чате: «полетели с Ивановым, полтора часа». Помощник сам разложит по клиентам, счетам, делам и объектам.",
    art: (
      <svg viewBox="0 0 300 160" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity=".9">
        <rect x="128" y="16" width="44" height="78" rx="22" />
        <path d="M108 74a42 42 0 0 0 84 0M150 116v26M126 142h48" />
        <path d="M40 60c8-10 8-26 0-36M60 70c16-18 16-46 0-64M260 60c-8-10-8-26 0-36M240 70c-16-18-16-46 0-64" />
      </svg>
    ),
  },
  {
    big: "Команда помощников",
    p: "Счета, договоры, стройка, техконтроль, финансы, сделки, оценщик домов и адвокат дьявола. А контролёр каждый день ищет, что не сходится.",
    art: (
      <svg viewBox="0 0 300 160" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="2" opacity=".9">
        {[0, 1, 2, 3].map((i) => (
          <g key={i} transform={`translate(${30 + i * 66} 30)`}>
            <circle cx="20" cy="20" r="16" />
            <path d="M-4 86c0-24 12-38 24-38s24 14 24 38" />
          </g>
        ))}
      </svg>
    ),
  },
  {
    big: "Цифры, которые видно",
    p: "Сколько приносит каждый клиент и каждый вертолёт, сколько на него уходит и когда он окупится. А по стройке — где твоя цена продажи относительно рынка вокруг дома.",
    art: (
      <svg viewBox="0 0 300 160" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity=".9">
        <path d="M30 130h240" />
        <path d="M40 120l50-30 40 18 50-50 40 14 40-40" strokeWidth="3" />
        <circle cx="260" cy="32" r="6" fill="currentColor" />
        <path d="M40 40h80M40 58h50" opacity=".6" />
      </svg>
    ),
  },
  {
    big: "Утро пилота",
    p: "Ветер, порывы и облачность по Windy, твой сон и восстановление по WHOOP — и подсказка, стоит ли сегодня лететь самому.",
    art: (
      <svg viewBox="0 0 300 160" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity=".9">
        {[24, 40, 30, 52, 70, 46, 34, 26].map((h, i) => (
          <rect key={i} x={30 + i * 32} y={130 - h} width="14" height={h} rx="3" />
        ))}
        <path d="M20 140h260" />
        <circle cx="236" cy="34" r="18" />
      </svg>
    ),
  },
  {
    big: "Почта — по желанию",
    p: "Можно подключить почту и Google Drive, тогда помощник сам найдёт договоры и счета в письмах. Можно не подключать — всё работает и без неё: ты просто прикладываешь нужный файл.",
    art: (
      <svg viewBox="0 0 300 160" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" opacity=".9">
        <rect x="40" y="36" width="120" height="88" rx="8" />
        <path d="M40 44l60 44 60-44" />
        <rect x="190" y="56" width="70" height="48" rx="24" />
        <circle cx="236" cy="80" r="16" fill="currentColor" />
      </svg>
    ),
  },
  {
    big: "Приложение растёт вместе с тобой",
    p: "Чего-то не хватает или что-то неудобно — просто скажи в чате, что поменять. Приложение доделают под тебя.",
    art: (
      <svg viewBox="0 0 300 160" width="100%" height="100%" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity=".9">
        <path d="M40 130h220M70 130V96M110 130V76M150 130V58M190 130V40M230 130V22" strokeWidth="8" />
      </svg>
    ),
  },
];

export function Reel({ onEnd }: { onEnd?: () => void }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    const t = setTimeout(() => (i < SLIDES.length - 1 ? setI(i + 1) : onEnd?.()), 5000);
    return () => clearTimeout(t);
  }, [i, onEnd]);
  return (
    <div className="reel" onClick={() => setI((x) => Math.min(SLIDES.length - 1, x + 1))} role="group" aria-label="Что умеет приложение">
      <div className="dots">
        {SLIDES.map((_, k) => (
          <i key={k + "-" + (k === i ? i : "")} className={k < i ? "done" : k === i ? "now" : ""} />
        ))}
      </div>
      {SLIDES.map((sl, k) => (
        <div key={k} className={"slide" + (k === i ? " on" : "")} aria-hidden={k !== i}>
          <div className="art">{sl.art}</div>
          <div className="big">{sl.big}</div>
          <p>{sl.p}</p>
        </div>
      ))}
    </div>
  );
}

export default function Onboarding({ s, reload }: { s: any; reload: () => void }) {
  const [step, setStep] = useState(0);
  const finish = async (thenChat?: boolean) => {
    await api("/api/settings", { method: "POST", json: { onboarded: true } });
    if (thenChat) toast("Расскажи помощнику о клиентах — можно голосом или файлом");
    reload();
  };
  const steps = 4;
  const [busy, setBusy] = useState(false);
  const demo = async () => {
    setBusy(true);
    try {
      await api("/api/demo", { method: "POST", json: { action: "load" } });
      await api("/api/settings", { method: "POST", json: { onboarded: true } });
      reload();
    } catch (e: any) {
      toast(e.message);
      setBusy(false);
    }
  };
  return (
    <div className="onb">
      <div className="steps" aria-hidden>
        {Array.from({ length: steps }, (_, k) => (
          <i key={k} className={k <= step ? "on" : ""} />
        ))}
      </div>

      {step === 0 && (
        <>
          <div className="hello">Привет, Максим</div>
          <p className="muted" style={{ marginTop: 0 }}>
            Это твой офис: секретарь и команда помощников для Heliclub и стройки. Вот что он умеет — за полминуты.
          </p>
          <Reel />
          <button className="btn ghost" style={{ marginTop: 10 }} disabled={busy} onClick={demo}>
            {busy ? "Заполняю пример…" : "Посмотреть приложение на примере"}
          </button>
        </>
      )}

      {step === 1 && (
        <>
          <h1>Подключи к своему Claude</h1>
          <p className="muted" style={{ marginTop: 0 }}>
            Говорить с помощником можно прямо здесь. А можно и в обычном Claude на телефоне — тогда всё, что ты ему скажешь о работе, тоже окажется здесь.
          </p>
          <ClaudeConnect />
        </>
      )}

      {step === 2 && (
        <>
          <h1>Что подключить</h1>
          <p className="muted" style={{ marginTop: 0 }}>
            Всё по желанию. Пропущенное можно подключить потом в разделе «Ещё».
          </p>
          <ConnList s={s} reload={reload} />
          <h2>Календарь в телефоне</h2>
          <CalendarConnect />
        </>
      )}

      {step === 3 && (
        <>
          <h1>С чего начать</h1>
          <p className="muted" style={{ marginTop: 0 }}>
            Приложение пустое — его заполняешь ты. Проще всего рассказать помощнику:
          </p>
          <div className="panel pad" style={{ fontSize: 17 }}>
            «У меня клиенты: Петров, борт YL-HCB, хранение 900 в месяц, лётный час 650. Иванов…»
          </div>
          <p className="muted">Или пришли ему таблицу, старый счёт или договор — он сам заведёт клиентов, ставки и вертолёты.</p>
        </>
      )}

      <div className="foot">
        {step > 0 && (
          <button className="btn" onClick={() => setStep(step - 1)}>
            Назад
          </button>
        )}
        {step < 2 && (
          <button className="btn primary" onClick={() => setStep(step + 1)}>
            {step === 1 ? "Дальше" : "Начать"}
          </button>
        )}
        {step === 2 && (
          <button className="btn primary" onClick={() => setStep(3)}>
            Дальше
          </button>
        )}
        {step === 3 && (
          <button className="btn primary" onClick={() => finish(true)}>
            Открыть офис
          </button>
        )}
      </div>
    </div>
  );
}

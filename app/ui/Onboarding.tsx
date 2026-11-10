"use client";
import { useEffect, useState } from "react";
import { api, toast } from "./kit";
import { ClaudeConnect, ConnList, CalendarConnect } from "./Connections";

/* Первый запуск: привет и короткий рассказ, подключение к Claude, подключения, первые данные. */

export { Reel } from "./Reel";
import { Reel } from "./Reel";

export default function Onboarding({ s, reload }: { s: any; reload: () => void }) {
  const [step, setStep] = useState(0);
  // только что установил по подарочной ссылке — рассказ он уже видел
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    try {
      if (new URLSearchParams(location.search).has("installed")) sessionStorage.setItem("seenReel", "1");
      setSeen(sessionStorage.getItem("seenReel") === "1");
    } catch {}
  }, []);
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
          {seen ? (
            <>
              <h1>Готово, это твоё приложение</h1>
              <p className="muted" style={{ marginTop: 0 }}>
                Оно живёт в твоих аккаунтах, данные видишь только ты. Дальше — подключить твой Claude и то, что захочешь. Всё по желанию, пропущенное можно подключить потом в «Ещё».
              </p>
            </>
          ) : (
            <Reel />
          )}
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

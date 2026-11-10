"use client";
import { useEffect, useState } from "react";
import { Reel } from "./Reel";

/* Подарочная ссылка: рассказ, а потом установка приложения в его собственные аккаунты — дальше оно живёт у него. */
export default function Install({ movedTo }: { movedTo: string | null }) {
  const [step, setStep] = useState<"story" | "how">("story");
  useEffect(() => {
    // уже установлено — подарочная ссылка просто ведёт в его приложение
    if (movedTo) location.replace(movedTo);
  }, [movedTo]);
  if (movedTo) return null;
  return (
    <div className="onb">
      {step === "story" ? (
        <>
          <Reel onEnd={() => setStep("how")} />
          <div className="foot">
            <button className="btn primary" onClick={() => setStep("how")}>
              Забрать подарок
            </button>
          </div>
        </>
      ) : (
        <>
          <h1>Сделаем приложение твоим</h1>
          <p className="muted" style={{ marginTop: 0 }}>
            Оно установится в твои собственные аккаунты и будет жить только у тебя: твои данные видишь только ты, а меняешь и улучшаешь его тоже ты — через свой Claude. Минут десять, удобнее с компьютера.
          </p>
          <ol className="how">
            <li>
              Нажми <b>«Установить»</b> — откроется Vercel (там живут сайты и приложения). Войди через <b>GitHub</b>; если аккаунта нет — «Sign up», понадобится только почта.
            </li>
            <li>
              Нажми <b>Create</b>. Ниже, в «Storage», у <b>Neon</b> (бесплатная база данных) нажми <b>Add</b> и согласись.
            </li>
            <li>
              Нажми <b>Deploy</b> и подожди пару минут. Ты сам вернёшься сюда и сразу попадёшь в своё приложение.
            </li>
            <li>
              Там придумай пароль — и на iPhone поставь приложение на экран «Домой»: в Safari «Поделиться» → «На экран „Домой“».
            </li>
          </ol>
          <div className="foot">
            <button className="btn" onClick={() => setStep("story")}>
              Назад
            </button>
            <a className="btn primary" href="/api/install">
              Установить
            </a>
          </div>
          <p className="small muted">Бесплатно: Vercel и Neon на бесплатных тарифах. Платно только по желанию — Claude API для чата внутри приложения.</p>
        </>
      )}
    </div>
  );
}

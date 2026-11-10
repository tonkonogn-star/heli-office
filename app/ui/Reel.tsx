"use client";
import { useEffect, useState } from "react";

/* Живой рассказ при первом запуске. Слайд монтируется заново при показе — анимация каждый раз с начала. */

const DUR = 6000;

function Count({ to, ms = 1400, suffix = "" }: { to: number; ms?: number; suffix?: string }) {
  const [v, setV] = useState(0);
  useEffect(() => {
    const t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = Math.min(1, (t - t0) / ms);
      setV(Math.round(to * (1 - Math.pow(1 - k, 3))));
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [to, ms]);
  return (
    <>
      {v.toLocaleString("ru-RU")}
      {suffix}
    </>
  );
}

const d = (s: number) => ({ animationDelay: s + "s" }) as React.CSSProperties;

const SLIDES: { title: string; text: string; scene: () => React.ReactNode }[] = [
  {
    title: "Привет, Максим! Я твой помощник.",
    text: "Подарок на день рождения от Насти и Марка. Через пару минут поймёшь, что я умею. А если коротко — тебе дарят время: около 20 часов каждый месяц.",
    scene: () => (
      <div className="sc-gift">
        <div className="badge sm">
          <i className="ring" />
          <i className="core" />
        </div>
        {Array.from({ length: 14 }, (_, k) => (
          <span key={k} className="spark" style={{ left: `${(k * 37) % 100}%`, animationDelay: `${(k % 7) * 0.25}s`, animationDuration: `${2.6 + (k % 4) * 0.5}s` }} />
        ))}
        <div className="date rise" style={d(0.3)}>
          13 ноября
        </div>
      </div>
    ),
  },
  {
    title: "Твой офис в трёх комнатах",
    text: "Heliclub, стройка и личное. В каждой — свои счета, договоры, дела и документы. Утром всё важное — на одном экране.",
    scene: () => (
      <div className="sc-spaces">
        {[
          ["Heliclub", "клиенты · полёты · счета · Bell"],
          ["Стройка", "объекты · этапы · рынок"],
          ["Личное", "платежи · здоровье · дела"],
        ].map(([t, s], k) => (
          <div key={t} className="card pop" style={d(0.2 + k * 0.35)}>
            <b>{t}</b>
            <span>{s}</span>
          </div>
        ))}
      </div>
    ),
  },
  {
    title: "Скажи — и я запишу",
    text: "Пиши или диктуй как другу, хоть сразу после посадки. Я сам разложу по клиентам, счетам и делам.",
    scene: () => (
      <div className="sc-chat">
        <div className="bub me rise" style={d(0.2)}>
          Полетели с Петровым, два часа, Рига — Сигулда
        </div>
        <div className="typing rise" style={d(1.1)}>
          <i />
          <i />
          <i />
        </div>
        <div className="bub ai rise" style={d(2.1)}>
          Записал полёт. В счёт Петрова +1 300 €.
          <span className="chip">Полёт записан</span>
        </div>
      </div>
    ),
  },
  {
    title: "Счета я соберу сам",
    text: "Хранение — 1-го числа, полёты и работы — сразу после события. Тебе остаётся проверить и нажать «Отправить».",
    scene: () => (
      <div className="sc-invoice">
        <div className="paper">
          <div className="hd">Invoice · Петров Air</div>
          {[
            ["Hangarage — November", "900 €"],
            ["Flight Rīga — Sigulda, 2 h", "1 300 €"],
            ["Maintenance, 3 h", "285 €"],
          ].map(([a, b], k) => (
            <div key={a} className="ln slide-in" style={d(0.3 + k * 0.45)}>
              <span>{a}</span>
              <b>{b}</b>
            </div>
          ))}
          <div className="tot rise" style={d(1.8)}>
            <span>Итого</span>
            <b>
              <Count to={2485} suffix=" €" />
            </b>
          </div>
        </div>
        <div className="stamp pop" style={d(2.6)}>
          Черновик готов
        </div>
      </div>
    ),
  },
  {
    title: "Утро пилота",
    text: "Ветер и облачность там, где ты сейчас, твой сон и восстановление по WHOOP — и честная подсказка, лететь ли сегодня самому.",
    scene: () => (
      <div className="sc-sky">
        <div className="go pop" style={d(0.2)}>
          GO
        </div>
        <div className="bars">
          {[6, 8, 10, 13, 17, 21, 18, 12].map((h, k) => (
            <i key={k} className={"grow" + (h > 18 ? " warn" : "")} style={{ height: h * 3.4, ...d(0.4 + k * 0.08) }} />
          ))}
        </div>
        <div className="whoop rise" style={d(1.3)}>
          <b>
            <Count to={72} suffix="%" />
          </b>
          восстановление
        </div>
      </div>
    ),
  },
  {
    title: "Цифры, которые видно",
    text: "Сколько приносит каждый клиент и борт, сколько на него уходит и когда он окупится.",
    scene: () => (
      <div className="sc-fin">
        {[
          ["YL-HCB", 0.68, "+20 635 €"],
          ["YL-HCC", 0.82, "+23 885 €"],
        ].map(([r, w, v], k) => (
          <div key={r as string} className="row2 rise" style={d(0.2 + k * 0.4)}>
            <span>{r}</span>
            <div className="track">
              <i className="fill" style={{ width: (w as number) * 100 + "%", ...d(0.5 + k * 0.4) }} />
            </div>
            <b>{v}</b>
          </div>
        ))}
        <div className="clients">
          {["Baltic Charter", "Петров Air", "Иванов"].map((c, k) => (
            <span key={c} className="pill2 pop" style={d(1.4 + k * 0.2)}>
              {c}
            </span>
          ))}
        </div>
      </div>
    ),
  },
  {
    title: "Рынок вокруг дома",
    text: "Я найду похожие дома в Кап-Мартене и покажу, где твоя цена продажи относительно рынка.",
    scene: () => (
      <div className="sc-market">
        <div className="scale">
          {[8, 22, 31, 38, 47, 58, 66, 80].map((x, k) => (
            <i key={k} className="dot drop" style={{ left: x + "%", ...d(0.2 + k * 0.12) }} />
          ))}
          <span className="me slide-x" style={d(1.4)}>
            твой план
          </span>
        </div>
        <div className="lbl rise" style={d(0.4)}>
          цена за м² · Cap-Martin
        </div>
      </div>
    ),
  },
  {
    title: "Нас тут целая команда",
    text: "Счета, договоры, стройка, техконтроль, финансы, сделки, оценщик домов, здоровье и адвокат дьявола. А контролёр каждый день ищет, что требует твоего внимания.",
    scene: () => (
      <div className="sc-team">
        {["Счета", "Договоры", "Стройка", "Техконтроль", "Финансы", "Сделки", "Оценщик", "Здоровье", "Адвокат дьявола"].map((n, k) => (
          <span key={n} className="pill2 pop" style={d(0.15 + k * 0.15)}>
            {n}
          </span>
        ))}
      </div>
    ),
  },
  {
    title: "Дай мне почту — и выдохни",
    text: "Я напомню обо всём важном, перескажу длинные письма в двух строках, сам запишу дела и сроки из переписки и подготовлю ответы — тебе останется нажать «Отправить». Не хочешь — не подключай: я работаю и без почты.",
    scene: () => (
      <div className="sc-mail">
        {[
          ["Bell Helicopter", "Re: 505 spec & delivery slots", "Записал дело: ответить до пятницы"],
          ["Elec Riviera", "Facture n° 2611 — travaux", "Расход по дому: 24 500 €"],
          ["AeroBaltic", "Contract draft v3", "Ответ готов — отправить?"],
        ].map(([from, subj, chip], k) => (
          <div key={from} className="mrow slide-in" style={d(0.2 + k * 0.5)}>
            <div>
              <b>{from}</b>
              <span>{subj}</span>
            </div>
            <i className="chip pop" style={d(0.8 + k * 0.5)}>
              {chip}
            </i>
          </div>
        ))}
        <div className="saved rise" style={d(2.6)}>
          ≈ 6 часов в месяц на почте
        </div>
      </div>
    ),
  },
  {
    title: "Твои 20 часов",
    text: "Столько примерно уходит в месяц на то, что теперь делаю я. Это почти месяц рабочего времени в год — на небо, на Марка, на себя.",
    scene: () => (
      <div className="sc-time">
        <div className="total pop" style={d(0.1)}>
          <Count to={20} ms={1800} /> <small>ч / месяц</small>
        </div>
        {[
          ["Договоры и спецификации", 6],
          ["Почта и ответы", 6],
          ["Счета клиентам", 5],
          ["Стройка и документы", 3],
        ].map(([l, h], k) => (
          <div key={l as string} className="trow rise" style={d(0.4 + k * 0.25)}>
            <span>{l}</span>
            <div className="track">
              <i className="fill" style={{ width: ((h as number) / 6) * 100 + "%", ...d(0.6 + k * 0.25) }} />
            </div>
            <b>{h} ч</b>
          </div>
        ))}
      </div>
    ),
  },
  {
    title: "Я расту вместе с тобой",
    text: "Чего-то не хватает или что-то неудобно — просто скажи, что поменять.",
    scene: () => (
      <div className="sc-chat">
        <div className="bub me rise" style={d(0.2)}>
          Добавь мне учёт топлива по каждому борту
        </div>
        <div className="bub ai rise" style={d(1.2)}>
          Записал пожелание — сделаем.
        </div>
      </div>
    ),
  },
];

export function Reel({ onEnd }: { onEnd?: () => void }) {
  const [i, setI] = useState(0);
  useEffect(() => {
    if (i >= SLIDES.length - 1) return;
    const t = setTimeout(() => setI(i + 1), DUR);
    return () => clearTimeout(t);
  }, [i]);
  useEffect(() => {
    if (i === SLIDES.length - 1 && onEnd) {
      const t = setTimeout(onEnd, DUR + 2000);
      return () => clearTimeout(t);
    }
  }, [i, onEnd]);
  const S = SLIDES[i];
  return (
    <div
      className="reel live"
      role="group"
      aria-label="Что умеет приложение"
      onClick={(e) => {
        const r = (e.currentTarget as HTMLElement).getBoundingClientRect();
        setI((x) => (e.clientX - r.left < r.width / 3 ? Math.max(0, x - 1) : Math.min(SLIDES.length - 1, x + 1)));
      }}
    >
      <div className="dots">
        {SLIDES.map((_, k) => (
          <i key={k + "-" + (k === i ? i : "")} className={k < i ? "done" : k === i ? "now" : ""} style={{ ["--dur" as any]: DUR + "ms" }} />
        ))}
      </div>
      <div key={i} className="frame">
        <div className="scene">{S.scene()}</div>
        <div className="big rise" style={d(0.1)}>
          {S.title}
        </div>
        <p className="rise" style={d(0.25)}>
          {S.text}
        </p>
      </div>
    </div>
  );
}

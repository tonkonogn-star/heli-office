"use client";
import { useEffect, useState } from "react";

/** Заставка при открытии: кольцо Heliclub крутится, как винт, птица на месте. Касание — пропустить. */
export default function Splash({ ready }: { ready: boolean }) {
  const [phase, setPhase] = useState<"on" | "out" | "gone">("on");
  const [min, setMin] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setMin(true), 2200);
    return () => clearTimeout(t);
  }, []);
  useEffect(() => {
    if (ready && min && phase === "on") {
      setPhase("out");
      setTimeout(() => setPhase("gone"), 650);
    }
  }, [ready, min, phase]);
  if (phase === "gone") return null;
  const h = new Date().getHours();
  const hello = h < 5 ? "Доброй ночи" : h < 12 ? "Доброе утро" : h < 18 ? "Добрый день" : "Добрый вечер";
  return (
    <div className={"splash" + (phase === "out" ? " out" : "")} onClick={() => ready && setMin(true)} aria-hidden>
      <div className="badge">
        <i className="ring" />
        <i className="core" />
      </div>
      <div className="hi">
        {hello}, Максим
        <small>Heliclub · Стройка · Личное</small>
      </div>
    </div>
  );
}

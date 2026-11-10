"use client";
import { useCallback, useEffect, useState } from "react";
import { api, Icon, Viewer, Toast, toast } from "./kit";
import Today from "./Today";
import Heli from "./Heli";
import Build from "./Build";
import Chat from "./Chat";
import More from "./More";
import Personal from "./Personal";
import Onboarding from "./Onboarding";
import { QuickAdd } from "./Forms";
import Splash from "./Splash";
import Install from "./Install";

export type Tab = "today" | "heli" | "build" | "personal" | "chat" | "more";
const TABS: { id: Tab; label: string; icon: string }[] = [
  { id: "today", label: "Сегодня", icon: "today" },
  { id: "heli", label: "Heliclub", icon: "heli" },
  { id: "build", label: "Стройка", icon: "build" },
  { id: "personal", label: "Личное", icon: "person" },
  { id: "chat", label: "Помощник", icon: "chat" },
];

export type Nav = { tab: Tab; sub?: string; id?: string; thread?: string; files?: { id: string; name: string }[]; draft?: string };

export default function App() {
  const [auth, setAuth] = useState<{ hasPassword: boolean; authed: boolean; error?: string; launcher?: boolean; movedTo?: string | null } | null>(null);
  const [s, setS] = useState<any>(null);
  const [nav, setNav] = useState<Nav>({ tab: "today" });
  const [quick, setQuick] = useState(false);

  const load = useCallback(async () => {
    try {
      setS(await api("/api/state"));
    } catch (e: any) {
      if (/войти/.test(e.message)) setAuth((a) => (a ? { ...a, authed: false } : a));
      else toast(e.message);
    }
  }, []);

  useEffect(() => {
    try {
      if (new URLSearchParams(location.search).has("installed")) sessionStorage.setItem("seenReel", "1");
    } catch {}
    fetch("/api/auth")
      .then((r) => r.json())
      .then(setAuth)
      .catch(() => setAuth({ hasPassword: false, authed: false, error: "no_db" }));
    const msg = new URLSearchParams(location.search).get("msg");
    if (msg) {
      setTimeout(() => toast(msg), 400);
      history.replaceState(null, "", "/");
    }
  }, []);

  useEffect(() => {
    if (auth?.authed) load();
  }, [auth?.authed, load]);

  // обновляем, когда приложение снова на экране
  useEffect(() => {
    const v = () => document.visibilityState === "visible" && auth?.authed && load();
    document.addEventListener("visibilitychange", v);
    return () => document.removeEventListener("visibilitychange", v);
  }, [auth?.authed, load]);

  const go = (n: Nav) => {
    setNav(n);
    window.scrollTo({ top: 0 });
  };

  const ready = !!auth && (!auth.authed || !!s || auth.error === "no_db");
  // заставка всегда в одном месте дерева — не перезапускается при смене экранов
  return (
    <>
      <Splash ready={ready} />
      {screen()}
    </>
  );

  function screen() {
  if (!auth) return null;
  if (auth.launcher) return <Install movedTo={auth.movedTo || null} />;
  if (auth.error === "no_db") return <Gate mode="nodb" />;
  if (!auth.authed) return <Gate mode={auth.hasPassword ? "login" : "setup"} onDone={() => setAuth({ hasPassword: true, authed: true })} />;
  if (!s) return null;
  if (!s.onboarded) return <Onboarding s={s} reload={load} />;

  return (
    <div className="shell">
      <nav className="tabs" aria-label="Разделы">
        {TABS.map((t) => (
          <button key={t.id} aria-current={nav.tab === t.id ? "page" : undefined} onClick={() => go({ tab: t.id })}>
            <Icon n={t.icon} />
            {t.label}
          </button>
        ))}
      </nav>
      <main className="main">
        {nav.tab === "today" && <Today s={s} go={go} reload={load} />}
        {nav.tab === "heli" && <Heli s={s} nav={nav} go={go} reload={load} />}
        {nav.tab === "build" && <Build s={s} nav={nav} go={go} reload={load} />}
        {nav.tab === "personal" && <Personal s={s} nav={nav} go={go} reload={load} />}
        {nav.tab === "chat" && <Chat key={(nav.thread || "inbox") + (nav.files?.length || "")} thread={nav.thread || "inbox"} initFiles={nav.files} initDraft={nav.draft} go={go} reload={load} />}
        {nav.tab === "more" && <More s={s} reload={load} go={go} />}
      </main>
      {nav.tab !== "chat" && (
        <button className="fab" aria-label="Быстро добавить" onClick={() => setQuick(true)}>
          <Icon n="plus" size={26} />
        </button>
      )}
      {quick && <QuickAdd s={s} onClose={() => setQuick(false)} done={load} go={go} />}
      <Viewer />
      <Toast />
    </div>
  );
}
}

function Gate({ mode, onDone }: { mode: "login" | "setup" | "nodb"; onDone?: () => void }) {
  const [pw, setPw] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);
  if (mode === "nodb")
    return (
      <div className="gate">
        <div className="card">
          <div className="mark">
          <img src="/badge-black.png" alt="" />
          Офис
        </div>
          <p className="muted">База данных не подключена. В проекте на Vercel нужно добавить Neon Postgres (Storage → Create Database) и перезапустить.</p>
        </div>
      </div>
    );
  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setErr("");
    try {
      await api("/api/auth", { method: "POST", json: { action: mode, password: pw } });
      onDone?.();
    } catch (e: any) {
      setErr(e.message);
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="gate">
      <form className="card" onSubmit={submit}>
        <div className="mark">
          <img src="/badge-black.png" alt="" />
          Офис
        </div>
        <p className="muted" style={{ marginTop: 0 }}>{mode === "setup" ? "Придумай пароль. Он нужен, чтобы в твоё пространство никто, кроме тебя, не зашёл." : "Твоё пространство: Heliclub, стройка и личное."}</p>
        <Field2 label={mode === "setup" ? "Новый пароль, от 6 символов" : "Пароль"}>
          <input className="input" type="password" autoComplete={mode === "setup" ? "new-password" : "current-password"} value={pw} onChange={(e) => setPw(e.target.value)} autoFocus />
        </Field2>
        {err && <p style={{ color: "var(--red)" }}>{err}</p>}
        <InstallHint />
        <button className="btn primary" style={{ width: "100%" }} disabled={busy || pw.length < (mode === "setup" ? 6 : 1)}>
          {mode === "setup" ? "Сохранить пароль" : "Войти"}
        </button>
      </form>
    </div>
  );
}

function Field2({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

/** iPhone: приложение ставится на экран «Домой» из Safari — тогда открывается без браузера, как обычное. */
function InstallHint() {
  const [show, setShow] = useState<null | "ios" | "other">(null);
  useEffect(() => {
    const standalone = (navigator as any).standalone || window.matchMedia("(display-mode: standalone)").matches;
    if (standalone) return;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    setShow(ios ? "ios" : /android/i.test(navigator.userAgent) ? "other" : null);
  }, []);
  if (!show) return null;
  return (
    <div className="panel pad small" style={{ marginBottom: 14, background: "var(--soft)", borderColor: "transparent" }}>
      {show === "ios" ? (
        <>
          <b>Поставь меня на экран «Домой»</b> — буду открываться как приложение, без браузера: внизу Safari нажми «Поделиться» <span aria-hidden>⬆︎</span>, затем «На экран „Домой“».
        </>
      ) : (
        <>
          <b>Поставь меня на главный экран</b> — меню браузера ⋮ → «Добавить на главный экран».
        </>
      )}
    </div>
  );
}

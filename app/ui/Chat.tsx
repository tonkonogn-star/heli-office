"use client";
import { useEffect, useRef, useState } from "react";
import { api, Icon, Md, toast } from "./kit";
import { AGENTS } from "@/lib/agents";
import type { Nav } from "./App";

type Msg = { id: number | string; role: "user" | "assistant"; text: string; meta?: any };
const THREADS: [string, string][] = [["inbox", "Секретарь"], ...AGENTS.map((a) => ["a:" + a.id, a.name] as [string, string])];

const HINTS: Record<string, string[]> = {
  inbox: ["Полетели с Ивановым, полтора часа, Рига — Юрмала", "Что у меня горит?", "Кто мне должен?"],
  "a:billing": ["Собери черновики счетов за этот месяц", "Добавь Петрову замену фильтров, 3 часа"],
  "a:contracts": ["Собери договор купли-продажи Bell 505 по этой спецификации", "Сверь договор с прайсом"],
  "a:build": ["Электрик закончил, акт подписан", "Сколько осталось от бюджета?"],
  "a:tech": ["Когда ТО у YL-HCB?", "Медкомиссия до 1 марта"],
  "a:finance": ["Сколько принёс каждый клиент за год?", "Какой будет денежный поток до лета?"],
  "a:deals": ["Что застряло?", "Кому пора напомнить о себе?"],
  "a:flip": ["Оцени дом: адрес, цена 180 000, ремонт около 60 000"],
  "a:devil": ["Хочу купить второй 505-й под доли — найди, где риск"],
};

export default function Chat({ thread, go, reload }: { thread: string; go: (n: Nav) => void; reload: () => void }) {
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [text, setText] = useState("");
  const [live, setLive] = useState<{ text: string; status: string; actions: string[] } | null>(null);
  const [files, setFiles] = useState<{ id: string; name: string }[]>([]);
  const [upl, setUpl] = useState(false);
  const [rec, setRec] = useState(false);
  const recRef = useRef<any>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const end = useRef<HTMLDivElement>(null);
  const ta = useRef<HTMLTextAreaElement>(null);
  const agent = AGENTS.find((a) => "a:" + a.id === thread);
  const canSpeak = typeof window !== "undefined" && !!((window as any).SpeechRecognition || (window as any).webkitSpeechRecognition);

  useEffect(() => {
    setMsgs([]);
    api(`/api/chat?thread=${encodeURIComponent(thread)}`)
      .then((r) => setMsgs(r.messages))
      .catch((e) => toast(e.message));
  }, [thread]);

  useEffect(() => {
    end.current?.scrollIntoView({ block: "end" });
  }, [msgs.length, live?.text]);

  useEffect(() => {
    if (!ta.current) return;
    ta.current.style.height = "auto";
    ta.current.style.height = Math.min(160, ta.current.scrollHeight) + "px";
  }, [text]);

  const send = async (t?: string) => {
    const body = (t ?? text).trim();
    if (!body || live) return;
    stopRec();
    setText("");
    const docs = files;
    setFiles([]);
    setMsgs((m) => [...m, { id: "u" + Date.now(), role: "user", text: body, meta: { docNames: docs.map((d) => d.name) } }]);
    setLive({ text: "", status: "Думаю…", actions: [] });
    let acc = "";
    const acts: string[] = [];
    let changed = false;
    try {
      const r = await fetch("/api/chat", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ thread, text: body, docs: docs.map((d) => d.id) }) });
      if (!r.ok || !r.body) throw new Error(r.status === 401 ? "Нужно войти заново" : "Сервер не ответил");
      const rd = r.body.getReader();
      const dec = new TextDecoder();
      let buf = "";
      for (;;) {
        const { done, value } = await rd.read();
        if (done) break;
        buf += dec.decode(value, { stream: true });
        let i;
        while ((i = buf.indexOf("\n")) >= 0) {
          const line = buf.slice(0, i);
          buf = buf.slice(i + 1);
          if (!line.trim()) continue;
          const ev = JSON.parse(line);
          if (ev.type === "text") acc += ev.text;
          else if (ev.type === "action") acts.push(ev.text);
          else if (ev.type === "error") {
            acc = (acc ? acc + "\n\n" : "") + ev.text;
            changed ||= !!ev.changed;
          } else if (ev.type === "done") changed ||= !!ev.changed;
          setLive({ text: acc, status: ev.type === "status" ? ev.text : "", actions: [...acts] });
        }
      }
    } catch (e: any) {
      // связь оборвалась — ответ всё равно сохранён на сервере; подтягиваем его
      acc = acc || "";
      setTimeout(() => api(`/api/chat?thread=${encodeURIComponent(thread)}`).then((r) => setMsgs(r.messages)), 4000);
      if (!acc) acc = "Связь оборвалась. Ответ появится здесь через несколько секунд, если помощник успел его закончить.";
    }
    setMsgs((m) => [...m, { id: "a" + Date.now(), role: "assistant", text: acc, meta: { actions: acts } }]);
    setLive(null);
    if (changed || acts.length) reload();
  };

  const upload = async (list: FileList | null) => {
    if (!list?.length) return;
    setUpl(true);
    try {
      const fd = new FormData();
      fd.set("space", agent?.space === "build" ? "build" : agent?.space === "heli" ? "heli" : "general");
      for (const f of Array.from(list)) fd.append("file", f);
      const r = await api("/api/docs", { method: "POST", body: fd });
      setFiles((x) => [...x, ...r.docs]);
    } catch (e: any) {
      toast(e.message);
    } finally {
      setUpl(false);
      if (fileRef.current) fileRef.current.value = "";
    }
  };

  // Голос: только по нажатию, никогда сам. Текст идёт в поле — можно поправить перед отправкой.
  const startRec = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return;
    const r = new SR();
    r.lang = "ru-RU";
    r.continuous = true;
    r.interimResults = true;
    const base = text ? text.trim() + " " : "";
    r.onresult = (e: any) => {
      let s = "";
      for (let i = 0; i < e.results.length; i++) s += e.results[i][0].transcript;
      setText(base + s);
    };
    r.onerror = (e: any) => {
      if (e.error === "not-allowed") toast("Разреши доступ к микрофону в настройках браузера");
      setRec(false);
    };
    r.onend = () => setRec(false);
    recRef.current = r;
    r.start();
    setRec(true);
  };
  const stopRec = () => {
    try {
      recRef.current?.stop();
    } catch {}
    recRef.current = null;
    setRec(false);
  };

  return (
    <>
      <div className="threads" role="tablist" aria-label="С кем говорить">
        {THREADS.map(([id, name]) => (
          <button key={id} aria-pressed={thread === id} onClick={() => go({ tab: "chat", thread: id })}>
            {name}
          </button>
        ))}
      </div>
      <p className="small muted" style={{ marginTop: 0 }}>
        {agent ? agent.about[0].toUpperCase() + agent.about.slice(1) + "." : "Пиши или диктуй как есть — секретарь сам разложит по счетам, делам и объектам."}
      </p>

      <div className="msgs">
        {msgs.length === 0 && !live && (
          <div className="panel list">
            {(HINTS[thread] || HINTS.inbox).map((h) => (
              <button key={h} className="item" onClick={() => send(h)}>
                «{h}»
              </button>
            ))}
          </div>
        )}
        {msgs.map((m) => (
          <div key={m.id} className={"msg " + m.role}>
            {m.role === "assistant" ? <Md text={m.text} /> : m.text}
            {m.meta?.docNames?.length > 0 && <div className="small" style={{ opacity: 0.8, marginTop: 4 }}>📎 {m.meta.docNames.join(", ")}</div>}
            {m.role === "assistant" && m.meta?.actions?.length > 0 && (
              <div className="acts">
                {[...new Set(m.meta.actions as string[])].map((a) => (
                  <span key={a} className="pill go">
                    {a}
                  </span>
                ))}
              </div>
            )}
          </div>
        ))}
        {live && (
          <div className="msg assistant" aria-live="polite">
            {live.text ? <Md text={live.text} /> : null}
            {live.status && <div className="status">{live.status}</div>}
            {live.actions.length > 0 && (
              <div className="acts">
                {[...new Set(live.actions)].map((a) => (
                  <span key={a} className="pill go">
                    {a}
                  </span>
                ))}
              </div>
            )}
          </div>
        )}
        <div ref={end} />
      </div>

      <div className="composer">
        {files.length > 0 && (
          <div className="files">
            {files.map((f) => (
              <span key={f.id} className="pill">
                📎 {f.name}
                <button aria-label="Убрать" style={{ background: "none", border: 0, cursor: "pointer", padding: 0 }} onClick={() => setFiles((x) => x.filter((y) => y.id !== f.id))}>
                  ×
                </button>
              </span>
            ))}
          </div>
        )}
        <div className="box">
          <button className="ic" aria-label="Приложить файл" disabled={upl} onClick={() => fileRef.current?.click()}>
            <Icon n="clip" />
          </button>
          <input ref={fileRef} type="file" multiple hidden onChange={(e) => upload(e.target.files)} />
          <textarea
            ref={ta}
            rows={1}
            value={text}
            placeholder={rec ? "Говори…" : upl ? "Загружаю файл…" : "Написать или надиктовать"}
            onChange={(e) => setText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey && window.matchMedia("(min-width: 900px)").matches) {
                e.preventDefault();
                send();
              }
            }}
          />
          {canSpeak && !text.trim() && !rec ? (
            <button className="ic" aria-label="Надиктовать" onClick={startRec}>
              <Icon n="mic" />
            </button>
          ) : rec ? (
            <button className="ic rec" aria-label="Остановить запись" onClick={stopRec}>
              <Icon n="stop" />
            </button>
          ) : (
            <button className="ic send" aria-label="Отправить" disabled={!text.trim() || !!live} onClick={() => send()}>
              <Icon n="send" />
            </button>
          )}
        </div>
      </div>
    </>
  );
}

"use client";
import { useEffect, useRef, useState } from "react";
import { marked } from "marked";
import DOMPurify from "dompurify";

/* ---------- данные ---------- */

export async function api<T = any>(url: string, opts: RequestInit & { json?: unknown } = {}): Promise<T> {
  const { json, ...rest } = opts;
  const r = await fetch(url, { ...rest, headers: { ...(json !== undefined ? { "content-type": "application/json" } : {}), ...(rest.headers || {}) }, body: json !== undefined ? JSON.stringify(json) : rest.body });
  const j = await r.json().catch(() => ({}));
  if (!r.ok) throw new Error(j?.error === "auth" ? "Нужно войти заново" : j?.error || `Ошибка ${r.status}`);
  return j as T;
}

/** То же действие, что делает помощник: экраны и чат меняют данные одинаково. */
export const act = (tool: string, input: unknown) => api<{ result: string; changed?: boolean }>("/api/data", { method: "POST", json: { tool, input } });

export function money(n: unknown, cur = "EUR") {
  const v = Number(n) || 0;
  const s = v.toLocaleString("ru-RU", { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 });
  return cur === "EUR" ? `${s} €` : cur === "USD" ? `$${s}` : `${s} ${cur}`;
}

export function day(d: any, withYear = false) {
  if (!d) return "";
  const s = String(d).slice(0, 10);
  const dt = new Date(s + "T12:00:00");
  return dt.toLocaleDateString("ru-RU", { day: "numeric", month: "short", ...(withYear ? { year: "numeric" } : {}) }).replace(".", "");
}

export const todayIso = () => new Date().toLocaleDateString("sv-SE");
export const isPast = (d: any) => !!d && String(d).slice(0, 10) < todayIso();

/* ---------- иконки (свои, тонкие) ---------- */

const P: Record<string, string> = {
  today: "M4 12h3l2-6 4 12 2-6h5",
  heli: "M3 6h18M12 6v4m-7 4h10a3 3 0 0 0 3-3v0a1 1 0 0 0-1-1H7a3 3 0 0 0-3 3v0a1 1 0 0 0 1 1zm2 0v3m8-3v3M5 17h13",
  build: "M3 20h18M5 20V10l7-5 7 5v10M9 20v-6h6v6",
  chat: "M4 5h16v11H9l-5 4z",
  more: "M5 12h.01M12 12h.01M19 12h.01",
  plus: "M12 5v14M5 12h14",
  mic: "M12 3a3 3 0 0 0-3 3v6a3 3 0 0 0 6 0V6a3 3 0 0 0-3-3zM5 11a7 7 0 0 0 14 0M12 18v3",
  send: "M5 12h13M13 6l6 6-6 6",
  clip: "M15 7l-6.5 6.5a2 2 0 0 0 2.8 2.8L18 9.6a4 4 0 0 0-5.7-5.7L5.6 10.6a6 6 0 0 0 8.5 8.5L20 13",
  x: "M6 6l12 12M18 6L6 18",
  back: "M15 5l-7 7 7 7",
  doc: "M7 3h7l5 5v13H7zM14 3v5h5",
  down: "M12 4v12m-5-5l5 5 5-5M5 20h14",
  stop: "M7 7h10v10H7z",
  person: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8zM4 21c0-4 3.6-7 8-7s8 3 8 7",
  gear: "M12 15a3 3 0 1 0 0-6 3 3 0 0 0 0 6zM19.4 13a7.5 7.5 0 0 0 0-2l2-1.6-2-3.4-2.4 1a7 7 0 0 0-1.7-1L15 3.5h-4l-.4 2.5a7 7 0 0 0-1.7 1l-2.4-1-2 3.4L6.6 11a7.5 7.5 0 0 0 0 2l-2 1.6 2 3.4 2.4-1a7 7 0 0 0 1.7 1l.4 2.5h4l.4-2.5a7 7 0 0 0 1.7-1l2.4 1 2-3.4z",
  cal: "M4 6h16v14H4zM4 10h16M8 3v4M16 3v4",
};

export function Icon({ n, size }: { n: keyof typeof P | string; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size || 22} height={size || 22} fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d={P[n] || P.more} />
    </svg>
  );
}

/* ---------- текст помощника ---------- */

export function Md({ text }: { text: string }) {
  const html = DOMPurify.sanitize(marked.parse(text || "", { async: false, breaks: true }) as string, { ADD_ATTR: ["target"] });
  return (
    <div
      dangerouslySetInnerHTML={{ __html: html }}
      onClick={(e) => {
        // ссылки на PDF открываются внутри приложения, а не в новом окне
        const a = (e.target as HTMLElement).closest("a");
        const href = a?.getAttribute("href") || "";
        if (/^\/api\/(invoices|contracts|docs)\//.test(href)) {
          e.preventDefault();
          openFile(href.replace(/\?download=1$/, ""), a?.textContent || "Файл");
        }
      }}
    />
  );
}

/* ---------- просмотр файлов ---------- */

type Open = { url: string; name: string; mime?: string };
let setOpen: ((f: Open | null) => void) | null = null;
export function openFile(url: string, name: string, mime?: string) {
  setOpen?.({ url, name, mime });
}

export function Viewer() {
  const [f, set] = useState<Open | null>(null);
  useEffect(() => {
    setOpen = (v) => {
      // запись в историю: жест «назад» на iPhone закрывает просмотр, а не приложение
      if (v) history.pushState({ viewer: 1 }, "");
      set(v);
    };
    const onPop = () => set(null);
    window.addEventListener("popstate", onPop);
    return () => window.removeEventListener("popstate", onPop);
  }, []);
  if (!f) return null;
  const isPdf = /\/pdf$/.test(f.url) || f.mime === "application/pdf";
  const isImg = f.mime?.startsWith("image/");
  const close = () => (history.state?.viewer ? history.back() : set(null));
  return (
    <div className="viewer" role="dialog" aria-label={f.name}>
      <div className="viewer-bar">
        <button className="btn small" onClick={close}>
          <Icon n="back" size={18} /> Закрыть
        </button>
        <div className="grow">{f.name}</div>
        <a className="btn small" href={f.url + (f.url.includes("?") ? "&" : "?") + "download=1"}>
          <Icon n="down" size={18} /> Скачать
        </a>
      </div>
      <div className="viewer-body">
        {isPdf ? <PdfPages url={f.url} /> : isImg ? <img src={f.url} alt={f.name} /> : <p className="muted">Этот файл здесь не показать — нажми «Скачать», он откроется в своей программе.</p>}
      </div>
    </div>
  );
}

/** PDF страницами через pdf.js: iPhone не показывает PDF во встроенном окне. */
function PdfPages({ url }: { url: string }) {
  const box = useRef<HTMLDivElement>(null);
  const [state, setState] = useState<"load" | "ok" | "err">("load");
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const pdfjs: any = await import("pdfjs-dist");
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
        const doc = await pdfjs.getDocument({ url }).promise;
        const el = box.current;
        if (!el || cancelled) return;
        el.innerHTML = "";
        const width = Math.min(el.clientWidth || 360, 860);
        const dpr = Math.min(window.devicePixelRatio || 1, 2);
        for (let i = 1; i <= doc.numPages; i++) {
          if (cancelled) return;
          const page = await doc.getPage(i);
          const vp = page.getViewport({ scale: (width / page.getViewport({ scale: 1 }).width) * dpr });
          const c = document.createElement("canvas");
          c.width = vp.width;
          c.height = vp.height;
          c.style.width = width + "px";
          c.className = "pdf-page";
          el.appendChild(c);
          await page.render({ canvasContext: c.getContext("2d")!, viewport: vp }).promise;
          if (i === 1) setState("ok");
        }
      } catch (e) {
        console.error(e);
        if (!cancelled) setState("err");
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [url]);
  return (
    <>
      {state === "load" && <p className="muted">Открываю…</p>}
      {state === "err" && <p className="muted">Не получилось показать PDF. Нажми «Скачать».</p>}
      <div ref={box} className="pdf-pages" />
    </>
  );
}

/* ---------- лист снизу ---------- */

export function Sheet({ title, onClose, children }: { title: string; onClose: () => void; children: React.ReactNode }) {
  useEffect(() => {
    const k = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", k);
    return () => window.removeEventListener("keydown", k);
  }, [onClose]);
  return (
    <div className="veil" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="sheet" role="dialog" aria-label={title}>
        <div className="grab" />
        <div className="row between" style={{ marginBottom: 12 }}>
          <h2 style={{ margin: 0 }}>{title}</h2>
          <button className="btn ghost small" onClick={onClose} aria-label="Закрыть">
            <Icon n="x" size={20} />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

/* ---------- уведомление ---------- */

let pushToast: ((s: string) => void) | null = null;
export const toast = (s: string) => pushToast?.(s);
export function Toast() {
  const [t, setT] = useState<string | null>(null);
  useEffect(() => {
    let h: any;
    pushToast = (s) => {
      setT(s);
      clearTimeout(h);
      h = setTimeout(() => setT(null), 3200);
    };
  }, []);
  return t ? (
    <div className="toast" role="status">
      {t}
    </div>
  ) : null;
}

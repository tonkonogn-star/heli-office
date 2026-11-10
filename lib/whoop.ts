import crypto from "node:crypto";
import { q, getSetting, setSetting } from "./db";
const todayVienna = (d: Date) => d.toLocaleDateString("sv-SE", { timeZone: "Europe/Vienna" });

const AUTH = "https://api.prod.whoop.com/oauth/oauth2/auth";
const TOKEN = "https://api.prod.whoop.com/oauth/oauth2/token";
const API = "https://api.prod.whoop.com/developer";
const SCOPES = "offline read:recovery read:sleep read:cycles read:profile";

type W = {
  clientId?: string;
  clientSecret?: string;
  access?: string;
  refresh?: string;
  expiresAt?: number;
  state?: string;
  lastSync?: number;
  error?: string;
};

export async function whoopCfg(): Promise<W> {
  const w = (await getSetting<W>("whoop")) || {};
  // ключи приложения WHOOP задаются один раз при установке — Максиму остаётся одна кнопка «Подключить»
  return { ...w, clientId: w.clientId || process.env.WHOOP_CLIENT_ID, clientSecret: w.clientSecret || process.env.WHOOP_CLIENT_SECRET };
}
async function save(patch: Partial<W>) {
  const cur = (await getSetting<W>("whoop")) || {};
  await setSetting("whoop", { ...cur, ...patch });
}

export async function ensureTable() {
  await q(`create table if not exists whoop_days (
    day date primary key,
    recovery numeric, hrv numeric, rhr numeric,
    sleep_hours numeric, sleep_perf numeric, strain numeric,
    updated_at timestamptz not null default now()
  )`);
}

export function redirectUri(req: Request) {
  const h = req.headers;
  const host = h.get("x-forwarded-host") || h.get("host");
  const proto = h.get("x-forwarded-proto") || "https";
  return `${proto}://${host}/api/whoop/callback`;
}

export async function saveClient(clientId: string, clientSecret: string) {
  await save({ clientId: clientId.trim(), clientSecret: clientSecret.trim(), error: undefined });
}

export async function authUrl(req: Request) {
  const c = await whoopCfg();
  if (!c.clientId) throw new Error("WHOOP ещё не настроен на сервере (нужны WHOOP_CLIENT_ID и WHOOP_CLIENT_SECRET)");
  const state = crypto.randomBytes(6).toString("base64url").slice(0, 8);
  await save({ state });
  const u = new URL(AUTH);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("client_id", c.clientId);
  u.searchParams.set("redirect_uri", redirectUri(req));
  u.searchParams.set("scope", SCOPES);
  u.searchParams.set("state", state);
  return u.toString();
}

async function tokenRequest(body: Record<string, string>) {
  const res = await fetch(TOKEN, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams(body).toString(),
  });
  const j: any = await res.json().catch(() => ({}));
  if (!res.ok || !j.access_token) throw new Error(j.error_description || j.error || `Whoop ${res.status}`);
  return j;
}

export async function exchangeCode(req: Request, code: string, state: string) {
  const c = await whoopCfg();
  if (!c.state || state !== c.state) throw new Error("Неверный state, попробуй подключить ещё раз");
  const j = await tokenRequest({
    grant_type: "authorization_code",
    code,
    client_id: c.clientId!,
    client_secret: c.clientSecret!,
    redirect_uri: redirectUri(req),
  });
  await save({ access: j.access_token, refresh: j.refresh_token, expiresAt: Date.now() + (j.expires_in - 60) * 1000, state: undefined, error: undefined });
}

let refreshing: Promise<string> | null = null;
async function accessToken(): Promise<string> {
  const c = await whoopCfg();
  if (!c.access) throw new Error("Whoop не подключён");
  if (c.expiresAt && Date.now() < c.expiresAt) return c.access;
  if (!refreshing) {
    refreshing = (async () => {
      const j = await tokenRequest({
        grant_type: "refresh_token",
        refresh_token: c.refresh!,
        client_id: c.clientId!,
        client_secret: c.clientSecret!,
        scope: "offline",
      });
      await save({ access: j.access_token, refresh: j.refresh_token || c.refresh, expiresAt: Date.now() + (j.expires_in - 60) * 1000 });
      return j.access_token as string;
    })().finally(() => {
      refreshing = null;
    });
  }
  return refreshing;
}

async function getAll(path: string, startIso: string) {
  const out: any[] = [];
  let next: string | undefined;
  for (let i = 0; i < 8; i++) {
    const u = new URL(API + path);
    u.searchParams.set("limit", "25");
    u.searchParams.set("start", startIso);
    if (next) u.searchParams.set("nextToken", next);
    const res = await fetch(u, { headers: { authorization: `Bearer ${await accessToken()}` } });
    if (!res.ok) throw new Error(`Whoop ${path} ${res.status}`);
    const j: any = await res.json();
    out.push(...(j.records || []));
    next = j.next_token || j.nextToken;
    if (!next) break;
  }
  return out;
}

const dayOf = (iso: string) => todayVienna(new Date(iso));

/** Pulls the last N days of recovery, sleep and strain into whoop_days. */
export async function syncWhoop(days = 30) {
  await ensureTable();
  const c = await whoopCfg();
  if (!c.access) return { connected: false };
  try {
    const start = new Date(Date.now() - days * 86400000).toISOString();
    const [sleeps, recs, cycles] = await Promise.all([
      getAll("/v2/activity/sleep", start),
      getAll("/v2/recovery", start),
      getAll("/v2/cycle", start),
    ]);
    const rows = new Map<string, any>();
    const row = (d: string) => rows.get(d) || rows.set(d, { day: d }).get(d);
    const sleepDay = new Map<string, string>();
    for (const s of sleeps) {
      if (s.nap || s.score_state !== "SCORED" || !s.score) continue;
      const d = dayOf(s.end);
      sleepDay.set(String(s.id), d);
      const st = s.score.stage_summary || {};
      const asleep = (st.total_in_bed_time_milli || 0) - (st.total_awake_time_milli || 0);
      const r = row(d);
      r.sleep_hours = Math.round((asleep / 3600000) * 10) / 10;
      r.sleep_perf = s.score.sleep_performance_percentage ?? null;
    }
    for (const x of recs) {
      if (x.score_state !== "SCORED" || !x.score) continue;
      const d = sleepDay.get(String(x.sleep_id)) || dayOf(x.created_at);
      const r = row(d);
      r.recovery = x.score.recovery_score ?? null;
      r.hrv = x.score.hrv_rmssd_milli != null ? Math.round(x.score.hrv_rmssd_milli) : null;
      r.rhr = x.score.resting_heart_rate ?? null;
    }
    for (const cy of cycles) {
      if (!cy.score) continue;
      const r = row(dayOf(cy.start));
      r.strain = cy.score.strain != null ? Math.round(cy.score.strain * 10) / 10 : null;
    }
    // Все дни одним запросом (раньше — по запросу на каждый день).
    const list = [...rows.values()];
    if (list.length) {
      const vals: unknown[] = [];
      const ph = list.map((r, k) => {
        vals.push(r.day, r.recovery ?? null, r.hrv ?? null, r.rhr ?? null, r.sleep_hours ?? null, r.sleep_perf ?? null, r.strain ?? null);
        return `(${Array.from({ length: 7 }, (_, j) => "$" + (k * 7 + j + 1)).join(",")})`;
      });
      await q(
        `insert into whoop_days(day,recovery,hrv,rhr,sleep_hours,sleep_perf,strain) values ${ph.join(",")}
         on conflict(day) do update set
           recovery=coalesce(excluded.recovery,whoop_days.recovery), hrv=coalesce(excluded.hrv,whoop_days.hrv),
           rhr=coalesce(excluded.rhr,whoop_days.rhr), sleep_hours=coalesce(excluded.sleep_hours,whoop_days.sleep_hours),
           sleep_perf=coalesce(excluded.sleep_perf,whoop_days.sleep_perf), strain=coalesce(excluded.strain,whoop_days.strain), updated_at=now()`,
        vals,
      );
    }
    await save({ lastSync: Date.now(), error: undefined });
    return { connected: true, days: rows.size };
  } catch (e: any) {
    await save({ error: String(e?.message || e).slice(0, 200) });
    return { connected: true, error: String(e?.message || e) };
  }
}

/** Sync if the data is older than `maxAgeMin`. Never throws. */
export async function syncIfStale(maxAgeMin = 180) {
  try {
    const c = await whoopCfg();
    if (!c.access) return;
    if (c.lastSync && Date.now() - c.lastSync < maxAgeMin * 60000) return;
    await syncWhoop(14);
  } catch {}
}

export async function whoopDays(n = 14) {
  await ensureTable();
  return q<any>(
    "select to_char(day,'YYYY-MM-DD') as d, recovery::float, hrv::float, rhr::float, sleep_hours::float, sleep_perf::float, strain::float from whoop_days order by day desc limit $1",
    [n],
  );
}

export async function whoopStatus() {
  const c = await whoopCfg();
  return { hasClient: !!c.clientId, connected: !!c.access, lastSync: c.lastSync || null, error: c.error || null };
}

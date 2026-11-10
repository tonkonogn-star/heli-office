import { Pool, types, type QueryResultRow } from "pg";

// даты (date) — строкой YYYY-MM-DD, иначе часовой пояс сервера сдвигает их на день
types.setTypeParser(1082, (v) => v);
import crypto from "node:crypto";

declare global {
  // eslint-disable-next-line no-var
  var __heliPool: Pool | undefined;
  // eslint-disable-next-line no-var
  var __heliReady: Promise<void> | undefined;
}

function connString() {
  const cs = process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.DATABASE_URL_UNPOOLED || "";
  // sslmode=require в новых версиях pg значит «проверять сертификат» — у Supabase это падает; шифрование остаётся через ssl ниже
  if (!cs) return "";
  try {
    const u = new URL(cs);
    for (const k of ["sslmode", "supa", "sslrootcert", "pgbouncer"]) u.searchParams.delete(k);
    return u.toString();
  } catch {
    return cs;
  }
}

function pool(): Pool {
  if (!global.__heliPool) {
    const cs = connString();
    if (!cs) throw new Error("NO_DATABASE");
    const local = /localhost|127\.0\.0\.1/.test(cs);
    global.__heliPool = new Pool({ connectionString: cs, ssl: local ? undefined : { rejectUnauthorized: false }, max: 10, idleTimeoutMillis: 10_000 });
    // Neon закрывает простаивающие соединения — без этого обработчика функция падает.
    global.__heliPool.on("error", (e) => console.warn("[db] idle connection dropped:", e?.message));
  }
  return global.__heliPool;
}

const SCHEMA = `
create table if not exists settings (key text primary key, value jsonb not null);
create table if not exists clients (
  id text primary key, name text not null, contact text not null default '', email text not null default '', phone text not null default '',
  aircraft text not null default '', share text not null default '',
  storage_rate numeric not null default 0, hour_rate numeric not null default 0, maint_rate numeric not null default 0,
  currency text not null default 'EUR', notes text not null default '', archived boolean not null default false,
  created_at timestamptz not null default now()
);
create table if not exists invoices (
  id text primary key, client_id text not null references clients(id), number text not null, period text not null default '',
  status text not null default 'draft', issued date, due date, total numeric not null default 0, currency text not null default 'EUR',
  note text not null default '', created_at timestamptz not null default now(), sent_at timestamptz, paid_at timestamptz
);
create table if not exists charges (
  id text primary key, client_id text not null references clients(id), kind text not null default 'other', title text not null,
  qty numeric not null default 1, unit_price numeric not null default 0, amount numeric not null default 0, day date not null default current_date,
  invoice_id text references invoices(id) on delete set null, flight_id text, created_at timestamptz not null default now()
);
create table if not exists flights (
  id text primary key, day date not null default current_date, client_id text references clients(id), aircraft text not null default '',
  route text not null default '', hours numeric not null default 0, notes text not null default '', created_at timestamptz not null default now()
);
create table if not exists aircraft (
  id text primary key, reg text not null, model text not null default '', hours numeric not null default 0,
  next_service_hours numeric, next_service_date date, insurance_until date, arc_until date, notes text not null default ''
);
create table if not exists deals (
  id text primary key, space text not null default 'heli', title text not null, party text not null default '', stage text not null default 'Новая',
  value numeric, currency text not null default 'EUR', next_step text not null default '', next_date date, notes text not null default '',
  updated_at timestamptz not null default now(), created_at timestamptz not null default now()
);
create table if not exists contracts (
  id text primary key, space text not null default 'heli', title text not null, party text not null default '', status text not null default 'Черновик',
  amount numeric, currency text not null default 'EUR', body text not null default '', checks text not null default '',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists sites (
  id text primary key, name text not null, address text not null default '', status text not null default 'Стройка',
  budget numeric not null default 0, buy_price numeric, sale_target numeric, start date, finish_plan date, notes text not null default '',
  created_at timestamptz not null default now()
);
create table if not exists stages (
  id text primary key, site_id text not null references sites(id) on delete cascade, title text not null, contractor text not null default '',
  due date, status text not null default 'open', report text not null default '', sort int not null default 0, done_at timestamptz
);
create table if not exists expenses (
  id text primary key, site_id text not null references sites(id) on delete cascade, title text not null, vendor text not null default '',
  amount numeric not null default 0, day date not null default current_date, paid boolean not null default false, doc_id text,
  created_at timestamptz not null default now()
);
create table if not exists tasks (
  id text primary key, space text not null default 'general', ref text, title text not null, notes text not null default '',
  due date, status text not null default 'open', created_at timestamptz not null default now(), done_at timestamptz
);
create table if not exists documents (
  id text primary key, space text not null default 'general', shelf text not null default 'Разное', ref text, name text not null, title text not null default '',
  mime text not null default 'application/octet-stream', size int not null default 0, data bytea, content text, summary text not null default '',
  archived boolean not null default false, created_at timestamptz not null default now()
);
create table if not exists messages (
  id bigserial primary key, thread text not null, role text not null, text text not null default '', meta jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index if not exists messages_thread on messages(thread, id);
create table if not exists payments (
  id text primary key, title text not null, amount numeric not null default 0, currency text not null default 'EUR', category text not null default 'Другое',
  every text not null default 'month', next_due date, notes text not null default '', active boolean not null default true, created_at timestamptz not null default now()
);
create table if not exists payment_log (id bigserial primary key, payment_id text, title text not null, amount numeric not null default 0, currency text not null default 'EUR', category text not null default 'Другое', day date not null default current_date);
create table if not exists labs (
  id text primary key, day date not null, test text not null, value numeric, value_text text not null default '', unit text not null default '',
  ref_low numeric, ref_high numeric, lab text not null default '', doc_id text, note text not null default '', created_at timestamptz not null default now()
);
create index if not exists labs_test on labs(lower(test), day);
alter table aircraft add column if not exists purchase_price numeric;
alter table aircraft add column if not exists purchase_date date;
create table if not exists aircraft_costs (
  id text primary key, aircraft_id text not null references aircraft(id) on delete cascade, kind text not null default 'Другое', title text not null,
  amount numeric not null default 0, day date not null default current_date, created_at timestamptz not null default now()
);
alter table sites add column if not exists city text not null default '';
alter table sites add column if not exists area_m2 numeric;
alter table invoices add column if not exists pay_url text;
alter table invoices add column if not exists pay_link_id text;
alter table aircraft add column if not exists icao24 text;
create table if not exists radar_flights (
  id text primary key, aircraft_id text not null, first_seen timestamptz not null, last_seen timestamptz not null,
  dep text not null default '', arr text not null default '', status text not null default 'new', created_at timestamptz not null default now()
);
create table if not exists comps (
  id text primary key, site_id text not null references sites(id) on delete cascade, title text not null, url text not null default '',
  price numeric, area_m2 numeric, status text not null default 'в продаже', note text not null default '', day date not null default current_date
);
create table if not exists facts (id bigserial primary key, text text not null, created_at timestamptz not null default now());
`;

async function ready() {
  if (!global.__heliReady) {
    global.__heliReady = pool()
      .query(SCHEMA)
      .then(() => undefined)
      .catch((e) => {
        global.__heliReady = undefined;
        throw e;
      });
  }
  return global.__heliReady;
}

export async function q<T extends QueryResultRow = any>(sql: string, params: unknown[] = []): Promise<T[]> {
  await ready();
  const r = await pool().query<T>(sql, params as any[]);
  return r.rows;
}

export async function getSetting<T = any>(key: string): Promise<T | null> {
  const r = await q<{ value: T }>("select value from settings where key=$1", [key]);
  return r[0]?.value ?? null;
}

export async function setSetting(key: string, value: unknown) {
  await q("insert into settings(key,value) values($1,$2) on conflict(key) do update set value=excluded.value", [key, JSON.stringify(value)]);
}

export function newId(prefix = "") {
  return prefix + crypto.randomBytes(5).toString("base64url").replace(/[-_]/g, "x").slice(0, 8).toLowerCase();
}

/** Сегодняшняя дата по Вене (YYYY-MM-DD). */
export function today(tz = "Europe/Vienna") {
  return new Date().toLocaleDateString("sv-SE", { timeZone: tz });
}

export function money(n: unknown, cur = "EUR") {
  const v = Number(n) || 0;
  const s = v.toLocaleString("ru-RU", { minimumFractionDigits: v % 1 ? 2 : 0, maximumFractionDigits: 2 });
  return cur === "EUR" ? `${s} €` : cur === "USD" ? `$${s}` : `${s} ${cur}`;
}

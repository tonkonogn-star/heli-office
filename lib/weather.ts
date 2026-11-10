import { getSetting } from "./db";

export type Base = { name: string; lat: number; lon: number };
export type Hour = { t: string; local?: string; wind: number; gust: number; dir: number; lowCloud: number; vis: number | null; precip: number; code: number; temp: number };
export type Verdict = "GO" | "ОСТОРОЖНО" | "НЕТ";

const KT = 1.943844; // м/с → узлы

/** Погода для пилота: Windy, если вставлен ключ; иначе Open-Meteo (бесплатно, без ключа). */
export async function forecast(base?: Base | null) {
  const b = base || (await getSetting<Base>("base"));
  if (!b) return null;
  const om = await openMeteo(b);
  const key = process.env.WINDY_KEY || (await getSetting<any>("keys"))?.windy;
  let source = "Open-Meteo";
  if (key) {
    try {
      const w = await windy(b, key);
      // ветер, порывы и облачность — из Windy; видимость и явления — из Open-Meteo (их нет в API Windy)
      for (const h of om) {
        const m = w.find((x) => Math.abs(new Date(x.t).getTime() - new Date(h.t).getTime()) < 90 * 60e3);
        if (m) Object.assign(h, { wind: m.wind, gust: m.gust, dir: m.dir, lowCloud: m.lowCloud });
      }
      source = "Windy";
    } catch (e) {
      console.warn("windy", e);
    }
  }
  const now = Date.now();
  const next = om.filter((h) => new Date(h.t).getTime() > now - 3600e3).slice(0, 14);
  return { base: b, source, hours: next.map((h) => ({ ...h, verdict: verdict(h) })), now: next[0] ? { ...next[0], verdict: verdict(next[0]) } : null };
}

/** Подсказка, а не разрешение на вылет: пороги для лёгкого вертолёта, ПВП. */
export function verdict(h: Hour): Verdict {
  const storm = [95, 96, 99].includes(h.code);
  const fog = [45, 48].includes(h.code);
  if (storm || h.wind > 30 || h.gust > 35 || (h.vis !== null && h.vis < 1500) || fog) return "НЕТ";
  if (h.wind > 18 || h.gust > 25 || h.lowCloud > 60 || (h.vis !== null && h.vis < 5000) || h.precip > 2) return "ОСТОРОЖНО";
  return "GO";
}

async function openMeteo(b: Base): Promise<Hour[]> {
  const u = new URL("https://api.open-meteo.com/v1/forecast");
  u.searchParams.set("latitude", String(b.lat));
  u.searchParams.set("longitude", String(b.lon));
  u.searchParams.set("hourly", "wind_speed_10m,wind_gusts_10m,wind_direction_10m,cloud_cover_low,visibility,precipitation,weather_code,temperature_2m");
  u.searchParams.set("wind_speed_unit", "kn");
  u.searchParams.set("forecast_days", "2");
  u.searchParams.set("timezone", "auto");
  const r = await fetch(u, { next: { revalidate: 900 } } as any);
  if (!r.ok) throw new Error("weather " + r.status);
  const j: any = await r.json();
  const H = j.hourly;
  return H.time.map((t: string, i: number) => ({
    t: new Date(Date.parse(t + ":00Z") - (j.utc_offset_seconds || 0) * 1000).toISOString(),
    local: t.slice(11, 16),
    wind: Math.round(H.wind_speed_10m[i]),
    gust: Math.round(H.wind_gusts_10m[i]),
    dir: H.wind_direction_10m[i],
    lowCloud: H.cloud_cover_low[i],
    vis: H.visibility?.[i] ?? null,
    precip: H.precipitation[i],
    code: H.weather_code[i],
    temp: Math.round(H.temperature_2m[i]),
  }));
}

async function windy(b: Base, key: string) {
  const r = await fetch("https://api.windy.com/api/point-forecast/v2", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ lat: b.lat, lon: b.lon, model: "gfs", parameters: ["wind", "windGust", "lclouds"], levels: ["surface"], key }),
  });
  if (!r.ok) throw new Error("windy " + r.status);
  const j: any = await r.json();
  return (j.ts as number[]).map((ts, i) => {
    const u = j["wind_u-surface"][i];
    const v = j["wind_v-surface"][i];
    return {
      t: new Date(ts).toISOString(),
      wind: Math.round(Math.hypot(u, v) * KT),
      gust: Math.round((j["gust-surface"]?.[i] ?? 0) * KT),
      dir: Math.round((Math.atan2(-u, -v) * 180) / Math.PI + 360) % 360,
      lowCloud: Math.round(j["lclouds-surface"]?.[i] ?? 0),
    };
  });
}

/** Поиск места для базы: «Рига», «Киев», название вертодрома. */
export async function geocode(name: string): Promise<Base[]> {
  const u = new URL("https://geocoding-api.open-meteo.com/v1/search");
  u.searchParams.set("name", name);
  u.searchParams.set("count", "5");
  u.searchParams.set("language", "ru");
  const r = await fetch(u);
  if (!r.ok) return [];
  const j: any = await r.json();
  return (j.results || []).map((x: any) => ({ name: [x.name, x.admin1, x.country].filter(Boolean).join(", "), lat: x.latitude, lon: x.longitude }));
}

export function windArrow(dir: number) {
  return ["С", "СВ", "В", "ЮВ", "Ю", "ЮЗ", "З", "СЗ"][Math.round(((dir % 360) / 45)) % 8];
}

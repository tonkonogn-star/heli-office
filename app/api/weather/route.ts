import { guard } from "@/lib/auth";
import { setSetting, getSetting } from "@/lib/db";
import { forecast, geocode, placeName } from "@/lib/weather";

export const dynamic = "force-dynamic";

export const GET = guard(async (req: Request) => {
  const s = new URL(req.url).searchParams.get("find");
  if (s) return Response.json({ places: await geocode(s) });
  return Response.json(await forecast());
});

/** here=true — координаты телефона (обновляются при каждом открытии); иначе — выбранная база. */
export const POST = guard(async (req: Request) => {
  const b = await req.json();
  if (typeof b?.lat !== "number" || typeof b?.lon !== "number") return Response.json({ error: "Нужны координаты" }, { status: 400 });
  if (b.here) {
    const prev = await getSetting<any>("here");
    // название места ищем заново, только если он сместился больше чем на ~5 км
    const moved = !prev || Math.hypot(prev.lat - b.lat, prev.lon - b.lon) > 0.05;
    const name = moved ? await placeName(b.lat, b.lon) : prev.name;
    await setSetting("here", { name, lat: b.lat, lon: b.lon, at: Date.now() });
  } else await setSetting("base", { name: String(b.name || "База"), lat: b.lat, lon: b.lon });
  return Response.json(await forecast());
});

import { guard } from "@/lib/auth";
import { setSetting } from "@/lib/db";
import { forecast, geocode } from "@/lib/weather";

export const dynamic = "force-dynamic";

export const GET = guard(async (req: Request) => {
  const s = new URL(req.url).searchParams.get("find");
  if (s) return Response.json({ places: await geocode(s) });
  return Response.json(await forecast());
});

export const POST = guard(async (req: Request) => {
  const b = await req.json();
  if (typeof b?.lat !== "number" || typeof b?.lon !== "number") return Response.json({ error: "Нужны координаты" }, { status: 400 });
  await setSetting("base", { name: String(b.name || "База"), lat: b.lat, lon: b.lon });
  return Response.json(await forecast());
});

import { isLauncher, deployUrl, movedTo } from "@/lib/launcher";

export const dynamic = "force-dynamic";

/** Кнопка «Установить»: ведёт в Vercel с готовыми настройками. */
export async function GET(req: Request) {
  if (!isLauncher()) return Response.redirect(new URL("/", req.url), 302);
  const m = await movedTo();
  if (m) return Response.redirect(m, 302);
  const h = req.headers;
  const origin = `${h.get("x-forwarded-proto") || "https"}://${h.get("x-forwarded-host") || h.get("host")}`;
  return Response.redirect(deployUrl(origin), 302);
}

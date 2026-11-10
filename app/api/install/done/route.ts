import { isLauncher, rememberMove, movedTo } from "@/lib/launcher";

export const dynamic = "force-dynamic";

/** Vercel возвращает сюда после установки: запоминаем адрес его приложения и сразу отправляем туда. */
export async function GET(req: Request) {
  if (!isLauncher()) return Response.redirect(new URL("/", req.url), 302);
  const u = new URL(req.url).searchParams;
  const name = u.get("project-name");
  const dep = u.get("deployment-url");
  await rememberMove(dep || (name ? `${name}.vercel.app` : ""));
  const to = await movedTo();
  return Response.redirect(to ? to + "/?installed=1" : new URL("/", req.url).toString(), 302);
}

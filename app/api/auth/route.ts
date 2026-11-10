import { isLauncher, movedTo } from "@/lib/launcher";
import { hasPassword, isAuthed, setPassword, checkPassword, startSession, endSession } from "@/lib/auth";

export const dynamic = "force-dynamic";

export async function GET() {
  try {
    // подарочная ссылка Насти: только установка в аккаунты Максима
    if (isLauncher()) return Response.json({ launcher: true, movedTo: await movedTo(), hasPassword: false, authed: false });
    return Response.json({ hasPassword: await hasPassword(), authed: await isAuthed() });
  } catch (e: any) {
    return Response.json({ error: e?.message === "NO_DATABASE" ? "no_db" : String(e?.message || e) }, { status: 503 });
  }
}

export async function POST(req: Request) {
  if (isLauncher()) return Response.json({ error: "Сначала установи приложение себе" }, { status: 400 });
  const { action, password } = await req.json().catch(() => ({}));
  if (action === "logout") {
    await endSession();
    return Response.json({ ok: true });
  }
  const pw = String(password || "");
  if (action === "setup") {
    if (await hasPassword()) return Response.json({ error: "Пароль уже задан" }, { status: 400 });
    if (pw.length < 6) return Response.json({ error: "Пароль — минимум 6 символов" }, { status: 400 });
    await setPassword(pw);
    await startSession();
    return Response.json({ ok: true });
  }
  if (await checkPassword(pw)) {
    await startSession();
    return Response.json({ ok: true });
  }
  await new Promise((r) => setTimeout(r, 800));
  return Response.json({ error: "Неверный пароль" }, { status: 401 });
}

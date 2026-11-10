import { isAuthed } from "@/lib/auth";
import { authUrl } from "@/lib/whoop";

export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  if (!(await isAuthed())) return Response.redirect(new URL("/", req.url), 302);
  try {
    return Response.redirect(await authUrl(req), 302);
  } catch (e: any) {
    return Response.redirect(new URL(`/?msg=${encodeURIComponent(String(e?.message || e))}`, req.url), 302);
  }
}

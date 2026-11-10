import { isAuthed } from "@/lib/auth";
import { exchangeCode, syncWhoop } from "@/lib/whoop";

export const dynamic = "force-dynamic";
export const maxDuration = 120;

export async function GET(req: Request) {
  const u = new URL(req.url);
  const back = (msg: string) => Response.redirect(new URL(`/?msg=${encodeURIComponent(msg)}`, req.url), 302);
  if (!(await isAuthed())) return Response.redirect(new URL("/", req.url), 302);
  const err = u.searchParams.get("error");
  if (err) return back("WHOOP: " + (u.searchParams.get("error_description") || err));
  try {
    await exchangeCode(req, u.searchParams.get("code") || "", u.searchParams.get("state") || "");
    await syncWhoop(30);
    return back("WHOOP подключён");
  } catch (e: any) {
    return back(String(e?.message || e));
  }
}

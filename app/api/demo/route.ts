import { guard } from "@/lib/auth";
import { loadDemo, clearDemo } from "@/lib/demo";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

export const POST = guard(async (req: Request) => {
  const { action } = await req.json();
  if (action === "load") return Response.json(await loadDemo());
  if (action === "clear") {
    await clearDemo();
    return Response.json({ ok: true });
  }
  return Response.json({ error: "action" }, { status: 400 });
});

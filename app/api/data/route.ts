import { guard } from "@/lib/auth";
import { runTool } from "@/lib/tools";

export const dynamic = "force-dynamic";

/** Экраны меняют данные теми же действиями, что и помощник. */
export const POST = guard(async (req: Request) => {
  const { tool, input } = await req.json();
  const r = await runTool(String(tool), input || {});
  return Response.json(r);
});

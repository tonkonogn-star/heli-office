import { stripeEvent } from "@/lib/extra";

export const dynamic = "force-dynamic";

/** Stripe сообщает сюда об оплате счёта картой. */
export async function POST(req: Request) {
  const raw = await req.text();
  const ok = await stripeEvent(raw, req.headers.get("stripe-signature") || "");
  return ok ? Response.json({ received: true }) : new Response("bad signature", { status: 400 });
}

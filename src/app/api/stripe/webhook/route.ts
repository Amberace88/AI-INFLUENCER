import type Stripe from "stripe";
import { NextResponse } from "next/server";
import { periodEnd, planOfSubscription, stripe, stripeConfigured } from "@/lib/billing/stripe";
import { serviceClient } from "@/lib/supabase/admin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Stripe → database. Every handler is idempotent by Stripe event id (billing_events table),
 * so Stripe's automatic retries never grant credits twice.
 *   checkout.session.completed      new subscription, or a credit pack paid
 *   invoice.paid (subscription_cycle) monthly renewal → fresh plan credits
 *   customer.subscription.updated   plan change (new allowance) or status change (past_due …)
 *   customer.subscription.deleted   back to Free; bought packs stay
 */
export async function POST(req: Request) {
  if (!stripeConfigured() || !process.env.STRIPE_WEBHOOK_SECRET) {
    return NextResponse.json({ error: "Stripe is not configured" }, { status: 503 });
  }
  const body = await req.text();
  let event: Stripe.Event;
  try {
    event = stripe().webhooks.constructEvent(body, req.headers.get("stripe-signature") ?? "", process.env.STRIPE_WEBHOOK_SECRET);
  } catch (e) {
    return NextResponse.json({ error: `Bad signature: ${(e as Error).message}` }, { status: 400 });
  }

  try {
    const result = await handle(event);
    return NextResponse.json({ received: true, result });
  } catch (e) {
    // 500 → Stripe retries later; idempotency makes the retry safe
    console.error(`[stripe] ${event.type} ${event.id} failed:`, e);
    return NextResponse.json({ error: (e as Error).message }, { status: 500 });
  }
}

async function handle(event: Stripe.Event): Promise<string> {
  const db = serviceClient();
  const rpc = async (fn: string, args: Record<string, unknown>) => {
    const { data, error } = await db.rpc(fn, args);
    if (error) throw new Error(`${fn}: ${error.message}`);
    return data;
  };
  const subscriptionPeriod = async (sub: Stripe.Subscription, userId: string | undefined) => {
    const uid = userId || sub.metadata?.user_id;
    if (!uid) return "no user on subscription";
    const plan = await planOfSubscription(sub);
    if (!plan) return "unknown plan";
    const customer = typeof sub.customer === "string" ? sub.customer : sub.customer.id;
    const done = await rpc("billing_subscription_period", {
      p_event: event.id, p_user: uid, p_plan: plan, p_customer: customer, p_subscription: sub.id, p_period_end: periodEnd(sub),
    });
    return done ? `plan ${plan} period started` : "duplicate";
  };

  switch (event.type) {
    case "checkout.session.completed": {
      const s = event.data.object;
      const userId = s.metadata?.user_id || s.client_reference_id || undefined;
      const customer = typeof s.customer === "string" ? s.customer : s.customer?.id ?? null;
      if (s.mode === "payment" && s.metadata?.kind === "pack") {
        if (s.payment_status !== "paid") return "pack not paid yet";
        const done = await rpc("billing_pack_paid", { p_event: event.id, p_user: userId, p_pack: s.metadata.pack, p_customer: customer });
        return done ? `pack ${s.metadata.pack} granted` : "duplicate";
      }
      if (s.mode === "subscription" && s.subscription) {
        const subId = typeof s.subscription === "string" ? s.subscription : s.subscription.id;
        return subscriptionPeriod(await stripe().subscriptions.retrieve(subId), userId);
      }
      return "ignored session";
    }

    case "invoice.paid": {
      const inv = event.data.object as Stripe.Invoice & { subscription?: string | Stripe.Subscription | null };
      if (inv.billing_reason !== "subscription_cycle") return `ignored invoice (${inv.billing_reason})`; // first one comes via checkout
      const ref = inv.parent?.subscription_details?.subscription ?? inv.subscription;
      const subId = typeof ref === "string" ? ref : ref?.id;
      if (!subId) return "invoice without subscription";
      return subscriptionPeriod(await stripe().subscriptions.retrieve(subId), undefined);
    }

    case "customer.subscription.updated": {
      const sub = event.data.object;
      const plan = await planOfSubscription(sub);
      const { data: prof } = await db.from("profiles").select("id, plan_id").eq("stripe_subscription_id", sub.id).maybeSingle();
      if (prof && plan && sub.status === "active" && plan !== prof.plan_id) return subscriptionPeriod(sub, prof.id); // upgrade / downgrade
      const done = await rpc("billing_subscription_status", { p_event: event.id, p_subscription: sub.id, p_status: sub.status });
      return done ? `status ${sub.status}` : "no change";
    }

    case "customer.subscription.deleted": {
      const done = await rpc("billing_subscription_status", { p_event: event.id, p_subscription: event.data.object.id, p_status: "canceled" });
      return done ? "canceled → free" : "no change";
    }

    default:
      return `ignored ${event.type}`;
  }
}

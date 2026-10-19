import "server-only";
import Stripe from "stripe";
import { serviceClient } from "@/lib/supabase/admin";

let client: Stripe | null = null;

export function stripeConfigured() {
  return Boolean(process.env.STRIPE_SECRET_KEY);
}
export function stripeTestMode() {
  return (process.env.STRIPE_SECRET_KEY ?? "").startsWith("sk_test_");
}
export function stripe(): Stripe {
  if (!process.env.STRIPE_SECRET_KEY) throw new Error("STRIPE_SECRET_KEY is not set");
  client ??= new Stripe(process.env.STRIPE_SECRET_KEY, { appInfo: { name: "Persona Studio" } });
  return client;
}

type PlanRow = { id: string; name: string; price_eur_incl_vat: number; stripe_price_id: string | null };

/**
 * Monthly Stripe price for a plan. Created on first use (no dashboard setup needed) and
 * found again by lookup key, so a price change in the database creates a new Stripe price.
 */
export async function priceForPlan(plan: PlanRow): Promise<string> {
  const cents = Math.round(Number(plan.price_eur_incl_vat) * 100);
  const lookup = `persona_${plan.id}_${cents}_eur_month`;
  const s = stripe();
  const found = await s.prices.list({ lookup_keys: [lookup], active: true, limit: 1 });
  let priceId = found.data[0]?.id;
  if (!priceId) {
    const product = await s.products.create({ name: `Persona Studio ${plan.name}`, metadata: { plan: plan.id } });
    const price = await s.prices.create({
      product: product.id, currency: "eur", unit_amount: cents, recurring: { interval: "month" },
      tax_behavior: "inclusive", lookup_key: lookup, metadata: { plan: plan.id },
    });
    priceId = price.id;
  }
  if (plan.stripe_price_id !== priceId) await serviceClient().from("plans").update({ stripe_price_id: priceId }).eq("id", plan.id);
  return priceId;
}

/** Period end of a subscription (moved onto the items in newer Stripe API versions). */
export function periodEnd(sub: Stripe.Subscription): string {
  const item = sub.items.data[0] as Stripe.SubscriptionItem & { current_period_end?: number };
  const legacy = (sub as unknown as { current_period_end?: number }).current_period_end;
  const ts = item?.current_period_end ?? legacy;
  return new Date((ts ?? Math.floor(Date.now() / 1000) + 30 * 86400) * 1000).toISOString();
}

/** Which of our plans a subscription is on: by stored price id, else by metadata. */
export async function planOfSubscription(sub: Stripe.Subscription): Promise<string | null> {
  const priceId = sub.items.data[0]?.price?.id;
  if (priceId) {
    const { data } = await serviceClient().from("plans").select("id").eq("stripe_price_id", priceId).maybeSingle();
    if (data?.id) return data.id;
  }
  const meta = sub.items.data[0]?.price?.metadata?.plan || sub.metadata?.plan;
  return meta || null;
}

"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/supabase/server";
import { priceForPlan, stripe, stripeConfigured } from "@/lib/billing/stripe";
import type { ActionResult } from "../actions";

const NOT_READY = "Payments are not switched on yet. Ask the admin to add the Stripe keys.";

async function origin() {
  const h = await headers();
  const host = h.get("x-forwarded-host") ?? h.get("host") ?? "localhost:3000";
  const proto = h.get("x-forwarded-proto") ?? (host.startsWith("localhost") || host.startsWith("127.") ? "http" : "https");
  return `${proto}://${host}`;
}

async function billingProfile() {
  const { supabase, user } = await requireUser();
  const { data: prof } = await supabase
    .from("profiles").select("plan_id, plan_status, stripe_customer_id, stripe_subscription_id").eq("id", user.id).maybeSingle();
  return { supabase, user, prof };
}

/** Subscribe to a plan, or switch the plan of an existing subscription (prorated). */
export async function choosePlan(planId: string): Promise<ActionResult> {
  if (!stripeConfigured()) return { ok: false, error: NOT_READY };
  const { supabase, user, prof } = await billingProfile();
  const { data: plan } = await supabase.from("plans").select("id, name, price_eur_incl_vat, stripe_price_id").eq("id", planId).maybeSingle();
  if (!plan || Number(plan.price_eur_incl_vat) <= 0) return { ok: false, error: "Choose a paid plan. To stop paying, use “Manage subscription”." };
  if (prof?.plan_id === plan.id && prof?.stripe_subscription_id) return { ok: false, error: `You are already on ${plan.name}.` };

  const price = await priceForPlan(plan);
  const s = stripe();

  if (prof?.stripe_subscription_id) {
    const sub = await s.subscriptions.retrieve(prof.stripe_subscription_id);
    if (sub.status === "active" || sub.status === "past_due") {
      await s.subscriptions.update(sub.id, {
        items: [{ id: sub.items.data[0].id, price }],
        proration_behavior: "always_invoice",
        metadata: { user_id: user.id, plan: plan.id },
      });
      return { ok: true, message: `Switching to ${plan.name}. Your new monthly credits appear in a few seconds.` };
    }
  }

  const base = await origin();
  const session = await s.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price, quantity: 1 }],
    client_reference_id: user.id,
    ...(prof?.stripe_customer_id ? { customer: prof.stripe_customer_id } : { customer_email: user.email ?? undefined }),
    metadata: { user_id: user.id, plan: plan.id, kind: "plan" },
    subscription_data: { metadata: { user_id: user.id, plan: plan.id } },
    allow_promotion_codes: true,
    success_url: `${base}/app/billing?paid=plan`,
    cancel_url: `${base}/app/billing`,
  });
  if (!session.url) return { ok: false, error: "Stripe did not return a checkout page." };
  redirect(session.url);
}

/** One-off credit pack. These credits do not expire at the end of the month. */
export async function buyPack(packId: string): Promise<ActionResult> {
  if (!stripeConfigured()) return { ok: false, error: NOT_READY };
  const { supabase, user, prof } = await billingProfile();
  if (!prof || prof.plan_id === "free") return { ok: false, error: "Credit packs are for Starter, Pro and Business plans." };
  const { data: pack } = await supabase.from("credit_packs").select("id, credits, price_eur_incl_vat").eq("id", packId).eq("active", true).maybeSingle();
  if (!pack) return { ok: false, error: "This pack is not available." };

  const base = await origin();
  const session = await stripe().checkout.sessions.create({
    mode: "payment",
    line_items: [{
      quantity: 1,
      price_data: {
        currency: "eur", unit_amount: Math.round(Number(pack.price_eur_incl_vat) * 100), tax_behavior: "inclusive",
        product_data: { name: `${pack.credits} extra credits`, description: "Persona Studio credits. They stay until you use them." },
      },
    }],
    client_reference_id: user.id,
    ...(prof.stripe_customer_id ? { customer: prof.stripe_customer_id } : { customer_email: user.email ?? undefined, customer_creation: "always" as const }),
    metadata: { user_id: user.id, pack: pack.id, kind: "pack" },
    success_url: `${base}/app/billing?paid=pack`,
    cancel_url: `${base}/app/billing`,
  });
  if (!session.url) return { ok: false, error: "Stripe did not return a checkout page." };
  redirect(session.url);
}

/** Stripe's own page for card, invoices and cancelling. */
export async function openPortal(): Promise<ActionResult> {
  if (!stripeConfigured()) return { ok: false, error: NOT_READY };
  const { prof } = await billingProfile();
  if (!prof?.stripe_customer_id) return { ok: false, error: "You have no payments yet." };
  try {
    const session = await stripe().billingPortal.sessions.create({ customer: prof.stripe_customer_id, return_url: `${await origin()}/app/billing` });
    redirect(session.url);
  } catch (e) {
    if ((e as { digest?: string }).digest?.startsWith("NEXT_REDIRECT")) throw e;
    return { ok: false, error: `Stripe: ${(e as Error).message}` };
  }
}

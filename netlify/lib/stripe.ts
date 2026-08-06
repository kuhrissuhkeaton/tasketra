import Stripe from "stripe";
import { getEnv } from "./env.ts";

let client: Stripe | null = null;

export function stripe(): Stripe {
  if (client) return client;
  const key = getEnv("STRIPE_SECRET_KEY");
  if (!key) throw new Error("STRIPE_SECRET_KEY is not configured.");
  client = new Stripe(key);
  return client;
}

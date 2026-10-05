import crypto from 'node:crypto';
﻿import DodoPayments from "dodopayments";

const json = (body, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json" }
  });

export default async function handler(request) {
  if (request.method !== "POST") {
    return json({ error: "Method not allowed" }, 405);
  }

  try {
    const apiKey = process.env.DODO_PAYMENTS_API_KEY;
    const productId = process.env.DODO_PRODUCT_ID;
    const siteUrl = process.env.URL || process.env.DEPLOY_URL;

    if (!apiKey || !productId || !siteUrl) {
      return json({
        error: "Dodo checkout is not configured yet."
      }, 503);
    }

    const supabaseUrl = process.env.SUPABASE_URL;
    const anonKey = process.env.SUPABASE_ANON_KEY;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !anonKey || !serviceKey) {
      return json({ error: "Payment service is not configured." }, 503);
    }

    const token = request.headers.get("authorization")
      ?.replace(/^Bearer\s+/i, "");

    if (!token) {
      return json({ error: "Authentication required." }, 401);
    }

    const authResponse = await fetch(
      `${supabaseUrl}/auth/v1/user`,
      { headers: {
        apikey: anonKey,
        Authorization: `Bearer ${token}`
      }}
    );

    if (!authResponse.ok) {
      return json({ error: "Authentication required." }, 401);
    }

    const user = await authResponse.json();
    if (!user?.id || !user?.email) {
      return json({ error: "User email is required." }, 400);
    }

    const rate = Number(process.env.DODO_USD_TO_GHS_RATE);
    const usdAmount = Number(process.env.DODO_DEPOSIT_USD_AMOUNT);

    if (!Number.isFinite(rate) || rate <= 0 ||
        !Number.isFinite(usdAmount) || usdAmount <= 0) {
      return json({
        error: "Set DODO_USD_TO_GHS_RATE and DODO_DEPOSIT_USD_AMOUNT before enabling checkout."
      }, 503);
    }

    const ghsAmount = Number((usdAmount * rate).toFixed(2));
    const reference = `DD-${crypto.randomUUID()}`;

    const intentResponse = await fetch(
      `${supabaseUrl}/rest/v1/rpc/create_dodo_payment_intent`,
      {
        method: "POST",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          p_user_id: user.id,
          p_amount: ghsAmount.toFixed(2),
          p_reference: reference,

          p_metadata: {
            provider: "dodo",
            user_email: user.email,
            usd_amount: usdAmount,
            exchange_rate: rate
          }
        })
      }
    );

    if (!intentResponse.ok) {
      throw new Error("Could not create payment intent.");
    }

    const intentId = await intentResponse.json();

    const client = new DodoPayments({
      bearerToken: apiKey,
      environment: process.env.DODO_PAYMENTS_ENVIRONMENT || "live_mode"
    });

    const session = await client.checkoutSessions.create({
      product_cart: [{ product_id: productId, quantity: 1 }],
      customer: { email: user.email },
      return_url: `${siteUrl}/?payment=dodo-return`,
      metadata: {
        user_id: user.id,
        payment_intent_id: intentId,
        reference,
        usd_amount: String(usdAmount),
        ghs_amount: String(ghsAmount),
        exchange_rate: String(rate)
      }
    });

    const checkoutUrl = session.url;
    if (!checkoutUrl) {
      throw new Error("Dodo did not return a checkout URL.");
    }

    const update = await fetch(
      `${supabaseUrl}/rest/v1/payment_intents?reference=eq.${encodeURIComponent(reference)}`,
      {
        method: "PATCH",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json",
          Prefer: "return=minimal"
        },
        body: JSON.stringify({
          checkout_url: checkoutUrl,
          metadata: {
            provider: "dodo",
            user_email: user.email,
            usd_amount: usdAmount,
            exchange_rate: rate,
            payment_intent_id: intentId
          }
        })
      }
    );

    if (!update.ok) {
      throw new Error("Could not save checkout URL.");
    }

    return json({
      accepted: true,
      reference,
      payment_intent_id: intentId,
      checkout_url: checkoutUrl
    }, 201);
  } catch (error) {
    console.error("[DODO CHECKOUT]", error);
    return json({ error: "Unable to start Dodo checkout." }, 500);
  }
}


import DodoPayments from "dodopayments";

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
    const webhookSecret = process.env.DODO_WEBHOOK_SECRET;
    const environment =
      process.env.DODO_PAYMENTS_ENVIRONMENT || "live_mode";
    const supabaseUrl = process.env.SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!apiKey || !webhookSecret || !supabaseUrl || !serviceKey) {
      return json({ error: "Webhook is not configured." }, 503);
    }

    const rawBody = await request.text();
    const client = new DodoPayments({
      bearerToken: apiKey,
      environment,
      webhookKey: webhookSecret
    });

    const payload = client.webhooks.unwrap(rawBody, {
      headers: {
        "webhook-id": request.headers.get("webhook-id") || "",
        "webhook-signature": request.headers.get("webhook-signature") || "",
        "webhook-timestamp": request.headers.get("webhook-timestamp") || ""
      }
    });

    if (payload.type !== "payment.succeeded") {
      return json({ accepted: true, ignored: true });
    }

    const payment = payload.data;
    const metadata = payment?.metadata || {};
    const reference = metadata.reference;
    const paymentId = payment?.payment_id;
    const currency = String(payment?.currency || "").toUpperCase();
    const usdAmount = Number(metadata.usd_amount);
    const ghsAmount = Number(metadata.ghs_amount);
    const rate = Number(metadata.exchange_rate);

    if (
      !reference ||
      !paymentId ||
      currency !== "USD" ||
      !Number.isFinite(payment.total_amount) ||
      !Number.isFinite(usdAmount) ||
      !Number.isFinite(ghsAmount) ||
      !Number.isFinite(rate) ||
      usdAmount <= 0 ||
      rate <= 0 ||
      ghsAmount <= 0
    ) {
      return json({ error: "Invalid payment details." }, 400);
    }

    // Dodo reports total_amount in cents for USD.
    const actualUsd = Number((payment.total_amount / 100).toFixed(2));
    const expectedGhs = Number((usdAmount * rate).toFixed(2));

    if (
      Math.abs(actualUsd - usdAmount) > 0.01 ||
      Math.abs(expectedGhs - ghsAmount) > 0.01
    ) {
      console.error("[DODO WEBHOOK] Amount mismatch", {
        reference,
        actualUsd,
        expectedUsd: usdAmount
      });
      return json({ error: "Payment amount mismatch." }, 400);
    }

    const response = await fetch(
      `${supabaseUrl}/rest/v1/rpc/settle_dodo_deposit`,
      {
        method: "POST",
        headers: {
          apikey: serviceKey,
          Authorization: `Bearer ${serviceKey}`,
          "Content-Type": "application/json"
        },
        body: JSON.stringify({
          p_reference: reference,
          p_provider_amount_ghs: ghsAmount,
          p_event_type: payload.type,
          p_event_reference: paymentId,
          p_payload: payload
        })
      }
    );

    const resultText = await response.text();

    if (!response.ok) {
      console.error("[DODO WEBHOOK] Settlement failed:", resultText);
      return json({ error: "Wallet settlement failed." }, 500);
    }

    return json({
      accepted: true,
      result: resultText ? JSON.parse(resultText) : null
    });
  } catch (error) {
    console.error("[DODO WEBHOOK] Error:", error);
    return json({ error: "Webhook verification or processing failed." }, 400);
  }
}


export const arkeselWebhookSchema = {
  $schema: "http://json-schema.org",
  title: "ArkeselPaymentWebhook",
  type: "object",
  required: ["transaction_id", "status", "amount", "reference"],
  properties: {
    transaction_id: { type: "string" },
    status: { type: "string", enum: ["success", "failed"] },
    amount: { type: "number" },
    customer_phone: { type: "string" },
    reference: { type: "string" }
  }
};

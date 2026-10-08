import crypto from "node:crypto";

const API = "https://api.razorpay.com/v1";

function basicAuth() {
  const pair = `${process.env.RAZORPAY_KEY_ID}:${process.env.RAZORPAY_KEY_SECRET}`;
  return "Basic " + Buffer.from(pair).toString("base64");
}

export async function createProviderOrder(amountPaise: number, receipt: string) {
  const res = await fetch(`${API}/orders`, {
    method: "POST",
    headers: { Authorization: basicAuth(), "Content-Type": "application/json" },
    body: JSON.stringify({ amount: amountPaise, currency: "INR", receipt }),
  });
  if (!res.ok) throw new Error(`razorpay order create failed (${res.status})`);
  const body = (await res.json()) as { id: string };
  return { providerOrderId: body.id };
}

export function verifyWebhookSignature(rawBody: string, signature: string | null) {
  if (!signature) return false;
  const expected = crypto
    .createHmac("sha256", process.env.RAZORPAY_WEBHOOK_SECRET ?? "")
    .update(rawBody)
    .digest("hex");
  const a = Buffer.from(expected);
  const b = Buffer.from(signature);
  return a.length === b.length && crypto.timingSafeEqual(a, b);
}

import crypto from "node:crypto";

// The token is derived from the order id and a stored nonce, so the student's
// QR page can show it again later while the database only keeps its hash.
const mac = (orderId: string, nonce: string) =>
  crypto.createHmac("sha256", process.env.AUTH_SECRET ?? "").update(`${orderId}:${nonce}`).digest("base64url");

export const sha = (token: string) => crypto.createHash("sha256").update(token).digest("hex");

export function newPickupToken(orderId: string) {
  const nonce = crypto.randomBytes(16).toString("hex");
  const token = mac(orderId, nonce);
  return { nonce, tokenHash: sha(token) };
}

export const tokenFor = mac;

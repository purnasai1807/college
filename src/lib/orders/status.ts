import type { OrderStatus } from "@prisma/client";

const moves: Record<OrderStatus, OrderStatus[]> = {
  CREATED: ["PAYMENT_PENDING", "CANCELLED"],
  PAYMENT_PENDING: ["PAID", "CANCELLED"],
  PAID: ["ACCEPTED", "REFUND_PENDING"],
  ACCEPTED: ["PREPARING", "REFUND_PENDING"],
  PREPARING: ["READY"],
  READY: ["COLLECTED"],
  COLLECTED: [],
  CANCELLED: ["REFUND_PENDING"],
  REFUND_PENDING: ["REFUNDED"],
  REFUNDED: [],
};

export const canMove = (from: OrderStatus, to: OrderStatus) => moves[from].includes(to);

import jwt from "jsonwebtoken";
import { env } from "../config.js";

type ReceiptTokenPayload = {
  scope: "receipt";
  orderId: string;
  orderNumber: string;
};

export function signReceiptToken(payload: Omit<ReceiptTokenPayload, "scope">) {
  return jwt.sign({ ...payload, scope: "receipt" }, env.JWT_SECRET, { expiresIn: "30d" });
}

export function verifyReceiptToken(token: string) {
  const payload = jwt.verify(token, env.JWT_SECRET) as Partial<ReceiptTokenPayload>;
  if (payload.scope !== "receipt" || !payload.orderId || !payload.orderNumber) {
    throw new Error("Invalid receipt token.");
  }

  return payload as ReceiptTokenPayload;
}

import webPush from "web-push";
import { env } from "../config.js";
import { prisma } from "./prisma.js";

const hasVapidConfiguration = Boolean(env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY);

if (hasVapidConfiguration) {
  webPush.setVapidDetails(
    env.VAPID_SUBJECT ?? "mailto:hello@pocketshawarma.com",
    env.VAPID_PUBLIC_KEY!,
    env.VAPID_PRIVATE_KEY!
  );
}

export function getDeliveryPushConfiguration() {
  return {
    enabled: hasVapidConfiguration,
    publicKey: hasVapidConfiguration ? env.VAPID_PUBLIC_KEY! : null
  };
}

async function sendStaffPush(payload: string) {
  const subscriptions = await prisma.pushSubscription.findMany({
    select: {
      id: true,
      endpoint: true,
      p256dh: true,
      auth: true
    }
  });

  await Promise.all(
    subscriptions.map(async (subscription) => {
      try {
        await webPush.sendNotification(
          {
            endpoint: subscription.endpoint,
            keys: {
              p256dh: subscription.p256dh,
              auth: subscription.auth
            }
          },
          payload,
          { TTL: 60 * 60, urgency: "high" }
        );
      } catch (error) {
        const statusCode = typeof error === "object" && error && "statusCode" in error ? Number(error.statusCode) : 0;
        if (statusCode === 404 || statusCode === 410) {
          await prisma.pushSubscription.delete({ where: { id: subscription.id } }).catch(() => null);
          return;
        }
        console.error("Failed to send delivery push notification", error);
      }
    })
  );
}

export async function notifyStaffAboutNewDelivery(input: { orderId: string; orderNumber: string; branchName: string; customerName: string | null }) {
  if (!hasVapidConfiguration) return;

  await sendStaffPush(JSON.stringify({
    type: "delivery-pending",
    title: "New Pocket delivery order",
    body: `${input.orderNumber} from ${input.customerName ?? "a customer"} needs acceptance at ${input.branchName}.`,
    orderId: input.orderId,
    orderNumber: input.orderNumber,
    url: "/admin/delivery"
  }));
}

export async function clearStaffDeliveryPush(orderId: string) {
  if (!hasVapidConfiguration) return;
  await sendStaffPush(JSON.stringify({ type: "delivery-resolved", orderId }));
}

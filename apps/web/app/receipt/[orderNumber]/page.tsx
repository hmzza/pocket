import { ReceiptView } from "@/components/pos/receipt-view";

export default function PublicReceiptPage({
  params,
  searchParams
}: {
  params: { orderNumber: string };
  searchParams: { token?: string };
}) {
  return <ReceiptView orderId={params.orderNumber} publicToken={searchParams.token} />;
}

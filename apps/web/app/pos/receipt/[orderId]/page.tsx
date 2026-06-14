import { ReceiptView } from "@/components/pos/receipt-view";

export default function PosReceiptPage({ params }: { params: { orderId: string } }) {
  return <ReceiptView orderId={params.orderId} />;
}

const FBR_REFERENCE_NUMBER = "8816692-5";

export function formatOrderForReceipt(order: any) {
  const taxRate = 0;
  const grossTotal = Number(order.subtotal);
  const discountAmount = Number(order.discountAmount);
  const totalTax = 0;
  const netTotal = Number(order.totalAmount);

  return {
    id: order.id,
    receiptNumber: order.orderNumber,
    orderNumber: order.orderNumber,
    fbrReferenceNumber: FBR_REFERENCE_NUMBER,
    posNo: "001",
    userId: order.cashierId ?? "Admin",
    channel: order.channel,
    orderSource: order.orderSource,
    serviceType: order.serviceType,
    orderType: order.serviceType,
    status: order.status,
    customerName: order.customerName ?? order.customer?.name ?? "Walk-in Customer",
    customerPhone: order.customerPhone ?? order.customer?.phone ?? null,
    paymentMethod: order.paymentMethod,
    paymentStatus: order.paymentStatus,
    createdAt: order.placedAt,
    subtotal: grossTotal,
    grossTotal,
    discountAmount,
    serviceFee: 0,
    taxRate,
    totalTax,
    netTotal,
    taxAmount: totalTax,
    totalAmount: netTotal,
    paidAmount: Number(order.cashReceivedAmount ?? order.totalAmount),
    changeDueAmount: Number(order.changeDueAmount ?? 0),
    placedAt: order.placedAt,
    branch: {
      id: order.branch.id,
      name: order.branch.name,
      addressLine1: order.branch.addressLine1,
      phone: order.branch.phone
    },
    items: order.items.map((item: any) => ({
      id: item.id,
      productName: item.productName,
      customDescription: item.customDescription ?? null,
      quantity: item.quantity,
      unitPrice: Number(item.unitPrice),
      taxRate,
      taxAmount: 0,
      lineTotal: Number((Number(item.unitPrice) * item.quantity).toFixed(2)),
      note: item.note ?? null,
      addOns: item.addOns.map((addOn: any) => ({
        id: addOn.id,
        optionName: addOn.optionName,
        priceDelta: Number(addOn.priceDelta)
      }))
    }))
  };
}

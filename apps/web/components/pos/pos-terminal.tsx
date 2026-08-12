"use client";

import Image from "next/image";
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { CalendarDays, Car, Minus, PencilLine, Plus, Receipt, Search, Send, ShoppingBag, Trash2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { PosOrderQueue } from "@/components/pos/order-queue";
import { PosToolbar } from "@/components/pos/pos-toolbar";
import { createPosOrder, fetchPosCatalog, fetchPosOrderByNumber, fetchPosPromotion, fetchPosSession, getPosReceiptCacheKey, lookupPosCustomer, updatePosOrder } from "@/lib/pos-client";
import type { AddOnGroup, PosCatalogProduct, PosCustomerLookup, PosEditableOrder, PosPromotion, PosReceiptOrder } from "@/lib/types";
import { cn, formatCompactCurrency, formatCurrency, getCurrentBusinessDateKey } from "@/lib/utils";

type TicketLine = {
  id: string;
  type: "product" | "manual";
  productId?: string;
  name: string;
  categoryName: string;
  quantity: number;
  unitPrice: number;
  customDescription?: string;
  selections: Array<{ groupId: string; optionIds: string[] }>;
  bundleComponents: Array<{ productId: string; productName: string; quantity: number }>;
  addOns: Array<{ id: string; name: string; priceDelta: number }>;
  promotionFreeQuantity?: number;
};

type ProductSelection = { groupId: string; optionIds: string[] };

type PaymentOptionValue = "CASH" | "EASYPAISA" | "JAZZCASH" | "FOODPANDA_PAYOUT";
type ServiceTypeValue = "INSHOP" | "TAKEAWAY" | "FOODPANDA";
type ServiceTypeSelection = ServiceTypeValue | "";

const basePaymentOptions = [
  { value: "CASH", label: "Cash", logo: "/images/cash-logo.png" },
  { value: "EASYPAISA", label: "Easypaisa", logo: "/images/easypaisa-logo.png" },
  { value: "JAZZCASH", label: "JazzCash", logo: "/images/jazz-cash-logo.png" }
] as const;

const foodpandaPaymentOption = { value: "FOODPANDA_PAYOUT", label: "Foodpanda payout", logo: "/images/foodpanda-logo.png" } as const;

const serviceTypes = [
  { value: "INSHOP", label: "Dine-in", logo: "/images/instore-logo.png" },
  { value: "TAKEAWAY", label: "Takeaway", icon: Car },
  { value: "FOODPANDA", label: "Foodpanda", logo: "/images/foodpanda-logo.png" }
] as const;

function getLocalDateInputValue(date = new Date()) {
  return getCurrentBusinessDateKey(date);
}

function buildIsoFromDateInput(value: string) {
  if (!value) return "";
  return new Date(`${value}T12:00:00+05:00`).toISOString();
}

function buildDefaultSelections(groups: AddOnGroup[]) {
  return normalizeSelections(
    groups.map((group) => ({
      groupId: group.id,
      optionIds: group.options.slice(0, group.minSelect).map((option) => option.id)
    }))
  );
}

function normalizeSelections(selections: ProductSelection[]) {
  const normalized = new Map<string, string[]>();

  for (const selection of selections) {
    const optionIds = [...new Set(selection.optionIds.filter(Boolean))];
    if (!optionIds.length) {
      continue;
    }

    normalized.set(selection.groupId, optionIds);
  }

  return Array.from(normalized.entries()).map(([groupId, optionIds]) => ({
    groupId,
    optionIds
  }));
}

function toggleSelectionOption(selections: ProductSelection[], group: AddOnGroup, optionId: string) {
  const existing = selections.find((entry) => entry.groupId === group.id);
  const currentIds = existing?.optionIds ?? [];
  const optionExists = currentIds.includes(optionId);
  const nextOptionIds = optionExists
    ? currentIds.filter((id) => id !== optionId)
    : [...currentIds, optionId].slice(-group.maxSelect);

  return normalizeSelections([
    ...selections.filter((entry) => entry.groupId !== group.id),
    {
      groupId: group.id,
      optionIds: nextOptionIds
    }
  ]);
}

function calculateLinePrice(product: PosCatalogProduct, selections: ProductSelection[]) {
  const selected = selections.flatMap((selection) => {
    const group = product.addOnGroups.find((entry) => entry.id === selection.groupId);
    return (group?.options ?? []).filter((option) => selection.optionIds.includes(option.id));
  });

  return {
    unitPrice: product.price + selected.reduce((sum, option) => sum + option.priceDelta, 0),
    addOns: selected.map((option) => ({
      id: option.id,
      name: option.name,
      priceDelta: option.priceDelta
    }))
  };
}

function parsePositiveInteger(value: string, fallback = 1) {
  const parsed = Number.parseInt(value.replace(/\D/g, ""), 10);
  return Number.isFinite(parsed) ? Math.max(1, parsed) : fallback;
}

function parseMoney(value: string) {
  const parsed = Number(value.replace(/[^\d.]/g, ""));
  return Number.isFinite(parsed) ? parsed : 0;
}

function formatWhatsAppPhone(value: string) {
  const digits = value.replace(/\D/g, "");
  if (!digits) return "";
  if (digits.startsWith("00")) return digits.slice(2);
  if (digits.startsWith("92")) return digits;
  if (digits.startsWith("0")) return `92${digits.slice(1)}`;
  if (digits.length === 10 && digits.startsWith("3")) return `92${digits}`;
  return digits;
}

function formatPaymentMethod(value: string) {
  const map: Record<string, string> = {
    CASH: "Cash",
    CASH_ON_DELIVERY: "Cash on Delivery",
    CARD: "Card",
    ONLINE: "Online",
    JAZZCASH: "JazzCash",
    EASYPAISA: "Easypaisa",
    FOODPANDA_PAYOUT: "Foodpanda payout"
  };

  return map[value] ?? value.replaceAll("_", " ");
}

function getPaymentOptions(serviceType: ServiceTypeSelection) {
  if (!serviceType) return [];
  return serviceType === "FOODPANDA" ? [foodpandaPaymentOption] : basePaymentOptions;
}

function formatServiceType(value: string) {
  const map: Record<string, string> = {
    INSHOP: "Dine-in",
    FOODPANDA: "Foodpanda",
    TAKEAWAY: "Takeaway",
    DINE_IN: "Dine-in",
    DELIVERY: "Delivery"
  };

  return map[value] ?? value.replaceAll("_", " ");
}

function formatReceiptDateTime(value: string) {
  const date = new Date(value);
  return {
    date: new Intl.DateTimeFormat("en-PK", { timeZone: "Asia/Karachi", day: "2-digit", month: "short", year: "numeric" }).format(date),
    time: new Intl.DateTimeFormat("en-PK", { timeZone: "Asia/Karachi", hour: "2-digit", minute: "2-digit" }).format(date)
  };
}

function buildWhatsAppReceiptMessage(order: PosReceiptOrder) {
  const receiptMeta = formatReceiptDateTime(order.placedAt ?? order.createdAt);
  const lines = [
    "POCKET",
    order.branch.name,
    order.branch.addressLine1,
    `Phone: ${order.branch.phone}`,
    "",
    "Purchase Receipt",
    `Receipt No: ${order.receiptNumber}`,
    `Order ID: ${order.id}`,
    ...(order.foodpandaOrderNumber ? [`Foodpanda Order: ${order.foodpandaOrderNumber}`] : []),
    `Date: ${receiptMeta.date}`,
    `Time: ${receiptMeta.time}`,
    `Customer: ${order.customerName || "Walk-in"}`,
    `Order Type: ${formatServiceType(order.orderType)}`,
    `Payment: ${formatPaymentMethod(order.paymentMethod)}`,
    "",
    "Items"
  ];

  order.items.forEach((item, index) => {
    lines.push(`${index + 1}. ${item.productName}`);
    if (item.customDescription) {
      lines.push(`   ${item.customDescription}`);
    }
    if (item.bundleComponents.length) {
      lines.push(`   Contains: ${formatBundleSummary(item.bundleComponents)}`);
    }
    if (item.addOns.length) {
      lines.push(`   ${item.addOns.map((addOn) => addOn.optionName).join(", ")}`);
    }
    lines.push(`   ${formatCurrency(item.unitPrice)} x ${item.quantity} = ${formatCurrency(item.unitPrice * item.quantity)}`);
  });

  lines.push(
    "",
    `Gross Total: ${formatCurrency(order.grossTotal)}`,
    `Discount: ${formatCurrency(order.discountAmount)}`,
    `Total: ${formatCurrency(order.netTotal)}`,
    "",
    "Thank you for your visit.",
    `For complaints & queries: ${order.branch.phone}`
  );

  return lines.join("\n");
}

function buildTicketSignature(input: {
  type: "product" | "manual";
  productId?: string;
  name: string;
  customDescription?: string;
  unitPrice: number;
  selections: ProductSelection[];
}) {
  if (input.type === "manual") {
    return `manual:${input.name.trim().toLowerCase()}:${input.customDescription?.trim().toLowerCase() ?? ""}:${input.unitPrice.toFixed(2)}`;
  }

  const selections = normalizeSelections(input.selections)
    .map((selection) => `${selection.groupId}:${selection.optionIds.slice().sort().join(",")}`)
    .sort()
    .join("|");
  return `product:${input.productId}:${selections}`;
}

function mergeTicketLine(lines: TicketLine[], nextLine: TicketLine) {
  const nextSignature = buildTicketSignature(nextLine);
  const existingIndex = lines.findIndex((line) => buildTicketSignature(line) === nextSignature);
  if (existingIndex === -1) {
    return [...lines, nextLine];
  }

  return lines.map((line, index) => index === existingIndex ? { ...line, quantity: line.quantity + nextLine.quantity } : line);
}

function synchronizeIndependenceOffer(lines: TicketLine[], promotion: PosPromotion | null, serviceType: ServiceTypeSelection, products: PosCatalogProduct[]) {
  const eligible = promotion?.isActive && promotion.available && promotion.rewardProductId && promotion.appliesTo.includes(serviceType) ? promotion : null;
  const eligibleQuantity = eligible
    ? lines.reduce((total, line) => total + (line.type === "product" && products.find((product) => product.id === line.productId)?.categorySlug === "shawarma" ? line.quantity : 0), 0)
    : 0;
  const desiredFreeQuantity = eligible ? Math.floor(eligibleQuantity / eligible.threshold) : 0;
  let remainingFreeQuantity = desiredFreeQuantity;
  let changed = false;
  const nextLines = lines.flatMap((line) => {
    if (line.type !== "product" || line.productId !== promotion?.rewardProductId || line.selections.length || line.addOns.length) return [line];
    const previousFreeQuantity = line.promotionFreeQuantity ?? 0;
    const paidQuantity = Math.max(0, line.quantity - previousFreeQuantity);
    const freeQuantity = Math.min(desiredFreeQuantity, remainingFreeQuantity);
    remainingFreeQuantity -= freeQuantity;
    const nextQuantity = paidQuantity + freeQuantity;
    if (nextQuantity !== line.quantity || freeQuantity !== previousFreeQuantity) changed = true;
    if (!nextQuantity) return [];
    return [{ ...line, quantity: nextQuantity, promotionFreeQuantity: freeQuantity || undefined }];
  });

  if (remainingFreeQuantity > 0 && eligible?.rewardProductId) {
    const rewardProduct = products.find((product) => product.id === eligible.rewardProductId);
    if (rewardProduct) {
      changed = true;
      nextLines.push({
        id: `promotion-${eligible.rewardProductId}`,
        type: "product",
        productId: rewardProduct.id,
        name: rewardProduct.name,
        categoryName: rewardProduct.categoryName,
        quantity: remainingFreeQuantity,
        unitPrice: rewardProduct.price,
        selections: [],
        bundleComponents: rewardProduct.bundleComponents,
        addOns: [],
        promotionFreeQuantity: remainingFreeQuantity
      });
    }
  }

  return changed ? nextLines : lines;
}

function formatBundleSummary(components: Array<{ productName: string; quantity: number }>, multiplier = 1) {
  return components.map((component) => `${component.quantity * multiplier}x ${component.productName}`).join(", ");
}

function buildSelectionsFromEditableItem(item: PosEditableOrder["items"][number]) {
  const groups = item.product?.addOnGroups ?? [];
  const groupByOptionId = new Map<string, string>();

  for (const group of groups) {
    for (const option of group.options ?? []) {
      groupByOptionId.set(option.id, group.id);
    }
  }

  const selections = new Map<string, string[]>();
  for (const addOn of item.addOns ?? []) {
    const groupId = groupByOptionId.get(addOn.optionId);
    if (!groupId) {
      continue;
    }

    const current = selections.get(groupId) ?? [];
    if (!current.includes(addOn.optionId)) {
      selections.set(groupId, [...current, addOn.optionId]);
    }
  }

  return Array.from(selections.entries()).map(([groupId, optionIds]) => ({
    groupId,
    optionIds
  }));
}

function mapEditableOrderToTicket(order: PosEditableOrder): TicketLine[] {
  return order.items.map((item) => ({
    id: crypto.randomUUID(),
    type: item.productId ? "product" : "manual",
    productId: item.productId ?? undefined,
    name: item.productName,
    categoryName: item.categoryName,
    quantity: item.quantity,
    promotionFreeQuantity: item.promotionFreeQuantity,
    unitPrice: item.unitPrice,
    customDescription: item.customDescription ?? undefined,
    selections: item.selections?.length ? item.selections : buildSelectionsFromEditableItem(item),
    bundleComponents: item.bundleComponents.map((component) => ({
      productId: component.productId,
      productName: component.productName,
      quantity: component.quantity
    })),
    addOns: item.addOns.map((addOn) => ({
      id: addOn.id,
      name: addOn.optionName,
      priceDelta: addOn.priceDelta
    }))
  }));
}

export function PosTerminal() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [products, setProducts] = useState<PosCatalogProduct[]>([]);
  const [promotion, setPromotion] = useState<PosPromotion | null>(null);
  const [sessionUser, setSessionUser] = useState<Awaited<ReturnType<typeof fetchPosSession>>["user"] | null>(null);
  const [branchId, setBranchId] = useState("");
  const [categoryId, setCategoryId] = useState("ALL");
  const [search, setSearch] = useState("");
  const [ticket, setTicket] = useState<TicketLine[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [serviceType, setServiceType] = useState<ServiceTypeSelection>("");
  const [foodpandaOrderNumber, setFoodpandaOrderNumber] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PaymentOptionValue | "">("");
  const [discountType, setDiscountType] = useState<"PERCENTAGE" | "FIXED">("PERCENTAGE");
  const [discountValue, setDiscountValue] = useState("0");
  const [backdateEnabled, setBackdateEnabled] = useState(false);
  const [orderDate, setOrderDate] = useState(getLocalDateInputValue());
  const [submitting, setSubmitting] = useState(false);
  const [productDialog, setProductDialog] = useState<PosCatalogProduct | null>(null);
  const [productSelections, setProductSelections] = useState<ProductSelection[]>([]);
  const [productQuantity, setProductQuantity] = useState("1");
  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualDescription, setManualDescription] = useState("");
  const [manualQuantity, setManualQuantity] = useState("1");
  const [manualUnitPrice, setManualUnitPrice] = useState("");
  const [lastReceiptOrderId, setLastReceiptOrderId] = useState("");
  const [lastReceiptOrder, setLastReceiptOrder] = useState<PosReceiptOrder | null>(null);
  const [lastReceiptPhone, setLastReceiptPhone] = useState("");
  const [matchedCustomer, setMatchedCustomer] = useState<PosCustomerLookup | null>(null);
  const [orderCompleted, setOrderCompleted] = useState(false);
  const [editingOrderId, setEditingOrderId] = useState("");
  const [orderLookupNumber, setOrderLookupNumber] = useState("");
  const [loadingLookup, setLoadingLookup] = useState(false);
  const [editPanelOpen, setEditPanelOpen] = useState(false);
  const [splitView, setSplitView] = useState(false);
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());
  const autoLoadedOrderRef = useRef("");

  async function loadCatalog(nextBranchId?: string) {
    const data = await fetchPosCatalog({
      branchId: nextBranchId || branchId || undefined
    });

    setCategories(data.categories.map((category) => ({ id: category.id, name: category.name })));
    setProducts(data.products);
    setPromotion(data.promotion ?? null);
    if (!branchId || nextBranchId) {
      setBranchId(data.branchId ?? data.branches[0]?.id ?? "");
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      try {
        const session = await fetchPosSession();
        if (
          !session.user.canAccessPos &&
          !["ADMIN", "SUPER_ADMIN", "POS_STAFF"].includes(session.user.role)
        ) {
          router.replace("/pos/login");
          return;
        }

        if (!cancelled) {
          setSessionUser(session.user);
        }

        await loadCatalog();
        if (!cancelled) {
          setReady(true);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Failed to load POS terminal.");
          router.replace("/pos/login");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void initialize();

    return () => {
      cancelled = true;
    };
  }, [router]);

  const visibleProducts = useMemo(() => {
    return products.filter((product) => {
      const categoryMatches = categoryId === "ALL" || product.categoryId === categoryId;
      if (!categoryMatches) return false;

      if (!deferredSearch) return true;

      const searchTarget = `${product.name} ${product.categoryName}`.toLowerCase();
      return searchTarget.includes(deferredSearch);
    });
  }, [categoryId, deferredSearch, products]);

  const paymentOptions = useMemo(() => getPaymentOptions(serviceType), [serviceType]);

  const subtotal = useMemo(() => ticket.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0), [ticket]);
  const promotionFreeQuantity = useMemo(() => ticket.reduce((sum, item) => sum + (item.promotionFreeQuantity ?? 0), 0), [ticket]);
  const promotionApplied = Boolean(promotion?.isActive && promotion?.available && promotionFreeQuantity > 0 && promotion.appliesTo.includes(serviceType));
  const promotionDiscountAmount = promotionApplied ? promotionFreeQuantity * (promotion?.rewardUnitPrice ?? 0) : 0;
  const manualDiscountAmount = useMemo(() => {
    if (discountType === "PERCENTAGE") {
      return Math.min(subtotal, (subtotal * parseMoney(discountValue)) / 100);
    }
    if (discountType === "FIXED") {
      return Math.min(subtotal, parseMoney(discountValue));
    }
    return 0;
  }, [discountType, discountValue, subtotal]);
  const discountAmount = promotionApplied ? Math.min(subtotal, promotionDiscountAmount) : manualDiscountAmount;
  const total = useMemo(() => Math.max(0, subtotal - discountAmount), [discountAmount, subtotal]);
  const payableTotal = total;
  const editingCompletedOrder = Boolean(editingOrderId);
  const ticketLocked = orderCompleted && !editingCompletedOrder;

  useEffect(() => {
    setTicket((current) => synchronizeIndependenceOffer(current, promotion, serviceType, products));
  }, [ticket, promotion, serviceType, products]);

  useEffect(() => {
    if (!ready) return;
    const interval = window.setInterval(() => {
      void fetchPosPromotion().then(setPromotion).catch(() => null);
    }, 15000);
    return () => window.clearInterval(interval);
  }, [ready]);

  useEffect(() => {
    if (serviceType === "FOODPANDA") {
      setPaymentMethod("FOODPANDA_PAYOUT");
      return;
    }

    if (paymentMethod === "FOODPANDA_PAYOUT") {
      setPaymentMethod("");
    }
  }, [paymentMethod, serviceType]);

  useEffect(() => {
    const normalizedPhone = customerPhone.replace(/\D/g, "");
    if (normalizedPhone.length < 7 || ticketLocked) {
      setMatchedCustomer(null);
      return;
    }

    let cancelled = false;
    const timer = window.setTimeout(async () => {
      try {
        const customer = await lookupPosCustomer(customerPhone);
        if (!cancelled) {
          setMatchedCustomer(customer);
          if (customer?.name && !customerName.trim()) {
            setCustomerName(customer.name);
          }
        }
      } catch {
        if (!cancelled) {
          setMatchedCustomer(null);
        }
      }
    }, 350);

    return () => {
      cancelled = true;
      window.clearTimeout(timer);
    };
  }, [customerName, customerPhone, ticketLocked]);

  function addProductToTicket(product: PosCatalogProduct) {
    if (ticketLocked) {
      return;
    }

    if (product.addOnGroups.length) {
      setProductDialog(product);
      setProductSelections(buildDefaultSelections(product.addOnGroups));
      setProductQuantity("1");
      return;
    }

    setTicket((current) =>
      mergeTicketLine(current, {
        id: crypto.randomUUID(),
        type: "product",
        productId: product.id,
        name: product.name,
        categoryName: product.categoryName,
        quantity: 1,
        unitPrice: product.price,
        selections: [],
        bundleComponents: product.bundleComponents,
        addOns: []
      })
    );
  }

  function adjustProductQuantity(delta: number) {
    setProductQuantity((current) => String(Math.max(1, parsePositiveInteger(current) + delta)));
  }

  function updateProductQuantityInput(value: string) {
    setProductQuantity(value.replace(/\D/g, ""));
  }

  function confirmConfiguredProduct() {
    if (!productDialog || ticketLocked) return;

    const normalizedSelections = normalizeSelections(productSelections);

    for (const group of productDialog.addOnGroups) {
      const selected = normalizedSelections.find((entry) => entry.groupId === group.id)?.optionIds ?? [];
      if (selected.length < group.minSelect || selected.length > group.maxSelect) {
        setError(`${group.name} requires ${group.minSelect} to ${group.maxSelect} selections.`);
        return;
      }
    }

    const pricing = calculateLinePrice(productDialog, normalizedSelections);
    setTicket((current) =>
      mergeTicketLine(current, {
        id: crypto.randomUUID(),
        type: "product",
        productId: productDialog.id,
        name: productDialog.name,
        categoryName: productDialog.categoryName,
        quantity: parsePositiveInteger(productQuantity),
        unitPrice: pricing.unitPrice,
        selections: normalizedSelections,
        bundleComponents: productDialog.bundleComponents,
        addOns: pricing.addOns,
      })
    );
    setProductDialog(null);
    setError("");
  }

  function addManualItem() {
    if (ticketLocked) {
      return;
    }

    const price = parseMoney(manualUnitPrice);
    if (!manualName.trim() || Number.isNaN(price)) {
      setError("Manual item needs a name and valid amount.");
      return;
    }

    setTicket((current) =>
      mergeTicketLine(current, {
        id: crypto.randomUUID(),
        type: "manual",
        name: manualName.trim(),
        categoryName: "Manual",
        quantity: parsePositiveInteger(manualQuantity),
        unitPrice: price,
        customDescription: manualDescription.trim(),
        selections: [],
        bundleComponents: [],
        addOns: []
      })
    );
    setManualDialogOpen(false);
    setManualName("");
    setManualDescription("");
    setManualQuantity("1");
    setManualUnitPrice("");
    setError("");
  }

  function hydrateEditableOrder(order: PosEditableOrder, receiptOrder: PosReceiptOrder) {
    setTicket(mapEditableOrderToTicket(order));
    setCustomerName(order.customerName || "");
    setCustomerPhone(order.customerPhone || "");
    setServiceType(order.serviceType as ServiceTypeValue);
    setFoodpandaOrderNumber(order.foodpandaOrderNumber || "");
    setPaymentMethod(order.paymentMethod as PaymentOptionValue);
    setDiscountType(order.discountType === "NONE" ? "PERCENTAGE" : order.discountType);
    setDiscountValue(String(order.discountValue ?? 0));
    setBackdateEnabled(true);
    setOrderDate(getLocalDateInputValue(new Date(receiptOrder.placedAt)));
    setLastReceiptOrderId(receiptOrder.id);
    setLastReceiptOrder(receiptOrder);
    setLastReceiptPhone(receiptOrder.customerPhone ?? order.customerPhone ?? "");
    setMatchedCustomer(null);
    setOrderCompleted(true);
    setEditingOrderId(order.id);
    setEditPanelOpen(true);
    setError("");
  }

  async function loadOrderForEditing(orderNumber?: string) {
    const query = (orderNumber ?? orderLookupNumber).trim();
    if (!query) {
      setError("Enter a system order number to load.");
      return;
    }

    setLoadingLookup(true);
    setError("");

    try {
      const response = await fetchPosOrderByNumber(query);
      hydrateEditableOrder(response.editableOrder, response.order);
      setOrderLookupNumber(response.order.orderNumber);
      setEditPanelOpen(true);
    } catch (lookupError) {
      if (lookupError instanceof Error) {
        setError(lookupError.message);
      } else {
        setError("Could not load that order.");
      }
    } finally {
      setLoadingLookup(false);
    }
  }

  const autoEditOrderNumber = (searchParams.get("orderNumber") ?? searchParams.get("order") ?? "").trim();

  useEffect(() => {
    if (!ready || loading || !autoEditOrderNumber || autoLoadedOrderRef.current === autoEditOrderNumber) {
      return;
    }

    autoLoadedOrderRef.current = autoEditOrderNumber;
    setOrderLookupNumber(autoEditOrderNumber);
    setEditPanelOpen(true);
    void loadOrderForEditing(autoEditOrderNumber);
  }, [autoEditOrderNumber, loading, ready]);

  async function submitOrder() {
    setSubmitting(true);
    setError("");
    const submittedCustomerPhone = customerPhone.trim();
    const submittedFoodpandaOrderNumber = foodpandaOrderNumber.trim();

    if (!serviceType) {
      setError("Pick Dine-in, Takeaway, or Foodpanda before finishing the order.");
      setSubmitting(false);
      return;
    }

    if (!paymentMethod) {
      setError("Pick a payment mode before finishing the order.");
      setSubmitting(false);
      return;
    }

    if (serviceType === "FOODPANDA" && !submittedFoodpandaOrderNumber) {
      setError("Foodpanda order number is required for Foodpanda orders.");
      setSubmitting(false);
      return;
    }

    try {
      const payload = {
        branchId,
        serviceType,
        foodpandaOrderNumber: serviceType === "FOODPANDA" ? submittedFoodpandaOrderNumber : undefined,
        paymentMethod,
        customerName: customerName.trim() || undefined,
        customerPhone: submittedCustomerPhone || undefined,
        discountType: promotionApplied ? "FIXED" : discountType,
        discountValue: promotionApplied ? promotionDiscountAmount : parseMoney(discountValue),
        placedAt: backdateEnabled ? buildIsoFromDateInput(orderDate) : undefined,
        items: ticket.map((item) =>
          item.type === "manual"
            ? {
                type: "manual",
                name: item.name,
                description: item.customDescription || undefined,
                quantity: item.quantity,
                unitPrice: item.unitPrice
              }
            : {
                type: "product",
                productId: item.productId,
                quantity: item.quantity,
                selections: normalizeSelections(item.selections)
              }
        )
      };

      const response = editingOrderId
        ? await updatePosOrder(editingOrderId, payload)
        : await createPosOrder(payload);

      window.sessionStorage.setItem(getPosReceiptCacheKey(response.order.id), JSON.stringify(response.order));
      setLastReceiptOrderId(response.order.id);
      setLastReceiptOrder(response.order);
      setLastReceiptPhone(response.order.customerPhone ?? submittedCustomerPhone);
      setOrderCompleted(true);
      setEditingOrderId("");
    } catch (submitError) {
      if (submitError instanceof Error) {
        const details = (submitError as Error & { details?: string[] }).details ?? [];
        setError([submitError.message, ...details].filter(Boolean).join("\n"));
      } else {
        setError("Checkout failed.");
      }
    } finally {
      setSubmitting(false);
    }
  }

  function startNewOrder() {
    if (lastReceiptOrderId) {
      window.sessionStorage.removeItem(getPosReceiptCacheKey(lastReceiptOrderId));
    }
    setTicket([]);
    setCustomerName("");
    setCustomerPhone("");
    setServiceType("");
    setFoodpandaOrderNumber("");
    setPaymentMethod("");
    setDiscountType("PERCENTAGE");
    setDiscountValue("0");
    setBackdateEnabled(false);
    setOrderDate(getLocalDateInputValue());
    setLastReceiptOrderId("");
    setLastReceiptOrder(null);
    setLastReceiptPhone("");
    setMatchedCustomer(null);
    setOrderCompleted(false);
    setEditingOrderId("");
    setOrderLookupNumber("");
    setLoadingLookup(false);
    setEditPanelOpen(false);
    setSearch("");
    setCategoryId("ALL");
    setError("");
  }

  function editLastOrder() {
    if (!lastReceiptOrderId || !lastReceiptOrder) {
      return;
    }

    setOrderCompleted(true);
    setEditingOrderId(lastReceiptOrderId);
    setEditPanelOpen(false);
    setError("");
  }

  function printReceipt(copy: "all" | "chef" | "store" | "store-chef" = "all") {
    if (!lastReceiptOrderId) {
      return;
    }

    const iframe = document.createElement("iframe");
    iframe.style.position = "fixed";
    iframe.style.right = "0";
    iframe.style.bottom = "0";
    iframe.style.width = "0";
    iframe.style.height = "0";
    iframe.style.border = "0";
    iframe.setAttribute("aria-hidden", "true");
    iframe.src = `/pos/receipt/${lastReceiptOrderId}?copy=${copy}&autoPrint=1`;

    const cleanup = () => {
      window.removeEventListener("message", handleMessage);
      iframe.remove();
    };

    const handleMessage = (event: MessageEvent) => {
      if (event.origin !== window.location.origin) {
        return;
      }

      if (event.data?.type === "pos-receipt-printed" && event.data?.orderId === lastReceiptOrderId && event.data?.copy === copy) {
        cleanup();
      }
    };

    window.addEventListener("message", handleMessage);
    document.body.appendChild(iframe);
  }

  function sendReceipt() {
    if (!lastReceiptOrder) {
      setError("Receipt is not available for this order.");
      return;
    }

    const phone = formatWhatsAppPhone(lastReceiptPhone || customerPhone);
    if (!phone) {
      setError("Customer phone is required to send the receipt.");
      return;
    }

    const message = buildWhatsAppReceiptMessage(lastReceiptOrder);
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  }

  if (!ready || loading) {
    return <div className="min-h-screen bg-[#111827] px-6 py-10 text-white">Loading POS terminal...</div>;
  }

  return (
    <div className="pos-terminal min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.18),_transparent_22%),linear-gradient(135deg,_#111827,_#1f2937_55%,_#0f172a)] px-4 py-5 text-white md:px-5">
      <div className="mx-auto max-w-[1680px] space-y-5">
        {sessionUser ? <PosToolbar user={sessionUser} active="pos" splitView={splitView} onToggleSplit={() => setSplitView((current) => !current)} /> : null}

        {error ? (
          <div className="rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100 whitespace-pre-line">
            <p className="font-semibold text-red-50">Checkout blocked</p>
            <p className="mt-1">{error}</p>
          </div>
        ) : null}

        <div
          className={
            splitView
              ? "grid gap-4 xl:grid-cols-[minmax(0,1.2fr)_minmax(0,0.6fr)_minmax(0,1.2fr)]"
              : "grid gap-4 xl:grid-cols-[1.66fr_0.78fr]"
          }
        >
          <div className="space-y-4">
            <Card className={splitView ? "rounded-3xl border-white/10 bg-white/5 p-2 shadow-none" : "rounded-3xl border-white/10 bg-white/5 p-2.5 shadow-none"}>
              <div className={splitView ? "grid gap-1.5 lg:grid-cols-[minmax(0,1fr)_170px_140px]" : "grid gap-2 lg:grid-cols-[minmax(0,1fr)_190px_160px]"}>
                <label className={splitView ? "flex h-8 items-center gap-2 rounded-2xl border border-white/10 bg-slate-950/60 px-3" : "flex h-9 items-center gap-2.5 rounded-2xl border border-white/10 bg-slate-950/60 px-3.5"}>
                  <Search className={splitView ? "h-3 w-3 text-white/60" : "h-3.5 w-3.5 text-white/60"} />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search menu"
                    className={splitView ? "pos-dark-field w-full bg-transparent text-[11px] outline-none placeholder:text-white/40" : "pos-dark-field w-full bg-transparent text-xs outline-none placeholder:text-white/40"}
                  />
                </label>
                <select
                  value={categoryId}
                  onChange={(event) => setCategoryId(event.target.value)}
                  className={splitView ? "pos-dark-field h-8 rounded-2xl border border-white/10 bg-slate-950/60 px-3 text-[11px]" : "pos-dark-field h-9 rounded-2xl border border-white/10 bg-slate-950/60 px-3 text-xs"}
                >
                  <option value="ALL">All categories</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                <Button className={splitView ? "h-8 rounded-2xl text-[11px]" : "h-9 rounded-2xl text-xs"} onClick={() => setManualDialogOpen(true)} disabled={ticketLocked}>
                  <PencilLine className={splitView ? "h-3 w-3" : "h-3.5 w-3.5"} />
                  Other Item
                </Button>
              </div>
            </Card>

            <div className={splitView ? "grid gap-2 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5" : "grid gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5"}>
              {visibleProducts.map((product) => {
                const ticketQuantity = ticket
                  .filter((line) => line.type === "product" && line.productId === product.id)
                  .reduce((sum, line) => sum + line.quantity, 0);

                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => addProductToTicket(product)}
                    disabled={ticketLocked}
                    className={
                      splitView
                        ? "relative rounded-2xl border border-white/10 bg-white/5 p-2 text-left transition hover:-translate-y-0.5 hover:border-amber-300/40 hover:bg-white/10"
                        : "relative rounded-2xl border border-white/10 bg-white/5 p-2.5 text-left transition hover:-translate-y-0.5 hover:border-amber-300/40 hover:bg-white/10"
                    }
                  >
                    {ticketQuantity ? (
                      <span className={splitView ? "absolute right-2 top-2 rounded-full bg-amber-300 px-2 py-0.5 text-[10px] font-black text-slate-950" : "absolute right-2 top-2 rounded-full bg-amber-300 px-2 py-0.5 text-xs font-black text-slate-950"}>
                        x{ticketQuantity}
                      </span>
                    ) : null}
                    <p className={splitView ? "text-[11px] font-semibold uppercase tracking-[0.22em] text-amber-300/80" : "text-xs font-semibold uppercase tracking-[0.25em] text-amber-300/80"}>{product.categoryName}</p>
                    <p className={splitView ? "mt-1 pr-8 text-[0.86rem] font-black leading-tight" : "mt-1 pr-8 text-[0.95rem] font-black leading-tight xl:text-[0.98rem]"}>{product.name}</p>
                    <p className={splitView ? "mt-1 break-words text-[0.78rem] font-semibold leading-tight text-amber-200" : "mt-1.5 break-words text-sm font-semibold leading-tight text-amber-200"}>{formatCompactCurrency(product.price)}</p>
                    {product.bundleComponents.length ? <p className={splitView ? "mt-1 text-[0.64rem] text-amber-100/80" : "mt-1 text-[0.72rem] text-amber-100/80"}>Bundle meal</p> : null}
                    {product.addOnGroups.length ? <p className={splitView ? "mt-1 text-[0.64rem] text-white/60" : "mt-1 text-[0.72rem] text-white/60"}>Customization required</p> : null}
                  </button>
                );
              })}
            </div>
          </div>

            <Card className={splitView ? "rounded-3xl border-white/10 bg-[#f8f5ef] p-2 text-slate-900 shadow-none xl:sticky xl:top-4 xl:max-h-[calc(100vh-4.75rem)] xl:overflow-y-auto" : "rounded-3xl border-white/10 bg-[#f8f5ef] p-2.5 text-slate-900 shadow-none xl:sticky xl:top-4 xl:max-h-[calc(100vh-4.75rem)] xl:overflow-y-auto"}>
              <div className="flex items-center justify-between">
                <div>
                  <p className={splitView ? "text-[9px] font-semibold uppercase tracking-[0.24em] text-orange-600" : "text-[10px] font-semibold uppercase tracking-[0.24em] text-orange-600"}>Live Ticket</p>
                  <h2 className={splitView ? "mt-0.5 text-[0.88rem] font-black leading-none" : "mt-0.5 text-[0.98rem] font-black leading-none"}>Current Sale</h2>
                </div>
                <ShoppingBag className={splitView ? "h-3.5 w-3.5 text-orange-600" : "h-4 w-4 text-orange-600"} />
              </div>

            {orderCompleted ? (
              <div className={splitView ? "mt-1.5 rounded-2xl border border-amber-300/40 bg-amber-50 px-2 py-1 text-[10px] font-semibold text-amber-900" : "mt-1.5 rounded-2xl border border-amber-300/40 bg-amber-50 px-2.5 py-1.5 text-[11px] font-semibold text-amber-900"}>
                {editingCompletedOrder ? "Editing order. Finish again to update the same receipt." : "Order completed. Print receipt, edit it, or start a new order when ready."}
              </div>
            ) : null}

            <div className={splitView ? "mt-1.5 space-y-0.5" : "mt-1.5 space-y-1"}>
              {ticket.length ? (
                ticket.map((item) => (
                  <div key={item.id} className={splitView ? "rounded-xl border border-slate-200 bg-white px-1.5 py-1" : "rounded-xl border border-slate-200 bg-white px-2 py-1"}>
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            className={splitView ? "mt-0.5 h-5 w-5 shrink-0 px-0" : "mt-0.5 h-6 w-6 shrink-0 px-0"}
                            disabled={ticketLocked}
                            onClick={() => setTicket((current) => current.map((line) => line.id === item.id ? { ...line, quantity: Math.max(1, line.quantity - 1) } : line))}
                          >
                            <Minus className={splitView ? "h-2 w-2" : "h-2.5 w-2.5"} />
                          </Button>
                          <span className={splitView ? "mt-0.5 min-w-4 shrink-0 text-center text-[10px] font-semibold" : "mt-0.5 min-w-4 shrink-0 text-center text-[11px] font-semibold"}>{item.quantity}</span>
                          <Button
                            variant="outline"
                            size="sm"
                            className={splitView ? "mt-0.5 h-5 w-5 shrink-0 px-0" : "mt-0.5 h-6 w-6 shrink-0 px-0"}
                            disabled={ticketLocked}
                            onClick={() => setTicket((current) => current.map((line) => line.id === item.id ? { ...line, quantity: line.quantity + 1 } : line))}
                          >
                            <Plus className={splitView ? "h-2 w-2" : "h-2.5 w-2.5"} />
                          </Button>
                          <div className="min-w-0 flex-1">
                          <p className={splitView ? "text-[0.64rem] font-bold leading-tight" : "text-[0.72rem] font-bold leading-tight"}>{item.name}</p>
                            <p className={splitView ? "text-[0.52rem] leading-tight text-slate-500" : "text-[0.58rem] leading-tight text-slate-500"}>{item.categoryName}</p>
                          </div>
                        </div>
                        {item.customDescription ? <p className={splitView ? "mt-0.5 pl-[4.5rem] text-[0.52rem] leading-tight text-slate-500" : "mt-0.5 pl-[5.25rem] text-[0.58rem] leading-tight text-slate-500"}>{item.customDescription}</p> : null}
                        {item.bundleComponents.length ? (
                          <p className={splitView ? "mt-0.5 pl-[4.5rem] text-[0.52rem] leading-tight text-slate-600" : "mt-0.5 pl-[5.25rem] text-[0.58rem] leading-tight text-slate-600"}>
                            Contains: {formatBundleSummary(item.bundleComponents, item.quantity)}
                          </p>
                        ) : null}
                        {item.addOns.length ? (
                          <p className={splitView ? "mt-0.5 pl-[4.5rem] text-[0.52rem] leading-tight text-slate-600" : "mt-0.5 pl-[5.25rem] text-[0.58rem] leading-tight text-slate-600"}>{item.addOns.map((addOn) => addOn.name).join(", ")}</p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-start gap-1.5">
                        <div className="text-right">
                          <p className={splitView ? "break-words text-[0.6rem] font-bold leading-tight text-orange-600" : "break-words text-[0.68rem] font-bold leading-tight text-orange-600"}>{formatCompactCurrency(item.unitPrice * item.quantity)}</p>
                          <p className={splitView ? "break-words text-[0.5rem] leading-tight text-slate-500" : "break-words text-[0.58rem] leading-tight text-slate-500"}>{formatCompactCurrency(item.unitPrice)} each</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className={splitView ? "mt-0.5 h-4 w-4 px-0 text-red-600 hover:bg-red-50 hover:text-red-700" : "mt-0.5 h-5 w-5 px-0 text-red-600 hover:bg-red-50 hover:text-red-700"}
                          disabled={ticketLocked}
                          onClick={() => setTicket((current) => current.filter((line) => line.id !== item.id))}
                        >
                          <Trash2 className={splitView ? "h-2.5 w-2.5" : "h-3 w-3"} />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className={splitView ? "rounded-xl border border-dashed border-slate-300 bg-white/70 p-1.5 text-[10px] text-slate-500" : "rounded-xl border border-dashed border-slate-300 bg-white/70 p-2 text-[11px] text-slate-500"}>No items on the ticket yet.</div>
              )}
            </div>

            <div className={splitView ? "mt-2 space-y-1 border-t border-slate-200 pt-1.5" : "mt-2 space-y-1.5 border-t border-slate-200 pt-2"}>
              <div className="grid gap-1.5 md:grid-cols-2">
                <Input className={splitView ? "h-7 text-[11px]" : "h-8 text-xs"} value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Customer name (optional)" disabled={ticketLocked} />
                <Input className={splitView ? "h-7 text-[11px]" : "h-8 text-xs"} value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} placeholder="Phone (optional)" disabled={ticketLocked} />
              </div>
              {matchedCustomer ? (
                <div className={splitView ? "rounded-xl border border-emerald-200 bg-emerald-50 px-2 py-1 text-[10px] text-emerald-900" : "rounded-xl border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-[11px] text-emerald-900"}>
                  <p className="font-bold leading-tight">Repeat customer: {matchedCustomer.name ?? matchedCustomer.phone}</p>
                  <p className="mt-0.5 leading-tight">
                    {matchedCustomer.totalOrders} orders
                    {matchedCustomer.lastOrderSummary ? ` · Last: ${matchedCustomer.lastOrderSummary}` : ""}
                  </p>
                </div>
              ) : customerPhone.replace(/\D/g, "").length >= 7 ? (
                <div className={splitView ? "rounded-xl border border-slate-200 bg-white px-2 py-1 text-[10px] text-slate-600" : "rounded-xl border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] text-slate-600"}>
                  New customer phone. Receipt sharing will be available after checkout.
                </div>
              ) : null}
              <div className="grid gap-3 md:grid-cols-2">
                <div className="space-y-1.5">
                  <p className="text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-slate-500">Order type</p>
                  <div className="flex flex-nowrap gap-2 overflow-x-auto pb-1">
                    {serviceTypes.map((entry) => {
                      const selected = serviceType === entry.value;
                      return (
                        <button
                          key={entry.value}
                          type="button"
                          onClick={() => setServiceType(entry.value)}
                          disabled={ticketLocked}
                          className={cn(
                            "grid h-10 w-10 shrink-0 place-items-center rounded-full border transition",
                            selected ? "border-orange-500 bg-orange-100 shadow-sm" : "border-slate-200 bg-white hover:border-orange-300",
                            ticketLocked && "opacity-60"
                          )}
                          aria-label={entry.label}
                          title={entry.label}
                        >
                          {"icon" in entry ? (
                            <entry.icon className="h-6 w-6 text-slate-800" aria-hidden="true" />
                          ) : (
                            <Image src={entry.logo} alt={entry.label} width={28} height={28} className="h-7 w-7 object-contain" />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
                <div className="space-y-1.5">
                  <p className="text-[0.6rem] font-semibold uppercase tracking-[0.22em] text-slate-500">Payment mode</p>
                  <div className="flex flex-nowrap gap-2 overflow-x-auto pb-1">
                    {!serviceType ? (
                      <div className="flex h-10 items-center rounded-full border border-dashed border-slate-300 bg-white px-3 text-[11px] font-semibold text-slate-500">
                        Select order type first
                      </div>
                    ) : paymentOptions.map((entry) => {
                      const selected = paymentMethod === entry.value;
                      return (
                        <button
                          key={entry.value}
                          type="button"
                          onClick={() => setPaymentMethod(entry.value)}
                          disabled={ticketLocked}
                          className={cn(
                            "grid h-10 w-10 shrink-0 place-items-center rounded-full border transition",
                            selected ? "border-orange-500 bg-orange-100 shadow-sm" : "border-slate-200 bg-white hover:border-orange-300",
                            ticketLocked && "opacity-60"
                          )}
                          aria-label={entry.label}
                          title={entry.label}
                        >
                          <Image src={entry.logo} alt={entry.label} width={28} height={28} className="h-7 w-7 object-contain" />
                        </button>
                      );
                    })}
                  </div>
                </div>
              </div>
              {serviceType === "FOODPANDA" ? (
                <Input
                  className={splitView ? "h-7 text-[11px]" : "h-8 text-xs"}
                  value={foodpandaOrderNumber}
                  onChange={(event) => setFoodpandaOrderNumber(event.target.value)}
                  placeholder="Foodpanda order number"
                  disabled={ticketLocked}
                />
              ) : null}
              {promotionApplied ? (
                <div className={cn("rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800", splitView && "px-2 py-1 text-[11px]")}>
                  <p className="font-bold">{promotion?.name} applied</p>
                  <p className="mt-0.5">Loaded Fries free: {promotionFreeQuantity} · Discount: {formatCurrency(promotionDiscountAmount)}</p>
                </div>
              ) : (
                <div className="grid gap-1.5 md:grid-cols-2">
                  <select value={discountType} onChange={(event) => setDiscountType(event.target.value as "PERCENTAGE" | "FIXED")} className={splitView ? "h-7 rounded-md border border-slate-200 bg-white px-2 text-[11px]" : "h-8 rounded-md border border-slate-200 bg-white px-2.5 text-xs"} disabled={ticketLocked}>
                    <option value="PERCENTAGE">Percentage</option>
                    <option value="FIXED">Fixed amount</option>
                  </select>
                  <Input className={splitView ? "h-7 text-[11px]" : "h-8 text-xs"} inputMode="decimal" value={discountValue} onChange={(event) => setDiscountValue(event.target.value)} placeholder="0" disabled={ticketLocked} />
                </div>
              )}
              <div className="space-y-1.5">
                <button
                  type="button"
                  onClick={() => setBackdateEnabled((current) => !current)}
                  disabled={ticketLocked}
                  className={cn(
                    "inline-flex items-center gap-2 rounded-full border px-3 py-1.5 text-[0.64rem] font-semibold transition",
                    backdateEnabled ? "border-orange-400 bg-orange-50 text-orange-700" : "border-slate-200 bg-white text-slate-700 hover:border-orange-300",
                    ticketLocked && "opacity-60"
                  )}
                >
                  <CalendarDays className="h-3.5 w-3.5" />
                  Older Date
                </button>
                {backdateEnabled ? (
                  <Input
                    type="date"
                    className={splitView ? "h-7 text-[11px]" : "h-8 text-xs"}
                    value={orderDate}
                    onChange={(event) => setOrderDate(event.target.value)}
                    disabled={ticketLocked}
                  />
                ) : null}
              </div>
            </div>

            <div className={splitView ? "mt-2 space-y-1 rounded-2xl bg-slate-950 px-2 py-1.5 text-[0.74rem] text-white" : "mt-2 space-y-1 rounded-2xl bg-slate-950 px-2.5 py-1.5 text-[0.8rem] text-white"}>
              <div className="flex justify-between"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
              <div className="flex justify-between"><span>Discount</span><span>-{formatCurrency(discountAmount)}</span></div>
              <div className={splitView ? "flex justify-between text-[0.8rem] font-bold" : "flex justify-between text-[0.88rem] font-bold"}><span>Total</span><span>{formatCurrency(payableTotal)}</span></div>
            </div>

            {(!orderCompleted || editingCompletedOrder) ? (
              <Button className={splitView ? "mt-2 h-7 w-full rounded-2xl text-[11px]" : "mt-2 h-8 w-full rounded-2xl text-xs"} disabled={!ticket.length || submitting || ticketLocked} onClick={() => void submitOrder()}>
                <Receipt className={splitView ? "h-3 w-3" : "h-3.5 w-3.5"} />
                {submitting ? "Processing..." : editingCompletedOrder ? "Update Order" : "Finish"}
              </Button>
            ) : null}

            {lastReceiptOrderId && (orderCompleted || editingCompletedOrder) ? (
              <div className="mt-2 grid grid-cols-2 gap-1.5">
                <Button className={splitView ? "h-7 rounded-2xl text-[10px]" : "h-8 rounded-2xl text-[11px]"} variant="outline" onClick={() => printReceipt("store-chef")} type="button">
                  Print Receipt
                </Button>
                <Button className={splitView ? "h-7 rounded-2xl text-[10px]" : "h-8 rounded-2xl text-[11px]"} variant="outline" onClick={() => printReceipt("chef")} type="button">
                  Print Chef
                </Button>
                <Button className={splitView ? "h-7 rounded-2xl text-[10px]" : "h-8 rounded-2xl text-[11px]"} variant="outline" onClick={() => printReceipt("store")} type="button">
                  Print Store
                </Button>
                <Button className={splitView ? "h-7 rounded-2xl text-[10px]" : "h-8 rounded-2xl text-[11px]"} variant="outline" onClick={sendReceipt} type="button">
                  <Send className={splitView ? "h-3 w-3" : "h-3.5 w-3.5"} />
                  Send Receipt
                </Button>
              </div>
            ) : null}

            {!orderCompleted ? (
              <div className="mt-2 space-y-2">
                <Button
                  className={splitView ? "h-7 w-full rounded-2xl border border-slate-300 bg-white text-[10px] text-slate-900 hover:bg-slate-50" : "h-8 w-full rounded-2xl border border-slate-300 bg-white text-xs text-slate-900 hover:bg-slate-50"}
                  type="button"
                  onClick={() => {
                    setEditPanelOpen((current) => !current);
                  }}
                >
                  Edit Older Order
                </Button>
              </div>
            ) : (
              <div className="mt-2 grid grid-cols-2 gap-2">
                <Button className={splitView ? "h-7 rounded-2xl bg-amber-300 text-[10px] text-slate-950 hover:bg-amber-400" : "h-8 rounded-2xl bg-amber-300 text-xs text-slate-950 hover:bg-amber-400"} type="button" onClick={startNewOrder}>
                  Start New Order
                </Button>
                <Button className={splitView ? "h-7 rounded-2xl bg-slate-950 text-[10px] text-white hover:bg-slate-800" : "h-8 rounded-2xl bg-slate-950 text-xs text-white hover:bg-slate-800"} type="button" onClick={editLastOrder} disabled={!lastReceiptOrderId}>
                  Edit Current Order
                </Button>
              </div>
            )}

            <div className={[ "overflow-hidden transition-all duration-200 ease-out", editPanelOpen ? "mt-3 max-h-[340px] border-t border-slate-200 pt-3 opacity-100" : "max-h-0 opacity-0" ].join(" ")}>
              <div className="space-y-2">
                <div className="flex items-center justify-between gap-2">
                  <div>
                    <p className="text-[0.7rem] font-semibold uppercase tracking-[0.24em] text-slate-500">Edit Order</p>
                    <p className="mt-0.5 text-[11px] text-slate-500">Open an existing order by number, then edit it from this screen.</p>
                  </div>
                  {editingCompletedOrder ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-900">Editing</span> : null}
                </div>
                <div className="grid gap-1.5 md:grid-cols-[minmax(0,1fr)_160px]">
                  <Input
                    className={splitView ? "h-7 text-[11px]" : "h-8 text-xs"}
                    value={orderLookupNumber}
                    onChange={(event) => setOrderLookupNumber(event.target.value)}
                    placeholder="Open existing order by number"
                    disabled={ticketLocked || loadingLookup}
                  />
                  <Button className={splitView ? "h-7 rounded-2xl text-[10px]" : "h-8 rounded-2xl text-xs"} type="button" variant="outline" onClick={() => void loadOrderForEditing()} disabled={ticketLocked || loadingLookup || !orderLookupNumber.trim()}>
                    {loadingLookup ? "Loading..." : "Open Order"}
                  </Button>
                </div>
              </div>
            </div>
          </Card>

          {splitView ? (
            <div className="min-w-0 min-h-0 xl:sticky xl:top-4 xl:h-[calc(100vh-4.75rem)] xl:overflow-hidden">
              <PosOrderQueue embedded onEditOrder={(orderNumber) => void loadOrderForEditing(orderNumber)} />
            </div>
          ) : null}
        </div>
      </div>

      {productDialog ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 p-4">
          <Card className="flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border-white/10 bg-slate-900 p-6 text-white shadow-none">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">{productDialog.categoryName}</p>
                <h3 className="mt-2 text-2xl font-black">{productDialog.name}</h3>
              <p className="mt-2 break-words text-amber-200">{formatCompactCurrency(productDialog.price)}</p>
                {productDialog.bundleComponents.length ? (
                  <p className="mt-2 text-sm text-amber-100/80">Contains: {formatBundleSummary(productDialog.bundleComponents)}</p>
                ) : null}
              </div>
              <Button variant="ghost" className="text-white hover:bg-white/10" onClick={() => setProductDialog(null)}>Close</Button>
            </div>
            <div className="mt-6 flex-1 space-y-5 overflow-y-auto pr-1">
              {productDialog.addOnGroups.map((group) => (
                <div key={group.id}>
                  <div className="mb-3">
                    <p className="font-semibold">{group.name}</p>
                    <p className="text-sm text-white/60">Choose {group.minSelect} to {group.maxSelect}</p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {group.options.map((option) => {
                      const selected = productSelections.find((entry) => entry.groupId === group.id)?.optionIds.includes(option.id);
                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => {
                            setProductSelections((current) => toggleSelectionOption(current, group, option.id));
                          }}
                          className={cn(
                            "rounded-2xl border px-4 py-3 text-left",
                            selected ? "border-amber-300 bg-amber-300/10" : "border-white/10 bg-white/5"
                          )}
                        >
                          <p className="font-semibold">{option.name}</p>
                          <p className="break-words text-sm text-white/60">{option.priceDelta ? `+${formatCompactCurrency(option.priceDelta)}` : "Included"}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-white/5 px-3 py-2">
                <p className="text-sm font-semibold text-white">Quantity</p>
                <div className="flex items-center gap-2">
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 w-9 rounded-full border-white/20 bg-white/10 p-0 text-white hover:bg-white/20"
                    onClick={() => adjustProductQuantity(-1)}
                    disabled={parsePositiveInteger(productQuantity) <= 1}
                    aria-label="Decrease quantity"
                  >
                    <Minus className="h-4 w-4" />
                  </Button>
                  <Input
                    className="h-9 w-20 rounded-xl border-white/20 bg-white px-2 text-center text-base font-black text-slate-950 shadow-none focus-visible:ring-amber-300"
                    inputMode="numeric"
                    value={productQuantity}
                    onChange={(event) => updateProductQuantityInput(event.target.value)}
                    onBlur={() => setProductQuantity((current) => String(parsePositiveInteger(current)))}
                    aria-label="Quantity"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    className="h-9 w-9 rounded-full border-white/20 bg-white/10 p-0 text-white hover:bg-white/20"
                    onClick={() => adjustProductQuantity(1)}
                    aria-label="Increase quantity"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>
              <div className="sticky bottom-0 bg-slate-900 pt-2">
                <Button className="w-full" onClick={confirmConfiguredProduct}>Add to Ticket</Button>
              </div>
            </div>
          </Card>
        </div>
      ) : null}

      {manualDialogOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 p-4">
          <Card className="w-full max-w-xl rounded-3xl p-6">
            <div className="flex items-center justify-between">
              <h3 className="text-2xl font-black text-pocket-navy">Manual Item</h3>
              <Button variant="ghost" onClick={() => setManualDialogOpen(false)}>Close</Button>
            </div>
            <div className="mt-5 space-y-3">
              <Input value={manualName} onChange={(event) => setManualName(event.target.value)} placeholder="Name" />
              <Textarea value={manualDescription} onChange={(event) => setManualDescription(event.target.value)} placeholder="Description" />
              <div className="grid gap-3 md:grid-cols-2">
                <Input inputMode="decimal" value={manualUnitPrice} onChange={(event) => setManualUnitPrice(event.target.value)} placeholder="Unit price" />
                <Input inputMode="numeric" value={manualQuantity} onChange={(event) => setManualQuantity(event.target.value)} placeholder="Quantity" />
              </div>
              <Button className="w-full" onClick={addManualItem}>Add Manual Item</Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

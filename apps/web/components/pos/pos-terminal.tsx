"use client";

import { useDeferredValue, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, Search, Trash2, LogOut, Receipt, ShoppingBag, PencilLine, Send } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createPosOrder, fetchPosCatalog, fetchPosSession, getPosReceiptCacheKey, lookupPosCustomer, logoutPosSession } from "@/lib/pos-client";
import type { AddOnGroup, PosCatalogProduct, PosCustomerLookup } from "@/lib/types";
import { cn, formatCurrency } from "@/lib/utils";

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
  addOns: Array<{ id: string; name: string; priceDelta: number }>;
};

type ProductSelection = { groupId: string; optionIds: string[] };

const paymentOptions = [
  { value: "CASH", label: "Cash" },
  { value: "CARD", label: "Card" },
  { value: "EASYPAISA", label: "EasyPaisa" },
  { value: "JAZZCASH", label: "JazzCash" }
] as const;

const serviceTypes = ["TAKEAWAY", "DINE_IN"] as const;

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

export function PosTerminal() {
  const router = useRouter();
  const [ready, setReady] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [branches, setBranches] = useState<Array<{ id: string; name: string }>>([]);
  const [categories, setCategories] = useState<Array<{ id: string; name: string }>>([]);
  const [products, setProducts] = useState<PosCatalogProduct[]>([]);
  const [branchId, setBranchId] = useState("");
  const [categoryId, setCategoryId] = useState("ALL");
  const [search, setSearch] = useState("");
  const [ticket, setTicket] = useState<TicketLine[]>([]);
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [serviceType, setServiceType] = useState<(typeof serviceTypes)[number]>("TAKEAWAY");
  const [paymentMethod, setPaymentMethod] = useState<(typeof paymentOptions)[number]["value"]>("CASH");
  const [discountType, setDiscountType] = useState<"NONE" | "PERCENTAGE" | "FIXED">("NONE");
  const [discountValue, setDiscountValue] = useState("");
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
  const [lastReceiptUrl, setLastReceiptUrl] = useState("");
  const [lastReceiptPhone, setLastReceiptPhone] = useState("");
  const [matchedCustomer, setMatchedCustomer] = useState<PosCustomerLookup | null>(null);
  const [orderCompleted, setOrderCompleted] = useState(false);
  const deferredSearch = useDeferredValue(search.trim().toLowerCase());

  async function loadCatalog(nextBranchId?: string) {
    const data = await fetchPosCatalog({
      branchId: nextBranchId || branchId || undefined
    });

    setBranches(data.branches);
    setCategories(data.categories.map((category) => ({ id: category.id, name: category.name })));
    setProducts(data.products);
    if (!branchId || nextBranchId) {
      setBranchId(data.branchId ?? data.branches[0]?.id ?? "");
    }
  }

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      try {
        const session = await fetchPosSession();
        if (!["ADMIN", "SUPER_ADMIN", "POS_STAFF"].includes(session.user.role)) {
          router.replace("/pos/login");
          return;
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

  const subtotal = useMemo(() => ticket.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0), [ticket]);
  const discountAmount = useMemo(() => {
    if (discountType === "PERCENTAGE") {
      return Math.min(subtotal, (subtotal * parseMoney(discountValue)) / 100);
    }
    if (discountType === "FIXED") {
      return Math.min(subtotal, parseMoney(discountValue));
    }
    return 0;
  }, [discountType, discountValue, subtotal]);
  const total = useMemo(() => Math.max(0, subtotal - discountAmount), [discountAmount, subtotal]);
  const payableTotal = total;

  useEffect(() => {
    const normalizedPhone = customerPhone.replace(/\D/g, "");
    if (normalizedPhone.length < 7 || orderCompleted) {
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
  }, [customerName, customerPhone, orderCompleted]);

  function addProductToTicket(product: PosCatalogProduct) {
    if (orderCompleted) {
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
        addOns: []
      })
    );
  }

  function confirmConfiguredProduct() {
    if (!productDialog || orderCompleted) return;

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
        addOns: pricing.addOns,
      })
    );
    setProductDialog(null);
    setError("");
  }

  function addManualItem() {
    if (orderCompleted) {
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

  async function submitOrder() {
    setSubmitting(true);
    setError("");

    try {
      const response = await createPosOrder({
        branchId,
        serviceType,
        paymentMethod,
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        discountType,
        discountValue: parseMoney(discountValue),
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
      });

      window.sessionStorage.setItem(getPosReceiptCacheKey(response.order.id), JSON.stringify(response.order));
      setLastReceiptOrderId(response.order.id);
      setLastReceiptUrl(response.order.digitalReceiptUrl ?? "");
      setLastReceiptPhone(response.order.customerPhone ?? customerPhone.trim());
      setOrderCompleted(true);
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
    setServiceType("TAKEAWAY");
    setPaymentMethod("CASH");
    setDiscountType("NONE");
    setDiscountValue("");
    setLastReceiptOrderId("");
    setLastReceiptUrl("");
    setLastReceiptPhone("");
    setMatchedCustomer(null);
    setOrderCompleted(false);
    setSearch("");
    setCategoryId("ALL");
    setError("");
  }

  function printReceipt(copy: "all" | "chef" | "store" = "all") {
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
    if (!lastReceiptUrl) {
      setError("Receipt link is not available for this order.");
      return;
    }

    const phone = formatWhatsAppPhone(lastReceiptPhone || customerPhone);
    if (!phone) {
      setError("Customer phone is required to send the receipt.");
      return;
    }

    const message = `Pocket receipt for ${formatCurrency(payableTotal)}: ${lastReceiptUrl}`;
    window.open(`https://wa.me/${phone}?text=${encodeURIComponent(message)}`, "_blank", "noopener,noreferrer");
  }

  if (!ready || loading) {
    return <div className="min-h-screen bg-[#111827] px-6 py-10 text-white">Loading POS terminal...</div>;
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.18),_transparent_22%),linear-gradient(135deg,_#111827,_#1f2937_55%,_#0f172a)] px-4 py-5 text-white md:px-5">
      <div className="mx-auto max-w-[1680px] space-y-5">
        <div className="flex flex-col gap-3 rounded-3xl border border-white/10 bg-white/5 p-4 backdrop-blur md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-amber-300">Pocket POS</p>
            <h1 className="mt-1.5 text-[2rem] font-black leading-none">Counter Terminal</h1>
          </div>
          <div className="flex flex-wrap gap-3">
            <select
              value={branchId}
              onChange={(event) => {
                const nextBranchId = event.target.value;
                setBranchId(nextBranchId);
                void loadCatalog(nextBranchId);
              }}
              className="h-10 rounded-xl border border-white/10 bg-slate-950/60 px-4 text-sm"
            >
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              className="h-10 border-white/15 bg-white/5 px-4 text-white hover:bg-white/10"
              onClick={() => router.push("/pos/orders")}
            >
              View Orders
            </Button>
            <Button
              variant="outline"
              className="h-10 border-white/15 bg-white/5 px-4 text-white hover:bg-white/10"
              onClick={async () => {
                await logoutPosSession().catch(() => null);
                router.replace("/pos/login");
              }}
            >
              <LogOut className="h-4 w-4" />
              Logout
            </Button>
          </div>
        </div>

        {error ? (
          <div className="rounded-xl border border-red-400/20 bg-red-500/10 px-4 py-3 text-sm text-red-100 whitespace-pre-line">
            <p className="font-semibold text-red-50">Checkout blocked</p>
            <p className="mt-1">{error}</p>
          </div>
        ) : null}

        <div className="grid gap-4 xl:grid-cols-[1.66fr_0.78fr]">
          <div className="space-y-4">
            <Card className="rounded-3xl border-white/10 bg-white/5 p-3.5 shadow-none">
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_180px]">
                <label className="flex h-11 items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/60 px-4">
                  <Search className="h-4 w-4 text-white/60" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Search menu"
                    className="w-full bg-transparent text-sm outline-none placeholder:text-white/40"
                  />
                </label>
                <select
                  value={categoryId}
                  onChange={(event) => setCategoryId(event.target.value)}
                  className="h-11 rounded-2xl border border-white/10 bg-slate-950/60 px-4 text-sm"
                >
                  <option value="ALL">All categories</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                <Button className="h-11 rounded-2xl" onClick={() => setManualDialogOpen(true)} disabled={orderCompleted}>
                  <PencilLine className="h-4 w-4" />
                  Other Item
                </Button>
              </div>
            </Card>

            <div className="grid gap-3 md:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-5">
              {visibleProducts.map((product) => {
                const ticketQuantity = ticket
                  .filter((line) => line.type === "product" && line.productId === product.id)
                  .reduce((sum, line) => sum + line.quantity, 0);

                return (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => addProductToTicket(product)}
                    disabled={orderCompleted}
                    className="relative rounded-2xl border border-white/10 bg-white/5 p-2.5 text-left transition hover:-translate-y-0.5 hover:border-amber-300/40 hover:bg-white/10"
                  >
                    {ticketQuantity ? (
                      <span className="absolute right-2 top-2 rounded-full bg-amber-300 px-2 py-0.5 text-xs font-black text-slate-950">
                        x{ticketQuantity}
                      </span>
                    ) : null}
                    <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300/80">{product.categoryName}</p>
                    <p className="mt-1 pr-8 text-[0.95rem] font-black leading-tight xl:text-[0.98rem]">{product.name}</p>
                    <p className="mt-1.5 text-sm font-semibold text-amber-200">{formatCurrency(product.price)}</p>
                    {product.addOnGroups.length ? <p className="mt-1 text-[0.72rem] text-white/60">Customization required</p> : null}
                  </button>
                );
              })}
            </div>
          </div>

          <Card className="rounded-3xl border-white/10 bg-[#f8f5ef] p-3 text-slate-900 shadow-none xl:sticky xl:top-5 xl:max-h-[calc(100vh-5.75rem)] xl:overflow-y-auto">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-orange-600">Live Ticket</p>
                <h2 className="mt-1 text-[1.05rem] font-black leading-none">Current Sale</h2>
              </div>
              <ShoppingBag className="h-5 w-5 text-orange-600" />
            </div>

            {orderCompleted ? (
              <div className="mt-2 rounded-2xl border border-amber-300/40 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-900">
                Order completed. Print receipt, then start a new order when ready.
              </div>
            ) : null}

            <div className="mt-2 space-y-1.5">
              {ticket.length ? (
                ticket.map((item) => (
                  <div key={item.id} className="rounded-xl border border-slate-200 bg-white px-2.5 py-1.5">
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-start gap-1.5">
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-0.5 h-7 w-7 shrink-0 px-0"
                            disabled={orderCompleted}
                            onClick={() => setTicket((current) => current.map((line) => line.id === item.id ? { ...line, quantity: Math.max(1, line.quantity - 1) } : line))}
                          >
                            <Minus className="h-3 w-3" />
                          </Button>
                          <span className="mt-1 min-w-4 shrink-0 text-center text-xs font-semibold">{item.quantity}</span>
                          <Button
                            variant="outline"
                            size="sm"
                            className="mt-0.5 h-7 w-7 shrink-0 px-0"
                            disabled={orderCompleted}
                            onClick={() => setTicket((current) => current.map((line) => line.id === item.id ? { ...line, quantity: line.quantity + 1 } : line))}
                          >
                            <Plus className="h-3 w-3" />
                          </Button>
                          <div className="min-w-0 flex-1">
                            <p className="text-[0.78rem] font-bold leading-tight">{item.name}</p>
                            <p className="text-[0.64rem] leading-tight text-slate-500">{item.categoryName}</p>
                          </div>
                        </div>
                        {item.customDescription ? <p className="mt-0.5 pl-[6.25rem] text-[0.64rem] leading-tight text-slate-500">{item.customDescription}</p> : null}
                        {item.addOns.length ? (
                          <p className="mt-0.5 pl-[6.25rem] text-[0.64rem] leading-tight text-slate-600">{item.addOns.map((addOn) => addOn.name).join(", ")}</p>
                        ) : null}
                      </div>
                      <div className="flex shrink-0 items-start gap-1.5">
                        <div className="text-right">
                          <p className="text-[0.78rem] font-bold leading-tight text-orange-600">{formatCurrency(item.unitPrice * item.quantity)}</p>
                          <p className="text-[0.64rem] leading-tight text-slate-500">{formatCurrency(item.unitPrice)} each</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          className="mt-0.5 h-6 w-6 px-0 text-red-600 hover:bg-red-50 hover:text-red-700"
                          disabled={orderCompleted}
                          onClick={() => setTicket((current) => current.filter((line) => line.id !== item.id))}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-xl border border-dashed border-slate-300 bg-white/70 p-3 text-sm text-slate-500">No items on the ticket yet.</div>
              )}
            </div>

            <div className="mt-2.5 space-y-2 border-t border-slate-200 pt-2.5">
              <div className="grid gap-2 md:grid-cols-2">
                <Input className="h-9 text-sm" value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Customer name (optional)" disabled={orderCompleted} />
                <Input className="h-9 text-sm" value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} placeholder="Phone (optional)" disabled={orderCompleted} />
              </div>
              {matchedCustomer ? (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-900">
                  <p className="font-bold">Repeat customer: {matchedCustomer.name ?? matchedCustomer.phone}</p>
                  <p className="mt-0.5">
                    {matchedCustomer.totalOrders} orders
                    {matchedCustomer.lastOrderSummary ? ` · Last: ${matchedCustomer.lastOrderSummary}` : ""}
                  </p>
                </div>
              ) : customerPhone.replace(/\D/g, "").length >= 7 ? (
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-xs text-slate-600">
                  New customer phone. Receipt sharing will be available after checkout.
                </div>
              ) : null}
              <div className="grid gap-2 md:grid-cols-2">
                <select value={serviceType} onChange={(event) => setServiceType(event.target.value as (typeof serviceTypes)[number])} className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm" disabled={orderCompleted}>
                  {serviceTypes.map((entry) => (
                    <option key={entry} value={entry}>
                      {entry.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
                <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as (typeof paymentOptions)[number]["value"])} className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm" disabled={orderCompleted}>
                  {paymentOptions.map((entry) => (
                    <option key={entry.value} value={entry.value}>
                      {entry.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2 md:grid-cols-2">
                <select value={discountType} onChange={(event) => setDiscountType(event.target.value as "NONE" | "PERCENTAGE" | "FIXED")} className="h-9 rounded-md border border-slate-200 bg-white px-3 text-sm" disabled={orderCompleted}>
                  <option value="NONE">No discount</option>
                  <option value="PERCENTAGE">Percentage</option>
                  <option value="FIXED">Fixed amount</option>
                </select>
                <Input className="h-9 text-sm" inputMode="decimal" value={discountValue} onChange={(event) => setDiscountValue(event.target.value)} placeholder="Discount" disabled={orderCompleted} />
              </div>
            </div>

            {lastReceiptOrderId ? (
              <div className="mt-2.5 grid gap-2 md:grid-cols-2">
                <Button className="h-9 rounded-2xl text-sm" variant="outline" onClick={() => printReceipt("all")} type="button">
                  Print Receipt
                </Button>
                <Button className="h-9 rounded-2xl text-sm" variant="outline" onClick={() => printReceipt("chef")} type="button">
                  Print Chef
                </Button>
                <Button className="h-9 rounded-2xl text-sm" variant="outline" onClick={() => printReceipt("store")} type="button">
                  Print Store
                </Button>
                <Button className="h-9 rounded-2xl text-sm" variant="outline" onClick={sendReceipt} type="button">
                  <Send className="h-4 w-4" />
                  Send Receipt
                </Button>
                <Button className="h-9 rounded-2xl text-sm" type="button" onClick={startNewOrder}>
                  Start New Order
                </Button>
              </div>
            ) : null}

            <div className="mt-2.5 space-y-1 rounded-2xl bg-slate-950 px-3 py-2 text-[0.84rem] text-white">
              <div className="flex justify-between"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
              <div className="flex justify-between"><span>Discount</span><span>-{formatCurrency(discountAmount)}</span></div>
              <div className="flex justify-between text-[0.94rem] font-bold"><span>Total</span><span>{formatCurrency(payableTotal)}</span></div>
            </div>

            <Button className="mt-2.5 h-9 w-full rounded-2xl text-sm" disabled={!ticket.length || submitting || orderCompleted} onClick={() => void submitOrder()}>
              <Receipt className="h-4 w-4" />
              {submitting ? "Processing..." : orderCompleted ? "Order Completed" : "Finish"}
            </Button>
          </Card>
        </div>
      </div>

      {productDialog ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 p-4">
          <Card className="flex max-h-[calc(100vh-2rem)] w-full max-w-2xl flex-col overflow-hidden rounded-3xl border-white/10 bg-slate-900 p-6 text-white shadow-none">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">{productDialog.categoryName}</p>
                <h3 className="mt-2 text-2xl font-black">{productDialog.name}</h3>
                <p className="mt-2 text-amber-200">{formatCurrency(productDialog.price)}</p>
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
                          <p className="text-sm text-white/60">{option.priceDelta ? `+${formatCurrency(option.priceDelta)}` : "Included"}</p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
              <div className="grid gap-3">
                <Input inputMode="numeric" value={productQuantity} onChange={(event) => setProductQuantity(event.target.value)} />
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

"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { Minus, Plus, Printer, Receipt, Search, Trash2, X } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { cn, formatCurrency } from "@/lib/utils";
import { fetchPosCatalog, type PosDiscountType, type PosPaymentMethod, type PosReceipt, type PosServiceType, submitPosOrder } from "@/lib/pos-client";
import type { AddOnGroup, Branch, Product } from "@/lib/types";

type PosCartLine = {
  id: string;
  kind: "PRODUCT" | "CUSTOM";
  productId?: string;
  name: string;
  customDescription?: string;
  quantity: number;
  unitPrice: number;
  note: string;
  selectedAddOnIds: string[];
  addOns: Array<{
    id: string;
    name: string;
    priceDelta: number;
  }>;
};

const paymentOptions: Array<{ value: PosPaymentMethod; label: string }> = [
  { value: "CASH_ON_DELIVERY", label: "Cash" },
  { value: "CARD", label: "Card" },
  { value: "JAZZCASH", label: "JazzCash" },
  { value: "EASYPAISA", label: "EasyPaisa" }
];
const serviceOptions: Array<{ value: PosServiceType; label: string }> = [
  { value: "TAKEAWAY", label: "Takeaway" },
  { value: "DINE_IN", label: "Dine In" }
];

function roundCurrency(value: number) {
  return Number(value.toFixed(2));
}

function createLineId() {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

function getLineUnitTotal(line: PosCartLine) {
  return line.unitPrice + line.addOns.reduce((sum, addOn) => sum + addOn.priceDelta, 0);
}

function getLineTotal(line: PosCartLine) {
  return getLineUnitTotal(line) * line.quantity;
}

function calculateDiscountAmount(subtotal: number, type: PosDiscountType, value: number) {
  if (type === "PERCENTAGE") {
    return Math.min(subtotal, roundCurrency((subtotal * value) / 100));
  }

  if (type === "FIXED") {
    return Math.min(subtotal, roundCurrency(value));
  }

  return 0;
}

function formatServiceType(value: string) {
  return value.replaceAll("_", " ");
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function defaultTaxRateForPayment(paymentMethod: PosPaymentMethod) {
  return paymentMethod === "CARD" ? 5 : 15;
}

function buildReceiptPreviewImage(receipt: PosReceipt) {
  const width = 420;
  const padding = 28;
  const lineHeight = 22;
  const detailLines = receipt.items.flatMap((item) => {
    const lines = [`${item.productName} x${item.quantity}`, `${formatCurrency(item.unitPrice)} each`];

    if (item.customDescription) {
      lines.push(item.customDescription);
    }

    for (const addOn of item.addOns) {
      lines.push(`+ ${addOn.optionName} ${formatCurrency(addOn.priceDelta)}`);
    }

    if (item.note) {
      lines.push(`Note: ${item.note}`);
    }

    lines.push(`Line total ${formatCurrency(item.quantity * (item.unitPrice + item.addOns.reduce((sum, addOn) => sum + addOn.priceDelta, 0)))}`);
    return lines;
  });

  const summaryLines = [
    `Subtotal ${formatCurrency(receipt.subtotal)}`,
    `Discount -${formatCurrency(receipt.discountAmount)}`,
    `Tax ${formatCurrency(receipt.taxAmount)} (${receipt.taxRate}%)`,
    `Total ${formatCurrency(receipt.totalAmount)}`,
    `Paid ${formatCurrency(receipt.cashReceivedAmount)}`,
    `Change ${formatCurrency(receipt.changeDueAmount)}`
  ];

  const height = 260 + detailLines.length * lineHeight + summaryLines.length * lineHeight;
  let y = 140;

  const detailText = detailLines
    .map((line) => {
      const text = `<text x="${padding}" y="${y}" font-size="15" fill="#0f172a">${escapeHtml(line)}</text>`;
      y += lineHeight;
      return text;
    })
    .join("");

  const summaryStart = y + 18;
  const summaryText = summaryLines
    .map((line, index) => {
      const rowY = summaryStart + index * lineHeight;
      const weight = index === 3 ? 800 : 600;
      const size = index === 3 ? 18 : 15;

      return `<text x="${padding}" y="${rowY}" font-size="${size}" font-weight="${weight}" fill="#0f172a">${escapeHtml(line)}</text>`;
    })
    .join("");

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">
      <rect width="${width}" height="${height}" fill="#efe8dd" />
      <rect x="18" y="18" width="${width - 36}" height="${height - 36}" rx="24" fill="#ffffff" />
      <rect x="${padding}" y="34" width="48" height="48" rx="14" fill="#f97316" />
      <text x="${padding + 24}" y="66" text-anchor="middle" font-size="24" font-weight="800" fill="#ffffff">P</text>
      <text x="${padding + 64}" y="56" font-size="30" font-weight="900" fill="#0f172a">POCKET</text>
      <text x="${padding + 64}" y="78" font-size="13" font-weight="600" fill="#f97316">Counter Receipt Preview</text>
      <text x="${padding}" y="104" font-size="14" fill="#475569">${escapeHtml(receipt.branchName)} • ${escapeHtml(receipt.branchCity)}</text>
      <text x="${padding}" y="124" font-size="14" fill="#475569">Order ${escapeHtml(receipt.orderNumber)} • ${escapeHtml(formatServiceType(receipt.serviceType))}</text>
      ${detailText}
      <line x1="${padding}" y1="${summaryStart - 10}" x2="${width - padding}" y2="${summaryStart - 10}" stroke="#cbd5e1" stroke-dasharray="6 6" />
      ${summaryText}
      <text x="${padding}" y="${height - 46}" font-size="13" fill="#475569">Payment ${escapeHtml(formatServiceType(receipt.paymentMethod))}</text>
      <text x="${padding}" y="${height - 26}" font-size="13" fill="#475569">Thank you for ordering with Pocket.</text>
    </svg>
  `;

  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`;
}

function openReceiptPreview(receipt: PosReceipt) {
  const popup = window.open("", "_blank", "width=520,height=860");
  if (!popup) return;

  const previewImage = buildReceiptPreviewImage(receipt);
  popup.document.write(`<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>${escapeHtml(receipt.orderNumber)} Preview</title>
    <style>
      body {
        margin: 0;
        padding: 24px;
        font-family: Arial, sans-serif;
        background: #f7f1e7;
        color: #0f172a;
      }
      .shell {
        max-width: 460px;
        margin: 0 auto;
      }
      h1 {
        margin: 0 0 8px;
        font-size: 20px;
      }
      p {
        margin: 0 0 16px;
        color: #475569;
        line-height: 1.5;
      }
      img {
        display: block;
        width: 100%;
        height: auto;
        border-radius: 22px;
        box-shadow: 0 18px 42px rgba(15, 23, 42, 0.12);
      }
    </style>
  </head>
  <body>
    <div class="shell">
      <h1>Receipt Preview</h1>
      <p>This is the current print output preview. We can later switch this same flow to the real printer.</p>
      <img src="${previewImage}" alt="Receipt preview for ${escapeHtml(receipt.orderNumber)}" />
    </div>
  </body>
</html>`);
  popup.document.close();
}

function ProductCustomizationModal({
  product,
  onClose,
  onConfirm
}: {
  product: Product;
  onClose: () => void;
  onConfirm: (input: { quantity: number; note: string; selectedAddOnIds: string[] }) => void;
}) {
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");
  const [selectedAddOnIds, setSelectedAddOnIds] = useState<string[]>([]);
  const [error, setError] = useState("");

  function toggleOption(group: AddOnGroup, optionId: string) {
    setSelectedAddOnIds((current) => {
      const belongsToGroup = new Set(group.options.map((option) => option.id));
      const alreadySelectedInGroup = current.filter((entry) => belongsToGroup.has(entry));

      if (current.includes(optionId)) {
        return current.filter((entry) => entry !== optionId);
      }

      if (alreadySelectedInGroup.length >= group.maxSelect) {
        return current;
      }

      return [...current, optionId];
    });
  }

  function handleConfirm() {
    for (const group of product.addOnGroups) {
      const groupSelections = selectedAddOnIds.filter((entry) => group.options.some((option) => option.id === entry));
      if (groupSelections.length < group.minSelect) {
        setError(`Select at least ${group.minSelect} option(s) for ${group.name}.`);
        return;
      }
    }

    onConfirm({
      quantity,
      note,
      selectedAddOnIds
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-pocket-charcoal/45 px-4 py-8">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-3xl border border-pocket-navy/10 bg-white p-6 shadow-panel">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Customize</p>
            <h2 className="mt-2 text-3xl font-black text-pocket-navy">{product.name}</h2>
            <p className="mt-2 text-sm text-pocket-navy/65">{product.description}</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-6 space-y-6">
          {product.addOnGroups.map((group) => (
            <div key={group.id} className="space-y-3">
              <div>
                <p className="text-base font-bold text-pocket-navy">{group.name}</p>
                <p className="text-sm text-pocket-navy/60">
                  Choose up to {group.maxSelect}
                  {group.minSelect ? `, minimum ${group.minSelect}` : ""}
                </p>
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                {group.options.map((option) => {
                  const active = selectedAddOnIds.includes(option.id);

                  return (
                    <button
                      key={option.id}
                      type="button"
                      onClick={() => toggleOption(group, option.id)}
                      className={cn(
                        "rounded-2xl border px-4 py-4 text-left transition",
                        active ? "border-pocket-orange bg-pocket-orange/10" : "border-pocket-navy/10 hover:bg-pocket-cream"
                      )}
                    >
                      <div className="flex items-center justify-between gap-3">
                        <span className="font-semibold text-pocket-navy">{option.name}</span>
                        <span className="font-bold text-pocket-orange">+{formatCurrency(option.priceDelta)}</span>
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          ))}

          <div className="grid gap-4 md:grid-cols-[160px_1fr]">
            <div>
              <label className="text-sm font-semibold text-pocket-navy">Quantity</label>
              <div className="mt-2 inline-flex items-center gap-2 rounded-2xl border border-pocket-navy/10 bg-pocket-cream px-3 py-2">
                <button type="button" onClick={() => setQuantity((current) => Math.max(1, current - 1))} className="rounded-lg p-1 hover:bg-white">
                  <Minus className="h-4 w-4" />
                </button>
                <span className="min-w-8 text-center text-sm font-bold text-pocket-navy">{quantity}</span>
                <button type="button" onClick={() => setQuantity((current) => current + 1)} className="rounded-lg p-1 hover:bg-white">
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
            <div>
              <label className="text-sm font-semibold text-pocket-navy">Item note</label>
              <Textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Extra sauce, no onions, table note..." className="mt-2 min-h-24" />
            </div>
          </div>
        </div>

        {error ? <p className="mt-4 text-sm font-medium text-red-600">{error}</p> : null}

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>Add to Ticket</Button>
        </div>
      </div>
    </div>
  );
}

function CustomItemModal({
  onClose,
  onConfirm
}: {
  onClose: () => void;
  onConfirm: (input: { name: string; description: string; unitPrice: number; quantity: number; note: string }) => void;
}) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [unitPrice, setUnitPrice] = useState("");
  const [quantity, setQuantity] = useState(1);
  const [note, setNote] = useState("");
  const [error, setError] = useState("");

  function handleConfirm() {
    if (name.trim().length < 2) {
      setError("Enter a short item name for this manual line.");
      return;
    }

    const parsedUnitPrice = Number(unitPrice || 0);
    if (!Number.isFinite(parsedUnitPrice) || parsedUnitPrice <= 0) {
      setError("Enter a valid amount greater than zero.");
      return;
    }

    onConfirm({
      name: name.trim(),
      description: description.trim(),
      unitPrice: roundCurrency(parsedUnitPrice),
      quantity,
      note: note.trim()
    });
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-pocket-charcoal/45 px-4 py-8">
      <div className="max-h-[90vh] w-full max-w-2xl overflow-auto rounded-3xl border border-pocket-navy/10 bg-white p-6 shadow-panel">
        <div className="flex items-start justify-between gap-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Manual Item</p>
            <h2 className="mt-2 text-3xl font-black text-pocket-navy">Add other item</h2>
            <p className="mt-2 text-sm text-pocket-navy/65">Use this for quick counter-only entries that are not already listed in the menu.</p>
          </div>
          <Button variant="ghost" size="sm" onClick={onClose}>
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="mt-6 grid gap-4">
          <div>
            <label className="text-sm font-semibold text-pocket-navy">Item name</label>
            <Input value={name} onChange={(event) => setName(event.target.value)} placeholder="Other item, extra sauce bottle, staff meal..." className="mt-2" />
          </div>

          <div>
            <label className="text-sm font-semibold text-pocket-navy">Description</label>
            <Textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              placeholder="What exactly is being added to the bill?"
              className="mt-2 min-h-20"
            />
          </div>

          <div className="grid gap-4 md:grid-cols-[1fr_160px]">
            <div>
              <label className="text-sm font-semibold text-pocket-navy">Amount</label>
              <Input type="number" min="0" step="0.01" value={unitPrice} onChange={(event) => setUnitPrice(event.target.value)} placeholder="0.00" className="mt-2" />
            </div>
            <div>
              <label className="text-sm font-semibold text-pocket-navy">Quantity</label>
              <div className="mt-2 inline-flex items-center gap-2 rounded-2xl border border-pocket-navy/10 bg-pocket-cream px-3 py-2">
                <button type="button" onClick={() => setQuantity((current) => Math.max(1, current - 1))} className="rounded-lg p-1 hover:bg-white">
                  <Minus className="h-4 w-4" />
                </button>
                <span className="min-w-8 text-center text-sm font-bold text-pocket-navy">{quantity}</span>
                <button type="button" onClick={() => setQuantity((current) => current + 1)} className="rounded-lg p-1 hover:bg-white">
                  <Plus className="h-4 w-4" />
                </button>
              </div>
            </div>
          </div>

          <div>
            <label className="text-sm font-semibold text-pocket-navy">Cart note</label>
            <Textarea value={note} onChange={(event) => setNote(event.target.value)} placeholder="Any kitchen or counter note for this line..." className="mt-2 min-h-24" />
          </div>
        </div>

        {error ? <p className="mt-4 text-sm font-medium text-red-600">{error}</p> : null}

        <div className="mt-6 flex justify-end gap-3">
          <Button variant="outline" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={handleConfirm}>Add Custom Item</Button>
        </div>
      </div>
    </div>
  );
}

export function PosTerminal() {
  const router = useRouter();
  const [authorized, setAuthorized] = useState(false);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const [branches, setBranches] = useState<Branch[]>([]);
  const [categories, setCategories] = useState<Array<{ id: string; slug: string; name: string }>>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [activeBranch, setActiveBranch] = useState("");
  const [activeCategory, setActiveCategory] = useState("all");
  const [query, setQuery] = useState("");
  const [cart, setCart] = useState<PosCartLine[]>([]);
  const [serviceType, setServiceType] = useState<PosServiceType>("TAKEAWAY");
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [orderNote, setOrderNote] = useState("");
  const [paymentMethod, setPaymentMethod] = useState<PosPaymentMethod>("CASH_ON_DELIVERY");
  const [taxRate, setTaxRate] = useState(String(defaultTaxRateForPayment("CASH_ON_DELIVERY")));
  const [discountType, setDiscountType] = useState<PosDiscountType>("NONE");
  const [discountValue, setDiscountValue] = useState("0");
  const [checkoutOpen, setCheckoutOpen] = useState(false);
  const [tenderedAmount, setTenderedAmount] = useState("");
  const [customizingProduct, setCustomizingProduct] = useState<Product | null>(null);
  const [customItemOpen, setCustomItemOpen] = useState(false);
  const [lastReceipt, setLastReceipt] = useState<PosReceipt | null>(null);

  useEffect(() => {
    const posToken = window.localStorage.getItem("pocket-pos-token");
    const adminToken = window.localStorage.getItem("pocket-admin-token");

    if (!posToken && !adminToken) {
      router.replace("/pos/login?next=/pos");
      return;
    }

    setAuthorized(true);
  }, [router]);

  useEffect(() => {
    setTaxRate(String(defaultTaxRateForPayment(paymentMethod)));
  }, [paymentMethod]);

  useEffect(() => {
    if (!authorized) return;

    let cancelled = false;

    async function loadCatalog() {
      try {
        setLoading(true);
        setError("");
        const data = await fetchPosCatalog(activeBranch || undefined);

        if (cancelled) return;

        setBranches(data.branches);
        setCategories(data.categories.map((category) => ({ id: category.id, slug: category.slug, name: category.name })));
        setProducts(data.products);

        if (!activeBranch && data.branches[0]) {
          setActiveBranch(data.branches[0].slug);
        }
      } catch (loadError) {
        if (!cancelled) {
          setError(loadError instanceof Error ? loadError.message : "Unable to load the POS catalog.");
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    void loadCatalog();

    return () => {
      cancelled = true;
    };
  }, [activeBranch, authorized]);

  const filteredProducts = useMemo(() => {
    return products.filter((product) => {
      const matchesCategory = activeCategory === "all" || product.category.slug === activeCategory;
      const haystack = `${product.name} ${product.description} ${product.category.name}`.toLowerCase();
      const matchesQuery = !query.trim() || haystack.includes(query.trim().toLowerCase());

      return matchesCategory && matchesQuery;
    });
  }, [activeCategory, products, query]);

  const subtotal = useMemo(() => cart.reduce((sum, line) => sum + getLineTotal(line), 0), [cart]);
  const parsedTaxRate = Number(taxRate || 0);
  const normalizedDiscountValue = Number(discountValue || 0);
  const discountAmount = useMemo(() => calculateDiscountAmount(subtotal, discountType, normalizedDiscountValue), [discountType, normalizedDiscountValue, subtotal]);
  const taxAmount = useMemo(() => roundCurrency((subtotal * parsedTaxRate) / 100), [parsedTaxRate, subtotal]);
  const total = useMemo(() => Math.max(0, roundCurrency(subtotal + taxAmount - discountAmount)), [discountAmount, subtotal, taxAmount]);
  const paidAmount = Number(tenderedAmount || 0);
  const changeDue = Math.max(0, roundCurrency(paidAmount - total));
  const activeBranchDetails = branches.find((branch) => branch.slug === activeBranch);

  useEffect(() => {
    if (!checkoutOpen) return;
    setTenderedAmount((current) => current || String(total));
  }, [checkoutOpen, total]);

  function updateLine(lineId: string, updater: (line: PosCartLine) => PosCartLine) {
    setCart((current) => current.map((line) => (line.id === lineId ? updater(line) : line)));
  }

  function appendLine(product: Product, input?: { quantity?: number; note?: string; selectedAddOnIds?: string[] }) {
    const selectedAddOnIds = input?.selectedAddOnIds ?? [];
    const addOns = product.addOnGroups
      .flatMap((group) => group.options)
      .filter((option) => selectedAddOnIds.includes(option.id))
      .map((option) => ({
        id: option.id,
        name: option.name,
        priceDelta: option.priceDelta
      }));

    setCart((current) => [
      ...current,
      {
        id: createLineId(),
        kind: "PRODUCT",
        productId: product.id,
        name: product.name,
        quantity: input?.quantity ?? 1,
        unitPrice: product.price,
        note: input?.note ?? "",
        selectedAddOnIds,
        addOns
      }
    ]);
  }

  function appendCustomLine(input: { name: string; description: string; unitPrice: number; quantity: number; note: string }) {
    setCart((current) => [
      ...current,
      {
        id: createLineId(),
        kind: "CUSTOM",
        name: input.name,
        customDescription: input.description || undefined,
        quantity: input.quantity,
        unitPrice: input.unitPrice,
        note: input.note,
        selectedAddOnIds: [],
        addOns: []
      }
    ]);
  }

  function resetSale() {
    setCart([]);
    setCustomerName("");
    setCustomerPhone("");
    setOrderNote("");
    setPaymentMethod("CASH_ON_DELIVERY");
    setTaxRate(String(defaultTaxRateForPayment("CASH_ON_DELIVERY")));
    setDiscountType("NONE");
    setDiscountValue("0");
    setTenderedAmount("");
    setCheckoutOpen(false);
  }

  async function handleCheckout() {
    if (!activeBranch) {
      setError("Select a branch before checking out.");
      return;
    }

    setSubmitting(true);
    setError("");

    try {
      const receipt = await submitPosOrder({
        branchSlug: activeBranch,
        serviceType,
        customerName: customerName.trim() || undefined,
        customerPhone: customerPhone.trim() || undefined,
        paymentMethod,
        paidAmount,
        taxRate: parsedTaxRate,
        note: orderNote.trim() || undefined,
        discount: {
          type: discountType,
          value: normalizedDiscountValue
        },
        items: cart.map((line) =>
          line.kind === "CUSTOM"
            ? {
                kind: "CUSTOM" as const,
                name: line.name,
                description: line.customDescription?.trim() || undefined,
                unitPrice: line.unitPrice,
                quantity: line.quantity,
                note: line.note.trim() || undefined
              }
            : {
                kind: "PRODUCT" as const,
                productId: line.productId!,
                quantity: line.quantity,
                note: line.note.trim() || undefined,
                selectedAddOnIds: line.selectedAddOnIds
              }
        )
      });

      setLastReceipt(receipt);
      resetSale();
      openReceiptPreview(receipt);
    } catch (checkoutError) {
      setError(checkoutError instanceof Error ? checkoutError.message : "Unable to complete this POS order.");
    } finally {
      setSubmitting(false);
    }
  }

  if (!authorized) {
    return <div className="min-h-screen bg-pocket-cream" />;
  }

  return (
    <div className="min-h-screen bg-[linear-gradient(180deg,rgba(255,245,235,1)_0%,rgba(255,255,255,1)_52%,rgba(252,247,242,1)_100%)]">
      <div className="border-b border-pocket-navy/10 bg-white/90 backdrop-blur">
        <div className="mx-auto flex max-w-[1800px] flex-col gap-4 px-4 py-4 lg:flex-row lg:items-center lg:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Counter Terminal</p>
            <h1 className="text-3xl font-black text-pocket-navy">POCKET POS</h1>
          </div>

          <div className="flex flex-col gap-3 md:flex-row md:items-center">
            <select
              value={activeBranch}
              onChange={(event) => setActiveBranch(event.target.value)}
              className="h-11 rounded-2xl border border-pocket-navy/10 bg-white px-4 text-sm font-semibold text-pocket-navy outline-none focus:border-pocket-orange"
            >
              {branches.map((branch) => (
                <option key={branch.id} value={branch.slug}>
                  {branch.name}
                </option>
              ))}
            </select>

            <div className="inline-flex rounded-2xl border border-pocket-navy/10 bg-pocket-cream p-1">
              {serviceOptions.map((option) => (
                <button
                  key={option.value}
                  type="button"
                  onClick={() => setServiceType(option.value)}
                  className={cn(
                    "rounded-2xl px-4 py-2 text-sm font-semibold transition",
                    serviceType === option.value ? "bg-pocket-orange text-white" : "text-pocket-navy/70"
                  )}
                >
                  {option.label}
                </button>
              ))}
            </div>

            <Link href="/admin" className="inline-flex">
              <Button variant="outline">Back to Admin</Button>
            </Link>
          </div>
        </div>
      </div>

      <div className="mx-auto grid max-w-[1800px] gap-6 px-4 py-6 xl:grid-cols-[minmax(0,1.15fr)_420px]">
        <div className="space-y-6">
          <Card className="overflow-hidden rounded-3xl border-pocket-navy/10">
            <div className="grid gap-4 border-b border-pocket-navy/10 bg-white p-5 lg:grid-cols-[1fr_auto] lg:items-center">
              <div className="relative">
                <Search className="pointer-events-none absolute left-4 top-1/2 h-4 w-4 -translate-y-1/2 text-pocket-navy/35" />
                <Input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Search shawarmas, combos, fries, drinks..." className="h-12 rounded-2xl pl-11" />
              </div>

              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setActiveCategory("all")}
                  className={cn(
                    "rounded-2xl border px-4 py-2 text-sm font-semibold transition",
                    activeCategory === "all" ? "border-pocket-orange bg-pocket-orange text-white" : "border-pocket-navy/10 bg-pocket-cream text-pocket-navy"
                  )}
                >
                  All
                </button>
                {categories.map((category) => (
                  <button
                    key={category.id}
                    type="button"
                    onClick={() => setActiveCategory(category.slug)}
                    className={cn(
                      "rounded-2xl border px-4 py-2 text-sm font-semibold transition",
                      activeCategory === category.slug ? "border-pocket-orange bg-pocket-orange text-white" : "border-pocket-navy/10 bg-pocket-cream text-pocket-navy"
                    )}
                  >
                    {category.name}
                  </button>
                ))}
              </div>
            </div>

            {loading ? (
              <div className="p-8 text-sm text-pocket-navy/60">Loading live POS catalog...</div>
            ) : (
              <div className="grid gap-3 p-5 md:grid-cols-2 2xl:grid-cols-3">
                <button
                  type="button"
                  onClick={() => setCustomItemOpen(true)}
                  className="rounded-3xl border border-dashed border-pocket-orange/45 bg-pocket-orange/[0.06] p-4 text-left transition hover:bg-pocket-orange/[0.1]"
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0">
                      <p className="text-lg font-black text-pocket-navy">Other Item</p>
                      <p className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-pocket-orange">Manual Entry</p>
                      <p className="mt-3 text-sm text-pocket-navy/60">Add a custom description and amount for anything counter staff needs to bill manually.</p>
                    </div>
                    <Badge className="shrink-0 bg-pocket-orange text-white">Custom</Badge>
                  </div>
                </button>

                {filteredProducts.map((product) => (
                  <button
                    key={product.id}
                    type="button"
                    onClick={() => (product.addOnGroups.length ? setCustomizingProduct(product) : appendLine(product))}
                    className="rounded-3xl border border-pocket-navy/10 bg-white p-4 text-left transition hover:border-pocket-orange/40 hover:bg-pocket-cream/40"
                  >
                    <div className="flex items-start justify-between gap-4">
                      <div className="min-w-0">
                        <p className="text-lg font-black text-pocket-navy">{product.name}</p>
                        <p className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-pocket-navy/45">{product.category.name}</p>
                        {product.addOnGroups.length ? <p className="mt-3 text-sm text-pocket-navy/60">Tap to customize</p> : null}
                      </div>
                      <p className="shrink-0 text-lg font-black text-pocket-orange">{formatCurrency(product.price)}</p>
                    </div>
                  </button>
                ))}
              </div>
            )}
          </Card>
        </div>

        <div className="space-y-5">
          <Card className="rounded-3xl border-pocket-navy/10 p-5">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Current Ticket</p>
                <h2 className="mt-2 text-2xl font-black text-pocket-navy">{activeBranchDetails?.name ?? "Select branch"}</h2>
              </div>
              <Receipt className="h-8 w-8 text-pocket-orange" />
            </div>

            <div className="mt-5 grid gap-4">
              <Input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Customer name (optional)" />
              <Input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} placeholder="Customer phone (optional)" />
              <Textarea value={orderNote} onChange={(event) => setOrderNote(event.target.value)} placeholder="Order note for kitchen or counter..." className="min-h-24" />
            </div>

            <div className="mt-5 grid gap-3">
              {cart.length ? (
                cart.map((line) => (
                  <div key={line.id} className="rounded-3xl border border-pocket-navy/10 bg-pocket-cream/60 p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-bold text-pocket-navy">{line.name}</p>
                          {line.kind === "CUSTOM" ? <Badge className="bg-pocket-orange text-white">Custom</Badge> : null}
                        </div>
                        {line.customDescription ? <p className="mt-1 text-sm text-pocket-navy/60">{line.customDescription}</p> : null}
                        <p className="text-sm text-pocket-navy/60">{formatCurrency(getLineUnitTotal(line))} each</p>
                        {line.addOns.length ? (
                          <div className="mt-2 flex flex-wrap gap-2">
                            {line.addOns.map((addOn) => (
                              <span key={addOn.id} className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-pocket-navy">
                                {addOn.name}
                              </span>
                            ))}
                          </div>
                        ) : null}
                      </div>

                      <button type="button" onClick={() => setCart((current) => current.filter((entry) => entry.id !== line.id))} className="rounded-xl border border-pocket-navy/10 bg-white p-2 hover:bg-pocket-cream">
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>

                    <div className="mt-4 grid gap-4">
                      <div>
                        <label className="text-xs font-semibold uppercase tracking-[0.2em] text-pocket-navy/50">Item note</label>
                        <Textarea
                          value={line.note}
                          onChange={(event) => updateLine(line.id, (entry) => ({ ...entry, note: event.target.value }))}
                          placeholder="Add instructions for this line item..."
                          className="mt-2 min-h-20 bg-white"
                        />
                      </div>

                      <div className="flex items-center justify-between">
                        <div className="inline-flex items-center gap-2 rounded-2xl border border-pocket-navy/10 bg-white px-3 py-2">
                          <button type="button" onClick={() => updateLine(line.id, (entry) => ({ ...entry, quantity: Math.max(1, entry.quantity - 1) }))} className="rounded-lg p-1 hover:bg-pocket-cream">
                            <Minus className="h-4 w-4" />
                          </button>
                          <span className="min-w-8 text-center text-sm font-bold text-pocket-navy">{line.quantity}</span>
                          <button type="button" onClick={() => updateLine(line.id, (entry) => ({ ...entry, quantity: entry.quantity + 1 }))} className="rounded-lg p-1 hover:bg-pocket-cream">
                            <Plus className="h-4 w-4" />
                          </button>
                        </div>
                        <p className="text-lg font-black text-pocket-orange">{formatCurrency(getLineTotal(line))}</p>
                      </div>
                    </div>
                  </div>
                ))
              ) : (
                <div className="rounded-3xl border border-dashed border-pocket-navy/15 bg-pocket-cream/40 p-6 text-sm text-pocket-navy/60">
                  Your POS ticket is empty. Tap any item on the left to add it instantly.
                </div>
              )}
            </div>
          </Card>

          <Card className="rounded-3xl border-pocket-navy/10 p-5">
            <div className="grid gap-4">
              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-navy/55">Payment</label>
                <div className="mt-2 grid grid-cols-2 gap-2">
                  {paymentOptions.map((option) => (
                    <button
                      key={option.value}
                      type="button"
                      onClick={() => setPaymentMethod(option.value)}
                      className={cn(
                        "rounded-2xl border px-4 py-3 text-sm font-semibold transition",
                        paymentMethod === option.value ? "border-pocket-orange bg-pocket-orange text-white" : "border-pocket-navy/10 bg-pocket-cream text-pocket-navy"
                      )}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="grid gap-3 md:grid-cols-[180px_1fr]">
                <div>
                  <label className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-navy/55">Discount</label>
                  <select
                    value={discountType}
                    onChange={(event) => setDiscountType(event.target.value as PosDiscountType)}
                    className="mt-2 h-11 w-full rounded-2xl border border-pocket-navy/10 bg-white px-4 text-sm font-semibold text-pocket-navy outline-none focus:border-pocket-orange"
                  >
                    <option value="NONE">No discount</option>
                    <option value="PERCENTAGE">Percentage</option>
                    <option value="FIXED">Fixed amount</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-navy/55">
                    {discountType === "PERCENTAGE" ? "Discount %" : "Discount value"}
                  </label>
                  <Input
                    type="number"
                    min="0"
                    step="0.01"
                    value={discountValue}
                    onChange={(event) => setDiscountValue(event.target.value)}
                    disabled={discountType === "NONE"}
                    className="mt-2"
                  />
                </div>
              </div>

              <div>
                <label className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-navy/55">Tax %</label>
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.01"
                  value={taxRate}
                  onChange={(event) => setTaxRate(event.target.value)}
                  className="mt-2"
                />
                <p className="mt-2 text-xs text-pocket-navy/55">
                  Default tax is {defaultTaxRateForPayment(paymentMethod)}% for {formatServiceType(paymentMethod).toLowerCase()} payments.
                </p>
              </div>

              <div className="rounded-3xl bg-pocket-navy p-5 text-pocket-cream">
                <div className="flex items-center justify-between text-sm">
                  <span>Subtotal</span>
                  <span>{formatCurrency(subtotal)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span>Discount</span>
                  <span>-{formatCurrency(discountAmount)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span>Tax ({parsedTaxRate}%)</span>
                  <span>{formatCurrency(taxAmount)}</span>
                </div>
                <div className="mt-4 flex items-center justify-between border-t border-white/10 pt-4 text-2xl font-black">
                  <span>Total</span>
                  <span className="text-pocket-orange">{formatCurrency(total)}</span>
                </div>
              </div>

              {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}

              <div className="grid gap-3">
                <Button className="h-12 text-base" disabled={!cart.length || submitting || loading} onClick={() => setCheckoutOpen(true)}>
                  <Printer className="h-4 w-4" />
                  Charge and Preview Slip
                </Button>
                {lastReceipt ? (
                  <Button variant="outline" onClick={() => openReceiptPreview(lastReceipt)}>
                    Open Last Receipt Preview
                  </Button>
                ) : null}
              </div>
            </div>
          </Card>
        </div>
      </div>

      {customizingProduct ? (
        <ProductCustomizationModal
          product={customizingProduct}
          onClose={() => setCustomizingProduct(null)}
          onConfirm={({ quantity, note, selectedAddOnIds }) => {
            appendLine(customizingProduct, { quantity, note, selectedAddOnIds });
            setCustomizingProduct(null);
          }}
        />
      ) : null}

      {customItemOpen ? (
        <CustomItemModal
          onClose={() => setCustomItemOpen(false)}
          onConfirm={(input) => {
            appendCustomLine(input);
            setCustomItemOpen(false);
          }}
        />
      ) : null}

      {checkoutOpen ? (
        <div className="fixed inset-0 z-40 flex items-end justify-center bg-pocket-charcoal/50 px-4 py-6 lg:items-center">
          <div className="w-full max-w-xl rounded-3xl border border-pocket-navy/10 bg-white p-6 shadow-panel">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Finalize Sale</p>
                <h2 className="mt-2 text-3xl font-black text-pocket-navy">Collect payment and preview receipt</h2>
              </div>
              <Button variant="ghost" size="sm" onClick={() => setCheckoutOpen(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            <div className="mt-6 grid gap-4">
              <div className="rounded-3xl bg-pocket-cream p-4">
                <div className="flex items-center justify-between text-sm">
                  <span>Total due</span>
                  <span className="font-bold text-pocket-navy">{formatCurrency(total)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span>Payment method</span>
                  <span className="font-semibold text-pocket-navy">{formatServiceType(paymentMethod)}</span>
                </div>
                <div className="mt-2 flex items-center justify-between text-sm">
                  <span>Tax applied</span>
                  <span className="font-semibold text-pocket-navy">{parsedTaxRate}%</span>
                </div>
              </div>

              <div>
                <label className="text-sm font-semibold text-pocket-navy">Paid amount</label>
                <Input type="number" min="0" step="0.01" value={tenderedAmount} onChange={(event) => setTenderedAmount(event.target.value)} className="mt-2 h-12 text-lg font-bold" />
              </div>

              <div className="grid gap-3 md:grid-cols-2">
                <div className="rounded-3xl border border-pocket-navy/10 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-navy/50">Paid</p>
                  <p className="mt-2 text-2xl font-black text-pocket-navy">{formatCurrency(paidAmount)}</p>
                </div>
                <div className="rounded-3xl border border-pocket-navy/10 p-4">
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-navy/50">Change</p>
                  <p className="mt-2 text-2xl font-black text-pocket-orange">{formatCurrency(changeDue)}</p>
                </div>
              </div>

              {paidAmount < total ? <p className="text-sm font-medium text-red-600">Paid amount must be at least the order total before the receipt preview can open.</p> : null}
            </div>

            <div className="mt-6 flex justify-end gap-3">
              <Button variant="outline" onClick={() => setCheckoutOpen(false)}>
                Back
              </Button>
              <Button disabled={paidAmount < total || submitting} onClick={() => void handleCheckout()}>
                {submitting ? "Processing..." : "Finish and View Slip"}
              </Button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Minus, Plus, Search, Trash2, LogOut, Receipt, ShoppingBag, PencilLine } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { createPosOrder, fetchPosCatalog, fetchPosSession, getPosTokenKey } from "@/lib/pos-client";
import type { AddOnGroup, PosCatalogProduct } from "@/lib/types";
import { cn, formatCurrency } from "@/lib/utils";

type TicketLine = {
  id: string;
  type: "product" | "manual";
  productId?: string;
  name: string;
  categoryName: string;
  quantity: number;
  unitPrice: number;
  note: string;
  customDescription?: string;
  selections: Array<{ groupId: string; optionIds: string[] }>;
  addOns: Array<{ id: string; name: string; priceDelta: number }>;
};

const paymentOptions = [
  { value: "CASH", label: "Cash", taxRate: 15 },
  { value: "CARD", label: "Card", taxRate: 5 },
  { value: "EASYPAISA", label: "EasyPaisa", taxRate: 15 },
  { value: "JAZZCASH", label: "JazzCash", taxRate: 15 }
] as const;

const serviceTypes = ["TAKEAWAY", "DINE_IN"] as const;

function buildDefaultSelections(groups: AddOnGroup[]) {
  return groups.map((group) => ({
    groupId: group.id,
    optionIds: group.options.slice(0, group.minSelect).map((option) => option.id)
  }));
}

function calculateLinePrice(product: PosCatalogProduct, selections: Array<{ groupId: string; optionIds: string[] }>) {
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
  const [taxRate, setTaxRate] = useState(15);
  const [discountType, setDiscountType] = useState<"NONE" | "PERCENTAGE" | "FIXED">("NONE");
  const [discountValue, setDiscountValue] = useState(0);
  const [paidAmount, setPaidAmount] = useState("");
  const [checkoutNote, setCheckoutNote] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [productDialog, setProductDialog] = useState<PosCatalogProduct | null>(null);
  const [productSelections, setProductSelections] = useState<Array<{ groupId: string; optionIds: string[] }>>([]);
  const [productQuantity, setProductQuantity] = useState(1);
  const [productNote, setProductNote] = useState("");
  const [manualDialogOpen, setManualDialogOpen] = useState(false);
  const [manualName, setManualName] = useState("");
  const [manualDescription, setManualDescription] = useState("");
  const [manualQuantity, setManualQuantity] = useState(1);
  const [manualUnitPrice, setManualUnitPrice] = useState("");
  const [manualNote, setManualNote] = useState("");

  async function loadCatalog(nextBranchId?: string, nextCategoryId?: string, nextSearch?: string) {
    const data = await fetchPosCatalog({
      branchId: nextBranchId || branchId || undefined,
      categoryId: nextCategoryId && nextCategoryId !== "ALL" ? nextCategoryId : undefined,
      search: nextSearch || undefined
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
      const token = window.localStorage.getItem(getPosTokenKey());
      if (!token) {
        router.replace("/pos/login");
        return;
      }

      try {
        const session = await fetchPosSession();
        if (!["ADMIN", "SUPER_ADMIN", "POS_STAFF"].includes(session.user.role)) {
          window.localStorage.removeItem(getPosTokenKey());
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
          window.localStorage.removeItem(getPosTokenKey());
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

  useEffect(() => {
    const defaultTax = paymentOptions.find((option) => option.value === paymentMethod)?.taxRate ?? 15;
    setTaxRate(defaultTax);
  }, [paymentMethod]);

  const subtotal = useMemo(() => ticket.reduce((sum, item) => sum + item.unitPrice * item.quantity, 0), [ticket]);
  const discountAmount = useMemo(() => {
    if (discountType === "PERCENTAGE") {
      return Math.min(subtotal, (subtotal * discountValue) / 100);
    }
    if (discountType === "FIXED") {
      return Math.min(subtotal, discountValue);
    }
    return 0;
  }, [discountType, discountValue, subtotal]);
  const taxAmount = useMemo(() => ((subtotal - discountAmount) * taxRate) / 100, [discountAmount, subtotal, taxRate]);
  const total = useMemo(() => Math.max(0, subtotal - discountAmount + taxAmount), [discountAmount, subtotal, taxAmount]);
  const change = Math.max(0, Number(paidAmount || 0) - total);

  function addProductToTicket(product: PosCatalogProduct) {
    if (product.addOnGroups.length) {
      setProductDialog(product);
      setProductSelections(buildDefaultSelections(product.addOnGroups));
      setProductQuantity(1);
      setProductNote("");
      return;
    }

    setTicket((current) => [
      {
        id: crypto.randomUUID(),
        type: "product",
        productId: product.id,
        name: product.name,
        categoryName: product.categoryName,
        quantity: 1,
        unitPrice: product.price,
        note: "",
        selections: [],
        addOns: []
      },
      ...current
    ]);
  }

  function confirmConfiguredProduct() {
    if (!productDialog) return;

    for (const group of productDialog.addOnGroups) {
      const selected = productSelections.find((entry) => entry.groupId === group.id)?.optionIds ?? [];
      if (selected.length < group.minSelect || selected.length > group.maxSelect) {
        setError(`${group.name} requires ${group.minSelect} to ${group.maxSelect} selections.`);
        return;
      }
    }

    const pricing = calculateLinePrice(productDialog, productSelections);
    setTicket((current) => [
      {
        id: crypto.randomUUID(),
        type: "product",
        productId: productDialog.id,
        name: productDialog.name,
        categoryName: productDialog.categoryName,
        quantity: productQuantity,
        unitPrice: pricing.unitPrice,
        note: productNote,
        selections: productSelections,
        addOns: pricing.addOns,
      },
      ...current
    ]);
    setProductDialog(null);
    setError("");
  }

  function addManualItem() {
    const price = Number(manualUnitPrice);
    if (!manualName.trim() || Number.isNaN(price)) {
      setError("Manual item needs a name and valid amount.");
      return;
    }

    setTicket((current) => [
      {
        id: crypto.randomUUID(),
        type: "manual",
        name: manualName.trim(),
        categoryName: "Manual",
        quantity: manualQuantity,
        unitPrice: price,
        note: manualNote.trim(),
        customDescription: manualDescription.trim(),
        selections: [],
        addOns: []
      },
      ...current
    ]);
    setManualDialogOpen(false);
    setManualName("");
    setManualDescription("");
    setManualQuantity(1);
    setManualUnitPrice("");
    setManualNote("");
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
        taxRate,
        discountType,
        discountValue,
        paidAmount: Number(paidAmount || 0),
        note: checkoutNote.trim() || undefined,
        items: ticket.map((item) =>
          item.type === "manual"
            ? {
                type: "manual",
                name: item.name,
                description: item.customDescription || undefined,
                quantity: item.quantity,
                unitPrice: item.unitPrice,
                note: item.note || undefined
              }
            : {
                type: "product",
                productId: item.productId,
                quantity: item.quantity,
                note: item.note || undefined,
                selections: item.selections
              }
        )
      });

      const receiptPath = `/pos/receipt/${response.order.id}`;
      window.open(receiptPath, "_blank", "noopener,noreferrer");
      setTicket([]);
      setCustomerName("");
      setCustomerPhone("");
      setDiscountType("NONE");
      setDiscountValue(0);
      setPaidAmount("");
      setCheckoutNote("");
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

  if (!ready || loading) {
    return <div className="min-h-screen bg-[#111827] px-6 py-10 text-white">Loading POS terminal...</div>;
  }

  return (
    <div className="min-h-screen bg-[radial-gradient(circle_at_top_left,_rgba(245,158,11,0.18),_transparent_22%),linear-gradient(135deg,_#111827,_#1f2937_55%,_#0f172a)] px-4 py-6 text-white md:px-6">
      <div className="mx-auto max-w-[1680px] space-y-6">
        <div className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-white/5 p-5 backdrop-blur md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.35em] text-amber-300">Pocket POS</p>
            <h1 className="mt-2 text-3xl font-black">Counter Terminal</h1>
          </div>
          <div className="flex flex-wrap gap-3">
            <select
              value={branchId}
              onChange={(event) => {
                const nextBranchId = event.target.value;
                setBranchId(nextBranchId);
                void loadCatalog(nextBranchId, categoryId, search);
              }}
              className="h-11 rounded-xl border border-white/10 bg-slate-950/60 px-4 text-sm"
            >
              {branches.map((branch) => (
                <option key={branch.id} value={branch.id}>
                  {branch.name}
                </option>
              ))}
            </select>
            <Button
              variant="outline"
              className="border-white/15 bg-white/5 text-white hover:bg-white/10"
              onClick={() => router.push("/pos/orders")}
            >
              View Orders
            </Button>
            <Button
              variant="outline"
              className="border-white/15 bg-white/5 text-white hover:bg-white/10"
              onClick={() => {
                window.localStorage.removeItem(getPosTokenKey());
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

        <div className="grid gap-6 xl:grid-cols-[1.45fr_0.95fr]">
          <div className="space-y-4">
            <Card className="rounded-3xl border-white/10 bg-white/5 p-4 shadow-none">
              <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_220px_180px]">
                <label className="flex h-12 items-center gap-3 rounded-2xl border border-white/10 bg-slate-950/60 px-4">
                  <Search className="h-4 w-4 text-white/60" />
                  <input
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Enter") {
                        void loadCatalog(branchId, categoryId, search);
                      }
                    }}
                    placeholder="Search menu"
                    className="w-full bg-transparent text-sm outline-none placeholder:text-white/40"
                  />
                </label>
                <select
                  value={categoryId}
                  onChange={(event) => {
                    const nextCategoryId = event.target.value;
                    setCategoryId(nextCategoryId);
                    void loadCatalog(branchId, nextCategoryId, search);
                  }}
                  className="h-12 rounded-2xl border border-white/10 bg-slate-950/60 px-4 text-sm"
                >
                  <option value="ALL">All categories</option>
                  {categories.map((category) => (
                    <option key={category.id} value={category.id}>
                      {category.name}
                    </option>
                  ))}
                </select>
                <Button className="h-12 rounded-2xl" onClick={() => setManualDialogOpen(true)}>
                  <PencilLine className="h-4 w-4" />
                  Other Item
                </Button>
              </div>
            </Card>

            <div className="grid gap-4 md:grid-cols-2 2xl:grid-cols-3">
              {products.map((product) => (
                <button
                  key={product.id}
                  type="button"
                  onClick={() => addProductToTicket(product)}
                  className="rounded-3xl border border-white/10 bg-white/5 p-5 text-left transition hover:-translate-y-0.5 hover:border-amber-300/40 hover:bg-white/10"
                >
                  <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300/80">{product.categoryName}</p>
                  <p className="mt-3 text-xl font-black">{product.name}</p>
                  <p className="mt-4 text-lg font-semibold text-amber-200">{formatCurrency(product.price)}</p>
                  {product.addOnGroups.length ? <p className="mt-3 text-sm text-white/60">Customization required</p> : null}
                </button>
              ))}
            </div>
          </div>

          <Card className="rounded-3xl border-white/10 bg-[#f8f5ef] p-5 text-slate-900 shadow-none">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-orange-600">Live Ticket</p>
                <h2 className="mt-2 text-2xl font-black">Current Sale</h2>
              </div>
              <ShoppingBag className="h-7 w-7 text-orange-600" />
            </div>

            <div className="mt-5 space-y-3">
              {ticket.length ? (
                ticket.map((item) => (
                  <div key={item.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                    <div className="flex items-start justify-between gap-3">
                      <div>
                        <p className="font-bold">{item.name}</p>
                        <p className="text-sm text-slate-500">{item.categoryName}</p>
                        {item.customDescription ? <p className="mt-1 text-sm text-slate-500">{item.customDescription}</p> : null}
                        {item.addOns.length ? (
                          <p className="mt-2 text-sm text-slate-600">{item.addOns.map((addOn) => addOn.name).join(", ")}</p>
                        ) : null}
                      </div>
                      <div className="text-right">
                        <p className="font-bold text-orange-600">{formatCurrency(item.unitPrice * item.quantity)}</p>
                        <p className="text-sm text-slate-500">{formatCurrency(item.unitPrice)} each</p>
                      </div>
                    </div>
                    <div className="mt-3 flex items-center gap-2">
                      <Button variant="outline" size="sm" onClick={() => setTicket((current) => current.map((line) => line.id === item.id ? { ...line, quantity: Math.max(1, line.quantity - 1) } : line))}>
                        <Minus className="h-3 w-3" />
                      </Button>
                      <span className="min-w-8 text-center text-sm font-semibold">{item.quantity}</span>
                      <Button variant="outline" size="sm" onClick={() => setTicket((current) => current.map((line) => line.id === item.id ? { ...line, quantity: line.quantity + 1 } : line))}>
                        <Plus className="h-3 w-3" />
                      </Button>
                      <Button variant="ghost" size="sm" className="ml-auto text-red-600 hover:bg-red-50 hover:text-red-700" onClick={() => setTicket((current) => current.filter((line) => line.id !== item.id))}>
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                    <Textarea
                      value={item.note}
                      onChange={(event) => setTicket((current) => current.map((line) => line.id === item.id ? { ...line, note: event.target.value } : line))}
                      placeholder="Item note"
                      className="mt-3 min-h-20"
                    />
                  </div>
                ))
              ) : (
                <div className="rounded-2xl border border-dashed border-slate-300 bg-white/70 p-6 text-sm text-slate-500">No items on the ticket yet.</div>
              )}
            </div>

            <div className="mt-5 space-y-4 border-t border-slate-200 pt-5">
              <div className="grid gap-3 md:grid-cols-2">
                <Input value={customerName} onChange={(event) => setCustomerName(event.target.value)} placeholder="Customer name (optional)" />
                <Input value={customerPhone} onChange={(event) => setCustomerPhone(event.target.value)} placeholder="Phone (optional)" />
              </div>
              <div className="grid gap-3 md:grid-cols-2">
                <select value={serviceType} onChange={(event) => setServiceType(event.target.value as (typeof serviceTypes)[number])} className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm">
                  {serviceTypes.map((entry) => (
                    <option key={entry} value={entry}>
                      {entry.replaceAll("_", " ")}
                    </option>
                  ))}
                </select>
                <select value={paymentMethod} onChange={(event) => setPaymentMethod(event.target.value as (typeof paymentOptions)[number]["value"])} className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm">
                  {paymentOptions.map((entry) => (
                    <option key={entry.value} value={entry.value}>
                      {entry.label}
                    </option>
                  ))}
                </select>
              </div>
              <div className="grid gap-3 md:grid-cols-3">
                <select value={discountType} onChange={(event) => setDiscountType(event.target.value as "NONE" | "PERCENTAGE" | "FIXED")} className="h-11 rounded-md border border-slate-200 bg-white px-3 text-sm">
                  <option value="NONE">No discount</option>
                  <option value="PERCENTAGE">Percentage</option>
                  <option value="FIXED">Fixed amount</option>
                </select>
                <Input type="number" value={discountValue} onChange={(event) => setDiscountValue(Number(event.target.value || 0))} placeholder="Discount" />
                <Input type="number" value={taxRate} onChange={(event) => setTaxRate(Number(event.target.value || 0))} placeholder="Tax %" />
              </div>
              <Input type="number" value={paidAmount} onChange={(event) => setPaidAmount(event.target.value)} placeholder="Paid amount" />
              <Textarea value={checkoutNote} onChange={(event) => setCheckoutNote(event.target.value)} placeholder="Order note (optional)" className="min-h-20" />
            </div>

            <div className="mt-5 space-y-2 rounded-2xl bg-slate-950 px-4 py-4 text-sm text-white">
              <div className="flex justify-between"><span>Subtotal</span><span>{formatCurrency(subtotal)}</span></div>
              <div className="flex justify-between"><span>Discount</span><span>-{formatCurrency(discountAmount)}</span></div>
              <div className="flex justify-between"><span>Tax ({taxRate}%)</span><span>{formatCurrency(taxAmount)}</span></div>
              <div className="flex justify-between text-base font-bold"><span>Total</span><span>{formatCurrency(total)}</span></div>
              <div className="flex justify-between"><span>Paid</span><span>{formatCurrency(Number(paidAmount || 0))}</span></div>
              <div className="flex justify-between"><span>Change</span><span>{formatCurrency(change)}</span></div>
            </div>

            <Button className="mt-5 h-12 w-full rounded-2xl" disabled={!ticket.length || submitting || Number(paidAmount || 0) < total} onClick={() => void submitOrder()}>
              <Receipt className="h-4 w-4" />
              {submitting ? "Processing..." : "Finish and View Slip"}
            </Button>
          </Card>
        </div>
      </div>

      {productDialog ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 p-4">
          <Card className="w-full max-w-2xl rounded-3xl border-white/10 bg-slate-900 p-6 text-white shadow-none">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-amber-300">{productDialog.categoryName}</p>
                <h3 className="mt-2 text-2xl font-black">{productDialog.name}</h3>
                <p className="mt-2 text-amber-200">{formatCurrency(productDialog.price)}</p>
              </div>
              <Button variant="ghost" className="text-white hover:bg-white/10" onClick={() => setProductDialog(null)}>Close</Button>
            </div>
            <div className="mt-6 space-y-5">
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
                            setProductSelections((current) =>
                              current.map((entry) => {
                                if (entry.groupId !== group.id) return entry;
                                const exists = entry.optionIds.includes(option.id);
                                const nextOptionIds = exists
                                  ? entry.optionIds.filter((id) => id !== option.id)
                                  : [...entry.optionIds, option.id].slice(-group.maxSelect);
                                return { ...entry, optionIds: nextOptionIds };
                              })
                            );
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
              <div className="grid gap-3 md:grid-cols-[120px_minmax(0,1fr)]">
                <Input type="number" value={productQuantity} onChange={(event) => setProductQuantity(Math.max(1, Number(event.target.value || 1)))} />
                <Textarea value={productNote} onChange={(event) => setProductNote(event.target.value)} placeholder="Item note" className="min-h-24" />
              </div>
              <Button className="w-full" onClick={confirmConfiguredProduct}>Add to Ticket</Button>
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
                <Input type="number" value={manualUnitPrice} onChange={(event) => setManualUnitPrice(event.target.value)} placeholder="Unit price" />
                <Input type="number" value={manualQuantity} onChange={(event) => setManualQuantity(Math.max(1, Number(event.target.value || 1)))} placeholder="Quantity" />
              </div>
              <Textarea value={manualNote} onChange={(event) => setManualNote(event.target.value)} placeholder="Note" />
              <Button className="w-full" onClick={addManualItem}>Add Manual Item</Button>
            </div>
          </Card>
        </div>
      ) : null}
    </div>
  );
}

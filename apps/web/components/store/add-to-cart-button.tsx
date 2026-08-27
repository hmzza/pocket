"use client";

import { useMemo, useState } from "react";
import { ShoppingBag } from "lucide-react";
import { useStore } from "./store-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn, formatCompactCurrency } from "@/lib/utils";
import type { Product } from "@/lib/types";

export function AddToCartButton({ product, mealProduct }: { product: Product; mealProduct?: Product }) {
  const { addToCart } = useStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [mealPromptOpen, setMealPromptOpen] = useState(false);
  const [configuredProduct, setConfiguredProduct] = useState<Product | null>(null);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string[]>>({});
  const [error, setError] = useState("");

  const itemBeingConfigured = configuredProduct ?? product;
  const isShawarma = product.category.slug === "shawarma";
  const configuredPrice = useMemo(() => {
    const extra = itemBeingConfigured.addOnGroups.reduce((sum, group) => {
      const optionIds = selectedOptions[group.id] ?? [];
      return (
        sum +
        group.options
          .filter((option) => optionIds.includes(option.id))
          .reduce((groupSum, option) => groupSum + option.priceDelta, 0)
      );
    }, 0);

    return itemBeingConfigured.price + extra;
  }, [itemBeingConfigured, selectedOptions]);

  function beginAdd(productToAdd: Product) {
    if (!productToAdd.addOnGroups.length) {
      addToCart({ productId: productToAdd.id });
      return;
    }

    setSelectedOptions(
      Object.fromEntries(
        productToAdd.addOnGroups.map((group) => [group.id, group.options.slice(0, group.minSelect).map((option) => option.id)])
      )
    );
    setConfiguredProduct(productToAdd);
    setError("");
    setDialogOpen(true);
  }

  function handleQuickAdd() {
    if (isShawarma) {
      setMealPromptOpen(true);
      return;
    }
    beginAdd(product);
  }

  function confirmAddToCart() {
    for (const group of itemBeingConfigured.addOnGroups) {
      const optionIds = selectedOptions[group.id] ?? [];
      if (optionIds.length < group.minSelect || optionIds.length > group.maxSelect) {
        setError(`${group.name} requires ${group.minSelect} to ${group.maxSelect} selections.`);
        return;
      }
    }

    const wasAdded = addToCart({
      productId: itemBeingConfigured.id,
      selectedAddOnIds: itemBeingConfigured.addOnGroups.flatMap((group) => selectedOptions[group.id] ?? [])
    });

    if (wasAdded) {
      setDialogOpen(false);
      setConfiguredProduct(null);
    }
  }

  return (
    <>
      <Button onClick={handleQuickAdd}>
        <ShoppingBag className="h-4 w-4" />
        {product.addOnGroups.length ? "Customize" : "Add to Cart"}
      </Button>

      {mealPromptOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center bg-slate-950/70 p-4">
          <Card className="w-full max-w-md rounded-3xl border-pocket-navy/10 p-6 text-center">
            <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">Make it a meal</p>
            <h3 className="mt-3 text-2xl font-black text-pocket-navy">Would you like to make your {product.name} a meal?</h3>
            <p className="mt-3 text-sm leading-6 text-pocket-navy/70">Add fries and choose your drink or shake.</p>
            <div className="mt-6 grid gap-3 sm:grid-cols-2">
              <Button variant="outline" onClick={() => { setMealPromptOpen(false); beginAdd(product); }}>No, just the shawarma</Button>
              <Button disabled={!mealProduct} onClick={() => { if (!mealProduct) return; setMealPromptOpen(false); beginAdd(mealProduct); }}>Yes, make it a meal</Button>
            </div>
            {!mealProduct ? <p className="mt-3 text-sm font-medium text-red-600">This meal upgrade is not available right now.</p> : null}
            <button type="button" className="mt-4 text-sm font-semibold text-pocket-navy/60 hover:text-pocket-navy" onClick={() => setMealPromptOpen(false)}>Cancel</button>
          </Card>
        </div>
      ) : null}

      {dialogOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/70 p-4">
          <Card className="max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-3xl border-pocket-navy/10 p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">{itemBeingConfigured.category.name}</p>
                <h3 className="mt-2 text-2xl font-black text-pocket-navy">{itemBeingConfigured.name}</h3>
                <p className="mt-2 break-words font-semibold text-pocket-orange">{formatCompactCurrency(configuredPrice)}</p>
              </div>
              <Button variant="ghost" onClick={() => { setDialogOpen(false); setConfiguredProduct(null); }}>
                Close
              </Button>
            </div>

            <div className="mt-6 space-y-5">
              {itemBeingConfigured.addOnGroups.map((group) => (
                <div key={group.id}>
                  <div className="mb-3">
                    <p className="font-semibold text-pocket-navy">{group.name}</p>
                    <p className="text-sm text-pocket-navy/60">
                      Choose {group.minSelect} to {group.maxSelect}
                    </p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {group.options.map((option) => {
                      const selected = (selectedOptions[group.id] ?? []).includes(option.id);

                      return (
                        <button
                          key={option.id}
                          type="button"
                          onClick={() => {
                            setSelectedOptions((current) => {
                              const currentIds = current[group.id] ?? [];
                              const exists = currentIds.includes(option.id);
                              const nextIds = exists
                                ? currentIds.filter((id) => id !== option.id)
                                : [...currentIds, option.id].slice(-group.maxSelect);

                              return {
                                ...current,
                                [group.id]: nextIds
                              };
                            });
                            setError("");
                          }}
                          className={cn(
                            "rounded-2xl border px-4 py-3 text-left transition",
                            selected
                              ? "border-pocket-orange bg-pocket-orange/10"
                              : "border-pocket-navy/10 bg-white hover:border-pocket-orange/50"
                          )}
                        >
                          <p className="font-semibold text-pocket-navy">{option.name}</p>
                          <p className="text-sm text-pocket-navy/60">
                            {option.priceDelta ? `+${formatCompactCurrency(option.priceDelta)}` : "Included"}
                          </p>
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}

              {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}

              <Button className="w-full" onClick={confirmAddToCart}>
                Add to Cart
              </Button>
            </div>
          </Card>
        </div>
      ) : null}
    </>
  );
}

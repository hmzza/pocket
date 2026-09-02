"use client";

import { useMemo, useState } from "react";
import { ShoppingBag } from "lucide-react";
import { useStore } from "./store-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn, formatCompactCurrency } from "@/lib/utils";
import type { AddOnGroup, Product } from "@/lib/types";

type AddToCartButtonProps = {
  product: Product;
  mealProduct?: Product;
  buttonLabel?: string;
};

function getWebsiteConfigurationGroups(product: Product) {
  return product.slug === "loaded-fries" ? [] : product.addOnGroups;
}

function getMealPairingGroup(product?: Product) {
  return product?.addOnGroups.find((group) => group.name === "Choose your meal pairing") ?? null;
}

export function AddToCartButton({ product, mealProduct, buttonLabel }: AddToCartButtonProps) {
  const { addToCart } = useStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [configuredProduct, setConfiguredProduct] = useState<Product | null>(null);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string[]>>({});
  const [selectedMealOptionId, setSelectedMealOptionId] = useState("");
  const [error, setError] = useState("");

  const itemBeingConfigured = configuredProduct ?? product;
  const isShawarma = product.category.slug === "shawarma";
  const isCombinedShawarmaFlow = isShawarma && Boolean(mealProduct);
  const itemGroups = getWebsiteConfigurationGroups(itemBeingConfigured);
  const mealPairingGroup = isCombinedShawarmaFlow ? getMealPairingGroup(mealProduct) : null;
  const showMealSection = Boolean(mealPairingGroup?.options.length);

  const configuredPrice = useMemo(() => {
    const productExtras = itemGroups.reduce((sum, group) => {
      const optionIds = selectedOptions[group.id] ?? [];
      return sum + group.options
        .filter((option) => optionIds.includes(option.id))
        .reduce((groupSum, option) => groupSum + option.priceDelta, 0);
    }, 0);

    const mealOption = mealPairingGroup?.options.find((option) => option.id === selectedMealOptionId);
    const mealPrice = mealOption && mealProduct ? mealProduct.price + mealOption.priceDelta : 0;

    return itemBeingConfigured.price + productExtras + mealPrice;
  }, [itemBeingConfigured, itemGroups, mealPairingGroup, mealProduct, selectedMealOptionId, selectedOptions]);

  function closeDialog() {
    setDialogOpen(false);
    setConfiguredProduct(null);
    setSelectedMealOptionId("");
  }

  function openConfiguration(productToConfigure: Product) {
    const groups = getWebsiteConfigurationGroups(productToConfigure);
    setSelectedOptions(
      Object.fromEntries(
        groups.map((group) => [group.id, group.options.slice(0, group.minSelect).map((option) => option.id)])
      )
    );
    setSelectedMealOptionId("");
    setConfiguredProduct(productToConfigure);
    setError("");
    setDialogOpen(true);
  }

  function beginAdd(productToAdd: Product) {
    const groups = getWebsiteConfigurationGroups(productToAdd);
    if (!groups.length) {
      addToCart({ productId: productToAdd.id });
      return;
    }

    openConfiguration(productToAdd);
  }

  function handleQuickAdd() {
    if (isCombinedShawarmaFlow || getWebsiteConfigurationGroups(product).length) {
      openConfiguration(product);
      return;
    }

    beginAdd(product);
  }

  function toggleProductOption(group: AddOnGroup, optionId: string) {
    setSelectedOptions((current) => {
      const currentIds = current[group.id] ?? [];
      const exists = currentIds.includes(optionId);
      const nextIds = exists
        ? currentIds.filter((id) => id !== optionId)
        : [...currentIds, optionId].slice(-group.maxSelect);

      return { ...current, [group.id]: nextIds };
    });
    setError("");
  }

  function confirmAddToCart() {
    for (const group of itemGroups) {
      const optionIds = selectedOptions[group.id] ?? [];
      if (optionIds.length < group.minSelect || optionIds.length > group.maxSelect) {
        setError(`${group.name} requires ${group.minSelect} to ${group.maxSelect} selections.`);
        return;
      }
    }

    const productOptionIds = itemGroups.flatMap((group) => selectedOptions[group.id] ?? []);
    const productWasAdded = addToCart({
      productId: itemBeingConfigured.id,
      selectedAddOnIds: productOptionIds
    });

    if (productWasAdded && isCombinedShawarmaFlow && selectedMealOptionId && mealProduct) {
      addToCart({
        productId: mealProduct.id,
        selectedAddOnIds: [selectedMealOptionId]
      });
    }

    if (productWasAdded) closeDialog();
  }

  const displayGroups = itemGroups;
  const buttonText = buttonLabel ?? (isCombinedShawarmaFlow || displayGroups.length ? "Customize" : "Add to Cart");

  return (
    <>
      <Button onClick={handleQuickAdd}>
        <ShoppingBag className="h-4 w-4" />
        {buttonText}
      </Button>

      {dialogOpen ? (
        <div className="fixed inset-0 z-50 grid place-items-center overflow-y-auto bg-slate-950/70 p-4">
          <Card className="max-h-[calc(100dvh-2rem)] w-full max-w-2xl overflow-y-auto rounded-3xl border-pocket-navy/10 p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.25em] text-pocket-orange">{itemBeingConfigured.category.name}</p>
                <h3 className="mt-2 text-2xl font-black text-pocket-navy">{itemBeingConfigured.name}</h3>
                <p className="mt-2 break-words font-semibold text-pocket-orange">{formatCompactCurrency(configuredPrice)}</p>
              </div>
              <Button variant="ghost" onClick={closeDialog}>Close</Button>
            </div>

            <div className="mt-6 space-y-6">
              {displayGroups.length ? (
                <section className="space-y-3">
                  <div>
                    <p className="font-semibold text-pocket-navy">Customize your {itemBeingConfigured.name}</p>
                    <p className="text-sm text-pocket-navy/60">Choose the options you want.</p>
                  </div>
                  {displayGroups.map((group) => (
                    <div key={group.id} className="space-y-3">
                      <div>
                        <p className="font-semibold text-pocket-navy">{group.name}</p>
                        <p className="text-sm text-pocket-navy/60">Choose {group.minSelect} to {group.maxSelect}</p>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {group.options.map((option) => {
                          const selected = (selectedOptions[group.id] ?? []).includes(option.id);
                          return (
                            <button
                              key={option.id}
                              type="button"
                              aria-pressed={selected}
                              onClick={() => toggleProductOption(group, option.id)}
                              className={cn(
                                "rounded-2xl border px-4 py-3 text-left transition",
                                selected
                                  ? "border-pocket-orange bg-pocket-orange/10"
                                  : "border-pocket-navy/10 bg-white hover:border-pocket-orange/50"
                              )}
                            >
                              <p className="font-semibold text-pocket-navy">{option.name}</p>
                              <p className="text-sm text-pocket-navy/60">{option.priceDelta ? `+${formatCompactCurrency(option.priceDelta)}` : "Included"}</p>
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </section>
              ) : null}

              {showMealSection && mealPairingGroup ? (
                <section className="space-y-3 border-t border-pocket-navy/10 pt-5">
                  <div>
                    <p className="font-semibold text-pocket-navy">Make It A Meal</p>
                    <p className="text-sm text-pocket-navy/60">Add Thela Fries with one drink, shake, or chiller.</p>
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2">
                    <button
                      type="button"
                      aria-pressed={!selectedMealOptionId}
                      onClick={() => setSelectedMealOptionId("")}
                      className={cn(
                        "rounded-2xl border px-4 py-3 text-left transition",
                        !selectedMealOptionId
                          ? "border-pocket-orange bg-pocket-orange/10"
                          : "border-pocket-navy/10 bg-white hover:border-pocket-orange/50"
                      )}
                    >
                      <p className="font-semibold text-pocket-navy">Just shawarma</p>
                      <p className="text-sm text-pocket-navy/60">No meal added</p>
                    </button>
                    {mealPairingGroup.options.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        aria-pressed={selectedMealOptionId === option.id}
                        onClick={() => setSelectedMealOptionId(option.id)}
                        className={cn(
                          "rounded-2xl border px-4 py-3 text-left transition",
                          selectedMealOptionId === option.id
                            ? "border-pocket-orange bg-pocket-orange/10"
                            : "border-pocket-navy/10 bg-white hover:border-pocket-orange/50"
                        )}
                      >
                        <p className="font-semibold text-pocket-navy">{option.name}</p>
                        <p className="text-sm text-pocket-navy/60">{formatCompactCurrency((mealProduct?.price ?? 0) + option.priceDelta)}</p>
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}

              {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
              <Button className="w-full" onClick={confirmAddToCart}>Add to Cart</Button>
            </div>
          </Card>
        </div>
      ) : null}
    </>
  );
}

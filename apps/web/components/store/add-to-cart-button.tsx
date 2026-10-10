"use client";

import { useMemo, useState } from "react";
import { Minus, Plus, ShoppingBag } from "lucide-react";
import { useStore } from "./store-provider";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { cn, formatCompactCurrency } from "@/lib/utils";
import type { AddOnGroup, Product } from "@/lib/types";
import { BOX_OF_SIX_SIZE, isBoxOfSixGroup, isBoxOfSixProduct } from "@/lib/box-of-six";

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

function getOptionDisplayName(group: AddOnGroup, optionName: string) {
  const prefix = `${group.name}: `;
  return optionName.startsWith(prefix) ? optionName.slice(prefix.length) : optionName;
}

export function AddToCartButton({ product, mealProduct, buttonLabel }: AddToCartButtonProps) {
  const { addToCart, deliveryEnabled: shopEnabled, notifyCart } = useStore();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [configuredProduct, setConfiguredProduct] = useState<Product | null>(null);
  const [selectedOptions, setSelectedOptions] = useState<Record<string, string[]>>({});
  const [selectedOptionQuantities, setSelectedOptionQuantities] = useState<Record<string, number>>({});
  const [selectedMealOptionId, setSelectedMealOptionId] = useState("");
  const [error, setError] = useState("");

  const itemBeingConfigured = configuredProduct ?? product;
  const isCombinedMealFlow = Boolean(mealProduct);
  const itemGroups = getWebsiteConfigurationGroups(itemBeingConfigured);
  const mealPairingGroup = isCombinedMealFlow ? getMealPairingGroup(mealProduct) : null;
  const boxGroup = itemGroups.find(isBoxOfSixGroup) ?? null;
  const isBoxFlow = isBoxOfSixProduct(itemBeingConfigured);
  const showMealSection = Boolean(mealPairingGroup?.options.length);

  const configuredPrice = useMemo(() => {
    const productExtras = itemGroups.reduce((sum, group) => {
      const optionIds = selectedOptions[group.id] ?? [];
      return sum + group.options
        .filter((option) => optionIds.includes(option.id))
        .reduce((groupSum, option) => groupSum + option.priceDelta * (selectedOptionQuantities[option.id] ?? 1), 0);
    }, 0);

    const mealOption = mealPairingGroup?.options.find((option) => option.id === selectedMealOptionId);
    const mealPrice = mealOption && mealProduct ? mealProduct.price + mealOption.priceDelta : 0;

    return itemBeingConfigured.price + productExtras + mealPrice;
  }, [itemBeingConfigured, itemGroups, mealPairingGroup, mealProduct, selectedMealOptionId, selectedOptionQuantities, selectedOptions]);

  function closeDialog() {
    setDialogOpen(false);
    setConfiguredProduct(null);
    setSelectedMealOptionId("");
    setSelectedOptionQuantities({});
  }

  function openConfiguration(productToConfigure: Product) {
    const groups = getWebsiteConfigurationGroups(productToConfigure);
    setSelectedOptions(
      Object.fromEntries(
        groups.map((group) => [group.id, group.options.slice(0, group.minSelect).map((option) => option.id)])
      )
    );
    setSelectedOptionQuantities(
      isBoxOfSixProduct(productToConfigure)
        ? Object.fromEntries(productToConfigure.addOnGroups.flatMap((group) => group.options.map((option) => [option.id, 0])))
        : {}
    );
    setSelectedMealOptionId("");
    setConfiguredProduct(productToConfigure);
    setError("");
    setDialogOpen(true);
  }

  function beginAdd(productToAdd: Product) {
    if (!shopEnabled) {
      notifyCart("Our shop is closed at the moment.");
      return;
    }
    const groups = getWebsiteConfigurationGroups(productToAdd);
    if (!groups.length) {
      addToCart({ productId: productToAdd.id });
      return;
    }

    openConfiguration(productToAdd);
  }

  function handleQuickAdd() {
    if (!shopEnabled) {
      notifyCart("Our shop is closed at the moment.");
      return;
    }
    if (isCombinedMealFlow || getWebsiteConfigurationGroups(product).length) {
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

  function updateBoxOptionQuantity(optionId: string, delta: number) {
    setSelectedOptionQuantities((current) => {
      const total = Object.values(current).reduce((sum, quantity) => sum + quantity, 0);
      const nextValue = Math.max(0, Math.min(BOX_OF_SIX_SIZE - total + (current[optionId] ?? 0), (current[optionId] ?? 0) + delta));
      return { ...current, [optionId]: nextValue };
    });
    setError("");
  }

  function confirmAddToCart() {
    if (!shopEnabled) {
      notifyCart("Our shop is closed at the moment.");
      closeDialog();
      return;
    }
    if (isBoxFlow) {
      const totalBoxQuantity = Object.values(selectedOptionQuantities).reduce((sum, quantity) => sum + quantity, 0);
      if (totalBoxQuantity !== BOX_OF_SIX_SIZE) {
        setError(`Choose exactly ${BOX_OF_SIX_SIZE} items for the box.`);
        return;
      }
    }

    for (const group of itemGroups) {
      const optionIds = selectedOptions[group.id] ?? [];
      if (isBoxFlow && group.id === boxGroup?.id) continue;
      if (optionIds.length < group.minSelect || optionIds.length > group.maxSelect) {
        setError(`${group.name} requires ${group.minSelect} to ${group.maxSelect} selections.`);
        return;
      }
    }

    const productOptionIds = itemGroups.flatMap((group) => selectedOptions[group.id] ?? []);
    const boxOptionIds = isBoxFlow && boxGroup
      ? boxGroup.options.filter((option) => (selectedOptionQuantities[option.id] ?? 0) > 0).map((option) => option.id)
      : [];
    const productWasAdded = addToCart({
      productId: itemBeingConfigured.id,
      selectedAddOnIds: isBoxFlow ? boxOptionIds : productOptionIds,
      selectedAddOnQuantities: isBoxFlow ? selectedOptionQuantities : undefined
    });

    if (productWasAdded && isCombinedMealFlow && selectedMealOptionId && mealProduct) {
      addToCart({
        productId: mealProduct.id,
        selectedAddOnIds: [selectedMealOptionId]
      });
    }

    if (productWasAdded) closeDialog();
  }

  const displayGroups = itemGroups;
  const buttonText = buttonLabel ?? (isCombinedMealFlow || displayGroups.length ? "Customize" : "Add to Cart");

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
                    <p className="font-semibold text-pocket-navy">{isBoxFlow ? "Customize your box items" : `Customize your ${itemBeingConfigured.name}`}</p>
                    {!isBoxFlow ? <p className="text-sm text-pocket-navy/60">Choose the options you want.</p> : null}
                  </div>
                  {displayGroups.map((group) => (
                    <div key={group.id} className="space-y-3">
                      <div>
                        {!(isBoxFlow && group.id === boxGroup?.id) ? <p className="font-semibold text-pocket-navy">{group.name}</p> : null}
                        <p className="text-sm text-pocket-navy/60">{isBoxFlow && group.id === boxGroup?.id ? `Choose exactly ${BOX_OF_SIX_SIZE} items` : `Choose ${group.minSelect} to ${group.maxSelect}`}</p>
                      </div>
                      <div className="grid gap-2 sm:grid-cols-2">
                        {group.options.map((option) => {
                          const selected = (selectedOptions[group.id] ?? []).includes(option.id);
                          const boxQuantity = selectedOptionQuantities[option.id] ?? 0;
                          if (isBoxFlow && group.id === boxGroup?.id) {
                            return (
                              <div key={option.id} className="rounded-2xl border border-pocket-navy/10 bg-white px-4 py-3">
                                <div className="flex items-center justify-between gap-3">
                                  <p className="font-semibold text-pocket-navy">{getOptionDisplayName(group, option.name)}</p>
                                  <div className="inline-flex items-center gap-2">
                                    <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-pocket-navy/15 text-pocket-navy disabled:opacity-40" onClick={() => updateBoxOptionQuantity(option.id, -1)} disabled={!boxQuantity} aria-label={`Remove ${option.name}`}><Minus className="h-4 w-4" /></button>
                                    <span className="w-6 text-center font-bold text-pocket-navy">{boxQuantity}</span>
                                    <button type="button" className="inline-flex h-8 w-8 items-center justify-center rounded-full border border-pocket-navy/15 text-pocket-navy disabled:opacity-40" onClick={() => updateBoxOptionQuantity(option.id, 1)} disabled={Object.values(selectedOptionQuantities).reduce((sum, quantity) => sum + quantity, 0) >= BOX_OF_SIX_SIZE} aria-label={`Add ${option.name}`}><Plus className="h-4 w-4" /></button>
                                  </div>
                                </div>
                              </div>
                            );
                          }
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
                              <p className="font-semibold text-pocket-navy">{getOptionDisplayName(group, option.name)}</p>
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
                      <p className="font-semibold text-pocket-navy">Just {itemBeingConfigured.name}</p>
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
                        <p className="text-sm text-pocket-navy/60">
                          {formatCompactCurrency((mealProduct?.price ?? 0) + option.priceDelta)} total
                        </p>
                      </button>
                    ))}
                  </div>
                </section>
              ) : null}

              {error ? <p className="text-sm font-medium text-red-600">{error}</p> : null}
              <Button className="w-full" onClick={confirmAddToCart} disabled={isBoxFlow && Object.values(selectedOptionQuantities).reduce((sum, quantity) => sum + quantity, 0) !== BOX_OF_SIX_SIZE}>Add to Cart</Button>
            </div>
          </Card>
        </div>
      ) : null}
    </>
  );
}

type UnitDefaults = {
  openingStock: number;
  reorderLevel: number;
};

const UNIT_DEFAULTS: Record<string, UnitDefaults> = {
  kg: { openingStock: 8, reorderLevel: 2 },
  litre: { openingStock: 6, reorderLevel: 1.5 },
  slices: { openingStock: 120, reorderLevel: 24 },
  bottles: { openingStock: 48, reorderLevel: 12 },
  loafs: { openingStock: 18, reorderLevel: 4 },
  pieces: { openingStock: 160, reorderLevel: 30 }
};

function ingredient(
  sku: string,
  name: string,
  unit: keyof typeof UNIT_DEFAULTS,
  overrides?: Partial<UnitDefaults> & { costPerUnit?: number; type?: "RAW" | "PREPARED" | "PACKAGING"; caloriesPerUnit?: number }
) {
  const defaults = UNIT_DEFAULTS[unit];
  if (!defaults) {
    throw new Error(`Unsupported unit ${unit}`);
  }
  return {
    sku,
    name,
    unit,
    type: overrides?.type ?? "RAW",
    reorderLevel: overrides?.reorderLevel ?? defaults.reorderLevel,
    openingStock: overrides?.openingStock ?? defaults.openingStock,
    costPerUnit: overrides?.costPerUnit ?? 0,
    caloriesPerUnit: overrides?.caloriesPerUnit ?? 0
  };
}

export const INVENTORY_ITEMS = [
  ingredient("ING-CHICKEN", "Chicken", "kg", { openingStock: 18, reorderLevel: 4, costPerUnit: 763, caloriesPerUnit: 1650 }),
  ingredient("ING-MARINATED-CHICKEN", "Marinated Chicken", "kg", { openingStock: 8, reorderLevel: 2, costPerUnit: 798, caloriesPerUnit: 1700, type: "PREPARED" }),
  ingredient("ING-CLASSIC-SAUCE", "Classic Sauce", "kg", { openingStock: 4, reorderLevel: 1, costPerUnit: 744, caloriesPerUnit: 3300, type: "PREPARED" }),
  ingredient("ING-SPICY-SAUCE", "Spicy Sauce", "kg", { openingStock: 4, reorderLevel: 1, costPerUnit: 791, caloriesPerUnit: 3000, type: "PREPARED" }),
  ingredient("ING-GARLIC-MAYO", "Garlic Mayo", "kg", { openingStock: 4, reorderLevel: 1, costPerUnit: 821, caloriesPerUnit: 3400, type: "PREPARED" }),
  ingredient("ING-CHEESE", "Cheese", "kg", { costPerUnit: 1000, caloriesPerUnit: 4020 }),
  ingredient("ING-OLIVES", "Olives", "kg", { costPerUnit: 2000, caloriesPerUnit: 1150 }),
  ingredient("ING-MUSHROOM", "Mushroom", "kg", { costPerUnit: 1000, caloriesPerUnit: 220 }),
  ingredient("ING-CORN", "Corn", "kg", { costPerUnit: 1000, caloriesPerUnit: 860 }),
  ingredient("ING-JALEPENOS", "Jalepenos", "kg", { costPerUnit: 900, caloriesPerUnit: 290 }),
  ingredient("ING-SOYA-SAUCE", "Soya Sauce", "litre", { costPerUnit: 250 }),
  ingredient("ING-HOT-SAUCE", "Hot Sauce", "litre", { costPerUnit: 1100 }),
  ingredient("ING-CHILLI-SAUCE", "Chilli Sauce", "litre", { costPerUnit: 300 }),
  ingredient("ING-VINEGAR", "Vinegar", "litre", { costPerUnit: 250 }),
  ingredient("ING-WORCHESTER", "Worchester Sauce", "litre", { costPerUnit: 400 }),
  ingredient("ING-LEMON-JUICE", "Lemon Juice", "litre", { costPerUnit: 500 }),
  ingredient("ING-TIKKA-MASALA", "Tikka Masala", "kg", { costPerUnit: 1667 }),
  ingredient("ING-DARA-MIRCH", "Dara Mirch", "kg", { costPerUnit: 600 }),
  ingredient("ING-LAL-MIRCH", "Lal Mirch", "kg", { costPerUnit: 625 }),
  ingredient("ING-KAALI-MIRCH", "Kaali Mirch", "kg", { costPerUnit: 2500 }),
  ingredient("ING-WHITE-MIRCH", "White Mirch", "kg", { costPerUnit: 3000 }),
  ingredient("ING-ADRAK-POWDER", "Adrak Powder", "kg", { costPerUnit: 900 }),
  ingredient("ING-LASAN-POWDER", "Lasan Powder", "kg", { costPerUnit: 625 }),
  ingredient("ING-LASAN", "Lasan", "kg", { costPerUnit: 800 }),
  ingredient("ING-NAMAK", "Namak", "kg", { costPerUnit: 80 }),
  ingredient("ING-OREGANO", "Oregano", "kg", { costPerUnit: 2133 }),
  ingredient("ING-PAPRIKA", "Paprika", "kg", { costPerUnit: 4500 }),
  ingredient("ING-FRIES-MASALA", "Fries Masala", "kg", { costPerUnit: 500 }),
  ingredient("ING-CHAT-MASALA", "Chat Masala", "kg", { costPerUnit: 500 }),
  ingredient("ING-FRIES", "Fries", "kg", { openingStock: 16, reorderLevel: 4, costPerUnit: 300, caloriesPerUnit: 3120 }),
  ingredient("ING-MILK", "Milk", "litre", { openingStock: 12, reorderLevel: 3, costPerUnit: 116 }),
  ingredient("ING-MAYO", "Mayo", "kg", { costPerUnit: 688, caloriesPerUnit: 6800 }),
  ingredient("ING-CREAM", "Cream", "kg", { costPerUnit: 1090, caloriesPerUnit: 3450 }),
  ingredient("ING-TOMATO-KETCHUP", "Tomato Ketchup", "kg", { costPerUnit: 533 }),
  ingredient("ING-MUSTARD", "Mustard", "kg", { costPerUnit: 1300 }),
  ingredient("ING-SUGAR", "Sugar", "kg", { costPerUnit: 200, caloriesPerUnit: 3870 }),
  ingredient("ING-MANGO-ICECREAM", "Mango Icecream", "kg"),
  ingredient("ING-STRAWBERRY-ICECREAM", "Strawberry Icecream", "kg"),
  ingredient("ING-VANILLA-ICECREAM", "Vanilla Icecream", "kg"),
  ingredient("ING-KULFA-ICECREAM", "Kulfa Icecream", "kg"),
  ingredient("ING-PISTACHIO-ICECREAM", "Pistachio Icecream", "kg"),
  ingredient("ING-7UP-345", "7UP 345ml", "bottles", { costPerUnit: 65 }),
  ingredient("ING-PEPSI", "Pepsi", "bottles", { costPerUnit: 65 }),
  ingredient("ING-FANTA", "Fanta", "bottles", { costPerUnit: 65 }),
  ingredient("ING-DIET", "Diet Drink", "bottles", { costPerUnit: 65 }),
  ingredient("ING-SPRITE", "Sprite", "bottles", { costPerUnit: 65 }),
  ingredient("ING-7UP-2L", "7UP 2 Litre", "bottles"),
  ingredient("ING-STRAWBERRY-MONIN", "Strawberry Monin", "litre", { costPerUnit: 1667 }),
  ingredient("ING-CHERRY-MONIN", "Cherry Monin", "litre", { costPerUnit: 1667 }),
  ingredient("ING-KIWI-MONIN", "Kiwi Monin", "litre", { costPerUnit: 1667 }),
  ingredient("ING-WATERMELON-MONIN", "Watermelon Monin", "litre", { costPerUnit: 1667 }),
  ingredient("ING-PASSION-FRUIT-MONIN", "Passion Fruit Monin", "litre", { costPerUnit: 1667 }),
  ingredient("ING-GUAVA-MONIN", "Guava Monin", "litre", { costPerUnit: 1667 }),
  ingredient("ING-BREAD", "Bread", "pieces", { costPerUnit: 33, caloriesPerUnit: 180 }),
  ingredient("ING-OIL", "Oil", "litre", { openingStock: 14, reorderLevel: 3, costPerUnit: 364, caloriesPerUnit: 8840 }),
  ingredient("ING-BOX", "Box", "pieces", { costPerUnit: 19, type: "PACKAGING" }),
  ingredient("ING-BUCKET", "Bucket", "pieces", { costPerUnit: 15, type: "PACKAGING" }),
  ingredient("ING-CUP", "Cup", "pieces", { costPerUnit: 10, type: "PACKAGING" }),
  ingredient("ING-TAKEAWAY", "Takeaway", "pieces", { costPerUnit: 19, type: "PACKAGING" }),
  ingredient("ING-GLASS", "Glass", "pieces", { costPerUnit: 10, type: "PACKAGING" }),
  ingredient("ING-CARROT", "Carrot", "kg", { costPerUnit: 467, caloriesPerUnit: 410 }),
  ingredient("ING-ONION", "Onion", "kg", { costPerUnit: 467, caloriesPerUnit: 400 }),
  ingredient("ING-LETTUCE", "Lettuce", "kg", { costPerUnit: 467, caloriesPerUnit: 150 }),
  ingredient("ING-CUCUMBER", "Cucumber", "kg", { costPerUnit: 467, caloriesPerUnit: 160 }),
  ingredient("ING-CAPSICUM", "Capsicum", "kg", { costPerUnit: 467, caloriesPerUnit: 310 })
] as const;

export const PRODUCT_RECIPE_BY_SLUG: Record<string, Array<{ ingredientSku: string; quantity: number }>> = {
  "classic-pocket": [
    { ingredientSku: "ING-MARINATED-CHICKEN", quantity: 0.09 },
    { ingredientSku: "ING-BREAD", quantity: 1 },
    { ingredientSku: "ING-CLASSIC-SAUCE", quantity: 0.07 },
    { ingredientSku: "ING-LETTUCE", quantity: 0.018 },
    { ingredientSku: "ING-CARROT", quantity: 0.006 },
    { ingredientSku: "ING-CUCUMBER", quantity: 0.006 },
    { ingredientSku: "ING-CAPSICUM", quantity: 0.006 },
    { ingredientSku: "ING-BOX", quantity: 1 }
  ],
  "spicy-pocket": [
    { ingredientSku: "ING-MARINATED-CHICKEN", quantity: 0.09 },
    { ingredientSku: "ING-BREAD", quantity: 1 },
    { ingredientSku: "ING-SPICY-SAUCE", quantity: 0.07 },
    { ingredientSku: "ING-LETTUCE", quantity: 0.018 },
    { ingredientSku: "ING-CARROT", quantity: 0.006 },
    { ingredientSku: "ING-CUCUMBER", quantity: 0.006 },
    { ingredientSku: "ING-CAPSICUM", quantity: 0.006 },
    { ingredientSku: "ING-BOX", quantity: 1 }
  ],
  "pocket-mai-rocket": [
    { ingredientSku: "ING-MARINATED-CHICKEN", quantity: 0.09 },
    { ingredientSku: "ING-BREAD", quantity: 1 },
    { ingredientSku: "ING-SPICY-SAUCE", quantity: 0.07 },
    { ingredientSku: "ING-LETTUCE", quantity: 0.018 },
    { ingredientSku: "ING-CARROT", quantity: 0.006 },
    { ingredientSku: "ING-CUCUMBER", quantity: 0.006 },
    { ingredientSku: "ING-CAPSICUM", quantity: 0.006 },
    { ingredientSku: "ING-CHEESE", quantity: 0.008 },
    { ingredientSku: "ING-OLIVES", quantity: 0.004 },
    { ingredientSku: "ING-MUSHROOM", quantity: 0.004 },
    { ingredientSku: "ING-JALEPENOS", quantity: 0.004 },
    { ingredientSku: "ING-CORN", quantity: 0.004 },
    { ingredientSku: "ING-BOX", quantity: 1 }
  ],
  "thela-fries": [
    { ingredientSku: "ING-FRIES", quantity: 0.32 },
    { ingredientSku: "ING-CHAT-MASALA", quantity: 0.012 },
    { ingredientSku: "ING-BUCKET", quantity: 1 }
  ],
  "loaded-fries": [
    { ingredientSku: "ING-FRIES", quantity: 0.25 },
    { ingredientSku: "ING-MARINATED-CHICKEN", quantity: 0.1 },
    { ingredientSku: "ING-OLIVES", quantity: 0.003 },
    { ingredientSku: "ING-JALEPENOS", quantity: 0.003 },
    { ingredientSku: "ING-CHEESE", quantity: 0.01 },
    { ingredientSku: "ING-GARLIC-MAYO", quantity: 0.05 },
    { ingredientSku: "ING-SPICY-SAUCE", quantity: 0.05 },
    { ingredientSku: "ING-BUCKET", quantity: 1 }
  ],
  olives: [{ ingredientSku: "ING-OLIVES", quantity: 0.03 }],
  mushrooms: [{ ingredientSku: "ING-MUSHROOM", quantity: 0.04 }],
  "chicken-add-on": [{ ingredientSku: "ING-CHICKEN", quantity: 0.06 }],
  cheese: [{ ingredientSku: "ING-CHEESE", quantity: 0.008 }],
  "classic-pocket-make-it-a-meal": [
    { ingredientSku: "ING-MARINATED-CHICKEN", quantity: 0.09 },
    { ingredientSku: "ING-BREAD", quantity: 1 },
    { ingredientSku: "ING-CLASSIC-SAUCE", quantity: 0.07 },
    { ingredientSku: "ING-LETTUCE", quantity: 0.018 },
    { ingredientSku: "ING-CARROT", quantity: 0.006 },
    { ingredientSku: "ING-CUCUMBER", quantity: 0.006 },
    { ingredientSku: "ING-CAPSICUM", quantity: 0.006 },
    { ingredientSku: "ING-FRIES", quantity: 0.18 },
    { ingredientSku: "ING-BOX", quantity: 1 },
    { ingredientSku: "ING-BUCKET", quantity: 1 }
  ],
  "spicy-pocket-make-it-a-meal": [
    { ingredientSku: "ING-MARINATED-CHICKEN", quantity: 0.09 },
    { ingredientSku: "ING-BREAD", quantity: 1 },
    { ingredientSku: "ING-SPICY-SAUCE", quantity: 0.07 },
    { ingredientSku: "ING-LETTUCE", quantity: 0.018 },
    { ingredientSku: "ING-CARROT", quantity: 0.006 },
    { ingredientSku: "ING-CUCUMBER", quantity: 0.006 },
    { ingredientSku: "ING-CAPSICUM", quantity: 0.006 },
    { ingredientSku: "ING-FRIES", quantity: 0.18 },
    { ingredientSku: "ING-BOX", quantity: 1 },
    { ingredientSku: "ING-BUCKET", quantity: 1 }
  ],
  "pocket-mai-rocket-make-it-a-meal": [
    { ingredientSku: "ING-MARINATED-CHICKEN", quantity: 0.09 },
    { ingredientSku: "ING-BREAD", quantity: 1 },
    { ingredientSku: "ING-SPICY-SAUCE", quantity: 0.07 },
    { ingredientSku: "ING-OLIVES", quantity: 0.004 },
    { ingredientSku: "ING-JALEPENOS", quantity: 0.004 },
    { ingredientSku: "ING-CORN", quantity: 0.004 },
    { ingredientSku: "ING-MUSHROOM", quantity: 0.004 },
    { ingredientSku: "ING-CHEESE", quantity: 0.008 },
    { ingredientSku: "ING-FRIES", quantity: 0.18 },
    { ingredientSku: "ING-BOX", quantity: 1 },
    { ingredientSku: "ING-BUCKET", quantity: 1 }
  ],
  "kiwi-passion": [
    { ingredientSku: "ING-KIWI-MONIN", quantity: 0.03 },
    { ingredientSku: "ING-PASSION-FRUIT-MONIN", quantity: 0.03 },
    { ingredientSku: "ING-SPRITE", quantity: 1 },
    { ingredientSku: "ING-CUP", quantity: 1 }
  ],
  "strawberry-cherry": [
    { ingredientSku: "ING-STRAWBERRY-MONIN", quantity: 0.03 },
    { ingredientSku: "ING-CHERRY-MONIN", quantity: 0.03 },
    { ingredientSku: "ING-SPRITE", quantity: 1 },
    { ingredientSku: "ING-CUP", quantity: 1 }
  ],
  "watermelon-guava": [
    { ingredientSku: "ING-WATERMELON-MONIN", quantity: 0.03 },
    { ingredientSku: "ING-GUAVA-MONIN", quantity: 0.03 },
    { ingredientSku: "ING-SPRITE", quantity: 1 },
    { ingredientSku: "ING-CUP", quantity: 1 }
  ],
  chocolate: [
    { ingredientSku: "ING-VANILLA-ICECREAM", quantity: 0.12 },
    { ingredientSku: "ING-MILK", quantity: 0.25 },
    { ingredientSku: "ING-CREAM", quantity: 0.03 },
    { ingredientSku: "ING-SUGAR", quantity: 0.01 },
    { ingredientSku: "ING-CUP", quantity: 1 }
  ],
  vanilla: [
    { ingredientSku: "ING-VANILLA-ICECREAM", quantity: 0.12 },
    { ingredientSku: "ING-MILK", quantity: 0.25 },
    { ingredientSku: "ING-CREAM", quantity: 0.03 },
    { ingredientSku: "ING-SUGAR", quantity: 0.01 },
    { ingredientSku: "ING-CUP", quantity: 1 }
  ],
  mango: [
    { ingredientSku: "ING-MANGO-ICECREAM", quantity: 0.12 },
    { ingredientSku: "ING-MILK", quantity: 0.25 },
    { ingredientSku: "ING-CREAM", quantity: 0.03 },
    { ingredientSku: "ING-SUGAR", quantity: 0.01 },
    { ingredientSku: "ING-CUP", quantity: 1 }
  ],
  oreo: [
    { ingredientSku: "ING-VANILLA-ICECREAM", quantity: 0.12 },
    { ingredientSku: "ING-MILK", quantity: 0.25 },
    { ingredientSku: "ING-CREAM", quantity: 0.03 },
    { ingredientSku: "ING-SUGAR", quantity: 0.01 },
    { ingredientSku: "ING-CUP", quantity: 1 }
  ],
  strawberry: [
    { ingredientSku: "ING-STRAWBERRY-ICECREAM", quantity: 0.12 },
    { ingredientSku: "ING-MILK", quantity: 0.25 },
    { ingredientSku: "ING-CREAM", quantity: 0.03 },
    { ingredientSku: "ING-SUGAR", quantity: 0.01 },
    { ingredientSku: "ING-CUP", quantity: 1 }
  ],
  pepsi: [{ ingredientSku: "ING-PEPSI", quantity: 1 }],
  "seven-up": [{ ingredientSku: "ING-7UP-345", quantity: 1 }],
  fanta: [{ ingredientSku: "ING-FANTA", quantity: 1 }]
};

export const PREPARED_RECIPE_BY_SKU: Record<string, Array<{ ingredientSku: string; quantity: number }>> = {
  "ING-MARINATED-CHICKEN": [
    { ingredientSku: "ING-CHICKEN", quantity: 10 },
    { ingredientSku: "ING-OIL", quantity: 0.5 },
    { ingredientSku: "ING-LASAN", quantity: 0.04 },
    { ingredientSku: "ING-ADRAK-POWDER", quantity: 0.01 },
    { ingredientSku: "ING-VINEGAR", quantity: 0.012 },
    { ingredientSku: "ING-LEMON-JUICE", quantity: 0.006 },
    { ingredientSku: "ING-SOYA-SAUCE", quantity: 0.008 },
    { ingredientSku: "ING-OREGANO", quantity: 0.015 },
    { ingredientSku: "ING-TIKKA-MASALA", quantity: 0.015 },
    { ingredientSku: "ING-DARA-MIRCH", quantity: 0.01 },
    { ingredientSku: "ING-LAL-MIRCH", quantity: 0.008 },
    { ingredientSku: "ING-KAALI-MIRCH", quantity: 0.012 },
    { ingredientSku: "ING-HOT-SAUCE", quantity: 0.015 },
    { ingredientSku: "ING-CHILLI-SAUCE", quantity: 0.015 },
    { ingredientSku: "ING-NAMAK", quantity: 0.025 }
  ],
  "ING-CLASSIC-SAUCE": [
    { ingredientSku: "ING-MAYO", quantity: 2 },
    { ingredientSku: "ING-CREAM", quantity: 0.2 },
    { ingredientSku: "ING-CUCUMBER", quantity: 0.034 },
    { ingredientSku: "ING-LASAN", quantity: 0.033 },
    { ingredientSku: "ING-CARROT", quantity: 0.033 },
    { ingredientSku: "ING-PAPRIKA", quantity: 0.008 },
    { ingredientSku: "ING-HOT-SAUCE", quantity: 0.006 },
    { ingredientSku: "ING-CHILLI-SAUCE", quantity: 0.006 },
    { ingredientSku: "ING-OREGANO", quantity: 0.015 },
    { ingredientSku: "ING-WHITE-MIRCH", quantity: 0.01 }
  ],
  "ING-SPICY-SAUCE": [
    { ingredientSku: "ING-MAYO", quantity: 0.5 },
    { ingredientSku: "ING-CREAM", quantity: 0.1 },
    { ingredientSku: "ING-JALEPENOS", quantity: 0.3 },
    { ingredientSku: "ING-WORCHESTER", quantity: 0.02 },
    { ingredientSku: "ING-HOT-SAUCE", quantity: 0.01 },
    { ingredientSku: "ING-CHILLI-SAUCE", quantity: 0.01 },
    { ingredientSku: "ING-TOMATO-KETCHUP", quantity: 0.015 },
    { ingredientSku: "ING-MUSTARD", quantity: 0.01 },
    { ingredientSku: "ING-LASAN-POWDER", quantity: 0.008 }
  ],
  "ING-GARLIC-MAYO": [
    { ingredientSku: "ING-MAYO", quantity: 0.5 },
    { ingredientSku: "ING-CREAM", quantity: 0.1 },
    { ingredientSku: "ING-LASAN", quantity: 0.06 },
    { ingredientSku: "ING-OREGANO", quantity: 0.015 },
    { ingredientSku: "ING-WHITE-MIRCH", quantity: 0.01 },
    { ingredientSku: "ING-LEMON-JUICE", quantity: 0.01 }
  ]
};

export const OPTION_RECIPE_BY_NAME: Record<string, Array<{ ingredientSku: string; quantity: number }>> = {
  "Classic shawarma sauce": [
    { ingredientSku: "ING-CREAM", quantity: 0.02 },
    { ingredientSku: "ING-SOYA-SAUCE", quantity: 0.003 },
    { ingredientSku: "ING-VINEGAR", quantity: 0.002 },
    { ingredientSku: "ING-LEMON-JUICE", quantity: 0.002 },
    { ingredientSku: "ING-OREGANO", quantity: 0.001 }
  ],
  "Spicy jalapeno sauce": [
    { ingredientSku: "ING-CREAM", quantity: 0.015 },
    { ingredientSku: "ING-CHILLI-SAUCE", quantity: 0.006 },
    { ingredientSku: "ING-HOT-SAUCE", quantity: 0.004 },
    { ingredientSku: "ING-VINEGAR", quantity: 0.002 }
  ],
  "Garlic Mayo Sauce": [
    { ingredientSku: "ING-CREAM", quantity: 0.02 },
    { ingredientSku: "ING-LASAN-POWDER", quantity: 0.001 },
    { ingredientSku: "ING-LEMON-JUICE", quantity: 0.002 }
  ],
  "Fries + Pepsi": [{ ingredientSku: "ING-PEPSI", quantity: 1 }],
  "Fries + 7UP": [{ ingredientSku: "ING-7UP-345", quantity: 1 }],
  "Fries + Fanta": [{ ingredientSku: "ING-FANTA", quantity: 1 }],
  "Fries + Chocolate Shake": [
    { ingredientSku: "ING-VANILLA-ICECREAM", quantity: 0.12 },
    { ingredientSku: "ING-MILK", quantity: 0.25 },
    { ingredientSku: "ING-CREAM", quantity: 0.03 },
    { ingredientSku: "ING-GLASS", quantity: 1 }
  ],
  "Fries + Vanilla Shake": [
    { ingredientSku: "ING-VANILLA-ICECREAM", quantity: 0.12 },
    { ingredientSku: "ING-MILK", quantity: 0.25 },
    { ingredientSku: "ING-CREAM", quantity: 0.03 },
    { ingredientSku: "ING-GLASS", quantity: 1 }
  ],
  "Fries + Mango Shake": [
    { ingredientSku: "ING-MANGO-ICECREAM", quantity: 0.12 },
    { ingredientSku: "ING-MILK", quantity: 0.25 },
    { ingredientSku: "ING-CREAM", quantity: 0.03 },
    { ingredientSku: "ING-GLASS", quantity: 1 }
  ],
  "Fries + Oreo Shake": [
    { ingredientSku: "ING-VANILLA-ICECREAM", quantity: 0.12 },
    { ingredientSku: "ING-MILK", quantity: 0.25 },
    { ingredientSku: "ING-CREAM", quantity: 0.03 },
    { ingredientSku: "ING-GLASS", quantity: 1 }
  ],
  "Fries + Strawberry Shake": [
    { ingredientSku: "ING-STRAWBERRY-ICECREAM", quantity: 0.12 },
    { ingredientSku: "ING-MILK", quantity: 0.25 },
    { ingredientSku: "ING-CREAM", quantity: 0.03 },
    { ingredientSku: "ING-GLASS", quantity: 1 }
  ],
  "Fries + Kiwi Passion": [
    { ingredientSku: "ING-KIWI-MONIN", quantity: 0.03 },
    { ingredientSku: "ING-PASSION-FRUIT-MONIN", quantity: 0.03 },
    { ingredientSku: "ING-GLASS", quantity: 1 }
  ],
  "Fries + Strawberry Cherry": [
    { ingredientSku: "ING-STRAWBERRY-MONIN", quantity: 0.03 },
    { ingredientSku: "ING-CHERRY-MONIN", quantity: 0.03 },
    { ingredientSku: "ING-GLASS", quantity: 1 }
  ],
  "Fries + Watermelon Guava": [
    { ingredientSku: "ING-WATERMELON-MONIN", quantity: 0.03 },
    { ingredientSku: "ING-GUAVA-MONIN", quantity: 0.03 },
    { ingredientSku: "ING-GLASS", quantity: 1 }
  ]
};

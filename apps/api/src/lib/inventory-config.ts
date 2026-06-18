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

function ingredient(sku: string, name: string, unit: keyof typeof UNIT_DEFAULTS, overrides?: Partial<UnitDefaults>) {
  const defaults = UNIT_DEFAULTS[unit];
  if (!defaults) {
    throw new Error(`Unsupported unit ${unit}`);
  }
  return {
    sku,
    name,
    unit,
    reorderLevel: overrides?.reorderLevel ?? defaults.reorderLevel,
    openingStock: overrides?.openingStock ?? defaults.openingStock,
    costPerUnit: 0
  };
}

export const INVENTORY_ITEMS = [
  ingredient("ING-CHICKEN", "Chicken", "kg", { openingStock: 18, reorderLevel: 4 }),
  ingredient("ING-CHEESE", "Cheese", "slices"),
  ingredient("ING-OLIVES", "Olives", "kg"),
  ingredient("ING-MUSHROOM", "Mushroom", "kg"),
  ingredient("ING-CORN", "Corn", "kg"),
  ingredient("ING-JALEPENOS", "Jalepenos", "kg"),
  ingredient("ING-SOYA-SAUCE", "Soya Sauce", "litre"),
  ingredient("ING-HOT-SAUCE", "Hot Sauce", "litre"),
  ingredient("ING-CHILLI-SAUCE", "Chilli Sauce", "litre"),
  ingredient("ING-VINEGAR", "Vinegar", "litre"),
  ingredient("ING-WORCHESTER", "Worchester Sauce", "litre"),
  ingredient("ING-LEMON-JUICE", "Lemon Juice", "litre"),
  ingredient("ING-TIKKA-MASALA", "Tikka Masala", "kg"),
  ingredient("ING-DARA-MIRCH", "Dara Mirch", "kg"),
  ingredient("ING-LAL-MIRCH", "Lal Mirch", "kg"),
  ingredient("ING-KAALI-MIRCH", "Kaali Mirch", "kg"),
  ingredient("ING-WHITE-MIRCH", "White Mirch", "kg"),
  ingredient("ING-ADRAK-POWDER", "Adrak Powder", "kg"),
  ingredient("ING-LASAN-POWDER", "Lasan Powder", "kg"),
  ingredient("ING-NAMAK", "Namak", "kg"),
  ingredient("ING-OREGANO", "Oregano", "kg"),
  ingredient("ING-PAPRIKA", "Paprika", "kg"),
  ingredient("ING-FRIES-MASALA", "Fries Masala", "kg"),
  ingredient("ING-FRIES", "Fries", "kg", { openingStock: 16, reorderLevel: 4 }),
  ingredient("ING-MILK", "Milk", "litre", { openingStock: 12, reorderLevel: 3 }),
  ingredient("ING-CREAM", "Cream", "kg"),
  ingredient("ING-MANGO-ICECREAM", "Mango Icecream", "kg"),
  ingredient("ING-STRAWBERRY-ICECREAM", "Strawberry Icecream", "kg"),
  ingredient("ING-VANILLA-ICECREAM", "Vanilla Icecream", "kg"),
  ingredient("ING-KULFA-ICECREAM", "Kulfa Icecream", "kg"),
  ingredient("ING-PISTACHIO-ICECREAM", "Pistachio Icecream", "kg"),
  ingredient("ING-7UP-345", "7UP 345ml", "bottles"),
  ingredient("ING-PEPSI", "Pepsi", "bottles"),
  ingredient("ING-FANTA", "Fanta", "bottles"),
  ingredient("ING-7UP-2L", "7UP 2 Litre", "bottles"),
  ingredient("ING-STRAWBERRY-MONIN", "Strawberry Monin", "litre"),
  ingredient("ING-CHERRY-MONIN", "Cherry Monin", "litre"),
  ingredient("ING-KIWI-MONIN", "Kiwi Monin", "litre"),
  ingredient("ING-WATERMELON-MONIN", "Watermelon Monin", "litre"),
  ingredient("ING-PASSION-FRUIT-MONIN", "Passion Fruit Monin", "litre"),
  ingredient("ING-GUAVA-MONIN", "Guava Monin", "litre"),
  ingredient("ING-BREAD", "Bread", "loafs"),
  ingredient("ING-OIL", "Oil", "litre", { openingStock: 14, reorderLevel: 3 }),
  ingredient("ING-BOX", "Box", "pieces"),
  ingredient("ING-TAKEAWAY", "Takeaway", "pieces"),
  ingredient("ING-GLASS", "Glass", "pieces"),
  ingredient("ING-CARROT", "Carrot", "kg"),
  ingredient("ING-ONION", "Onion", "kg"),
  ingredient("ING-LETTUCE", "Lettuce", "kg"),
  ingredient("ING-CUCUMBER", "Cucumber", "kg"),
  ingredient("ING-CAPSICUM", "Capsicum", "kg")
] as const;

export const PRODUCT_RECIPE_BY_SLUG: Record<string, Array<{ ingredientSku: string; quantity: number }>> = {
  "classic-pocket": [
    { ingredientSku: "ING-CHICKEN", quantity: 0.18 },
    { ingredientSku: "ING-BREAD", quantity: 0.14 },
    { ingredientSku: "ING-CHEESE", quantity: 1 },
    { ingredientSku: "ING-LETTUCE", quantity: 0.018 },
    { ingredientSku: "ING-CARROT", quantity: 0.012 },
    { ingredientSku: "ING-CUCUMBER", quantity: 0.012 },
    { ingredientSku: "ING-OIL", quantity: 0.005 },
    { ingredientSku: "ING-TAKEAWAY", quantity: 1 }
  ],
  "spicy-pocket": [
    { ingredientSku: "ING-CHICKEN", quantity: 0.18 },
    { ingredientSku: "ING-BREAD", quantity: 0.14 },
    { ingredientSku: "ING-CHEESE", quantity: 1 },
    { ingredientSku: "ING-LETTUCE", quantity: 0.018 },
    { ingredientSku: "ING-CARROT", quantity: 0.012 },
    { ingredientSku: "ING-CUCUMBER", quantity: 0.012 },
    { ingredientSku: "ING-OIL", quantity: 0.005 },
    { ingredientSku: "ING-TAKEAWAY", quantity: 1 }
  ],
  "pocket-mai-rocket": [
    { ingredientSku: "ING-CHICKEN", quantity: 0.18 },
    { ingredientSku: "ING-BREAD", quantity: 0.14 },
    { ingredientSku: "ING-OLIVES", quantity: 0.015 },
    { ingredientSku: "ING-JALEPENOS", quantity: 0.015 },
    { ingredientSku: "ING-CORN", quantity: 0.02 },
    { ingredientSku: "ING-MUSHROOM", quantity: 0.025 },
    { ingredientSku: "ING-CHEESE", quantity: 1 },
    { ingredientSku: "ING-OIL", quantity: 0.005 },
    { ingredientSku: "ING-TAKEAWAY", quantity: 1 }
  ],
  "thela-fries": [
    { ingredientSku: "ING-FRIES", quantity: 0.2 },
    { ingredientSku: "ING-FRIES-MASALA", quantity: 0.01 },
    { ingredientSku: "ING-OIL", quantity: 0.03 },
    { ingredientSku: "ING-BOX", quantity: 1 }
  ],
  "loaded-fries": [
    { ingredientSku: "ING-FRIES", quantity: 0.22 },
    { ingredientSku: "ING-CHEESE", quantity: 2 },
    { ingredientSku: "ING-JALEPENOS", quantity: 0.012 },
    { ingredientSku: "ING-OLIVES", quantity: 0.012 },
    { ingredientSku: "ING-CORN", quantity: 0.018 },
    { ingredientSku: "ING-CHICKEN", quantity: 0.08 },
    { ingredientSku: "ING-OIL", quantity: 0.03 },
    { ingredientSku: "ING-BOX", quantity: 1 }
  ],
  olives: [{ ingredientSku: "ING-OLIVES", quantity: 0.03 }],
  mushrooms: [{ ingredientSku: "ING-MUSHROOM", quantity: 0.04 }],
  "chicken-add-on": [{ ingredientSku: "ING-CHICKEN", quantity: 0.06 }],
  cheese: [{ ingredientSku: "ING-CHEESE", quantity: 1 }],
  "classic-pocket-make-it-a-meal": [
    { ingredientSku: "ING-CHICKEN", quantity: 0.18 },
    { ingredientSku: "ING-BREAD", quantity: 0.14 },
    { ingredientSku: "ING-CHEESE", quantity: 1 },
    { ingredientSku: "ING-LETTUCE", quantity: 0.018 },
    { ingredientSku: "ING-CARROT", quantity: 0.012 },
    { ingredientSku: "ING-CUCUMBER", quantity: 0.012 },
    { ingredientSku: "ING-FRIES", quantity: 0.18 },
    { ingredientSku: "ING-OIL", quantity: 0.025 },
    { ingredientSku: "ING-TAKEAWAY", quantity: 1 },
    { ingredientSku: "ING-BOX", quantity: 1 }
  ],
  "spicy-pocket-make-it-a-meal": [
    { ingredientSku: "ING-CHICKEN", quantity: 0.18 },
    { ingredientSku: "ING-BREAD", quantity: 0.14 },
    { ingredientSku: "ING-CHEESE", quantity: 1 },
    { ingredientSku: "ING-LETTUCE", quantity: 0.018 },
    { ingredientSku: "ING-CARROT", quantity: 0.012 },
    { ingredientSku: "ING-CUCUMBER", quantity: 0.012 },
    { ingredientSku: "ING-FRIES", quantity: 0.18 },
    { ingredientSku: "ING-OIL", quantity: 0.025 },
    { ingredientSku: "ING-TAKEAWAY", quantity: 1 },
    { ingredientSku: "ING-BOX", quantity: 1 }
  ],
  "pocket-mai-rocket-make-it-a-meal": [
    { ingredientSku: "ING-CHICKEN", quantity: 0.18 },
    { ingredientSku: "ING-BREAD", quantity: 0.14 },
    { ingredientSku: "ING-OLIVES", quantity: 0.015 },
    { ingredientSku: "ING-JALEPENOS", quantity: 0.015 },
    { ingredientSku: "ING-CORN", quantity: 0.02 },
    { ingredientSku: "ING-MUSHROOM", quantity: 0.025 },
    { ingredientSku: "ING-CHEESE", quantity: 1 },
    { ingredientSku: "ING-FRIES", quantity: 0.18 },
    { ingredientSku: "ING-OIL", quantity: 0.025 },
    { ingredientSku: "ING-TAKEAWAY", quantity: 1 },
    { ingredientSku: "ING-BOX", quantity: 1 }
  ],
  "kiwi-passion": [
    { ingredientSku: "ING-KIWI-MONIN", quantity: 0.03 },
    { ingredientSku: "ING-PASSION-FRUIT-MONIN", quantity: 0.03 },
    { ingredientSku: "ING-GLASS", quantity: 1 }
  ],
  "strawberry-cherry": [
    { ingredientSku: "ING-STRAWBERRY-MONIN", quantity: 0.03 },
    { ingredientSku: "ING-CHERRY-MONIN", quantity: 0.03 },
    { ingredientSku: "ING-GLASS", quantity: 1 }
  ],
  "watermelon-guava": [
    { ingredientSku: "ING-WATERMELON-MONIN", quantity: 0.03 },
    { ingredientSku: "ING-GUAVA-MONIN", quantity: 0.03 },
    { ingredientSku: "ING-GLASS", quantity: 1 }
  ],
  chocolate: [
    { ingredientSku: "ING-VANILLA-ICECREAM", quantity: 0.12 },
    { ingredientSku: "ING-MILK", quantity: 0.25 },
    { ingredientSku: "ING-CREAM", quantity: 0.03 },
    { ingredientSku: "ING-GLASS", quantity: 1 }
  ],
  vanilla: [
    { ingredientSku: "ING-VANILLA-ICECREAM", quantity: 0.12 },
    { ingredientSku: "ING-MILK", quantity: 0.25 },
    { ingredientSku: "ING-CREAM", quantity: 0.03 },
    { ingredientSku: "ING-GLASS", quantity: 1 }
  ],
  mango: [
    { ingredientSku: "ING-MANGO-ICECREAM", quantity: 0.12 },
    { ingredientSku: "ING-MILK", quantity: 0.25 },
    { ingredientSku: "ING-CREAM", quantity: 0.03 },
    { ingredientSku: "ING-GLASS", quantity: 1 }
  ],
  oreo: [
    { ingredientSku: "ING-VANILLA-ICECREAM", quantity: 0.12 },
    { ingredientSku: "ING-MILK", quantity: 0.25 },
    { ingredientSku: "ING-CREAM", quantity: 0.03 },
    { ingredientSku: "ING-GLASS", quantity: 1 }
  ],
  strawberry: [
    { ingredientSku: "ING-STRAWBERRY-ICECREAM", quantity: 0.12 },
    { ingredientSku: "ING-MILK", quantity: 0.25 },
    { ingredientSku: "ING-CREAM", quantity: 0.03 },
    { ingredientSku: "ING-GLASS", quantity: 1 }
  ],
  pepsi: [{ ingredientSku: "ING-PEPSI", quantity: 1 }],
  "seven-up": [{ ingredientSku: "ING-7UP-345", quantity: 1 }],
  fanta: [{ ingredientSku: "ING-FANTA", quantity: 1 }]
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

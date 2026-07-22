type InventoryType = "RAW" | "PREPARED" | "PACKAGING" | "RETAIL";

type InventoryItem = {
  sku: string;
  name: string;
  unit: string;
  type: InventoryType;
  reorderLevel: number;
  openingStock: number;
  costPerUnit: number;
  caloriesPerUnit: number;
};

type RecipeLine = {
  ingredientSku: string;
  quantity: number;
};

function item(
  sku: string,
  name: string,
  unit: string,
  openingStock: number,
  costPerUnit: number,
  options: { type?: InventoryType; reorderLevel?: number; caloriesPerUnit?: number } = {}
): InventoryItem {
  const defaultReorder = unit === "pieces" || unit === "bottles" || unit === "biscuit" ? 20 : 1;
  return {
    sku,
    name,
    unit,
    type: options.type ?? "RAW",
    openingStock,
    reorderLevel: options.reorderLevel ?? defaultReorder,
    costPerUnit,
    caloriesPerUnit: options.type === "PACKAGING" ? 0 : options.caloriesPerUnit ?? 0
  };
}

export const INVENTORY_ITEMS = [
  item("ING-MARINATED-CHICKEN", "Marinated Chicken", "kg", 0, 798, { type: "PREPARED", reorderLevel: 2, caloriesPerUnit: 1700 }),
  item("ING-CLASSIC-SAUCE", "Classic Sauce", "kg", 8.92, 744, { type: "PREPARED", reorderLevel: 1, caloriesPerUnit: 3300 }),
  item("ING-SPICY-SAUCE", "Spicy Sauce", "kg", 1.116, 791, { type: "PREPARED", reorderLevel: 1, caloriesPerUnit: 3000 }),
  item("ING-GARLIC-MAYO", "Garlic Mayo", "kg", 0.868, 821, { type: "PREPARED", reorderLevel: 1, caloriesPerUnit: 3400 }),
  item("ING-CORN", "Corn", "kg", 6.68, 1000, { caloriesPerUnit: 860 }),
  item("ING-OLIVES", "Olives", "kg", 2.35, 2000, { caloriesPerUnit: 1150 }),
  item("ING-JALEPENOS", "Jalepenos", "kg", 4.36, 900, { caloriesPerUnit: 290 }),
  item("ING-MUSHROOM", "Mushroom", "kg", 3.65, 1000, { caloriesPerUnit: 220 }),
  item("ING-CAPSICUM", "Shimla", "kg", 0.676, 467, { caloriesPerUnit: 310 }),
  item("ING-CUCUMBER", "Kheera", "kg", 1.478, 467, { caloriesPerUnit: 160 }),
  item("ING-CARROT", "Gajar", "kg", 1.152, 467, { caloriesPerUnit: 410 }),
  item("ING-LETTUCE", "Iceberg", "kg", 2.012, 467, { caloriesPerUnit: 150 }),
  item("ING-NAMAK", "Namak", "kg", 1.808, 80),
  item("ING-DARA-MIRCH", "Dara Mirch", "kg", 1.2, 600),
  item("ING-OREGANO", "Oregano", "kg", 0.636, 2133),
  item("ING-KAALI-MIRCH", "Kaali Mirch", "kg", 1.346, 2500),
  item("ING-WHITE-MIRCH", "White Pepper", "kg", 0, 3000),
  item("ING-LASAN-POWDER", "Lasan Powder", "kg", 1.202, 625),
  item("ING-ADRAK-POWDER", "Adrak Powder", "kg", 1.276, 900),
  item("ING-LAL-MIRCH", "Lal Mirch", "kg", 1.358, 625),
  item("ING-PAPRIKA", "Paprika", "kg", 0.75, 4500),
  item("ING-FRIES-MASALA", "Fries Masala", "kg", 0.436, 500),
  item("ING-TIKKA-MASALA", "Tikka Masala", "kg", 0.8, 1667),
  item("ING-MUSTARD", "Mustard", "kg", 0.25, 1300),
  item("ING-HOT-SAUCE", "Hot Sauce", "litre", 1.208, 1100),
  item("ING-WORCHESTER", "Worchester Sauce", "litre", 0.745, 400),
  item("ING-CHILLI-SAUCE", "Chili Sauce", "litre", 6.276, 300),
  item("ING-VINEGAR", "Vinegar", "litre", 4.762, 250),
  item("ING-SOYA-SAUCE", "Soya Sauce", "litre", 4.538, 250),
  item("ING-MILK", "Doodh", "glass", 6, 362.5, { caloriesPerUnit: 124 }),
  item("ING-CREAM", "Cream", "kg", 0.4, 1090, { caloriesPerUnit: 3450 }),
  item("ING-BREAD", "Bread", "pieces", 19, 33, { reorderLevel: 10, caloriesPerUnit: 180 }),
  item("ING-CHICKEN", "Chicken", "kg", 18, 763, { reorderLevel: 4, caloriesPerUnit: 1650 }),
  item("ING-CHEESE", "Cheese", "kg", 2.122, 1000, { caloriesPerUnit: 4020 }),
  item("ING-OIL", "Oil", "litre", 2.5, 364, { caloriesPerUnit: 8840 }),
  item("ING-LASAN", "Lasan", "kg", 0.4, 800),
  item("ING-MAYO", "Mayo", "kg", 22.5, 688, { caloriesPerUnit: 6800 }),
  item("ING-LEMON-JUICE", "Lemon Juice", "litre", 0.6, 800),
  item("ING-TOMATO-KETCHUP", "Tomato Ketchup", "kg", 0.3, 533),
  item("ING-SUGAR", "Cheeni", "kg", 0.8, 154, { caloriesPerUnit: 3870 }),
  item("ING-FRIES", "Fries", "kg", 16.7, 300, { reorderLevel: 4, caloriesPerUnit: 3120 }),
  item("ING-OREO", "Oreo", "biscuit", 12, 20, { caloriesPerUnit: 53 }),
  item("ING-SHAKE-SYRUP", "Shake Syrup", "litre", 0.6, 2750),
  item("ING-MANGO-ICECREAM", "Mango Icecream", "kg", 12.6, 500, { caloriesPerUnit: 2100 }),
  item("ING-KULFA-ICECREAM", "Kulfa Icecream", "kg", 2.8, 500, { caloriesPerUnit: 2100 }),
  item("ING-CARAMEL-ICECREAM", "Caramel Icecream", "kg", 3.7, 500, { caloriesPerUnit: 2100 }),
  item("ING-STRAWBERRY-ICECREAM", "Strawberry Icecream", "kg", 2.2, 500, { caloriesPerUnit: 2100 }),
  item("ING-VANILLA-ICECREAM", "Vanilla Icecream", "kg", 2.4, 500, { caloriesPerUnit: 2100 }),
  item("ING-PASSION-SYRUP", "Passion Syrup", "litre", 0.2, 1667),
  item("ING-BLUEBERRY-SYRUP", "Blueberry Syrup", "litre", 0.6, 1667),
  item("ING-STRAWBERRY-SYRUP", "Strawberry Syrup", "litre", 0.9, 1667),
  item("ING-POMEGRANATE-SYRUP", "Pomegranate Syrup", "litre", 0.35, 1667),
  item("ING-KIWI-SYRUP", "Kiwi Syrup", "litre", 0.08, 1667),
  item("ING-MINT-SYRUP", "Mint Syrup", "litre", 0.6, 1667),
  item("PKG-FRIES-BOX", "Fries Box", "pieces", 595, 15, { type: "PACKAGING", reorderLevel: 100 }),
  item("PKG-CUP", "Cups", "pieces", 327, 10, { type: "PACKAGING", reorderLevel: 75 }),
  item("PKG-CUP-LID", "Cups Dhakan", "pieces", 430, 0, { type: "PACKAGING", reorderLevel: 75 }),
  item("PKG-BUTTER-PAPER", "Butter Paper", "pieces", 1180, 0, { type: "PACKAGING", reorderLevel: 150 }),
  item("PKG-SHAWARMA-BOX", "Box", "pieces", 417, 19, { type: "PACKAGING", reorderLevel: 100 }),
  item("PKG-STRAWS", "Straws", "pieces", 450, 0, { type: "PACKAGING", reorderLevel: 100 }),
  item("PKG-FORK", "Fork", "pieces", 250, 0, { type: "PACKAGING", reorderLevel: 75 }),
  item("PKG-FOOD-BAG", "Food Bag", "pieces", 350, 0, { type: "PACKAGING", reorderLevel: 75 }),
  item("RTL-PEPSI", "Pepsi", "bottles", 28, 65, { type: "RETAIL", reorderLevel: 12, caloriesPerUnit: 140 }),
  item("RTL-MIRINDA", "Mirinda", "bottles", 21, 65, { type: "RETAIL", reorderLevel: 12, caloriesPerUnit: 145 }),
  item("RTL-WATER", "Water", "bottles", 2, 40, { type: "RETAIL", reorderLevel: 12 }),
  item("RTL-7UP", "7UP", "bottles", 12, 65, { type: "RETAIL", reorderLevel: 12, caloriesPerUnit: 135 })
] as const;

const vegMix: RecipeLine[] = [
  { ingredientSku: "ING-CARROT", quantity: 0.007 },
  { ingredientSku: "ING-CAPSICUM", quantity: 0.007 },
  { ingredientSku: "ING-CUCUMBER", quantity: 0.008 },
  { ingredientSku: "ING-LETTUCE", quantity: 0.008 }
];

const shakeBase: RecipeLine[] = [
  { ingredientSku: "ING-MILK", quantity: 0.16 },
  { ingredientSku: "ING-SUGAR", quantity: 0.013 },
  { ingredientSku: "ING-SHAKE-SYRUP", quantity: 0.008 }
];

export const PRODUCT_RECIPE_BY_SLUG: Record<string, RecipeLine[]> = {
  "classic-pocket": [
    { ingredientSku: "ING-MARINATED-CHICKEN", quantity: 0.09 },
    { ingredientSku: "ING-BREAD", quantity: 1 },
    ...vegMix,
    { ingredientSku: "ING-CLASSIC-SAUCE", quantity: 0.07 }
  ],
  "spicy-pocket": [
    { ingredientSku: "ING-MARINATED-CHICKEN", quantity: 0.09 },
    { ingredientSku: "ING-BREAD", quantity: 1 },
    ...vegMix,
    { ingredientSku: "ING-SPICY-SAUCE", quantity: 0.07 }
  ],
  "pocket-mai-rocket": [
    { ingredientSku: "ING-MARINATED-CHICKEN", quantity: 0.09 },
    { ingredientSku: "ING-BREAD", quantity: 1 },
    ...vegMix,
    { ingredientSku: "ING-CHEESE", quantity: 0.008 },
    { ingredientSku: "ING-OLIVES", quantity: 0.004 },
    { ingredientSku: "ING-MUSHROOM", quantity: 0.004 },
    { ingredientSku: "ING-JALEPENOS", quantity: 0.004 },
    { ingredientSku: "ING-CORN", quantity: 0.004 }
  ],
  "thela-fries": [
    { ingredientSku: "ING-FRIES", quantity: 0.32 },
    { ingredientSku: "ING-FRIES-MASALA", quantity: 0.012 }
  ],
  "loaded-fries": [
    { ingredientSku: "ING-FRIES", quantity: 0.25 },
    { ingredientSku: "ING-MARINATED-CHICKEN", quantity: 0.1 },
    { ingredientSku: "ING-OLIVES", quantity: 0.003 },
    { ingredientSku: "ING-JALEPENOS", quantity: 0.003 },
    { ingredientSku: "ING-CHEESE", quantity: 0.01 },
    { ingredientSku: "ING-GARLIC-MAYO", quantity: 0.05 },
    { ingredientSku: "ING-SPICY-SAUCE", quantity: 0.05 }
  ],
  olives: [{ ingredientSku: "ING-OLIVES", quantity: 0.03 }],
  mushrooms: [{ ingredientSku: "ING-MUSHROOM", quantity: 0.04 }],
  "chicken-add-on": [{ ingredientSku: "ING-MARINATED-CHICKEN", quantity: 0.06 }],
  cheese: [{ ingredientSku: "ING-CHEESE", quantity: 0.008 }],
  "classic-pocket-make-it-a-meal": [
    { ingredientSku: "ING-MARINATED-CHICKEN", quantity: 0.09 },
    { ingredientSku: "ING-BREAD", quantity: 1 },
    ...vegMix,
    { ingredientSku: "ING-CLASSIC-SAUCE", quantity: 0.07 },
    { ingredientSku: "ING-FRIES", quantity: 0.18 },
    { ingredientSku: "ING-FRIES-MASALA", quantity: 0.006 }
  ],
  "spicy-pocket-make-it-a-meal": [
    { ingredientSku: "ING-MARINATED-CHICKEN", quantity: 0.09 },
    { ingredientSku: "ING-BREAD", quantity: 1 },
    ...vegMix,
    { ingredientSku: "ING-SPICY-SAUCE", quantity: 0.07 },
    { ingredientSku: "ING-FRIES", quantity: 0.18 },
    { ingredientSku: "ING-FRIES-MASALA", quantity: 0.006 }
  ],
  "pocket-mai-rocket-make-it-a-meal": [
    { ingredientSku: "ING-MARINATED-CHICKEN", quantity: 0.09 },
    { ingredientSku: "ING-BREAD", quantity: 1 },
    ...vegMix,
    { ingredientSku: "ING-CHEESE", quantity: 0.008 },
    { ingredientSku: "ING-OLIVES", quantity: 0.004 },
    { ingredientSku: "ING-MUSHROOM", quantity: 0.004 },
    { ingredientSku: "ING-JALEPENOS", quantity: 0.004 },
    { ingredientSku: "ING-CORN", quantity: 0.004 },
    { ingredientSku: "ING-FRIES", quantity: 0.18 },
    { ingredientSku: "ING-FRIES-MASALA", quantity: 0.006 }
  ],
  "kiwi-passion": [
    { ingredientSku: "ING-KIWI-SYRUP", quantity: 0.03 },
    { ingredientSku: "ING-PASSION-SYRUP", quantity: 0.03 },
    { ingredientSku: "RTL-7UP", quantity: 1 }
  ],
  "strawberry-cherry": [
    { ingredientSku: "ING-STRAWBERRY-SYRUP", quantity: 0.03 },
    { ingredientSku: "ING-BLUEBERRY-SYRUP", quantity: 0.03 },
    { ingredientSku: "RTL-7UP", quantity: 1 }
  ],
  "watermelon-guava": [
    { ingredientSku: "ING-POMEGRANATE-SYRUP", quantity: 0.03 },
    { ingredientSku: "ING-MINT-SYRUP", quantity: 0.03 },
    { ingredientSku: "RTL-7UP", quantity: 1 }
  ],
  chocolate: [{ ingredientSku: "ING-CARAMEL-ICECREAM", quantity: 0.12 }, ...shakeBase],
  vanilla: [{ ingredientSku: "ING-VANILLA-ICECREAM", quantity: 0.12 }, ...shakeBase],
  mango: [{ ingredientSku: "ING-MANGO-ICECREAM", quantity: 0.12 }, ...shakeBase],
  oreo: [
    { ingredientSku: "ING-VANILLA-ICECREAM", quantity: 0.12 },
    { ingredientSku: "ING-OREO", quantity: 1 },
    ...shakeBase
  ],
  strawberry: [{ ingredientSku: "ING-STRAWBERRY-ICECREAM", quantity: 0.12 }, ...shakeBase],
  pepsi: [{ ingredientSku: "RTL-PEPSI", quantity: 1 }],
  "seven-up": [{ ingredientSku: "RTL-7UP", quantity: 1 }],
  fanta: [{ ingredientSku: "RTL-MIRINDA", quantity: 1 }]
};

export const PREPARED_RECIPE_BY_SKU: Record<string, RecipeLine[]> = {
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

export const PACKAGING_RULES: Array<{
  productSlug?: string;
  categorySlug?: string;
  serviceType: "DEFAULT" | "INSHOP" | "DINE_IN" | "TAKEAWAY" | "FOODPANDA" | "DELIVERY";
  packagingSku: string;
  quantityMode: "FIXED" | "PER_ITEM_STEP";
  quantity: number;
  itemStep?: number;
}> = [
  ...["classic-pocket", "spicy-pocket", "pocket-mai-rocket", "classic-pocket-make-it-a-meal", "spicy-pocket-make-it-a-meal", "pocket-mai-rocket-make-it-a-meal"].flatMap((productSlug) => [
    { productSlug, serviceType: "DEFAULT" as const, packagingSku: "PKG-SHAWARMA-BOX", quantityMode: "FIXED" as const, quantity: 1 },
    { productSlug, serviceType: "DEFAULT" as const, packagingSku: "PKG-BUTTER-PAPER", quantityMode: "FIXED" as const, quantity: 1 }
  ]),
  ...["thela-fries", "loaded-fries"].flatMap((productSlug) => [
    { productSlug, serviceType: "DEFAULT" as const, packagingSku: "PKG-FRIES-BOX", quantityMode: "FIXED" as const, quantity: 1 },
    { productSlug, serviceType: "DEFAULT" as const, packagingSku: "PKG-FORK", quantityMode: "FIXED" as const, quantity: 1 }
  ]),
  ...["kiwi-passion", "strawberry-cherry", "watermelon-guava", "chocolate", "vanilla", "mango", "oreo", "strawberry"].flatMap((productSlug) => [
    { productSlug, serviceType: "DEFAULT" as const, packagingSku: "PKG-CUP", quantityMode: "FIXED" as const, quantity: 1 },
    { productSlug, serviceType: "DEFAULT" as const, packagingSku: "PKG-CUP-LID", quantityMode: "FIXED" as const, quantity: 1 },
    { productSlug, serviceType: "DEFAULT" as const, packagingSku: "PKG-STRAWS", quantityMode: "FIXED" as const, quantity: 1 }
  ]),
  { serviceType: "TAKEAWAY", packagingSku: "PKG-FOOD-BAG", quantityMode: "PER_ITEM_STEP", quantity: 1, itemStep: 3 },
  { serviceType: "FOODPANDA", packagingSku: "PKG-FOOD-BAG", quantityMode: "PER_ITEM_STEP", quantity: 1, itemStep: 2 },
  { serviceType: "DELIVERY", packagingSku: "PKG-FOOD-BAG", quantityMode: "PER_ITEM_STEP", quantity: 1, itemStep: 2 }
];

export const OPTION_RECIPE_BY_NAME: Record<string, RecipeLine[]> = {
  "Classic shawarma sauce": [{ ingredientSku: "ING-CLASSIC-SAUCE", quantity: 0.07 }],
  "Spicy jalapeno sauce": [{ ingredientSku: "ING-SPICY-SAUCE", quantity: 0.07 }],
  "Garlic Mayo Sauce": [{ ingredientSku: "ING-GARLIC-MAYO", quantity: 0.03 }],
  "Fries + Pepsi": [
    { ingredientSku: "ING-FRIES", quantity: 0.18 },
    { ingredientSku: "ING-FRIES-MASALA", quantity: 0.006 },
    { ingredientSku: "RTL-PEPSI", quantity: 1 }
  ],
  "Fries + 7UP": [
    { ingredientSku: "ING-FRIES", quantity: 0.18 },
    { ingredientSku: "ING-FRIES-MASALA", quantity: 0.006 },
    { ingredientSku: "RTL-7UP", quantity: 1 }
  ],
  "Fries + Fanta": [
    { ingredientSku: "ING-FRIES", quantity: 0.18 },
    { ingredientSku: "ING-FRIES-MASALA", quantity: 0.006 },
    { ingredientSku: "RTL-MIRINDA", quantity: 1 }
  ],
  "Fries + Chocolate Shake": [
    { ingredientSku: "ING-FRIES", quantity: 0.18 },
    { ingredientSku: "ING-FRIES-MASALA", quantity: 0.006 },
    { ingredientSku: "ING-CARAMEL-ICECREAM", quantity: 0.12 },
    ...shakeBase
  ],
  "Fries + Vanilla Shake": [
    { ingredientSku: "ING-FRIES", quantity: 0.18 },
    { ingredientSku: "ING-FRIES-MASALA", quantity: 0.006 },
    { ingredientSku: "ING-VANILLA-ICECREAM", quantity: 0.12 },
    ...shakeBase
  ],
  "Fries + Mango Shake": [
    { ingredientSku: "ING-FRIES", quantity: 0.18 },
    { ingredientSku: "ING-FRIES-MASALA", quantity: 0.006 },
    { ingredientSku: "ING-MANGO-ICECREAM", quantity: 0.12 },
    ...shakeBase
  ],
  "Fries + Oreo Shake": [
    { ingredientSku: "ING-FRIES", quantity: 0.18 },
    { ingredientSku: "ING-FRIES-MASALA", quantity: 0.006 },
    { ingredientSku: "ING-VANILLA-ICECREAM", quantity: 0.12 },
    { ingredientSku: "ING-OREO", quantity: 1 },
    ...shakeBase
  ],
  "Fries + Strawberry Shake": [
    { ingredientSku: "ING-FRIES", quantity: 0.18 },
    { ingredientSku: "ING-FRIES-MASALA", quantity: 0.006 },
    { ingredientSku: "ING-STRAWBERRY-ICECREAM", quantity: 0.12 },
    ...shakeBase
  ],
  "Fries + Kiwi Passion": [
    { ingredientSku: "ING-FRIES", quantity: 0.18 },
    { ingredientSku: "ING-FRIES-MASALA", quantity: 0.006 },
    { ingredientSku: "ING-KIWI-SYRUP", quantity: 0.03 },
    { ingredientSku: "ING-PASSION-SYRUP", quantity: 0.03 },
    { ingredientSku: "RTL-7UP", quantity: 1 }
  ],
  "Fries + Strawberry Cherry": [
    { ingredientSku: "ING-FRIES", quantity: 0.18 },
    { ingredientSku: "ING-FRIES-MASALA", quantity: 0.006 },
    { ingredientSku: "ING-STRAWBERRY-SYRUP", quantity: 0.03 },
    { ingredientSku: "ING-BLUEBERRY-SYRUP", quantity: 0.03 },
    { ingredientSku: "RTL-7UP", quantity: 1 }
  ],
  "Fries + Watermelon Guava": [
    { ingredientSku: "ING-FRIES", quantity: 0.18 },
    { ingredientSku: "ING-FRIES-MASALA", quantity: 0.006 },
    { ingredientSku: "ING-POMEGRANATE-SYRUP", quantity: 0.03 },
    { ingredientSku: "ING-MINT-SYRUP", quantity: 0.03 },
    { ingredientSku: "RTL-7UP", quantity: 1 }
  ]
};

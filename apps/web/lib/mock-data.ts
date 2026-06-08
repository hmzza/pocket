import type { AddOnGroup, Branch, Category, DashboardData, HomeContent, Product, TrackedOrder } from "./types";

export const categories: Category[] = [
  {
    id: "cat-shawarmas",
    slug: "shawarmas",
    name: "Shawarmas",
    description: "Pocket signature wraps",
    imageUrl: "/images/shawarma-pocket.svg"
  },
  {
    id: "cat-fries",
    slug: "fries",
    name: "Fries",
    description: "Loaded sides and spice hits",
    imageUrl: "/images/loaded-fries.svg"
  },
  {
    id: "cat-drinks",
    slug: "drinks",
    name: "Drinks",
    description: "Cold add-ons",
    imageUrl: "/images/pocket-drink.svg"
  },
  {
    id: "cat-combos",
    slug: "combos",
    name: "Combos",
    description: "Pocket bundles",
    imageUrl: "/images/pocket-combo.svg"
  }
];

const [shawarmaCategory, friesCategory, drinksCategory, combosCategory] = categories as [Category, Category, Category, Category];

export const branch: Branch = {
  id: "branch-islamabad-g11",
  slug: "islamabad-g11",
  name: "Pocket G-11 Markaz",
  city: "Islamabad",
  addressLine1: "Shop #17, Al Ghaffar Mall, G-11 Markaz",
  phone: "+92-300-POCKET1",
  deliveryFee: 180
};

const addOns: AddOnGroup[] = [
  {
    id: "group-wrap-customize",
    name: "Customize Your Wrap",
    minSelect: 0,
    maxSelect: 3,
    options: [
      { id: "addon-cheese", name: "Extra cheese", priceDelta: 90 },
      { id: "addon-sauce", name: "Extra sauce", priceDelta: 50 },
      { id: "addon-double", name: "Double meat", priceDelta: 190 }
    ]
  }
];

const wrapAddOnGroup = addOns[0]!;

export const products: Product[] = [
  {
    id: "product-chicken",
    slug: "pocket-chicken-shawarma",
    name: "Pocket Chicken Shawarma",
    description: "Charred chicken, pickled slaw, garlic sauce, and crunchy lettuce wrapped Pocket style.",
    price: 590,
    calories: 640,
    category: shawarmaCategory,
    imageUrl: "/images/shawarma-pocket.svg",
    gallery: ["/images/shawarma-pocket.svg", "/images/hero-pocket.svg"],
    featured: true,
    bestSeller: true,
    prepTimeMinutes: 16,
    spiceLevel: 2,
    ingredients: ["Chicken", "Garlic sauce", "Pickles", "Lettuce"],
    nutrition: { calories: 640, protein: 31, carbs: 43, fats: 28 },
    addOnGroups: addOns,
    reviews: [
      {
        id: "review-1",
        author: "Ayesha Khan",
        rating: 5,
        title: "High repeat order potential",
        body: "Good crunch, strong garlic, and it still arrives well packed."
      }
    ]
  },
  {
    id: "product-beef",
    slug: "pocket-beef-shawarma",
    name: "Pocket Beef Shawarma",
    description: "Slow-spiced beef, tahini aioli, onions, and sumac fries crunch tucked into a toasted wrap.",
    price: 690,
    calories: 700,
    category: shawarmaCategory,
    imageUrl: "/images/shawarma-beef.svg",
    gallery: ["/images/shawarma-beef.svg", "/images/hero-pocket.svg"],
    featured: true,
    bestSeller: false,
    prepTimeMinutes: 18,
    spiceLevel: 3,
    ingredients: ["Beef", "Tahini aioli", "Onions", "Sumac"],
    nutrition: { calories: 700, protein: 34, carbs: 45, fats: 32 },
    addOnGroups: addOns,
    reviews: []
  },
  {
    id: "product-special",
    slug: "pocket-special-shawarma",
    name: "Pocket Special Shawarma",
    description: "Double protein, olives, corn, jalapeno cream, and Pocket fire sauce.",
    price: 790,
    calories: 820,
    category: shawarmaCategory,
    imageUrl: "/images/pocket-special.svg",
    gallery: ["/images/pocket-special.svg", "/images/hero-pocket.svg"],
    featured: true,
    bestSeller: true,
    prepTimeMinutes: 20,
    spiceLevel: 4,
    ingredients: ["Chicken", "Beef", "Olives", "Corn", "Pocket sauce"],
    nutrition: { calories: 820, protein: 44, carbs: 50, fats: 40 },
    addOnGroups: [
      {
        ...wrapAddOnGroup,
        options: [...wrapAddOnGroup.options, { id: "addon-fire", name: "Pocket fire sauce", priceDelta: 40 }]
      }
    ],
    reviews: []
  },
  {
    id: "product-loaded-fries",
    slug: "loaded-fries",
    name: "Loaded Fries",
    description: "Crispy fries with chicken shawarma, garlic drizzle, pickled onions, and parsley.",
    price: 470,
    calories: 510,
    category: friesCategory,
    imageUrl: "/images/loaded-fries.svg",
    gallery: ["/images/loaded-fries.svg"],
    featured: false,
    bestSeller: true,
    prepTimeMinutes: 12,
    spiceLevel: 2,
    ingredients: ["Fries", "Chicken", "Garlic drizzle", "Onions"],
    nutrition: { calories: 510, protein: 18, carbs: 53, fats: 24 },
    addOnGroups: [],
    reviews: []
  },
  {
    id: "product-masala-fries",
    slug: "masala-fries",
    name: "Masala Fries",
    description: "Crispy fries dusted in Pocket masala and served with cool dip.",
    price: 280,
    calories: 390,
    category: friesCategory,
    imageUrl: "/images/masala-fries.svg",
    gallery: ["/images/masala-fries.svg"],
    featured: false,
    bestSeller: false,
    prepTimeMinutes: 8,
    spiceLevel: 3,
    ingredients: ["Fries", "Masala seasoning", "Dip"],
    nutrition: { calories: 390, protein: 6, carbs: 49, fats: 18 },
    addOnGroups: [],
    reviews: []
  },
  {
    id: "product-coke",
    slug: "coke",
    name: "Coke",
    description: "Chilled can.",
    price: 120,
    calories: 140,
    category: drinksCategory,
    imageUrl: "/images/pocket-drink.svg",
    gallery: ["/images/pocket-drink.svg"],
    featured: false,
    bestSeller: true,
    prepTimeMinutes: 1,
    spiceLevel: 0,
    ingredients: ["Carbonated beverage"],
    nutrition: { calories: 140, protein: 0, carbs: 39, fats: 0 },
    addOnGroups: [],
    reviews: []
  },
  {
    id: "product-combo",
    slug: "shawarma-drink-combo",
    name: "Shawarma + Drink",
    description: "Pocket chicken shawarma paired with a chilled drink.",
    price: 670,
    calories: 780,
    category: combosCategory,
    imageUrl: "/images/pocket-combo.svg",
    gallery: ["/images/pocket-combo.svg"],
    featured: true,
    bestSeller: true,
    prepTimeMinutes: 16,
    spiceLevel: 2,
    ingredients: ["Chicken shawarma", "Soft drink"],
    nutrition: { calories: 780, protein: 31, carbs: 82, fats: 28 },
    addOnGroups: [],
    reviews: []
  },
  {
    id: "product-combo-full",
    slug: "shawarma-fries-drink-combo",
    name: "Shawarma + Fries + Drink",
    description: "The all-in Pocket order built for lunch rush or late-night cravings.",
    price: 890,
    calories: 1090,
    category: combosCategory,
    imageUrl: "/images/combo-meal.svg",
    gallery: ["/images/combo-meal.svg"],
    featured: true,
    bestSeller: true,
    prepTimeMinutes: 20,
    spiceLevel: 2,
    ingredients: ["Chicken shawarma", "Fries", "Soft drink"],
    nutrition: { calories: 1090, protein: 38, carbs: 121, fats: 42 },
    addOnGroups: [],
    reviews: []
  }
];

export const homeContent: HomeContent = {
  hero: {
    eyebrow: "Islamabad's newest shawarma ritual",
    headline: "POCKET",
    subheadline: "Real Shawarma, Served The Pocket Way",
    description: "Fresh carved wraps, loaded fries, bold sauces, and fast delivery from G-11 Markaz."
  },
  whyPocket: [
    {
      title: "Fresh ingredients",
      description: "Daily prepped veg, hand-seasoned proteins, signature sauces."
    },
    {
      title: "Fast service",
      description: "Built for walk-ins, pickups, and rush-hour delivery."
    },
    {
      title: "Premium taste",
      description: "A bolder shawarma profile with house-crafted toppings."
    }
  ],
  testimonials: [
    {
      author: "Hassan R.",
      body: "Pocket special with extra sauce is already my default lunch order.",
      rating: 5
    },
    {
      author: "Maria N.",
      body: "Loaded fries hit the right balance. Fast prep and clean packaging.",
      rating: 5
    },
    {
      author: "Ali Z.",
      body: "The wraps actually taste premium. Good portions too.",
      rating: 4
    }
  ]
};

export const trackedOrders: TrackedOrder[] = [
  {
    id: "order-123",
    orderNumber: "PKT-2026-000123",
    status: "OUT_FOR_DELIVERY",
    branch: branch.name,
    expectedDeliveryAt: "2026-06-04T17:35:00.000Z",
    totalAmount: 883,
    placedAt: "2026-06-04T16:58:00.000Z",
    items: [
      {
        id: "order-item-1",
        productName: "Shawarma + Drink",
        quantity: 1,
        unitPrice: 670
      }
    ]
  }
];

export const dashboardData: DashboardData = {
  kpis: {
    todayOrders: 124,
    revenue: 148700,
    totalCustomers: 684,
    averageOrderValue: 1199
  },
  topProducts: [
    { productName: "Pocket Chicken Shawarma", quantity: 172 },
    { productName: "Pocket Special Shawarma", quantity: 124 },
    { productName: "Shawarma + Fries + Drink", quantity: 98 },
    { productName: "Loaded Fries", quantity: 91 }
  ],
  recentOrders: [
    { id: "o1", orderNumber: "PKT-2026-000131", customerName: "Ali Raza", status: "PREPARING", totalAmount: 1490 },
    { id: "o2", orderNumber: "PKT-2026-000130", customerName: "Noor Hassan", status: "CONFIRMED", totalAmount: 930 },
    { id: "o3", orderNumber: "PKT-2026-000129", customerName: "Ayesha Khan", status: "OUT_FOR_DELIVERY", totalAmount: 883 },
    { id: "o4", orderNumber: "PKT-2026-000128", customerName: "M. Salman", status: "DELIVERED", totalAmount: 690 }
  ],
  lowStock: [
    { ingredient: "Beef slices", branch: "Pocket G-11 Markaz", quantityOnHand: 6 },
    { ingredient: "Garlic sauce", branch: "Pocket G-11 Markaz", quantityOnHand: 5 }
  ],
  sales: [
    { label: "Mon", revenue: 92000 },
    { label: "Tue", revenue: 106500 },
    { label: "Wed", revenue: 124400 },
    { label: "Thu", revenue: 148700 },
    { label: "Fri", revenue: 163000 },
    { label: "Sat", revenue: 176500 },
    { label: "Sun", revenue: 139800 }
  ]
};

export const mockCustomers = [
  {
    id: "cust-1",
    name: "Ayesha Khan",
    email: "customer@pocketshawarma.com",
    phone: "+92-300-0000022",
    totalOrders: 8,
    totalSpend: 8220,
    lastOrderDate: "2026-06-04T16:58:00.000Z",
    segment: "Loyal"
  },
  {
    id: "cust-2",
    name: "Hassan Riaz",
    email: "hassan@example.com",
    phone: "+92-300-1112233",
    totalOrders: 4,
    totalSpend: 3510,
    lastOrderDate: "2026-06-03T18:10:00.000Z",
    segment: "Active"
  },
  {
    id: "cust-3",
    name: "Maria Noman",
    email: "maria@example.com",
    phone: "+92-301-2223344",
    totalOrders: 2,
    totalSpend: 1780,
    lastOrderDate: "2026-06-01T14:40:00.000Z",
    segment: "New"
  }
];

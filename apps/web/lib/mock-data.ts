import type { AddOnGroup, Branch, Category, DashboardData, HomeContent, Product, TrackedOrder } from "./types";

export const categories: Category[] = [
  {
    id: "cat-shawarma",
    slug: "shawarma",
    name: "Shawarma",
    description: "Pocket signature wraps",
    imageUrl: "/images/shawarma-pocket.svg"
  },
  {
    id: "cat-fries",
    slug: "fries",
    name: "Fries",
    description: "Crispy sides and spice hits",
    imageUrl: "/images/loaded-fries.svg"
  },
  {
    id: "cat-meals",
    slug: "make-it-a-meal",
    name: "Make It A Meal",
    description: "Pocket wraps bundled with fries and your drink pick",
    imageUrl: "/images/combo-meal.svg"
  },
  {
    id: "cat-chillers",
    slug: "chillers",
    name: "Chillers",
    description: "Fruit chillers",
    imageUrl: "/images/pocket-drink.svg"
  },
  {
    id: "cat-shakes",
    slug: "ice-cream-shakes",
    name: "Ice Cream Shakes",
    description: "Creamy shakes",
    imageUrl: "/images/pocket-combo.svg"
  },
  {
    id: "cat-soft-drinks",
    slug: "soft-drinks",
    name: "Soft Drinks",
    description: "Classic soft drinks",
    imageUrl: "/images/pocket-drink.svg"
  }
];

const [shawarmaCategory, friesCategory, mealCategory, chillersCategory, shakesCategory, softDrinksCategory] = categories as [
  Category,
  Category,
  Category,
  Category,
  Category,
  Category
];

export const branch: Branch = {
  id: "branch-islamabad-g11",
  slug: "islamabad-g11",
  name: "Pocket G-11 Markaz",
  city: "Islamabad",
  addressLine1: "Shop #17, Al Ghaffar Mall, G-11 Markaz",
  phone: "+92 329 5196981",
  deliveryFee: 180
};

const garlicMayoAddOnGroup: AddOnGroup = {
  id: "group-garlic-mayo",
  name: "Extras",
  minSelect: 0,
  maxSelect: 1,
  options: [{ id: "addon-garlic-mayo", name: "Garlic Mayo Sauce", priceDelta: 50 }]
};

const mealOptionGroups = {
  classic: {
    id: "group-classic-meal",
    name: "Choose your meal pairing",
    minSelect: 1,
    maxSelect: 1,
    isRequired: true,
    options: [
      { id: "classic-meal-pepsi", name: "Fries + Pepsi", priceDelta: 250 },
      { id: "classic-meal-7up", name: "Fries + 7UP", priceDelta: 250 },
      { id: "classic-meal-fanta", name: "Fries + Fanta", priceDelta: 250 },
      { id: "classic-meal-chocolate", name: "Fries + Chocolate Shake", priceDelta: 450 },
      { id: "classic-meal-vanilla", name: "Fries + Vanilla Shake", priceDelta: 450 },
      { id: "classic-meal-mango", name: "Fries + Mango Shake", priceDelta: 450 },
      { id: "classic-meal-oreo", name: "Fries + Oreo Shake", priceDelta: 450 },
      { id: "classic-meal-strawberry", name: "Fries + Strawberry Shake", priceDelta: 450 },
      { id: "classic-meal-kiwi", name: "Fries + Kiwi Passion", priceDelta: 550 },
      { id: "classic-meal-cherry", name: "Fries + Strawberry Cherry", priceDelta: 550 },
      { id: "classic-meal-watermelon", name: "Fries + Watermelon Guava", priceDelta: 550 }
    ]
  } satisfies AddOnGroup,
  spicy: {
    id: "group-spicy-meal",
    name: "Choose your meal pairing",
    minSelect: 1,
    maxSelect: 1,
    isRequired: true,
    options: [
      { id: "spicy-meal-pepsi", name: "Fries + Pepsi", priceDelta: 250 },
      { id: "spicy-meal-7up", name: "Fries + 7UP", priceDelta: 250 },
      { id: "spicy-meal-fanta", name: "Fries + Fanta", priceDelta: 250 },
      { id: "spicy-meal-chocolate", name: "Fries + Chocolate Shake", priceDelta: 450 },
      { id: "spicy-meal-vanilla", name: "Fries + Vanilla Shake", priceDelta: 450 },
      { id: "spicy-meal-mango", name: "Fries + Mango Shake", priceDelta: 450 },
      { id: "spicy-meal-oreo", name: "Fries + Oreo Shake", priceDelta: 450 },
      { id: "spicy-meal-strawberry", name: "Fries + Strawberry Shake", priceDelta: 450 },
      { id: "spicy-meal-kiwi", name: "Fries + Kiwi Passion", priceDelta: 550 },
      { id: "spicy-meal-cherry", name: "Fries + Strawberry Cherry", priceDelta: 550 },
      { id: "spicy-meal-watermelon", name: "Fries + Watermelon Guava", priceDelta: 550 }
    ]
  } satisfies AddOnGroup,
  rocket: {
    id: "group-rocket-meal",
    name: "Choose your meal pairing",
    minSelect: 1,
    maxSelect: 1,
    isRequired: true,
    options: [
      { id: "rocket-meal-pepsi", name: "Fries + Pepsi", priceDelta: 250 },
      { id: "rocket-meal-7up", name: "Fries + 7UP", priceDelta: 250 },
      { id: "rocket-meal-fanta", name: "Fries + Fanta", priceDelta: 250 },
      { id: "rocket-meal-chocolate", name: "Fries + Chocolate Shake", priceDelta: 450 },
      { id: "rocket-meal-vanilla", name: "Fries + Vanilla Shake", priceDelta: 450 },
      { id: "rocket-meal-mango", name: "Fries + Mango Shake", priceDelta: 450 },
      { id: "rocket-meal-oreo", name: "Fries + Oreo Shake", priceDelta: 450 },
      { id: "rocket-meal-strawberry", name: "Fries + Strawberry Shake", priceDelta: 450 },
      { id: "rocket-meal-kiwi", name: "Fries + Kiwi Passion", priceDelta: 550 },
      { id: "rocket-meal-cherry", name: "Fries + Strawberry Cherry", priceDelta: 550 },
      { id: "rocket-meal-watermelon", name: "Fries + Watermelon Guava", priceDelta: 550 }
    ]
  } satisfies AddOnGroup
};

const sauceAddOnGroup: AddOnGroup = {
  id: "group-mai-rocket-sauce",
  name: "Choose Sauce",
  minSelect: 1,
  maxSelect: 1,
  isRequired: true,
  options: [
    { id: "addon-classic-sauce", name: "Classic shawarma sauce", priceDelta: 0 },
    { id: "addon-spicy-sauce", name: "Spicy jalapeno sauce", priceDelta: 0 }
  ]
};

export const products: Product[] = [
  {
    id: "product-classic-pocket",
    slug: "classic-pocket",
    name: "Classic Pocket",
    description: "Juicy chicken with classic shawarma sauce, iceberg, carrot, cucumber, cheese.",
    price: 450,
    calories: 560,
    category: shawarmaCategory,
    imageUrl: "/images/shawarma-pocket.svg",
    gallery: ["/images/shawarma-pocket.svg", "/images/hero-pocket.svg"],
    featured: true,
    bestSeller: true,
    ingredients: ["Chicken", "Classic shawarma sauce", "Iceberg", "Carrot", "Cucumber", "Cheese"],
    nutrition: { calories: 560, protein: 29, carbs: 41, fats: 24 },
    addOnGroups: [],
    reviews: []
  },
  {
    id: "product-spicy-pocket",
    slug: "spicy-pocket",
    name: "Spicy Pocket",
    description: "Juicy chicken with spicy jalapeno sauce, iceberg, carrot, cucumber, cheese.",
    price: 550,
    calories: 590,
    category: shawarmaCategory,
    imageUrl: "/images/shawarma-beef.svg",
    gallery: ["/images/shawarma-beef.svg", "/images/hero-pocket.svg"],
    featured: true,
    bestSeller: true,
    ingredients: ["Chicken", "Spicy jalapeno sauce", "Iceberg", "Carrot", "Cucumber", "Cheese"],
    nutrition: { calories: 590, protein: 30, carbs: 42, fats: 27 },
    addOnGroups: [],
    reviews: []
  },
  {
    id: "product-pocket-mai-rocket",
    slug: "pocket-mai-rocket",
    name: "Pocket Mai Rocket",
    description: "Premium pocket with black olives, jalapeno, corn, mushrooms, cheese, and your choice of sauce.",
    price: 750,
    calories: 760,
    category: shawarmaCategory,
    imageUrl: "/images/pocket-special.svg",
    gallery: ["/images/pocket-special.svg", "/images/hero-pocket.svg"],
    featured: true,
    bestSeller: true,
    ingredients: ["Chicken", "Black olives", "Jalapeno", "Corn", "Mushrooms", "Cheese"],
    nutrition: { calories: 760, protein: 36, carbs: 45, fats: 34 },
    addOnGroups: [sauceAddOnGroup],
    reviews: []
  },
  {
    id: "product-thela-fries",
    slug: "thela-fries",
    name: "Thela Fries",
    description: "Crispy french fries with spicy masala.",
    price: 180,
    calories: 360,
    category: friesCategory,
    imageUrl: "/images/loaded-fries.svg",
    gallery: ["/images/loaded-fries.svg"],
    featured: false,
    bestSeller: true,
    ingredients: ["French fries", "Spicy masala"],
    nutrition: { calories: 360, protein: 4, carbs: 44, fats: 18 },
    addOnGroups: [garlicMayoAddOnGroup],
    reviews: []
  },
  {
    id: "product-loaded-fries",
    slug: "loaded-fries",
    name: "Loaded Fries",
    description: "Loaded with cheese sauce, jalapeno, olives, corn, and juicy chicken.",
    price: 399,
    calories: 640,
    category: friesCategory,
    imageUrl: "/images/pocket-drink.svg",
    gallery: ["/images/pocket-drink.svg"],
    featured: true,
    bestSeller: true,
    ingredients: ["French fries", "Cheese sauce", "Jalapeno", "Olives", "Corn", "Chicken"],
    nutrition: { calories: 640, protein: 17, carbs: 50, fats: 30 },
    addOnGroups: [],
    reviews: []
  },
  {
    id: "product-classic-pocket-meal",
    slug: "classic-pocket-make-it-a-meal",
    name: "Classic Pocket - Make It A Meal",
    description: "Classic Pocket bundled with fries and your drink pick.",
    price: 450,
    calories: 560,
    category: mealCategory,
    imageUrl: "/images/combo-meal.svg",
    gallery: ["/images/combo-meal.svg", "/images/hero-pocket.svg"],
    featured: true,
    bestSeller: false,
    ingredients: ["Chicken", "Classic shawarma sauce", "Iceberg", "Carrot", "Cucumber", "Cheese", "Fries", "Drink"],
    nutrition: { calories: 560, protein: 29, carbs: 41, fats: 24 },
    addOnGroups: [mealOptionGroups.classic],
    reviews: []
  },
  {
    id: "product-spicy-pocket-meal",
    slug: "spicy-pocket-make-it-a-meal",
    name: "Spicy Pocket - Make It A Meal",
    description: "Spicy Pocket bundled with fries and your drink pick.",
    price: 550,
    calories: 590,
    category: mealCategory,
    imageUrl: "/images/combo-meal.svg",
    gallery: ["/images/combo-meal.svg", "/images/hero-pocket.svg"],
    featured: true,
    bestSeller: false,
    ingredients: ["Chicken", "Spicy jalapeno sauce", "Iceberg", "Carrot", "Cucumber", "Cheese", "Fries", "Drink"],
    nutrition: { calories: 590, protein: 30, carbs: 42, fats: 27 },
    addOnGroups: [mealOptionGroups.spicy],
    reviews: []
  },
  {
    id: "product-pocket-mai-rocket-meal",
    slug: "pocket-mai-rocket-make-it-a-meal",
    name: "Pocket Mai Rocket - Make It A Meal",
    description: "Pocket Mai Rocket bundled with fries and your drink pick.",
    price: 750,
    calories: 760,
    category: mealCategory,
    imageUrl: "/images/combo-meal.svg",
    gallery: ["/images/combo-meal.svg", "/images/hero-pocket.svg"],
    featured: true,
    bestSeller: false,
    ingredients: ["Chicken", "Black olives", "Jalapeno", "Corn", "Mushrooms", "Cheese", "Fries", "Drink"],
    nutrition: { calories: 760, protein: 36, carbs: 45, fats: 34 },
    addOnGroups: [sauceAddOnGroup, mealOptionGroups.rocket],
    reviews: []
  },
  {
    id: "product-kiwi-passion",
    slug: "kiwi-passion",
    name: "Kiwi Passion",
    description: "Fruit chiller.",
    price: 400,
    calories: 220,
    category: chillersCategory,
    imageUrl: "/images/pocket-drink.svg",
    gallery: ["/images/pocket-drink.svg"],
    featured: false,
    bestSeller: true,
    ingredients: ["Kiwi", "Passion fruit"],
    nutrition: { calories: 220, protein: 1, carbs: 54, fats: 0 },
    addOnGroups: [],
    reviews: []
  },
  {
    id: "product-strawberry-cherry",
    slug: "strawberry-cherry",
    name: "Strawberry Cherry",
    description: "Fruit chiller.",
    price: 400,
    calories: 230,
    category: chillersCategory,
    imageUrl: "/images/pocket-drink.svg",
    gallery: ["/images/pocket-drink.svg"],
    featured: false,
    bestSeller: false,
    ingredients: ["Strawberry", "Cherry"],
    nutrition: { calories: 230, protein: 1, carbs: 56, fats: 0 },
    addOnGroups: [],
    reviews: []
  },
  {
    id: "product-watermelon-guava",
    slug: "watermelon-guava",
    name: "Watermelon Guava",
    description: "Fruit chiller.",
    price: 400,
    calories: 240,
    category: chillersCategory,
    imageUrl: "/images/pocket-drink.svg",
    gallery: ["/images/pocket-drink.svg"],
    featured: false,
    bestSeller: false,
    ingredients: ["Watermelon", "Guava"],
    nutrition: { calories: 240, protein: 1, carbs: 58, fats: 0 },
    addOnGroups: [],
    reviews: []
  },
  {
    id: "product-chocolate",
    slug: "chocolate",
    name: "Chocolate",
    description: "Ice cream shake.",
    price: 300,
    calories: 410,
    category: shakesCategory,
    imageUrl: "/images/pocket-combo.svg",
    gallery: ["/images/pocket-combo.svg"],
    featured: true,
    bestSeller: true,
    ingredients: ["Chocolate ice cream", "Milk"],
    nutrition: { calories: 410, protein: 8, carbs: 48, fats: 18 },
    addOnGroups: [],
    reviews: []
  },
  {
    id: "product-vanilla",
    slug: "vanilla",
    name: "Vanilla",
    description: "Ice cream shake.",
    price: 300,
    calories: 390,
    category: shakesCategory,
    imageUrl: "/images/pocket-combo.svg",
    gallery: ["/images/pocket-combo.svg"],
    featured: false,
    bestSeller: false,
    ingredients: ["Vanilla ice cream", "Milk"],
    nutrition: { calories: 390, protein: 7, carbs: 46, fats: 16 },
    addOnGroups: [],
    reviews: []
  },
  {
    id: "product-mango",
    slug: "mango",
    name: "Mango",
    description: "Ice cream shake.",
    price: 300,
    calories: 400,
    category: shakesCategory,
    imageUrl: "/images/pocket-combo.svg",
    gallery: ["/images/pocket-combo.svg"],
    featured: false,
    bestSeller: true,
    ingredients: ["Mango", "Ice cream", "Milk"],
    nutrition: { calories: 400, protein: 7, carbs: 49, fats: 15 },
    addOnGroups: [],
    reviews: []
  },
  {
    id: "product-oreo",
    slug: "oreo",
    name: "Oreo",
    description: "Ice cream shake.",
    price: 300,
    calories: 430,
    category: shakesCategory,
    imageUrl: "/images/pocket-combo.svg",
    gallery: ["/images/pocket-combo.svg"],
    featured: false,
    bestSeller: false,
    ingredients: ["Oreo", "Ice cream", "Milk"],
    nutrition: { calories: 430, protein: 8, carbs: 52, fats: 18 },
    addOnGroups: [],
    reviews: []
  },
  {
    id: "product-strawberry",
    slug: "strawberry",
    name: "Strawberry",
    description: "Ice cream shake.",
    price: 300,
    calories: 395,
    category: shakesCategory,
    imageUrl: "/images/pocket-combo.svg",
    gallery: ["/images/pocket-combo.svg"],
    featured: false,
    bestSeller: false,
    ingredients: ["Strawberry", "Ice cream", "Milk"],
    nutrition: { calories: 395, protein: 7, carbs: 47, fats: 16 },
    addOnGroups: [],
    reviews: []
  },
  {
    id: "product-pepsi",
    slug: "pepsi",
    name: "Pepsi",
    description: "Soft drink.",
    price: 100,
    calories: 140,
    category: softDrinksCategory,
    imageUrl: "/images/pocket-drink.svg",
    gallery: ["/images/pocket-drink.svg"],
    featured: false,
    bestSeller: true,
    ingredients: ["Carbonated beverage"],
    nutrition: { calories: 140, protein: 0, carbs: 39, fats: 0 },
    addOnGroups: [],
    reviews: []
  },
  {
    id: "product-seven-up",
    slug: "seven-up",
    name: "7UP",
    description: "Soft drink.",
    price: 100,
    calories: 135,
    category: softDrinksCategory,
    imageUrl: "/images/pocket-drink.svg",
    gallery: ["/images/pocket-drink.svg"],
    featured: false,
    bestSeller: false,
    ingredients: ["Carbonated beverage"],
    nutrition: { calories: 135, protein: 0, carbs: 38, fats: 0 },
    addOnGroups: [],
    reviews: []
  },
  {
    id: "product-fanta",
    slug: "fanta",
    name: "Fanta",
    description: "Soft drink.",
    price: 100,
    calories: 145,
    category: softDrinksCategory,
    imageUrl: "/images/pocket-drink.svg",
    gallery: ["/images/pocket-drink.svg"],
    featured: false,
    bestSeller: false,
    ingredients: ["Carbonated beverage"],
    nutrition: { calories: 145, protein: 0, carbs: 40, fats: 0 },
    addOnGroups: [],
    reviews: []
  }
];

export const homeContent: HomeContent = {
  hero: {
    eyebrow: "Islamabad's newest shawarma ritual",
    headline: "POCKET",
    subheadline: "Real Shawarma, Served The Pocket Way",
    description: "Fresh shawarmas, crispy fries, chillers, shakes, and fast delivery from G-11 Markaz."
  },
  whyPocket: [
    {
      title: "Fresh ingredients",
      description: "Daily prepped veg, hand-seasoned proteins, and signature sauces."
    },
    {
      title: "Fast service",
      description: "Built for walk-ins, pickups, and rush-hour delivery."
    },
    {
      title: "Premium taste",
      description: "A bold menu with house-crafted toppings and drinks."
    }
  ],
  testimonials: [
    {
      author: "Hassan R.",
      body: "Classic Pocket is clean, filling, and easy to recommend.",
      rating: 5
    },
    {
      author: "Maria N.",
      body: "Loaded Fries and the chillers both hold up really well.",
      rating: 5
    },
    {
      author: "Ali Z.",
      body: "The shakes are consistent and the portions are solid.",
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
    totalAmount: 684,
    placedAt: "2026-06-04T16:58:00.000Z",
    items: [
      {
        id: "order-item-1",
        productName: "Classic Pocket",
        quantity: 1,
        unitPrice: 450
      }
    ]
  }
];

export const dashboardData: DashboardData = {
  range: {
    preset: "7d",
    start: "2026-06-01T00:00:00.000Z",
    end: "2026-06-07T23:59:59.000Z",
    label: "Last 7 days"
  },
  summary: {
    revenue: 148700,
    previousRevenue: 131400,
    orders: 124,
    previousOrders: 111,
    averageOrderValue: 1199,
    previousAverageOrderValue: 1184,
    activeCustomers: 89,
    repeatCustomers: 24,
    totalCustomers: 684,
    fulfilledRate: 74.2,
    cancellationRate: 4.8,
    revenueDelta: 13.2,
    ordersDelta: 11.7,
    averageOrderValueDelta: 1.3
  },
  series: [
    { label: "Mon", revenue: 92000, orders: 75 },
    { label: "Tue", revenue: 106500, orders: 84 },
    { label: "Wed", revenue: 124400, orders: 97 },
    { label: "Thu", revenue: 148700, orders: 124 },
    { label: "Fri", revenue: 163000, orders: 131 },
    { label: "Sat", revenue: 176500, orders: 142 },
    { label: "Sun", revenue: 139800, orders: 108 }
  ],
  topProducts: [
    { productName: "Classic Pocket", quantity: 172, revenue: 77400 },
    { productName: "Pocket Mai Rocket", quantity: 124, revenue: 93000 },
    { productName: "Loaded Fries", quantity: 98, revenue: 39102 },
    { productName: "Kiwi Passion", quantity: 91, revenue: 36400 }
  ],
  recentOrders: [
    { id: "o1", orderNumber: "PKT-2026-000131", customerName: "Ali Raza", status: "PREPARING", totalAmount: 1490, placedAt: "2026-06-07T16:58:00.000Z", branch: branch.name, channel: "ONLINE", orderSource: "ONLINE" },
    { id: "o2", orderNumber: "PKT-2026-000130", customerName: "Noor Hassan", status: "CONFIRMED", totalAmount: 930, placedAt: "2026-06-07T15:35:00.000Z", branch: branch.name, channel: "POS", orderSource: "POS" },
    { id: "o3", orderNumber: "PKT-2026-000129", customerName: "Ayesha Khan", status: "OUT_FOR_DELIVERY", totalAmount: 883, placedAt: "2026-06-07T14:12:00.000Z", branch: branch.name, channel: "ONLINE", orderSource: "FOODPANDA" },
    { id: "o4", orderNumber: "PKT-2026-000128", customerName: "M. Salman", status: "DELIVERED", totalAmount: 690, placedAt: "2026-06-07T13:02:00.000Z", branch: branch.name, channel: "POS", orderSource: "POS" }
  ],
  lowStock: [
    { ingredient: "Beef slices", branch: "Pocket G-11 Markaz", quantityOnHand: 6 },
    { ingredient: "Garlic sauce", branch: "Pocket G-11 Markaz", quantityOnHand: 5 }
  ],
  breakdowns: {
    statuses: [
      { label: "Delivered", count: 62, revenue: 77200 },
      { label: "Preparing", count: 26, revenue: 28100 },
      { label: "Confirmed", count: 19, revenue: 21200 },
      { label: "Out For Delivery", count: 11, revenue: 16100 },
      { label: "Cancelled", count: 6, revenue: 6100 }
    ],
    channels: [
      { label: "POS", count: 72, revenue: 86400 },
      { label: "ONLINE", count: 52, revenue: 62300 }
    ],
    sources: [
      { label: "POS", count: 72, revenue: 86400 },
      { label: "ONLINE", count: 41, revenue: 49200 },
      { label: "FOODPANDA", count: 11, revenue: 13100 }
    ],
    serviceTypes: [
      { label: "TAKEAWAY", count: 68, revenue: 80100 },
      { label: "DELIVERY", count: 42, revenue: 54800 },
      { label: "DINE IN", count: 14, revenue: 13800 }
    ],
    payments: [
      { label: "CASH", count: 61, revenue: 74300 },
      { label: "CASH ON DELIVERY", count: 38, revenue: 46900 },
      { label: "CARD", count: 15, revenue: 18200 },
      { label: "EASYPAISA", count: 10, revenue: 9300 }
    ],
    branches: [
      { label: branch.name, count: 124, revenue: 148700 }
    ],
    weekdays: [
      { label: "Mon", count: 75, revenue: 92000 },
      { label: "Tue", count: 84, revenue: 106500 },
      { label: "Wed", count: 97, revenue: 124400 },
      { label: "Thu", count: 124, revenue: 148700 },
      { label: "Fri", count: 131, revenue: 163000 },
      { label: "Sat", count: 142, revenue: 176500 },
      { label: "Sun", count: 108, revenue: 139800 }
    ],
    hours: [
      { label: "12:00", count: 8, revenue: 9200 },
      { label: "13:00", count: 10, revenue: 11800 },
      { label: "14:00", count: 14, revenue: 17200 },
      { label: "15:00", count: 16, revenue: 18400 },
      { label: "16:00", count: 18, revenue: 21600 },
      { label: "17:00", count: 21, revenue: 24800 },
      { label: "18:00", count: 24, revenue: 28900 },
      { label: "19:00", count: 22, revenue: 26100 },
      { label: "20:00", count: 19, revenue: 22100 }
    ]
  }
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

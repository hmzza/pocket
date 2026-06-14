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
    id: "cat-addons",
    slug: "add-ons",
    name: "Add-ons",
    description: "Custom extras",
    imageUrl: "/images/brand-grid.svg"
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

const [shawarmaCategory, friesCategory, addOnsCategory, chillersCategory, shakesCategory, softDrinksCategory] = categories as [
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
  phone: "+92-300-POCKET1",
  deliveryFee: 180
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
    addOnGroups: [],
    reviews: []
  },
  {
    id: "product-garlic-mayo-fries",
    slug: "garlic-mayo-fries",
    name: "Garlic Mayo Fries",
    description: "Crispy french fries with spicy masala and garlic mayo dip.",
    price: 220,
    calories: 420,
    category: friesCategory,
    imageUrl: "/images/masala-fries.svg",
    gallery: ["/images/masala-fries.svg"],
    featured: false,
    bestSeller: false,
    ingredients: ["French fries", "Spicy masala", "Garlic mayo dip"],
    nutrition: { calories: 420, protein: 5, carbs: 48, fats: 20 },
    addOnGroups: [],
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
    id: "product-olives",
    slug: "olives",
    name: "Olives",
    description: "Add-on item.",
    price: 40,
    calories: 40,
    category: addOnsCategory,
    imageUrl: "/images/brand-grid.svg",
    gallery: ["/images/brand-grid.svg"],
    featured: false,
    bestSeller: false,
    ingredients: ["Olives"],
    nutrition: { calories: 40, protein: 0, carbs: 2, fats: 4 },
    addOnGroups: [],
    reviews: []
  },
  {
    id: "product-mushrooms",
    slug: "mushrooms",
    name: "Mushrooms",
    description: "Add-on item.",
    price: 40,
    calories: 35,
    category: addOnsCategory,
    imageUrl: "/images/brand-grid.svg",
    gallery: ["/images/brand-grid.svg"],
    featured: false,
    bestSeller: false,
    ingredients: ["Mushrooms"],
    nutrition: { calories: 35, protein: 1, carbs: 4, fats: 0 },
    addOnGroups: [],
    reviews: []
  },
  {
    id: "product-chicken-addon",
    slug: "chicken-add-on",
    name: "Chicken",
    description: "Add-on item.",
    price: 90,
    calories: 120,
    category: addOnsCategory,
    imageUrl: "/images/brand-grid.svg",
    gallery: ["/images/brand-grid.svg"],
    featured: false,
    bestSeller: true,
    ingredients: ["Chicken"],
    nutrition: { calories: 120, protein: 14, carbs: 0, fats: 5 },
    addOnGroups: [],
    reviews: []
  },
  {
    id: "product-cheese",
    slug: "cheese",
    name: "Cheese",
    description: "Add-on item.",
    price: 40,
    calories: 80,
    category: addOnsCategory,
    imageUrl: "/images/brand-grid.svg",
    gallery: ["/images/brand-grid.svg"],
    featured: false,
    bestSeller: false,
    ingredients: ["Cheese"],
    nutrition: { calories: 80, protein: 4, carbs: 1, fats: 6 },
    addOnGroups: [],
    reviews: []
  },
  {
    id: "product-kiwi-passion",
    slug: "kiwi-passion",
    name: "Kiwi Passion",
    description: "Fruit chiller.",
    price: 410,
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
    price: 410,
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
    price: 410,
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
    price: 80,
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
    price: 80,
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
    price: 80,
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
  kpis: {
    todayOrders: 124,
    revenue: 148700,
    totalCustomers: 684,
    averageOrderValue: 1199
  },
  topProducts: [
    { productName: "Classic Pocket", quantity: 172 },
    { productName: "Pocket Mai Rocket", quantity: 124 },
    { productName: "Loaded Fries", quantity: 98 },
    { productName: "Kiwi Passion", quantity: 91 }
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

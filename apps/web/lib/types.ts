export type Category = {
  id: string;
  slug: string;
  name: string;
  description?: string;
  imageUrl?: string;
};

export type AddOnOption = {
  id: string;
  name: string;
  priceDelta: number;
};

export type AddOnGroup = {
  id: string;
  name: string;
  minSelect: number;
  maxSelect: number;
  isRequired?: boolean;
  options: AddOnOption[];
};

export type BundleComponent = {
  productId: string;
  productName: string;
  quantity: number;
  sortOrder?: number;
};

export type ProductReview = {
  id: string;
  author: string;
  rating: number;
  title?: string;
  body?: string;
};

export type Product = {
  id: string;
  slug: string;
  name: string;
  description: string;
  price: number;
  calories?: number;
  category: Category;
  imageUrl: string;
  gallery: string[];
  featured?: boolean;
  bestSeller?: boolean;
  ingredients: string[];
  nutrition: {
    calories: number;
    protein: number;
    carbs: number;
    fats: number;
  };
  addOnGroups: AddOnGroup[];
  reviews: ProductReview[];
};

export type CartProduct = Product & {
  cartItemId: string;
  quantity: number;
  selectedAddOnIds: string[];
  selectedAddOns: AddOnOption[];
  price: number;
};

export type HomeContent = {
  hero: {
    eyebrow: string;
    headline: string;
    subheadline: string;
    description: string;
  };
  heroImages: Array<{
    url: string;
    alt: string;
  }>;
  heroSliderIntervalMs: number;
  whyPocket: Array<{
    title: string;
    description: string;
  }>;
  testimonials: Array<{
    author: string;
    body: string;
    rating: number;
  }>;
};

export type Branch = {
  id: string;
  slug: string;
  name: string;
  city: string;
  addressLine1: string;
  phone: string;
  deliveryFee: number;
};

export type TrackedOrder = {
  id: string;
  orderNumber: string;
  status: string;
  branch: string;
  expectedDeliveryAt: string;
  totalAmount: number;
  placedAt: string;
  items: Array<{
    id: string;
    productName: string;
    quantity: number;
    unitPrice: number;
  }>;
};

export type AdminRangePreset = "today" | "7d" | "30d" | "month" | "year" | "custom";
export type AdminOrderSegment = "all" | "inshop" | "foodpanda";

export type DashboardData = {
  range: {
    preset: AdminRangePreset;
    start: string;
    end: string;
    label: string;
    segment: AdminOrderSegment;
  };
  summary: {
    revenue: number;
    previousRevenue: number;
    orders: number;
    previousOrders: number;
    averageOrderValue: number;
    previousAverageOrderValue: number;
    activeCustomers: number;
    repeatCustomers: number;
    totalCustomers: number;
    revenueDelta: number;
    ordersDelta: number;
    averageOrderValueDelta: number;
  };
  series: Array<{ label: string; revenue: number; orders: number }>;
  topProducts: Array<{ productName: string; quantity: number; revenue: number }>;
  recentOrders: Array<{
    id: string;
    orderNumber: string;
    customerName: string;
    totalAmount: number;
    placedAt: string;
    branch: string;
    channel: string;
    serviceType: string;
  }>;
  lowStock: Array<{
    ingredient: string;
    branch: string;
    quantityOnHand: number;
  }>;
  breakdowns: {
    channels: Array<{ label: string; count: number; revenue: number }>;
    serviceTypes: Array<{ label: string; count: number; revenue: number }>;
    payments: Array<{ label: string; count: number; revenue: number }>;
    branches: Array<{ label: string; count: number; revenue: number }>;
    weekdays: Array<{ label: string; count: number; revenue: number }>;
    hours: Array<{ label: string; count: number; revenue: number }>;
  };
};

export type AdminInventorySummary = {
  totalItems: number;
  lowStockItems: number;
  totalStockValue: number;
  totalUnits: number;
  wastageCostToday?: number;
  suggestedPurchaseCost?: number;
};

export type AdminInventoryItem = {
  id: string;
  branchId: string;
  branchName: string;
  ingredientId: string;
  name: string;
  sku: string;
  unit: string;
  type: string;
  reorderLevel: number;
  costPerUnit: number;
  caloriesPerUnit: number;
  quantityOnHand: number;
  stockValue: number;
  lowStockAlert: boolean;
  linkedProducts: Array<{
    productId: string;
    productName: string;
    quantityNeeded: number;
  }>;
  updatedAt: string;
};

export type AdminInventoryTransaction = {
  id: string;
  branchId: string;
  branchName: string;
  ingredientId: string;
  ingredientName: string;
  type: string;
  quantity: number;
  balanceAfter: number;
  note?: string | null;
  referenceType?: string | null;
  referenceId?: string | null;
  vendorName?: string | null;
  purchaseDate?: string | null;
  purchaseCost?: number | null;
  wastageReason?: string | null;
  editedAt?: string | null;
  actorName?: string | null;
  createdAt: string;
};

export type AdminInventoryData = {
  branches: Branch[];
  summary: AdminInventorySummary;
  items: AdminInventoryItem[];
  recentTransactions: AdminInventoryTransaction[];
};

export type AdminInventoryForecast = {
  branchId: string;
  generatedAt: string;
  horizons: Array<{
    label: string;
    days: number;
    suggestedPurchaseCost: number;
    items: Array<{
      ingredientId: string;
      name: string;
      unit: string;
      currentStock: number;
      expectedUsage: number;
      suggestedBuy: number;
      estimatedCost: number;
      confidence: string;
    }>;
  }>;
};

export type AdminRecipeData = {
  ingredients: Array<{
    id: string;
    name: string;
    sku: string;
    unit: string;
    type: string;
    costPerUnit: number;
    caloriesPerUnit: number;
  }>;
  preparedItems: Array<{
    id: string;
    name: string;
    unit: string;
    costPerUnit: number;
    caloriesPerUnit: number;
    totalCost: number;
    totalCalories: number;
    components: Array<{
      ingredientId: string;
      ingredientName: string;
      unit: string;
      quantityNeeded: number;
      cost: number;
      calories: number;
    }>;
  }>;
  products: Array<{
    id: string;
    name: string;
    sku: string;
    categoryName: string;
    basePrice: number;
    calories?: number;
    costSummary: AdminProductCostSummary;
  }>;
};

export type AdminProductCostSummary = {
  recipeCost: number;
  packagingCost: number;
  totalCost: number;
  salePrice: number;
  grossProfit: number;
  marginPercent: number;
  calories: number;
  linkedIngredients: number;
  items: Array<{
    ingredientId: string;
    ingredientName: string;
    ingredientType: string;
    unit: string;
    quantity: number;
    unitCost: number;
    cost: number;
    calories: number;
  }>;
};

export type AdminExpense = {
  id: string;
  branchId: string;
  branchName: string;
  title: string;
  category: string;
  amount: number;
  expenseDate: string;
  vendor?: string | null;
  billReference?: string | null;
  notes?: string | null;
  createdByName?: string | null;
  createdAt: string;
};

export type AdminExpenseSummary = {
  totalAmount: number;
  totalCount: number;
  averageAmount: number;
};

export type AdminExpenseData = {
  range: {
    preset: AdminRangePreset;
    start: string;
    end: string;
    label: string;
  };
  branches: Branch[];
  summary: AdminExpenseSummary;
  series: Array<{ label: string; revenue: number; orders: number }>;
  categories: Array<{ label: string; amount: number; count: number }>;
  expenses: AdminExpense[];
};

export type AdminVendor = {
  id: string;
  ingredientCategory: string;
  vendorName: string;
  contactNumber?: string;
  type?: string;
  quotedPrice?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type AdminVendorData = {
  vendors: AdminVendor[];
  categories: string[];
};

export type AdminUser = {
  id: string;
  name: string;
  username: string;
  email: string;
  phone?: string;
  roleCode: "ADMIN" | "SUPER_ADMIN" | "POS_STAFF" | "CUSTOMER";
  roleLabel: string;
  isActive: boolean;
  canAccessAdmin: boolean;
  canAccessPos: boolean;
  lastLoginAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminUserData = {
  users: AdminUser[];
};

export type AdminCustomer = {
  id: string;
  name: string;
  email: string;
  phone?: string;
  totalOrders: number;
  totalSpend: number;
  lastOrderDate?: string | null;
};

export type AdminProduct = {
  id: string;
  categoryId: string;
  slug: string;
  sku: string;
  name: string;
  description: string;
  ingredients: string[];
  basePrice: number;
  calories?: number;
  featured: boolean;
  bestSeller: boolean;
  isActive: boolean;
  stockStatus: string;
  imageUrl: string;
  images: Array<{
    url: string;
    alt: string;
    sortOrder?: number;
  }>;
  category: Category;
  bundleComponents: BundleComponent[];
  costSummary?: AdminProductCostSummary;
};

export type AdminOrder = {
  id: string;
  orderNumber: string;
  channel: string;
  serviceType: string;
  foodpandaOrderNumber?: string | null;
  customerName: string;
  customerPhone?: string;
  status: string;
  branch: string;
  totalAmount: number;
  subtotal: number;
  discountAmount: number;
  taxRate: number;
  taxAmount: number;
  paidAmount: number;
  changeDueAmount: number;
  manualDiscountType?: string;
  manualDiscountValue?: number;
  paymentMethod: string;
  paymentStatus: string;
  placedAt: string;
  deliveryInstructions?: string;
  address?: {
    addressLine1: string;
    city: string;
    instructions?: string;
  };
  items: Array<{
    id: string;
    productName: string;
    customDescription?: string | null;
    quantity: number;
    unitPrice: number;
    note?: string;
    bundleComponents: BundleComponent[];
    addOns: Array<{
      id: string;
      optionName: string;
      priceDelta: number;
    }>;
  }>;
};

export type PosCatalogProduct = {
  id: string;
  name: string;
  categoryId: string;
  categoryName: string;
  price: number;
  addOnGroups: AddOnGroup[];
  bundleComponents: BundleComponent[];
};

export type PosBranch = {
  id: string;
  slug: string;
  name: string;
};

export type PosReceiptOrder = {
  id: string;
  receiptNumber: string;
  orderNumber: string;
  foodpandaOrderNumber?: string | null;
  fbrReferenceNumber: string;
  posNo: string;
  userId: string;
  channel: string;
  serviceType: string;
  orderType: string;
  status: string;
  customerName: string;
  customerPhone?: string | null;
  paymentMethod: string;
  paymentStatus: string;
  createdAt: string;
  subtotal: number;
  grossTotal: number;
  discountAmount: number;
  serviceFee: number;
  taxRate: number;
  totalTax: number;
  netTotal: number;
  taxAmount: number;
  totalAmount: number;
  paidAmount: number;
  changeDueAmount: number;
  placedAt: string;
  digitalReceiptUrl?: string;
  branch: {
    id: string;
    name: string;
    addressLine1: string;
    phone: string;
  };
  items: Array<{
    id: string;
    productName: string;
    customDescription?: string | null;
    quantity: number;
    unitPrice: number;
    taxRate: number;
    taxAmount: number;
    lineTotal: number;
    note?: string | null;
    bundleComponents: BundleComponent[];
    addOns: Array<{
      id: string;
      optionName: string;
      priceDelta: number;
    }>;
  }>;
};

export type PosEditableOrder = {
  id: string;
  orderNumber: string;
  branchId: string;
  customerName: string;
  customerPhone: string;
  serviceType: string;
  paymentMethod: string;
  discountType: "NONE" | "PERCENTAGE" | "FIXED";
  discountValue: number;
  foodpandaOrderNumber: string;
  items: Array<{
    id: string;
    productId: string | null;
    productName: string;
    categoryName: string;
    quantity: number;
    unitPrice: number;
    customDescription?: string | null;
    note?: string | null;
    bundleComponents: BundleComponent[];
    addOns: Array<{
      id: string;
      optionName: string;
      priceDelta: number;
    }>;
  }>;
};

export type PosCustomerLookup = {
  name?: string | null;
  phone?: string | null;
  totalOrders: number;
  totalSpend: number;
  lastOrderDate: string;
  lastOrderSummary: string;
};

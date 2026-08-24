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
  email?: string;
  deliveryFee: number;
  isActive?: boolean;
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
export type AdminOrderSegment = "all" | "inshop" | "foodpanda" | "delivery" | "takeaway";

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
    branches: Array<{ label: string; count: number; revenue: number; foodpandaRevenue?: number }>;
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
  isActive: boolean;
  quantityOnHand: number;
  stockValue: number;
  lowStockAlert: boolean;
  purchaseUnits: Array<{
    id: string;
    name: string;
    quantityInBaseUnits: number;
    isActive: boolean;
  }>;
  linkedProducts: Array<{
    productId: string;
    productName: string;
    quantityNeeded: number;
  }>;
  updatedAt: string;
};

export type InventoryItemType = "RAW" | "PREPARED" | "PACKAGING" | "RETAIL";

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
  purchaseQuantity?: number | null;
  purchaseUnitId?: string | null;
  purchaseUnitLabel?: string | null;
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
    source?: "product" | "prep" | "packaging-rule";
  }>;
  packagingRules?: Array<{
    ingredientId: string;
    ingredientName: string;
    ingredientType: string;
    unit: string;
    quantity: number;
    unitCost: number;
    cost: number;
    calories: number;
    source: "packaging-rule";
    serviceType: string;
  }>;
};

export type AdminExpense = {
  id: string;
  branchId: string;
  branchName: string;
  title: string;
  category: string;
  amount: number;
  paymentSource: "CASH" | "EASYPAISA" | "JAZZCASH";
  expenseDate: string;
  vendor?: string | null;
  billReference?: string | null;
  notes?: string | null;
  stockTransactionId?: string | null;
  stockPurchase?: {
    ingredientId: string;
    ingredientName: string;
    purchaseUnitId?: string | null;
    purchaseQuantity: number;
    purchaseUnitLabel: string;
    baseQuantity: number;
    purchaseDate?: string;
  } | null;
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

export type AdminFixedExpense = {
  id: string;
  branchId: string;
  branchName: string;
  name: string;
  category: string;
  monthlyAmount: number;
  paymentSource: MoneySource;
  dueDay: number;
  autoRepeat: boolean;
  isActive: boolean;
  currentMonth: {
    id: string;
    expenseId: string;
    status: "PAID" | "UNPAID";
    paidAt?: string | null;
    expenseDate: string;
  } | null;
};

export type AdminFixedExpenseData = {
  monthKey: string;
  monthLabel: string;
  branches: Branch[];
  summary: {
    totalFixedExpenses: number;
    paid: number;
    remaining: number;
    upcomingDue: number;
  };
  fixedExpenses: AdminFixedExpense[];
};

export type MoneySource = "CASH" | "EASYPAISA" | "JAZZCASH";

export type AdminLoanRepayment = {
  id: string;
  loanId: string;
  branchId: string;
  amount: number;
  paidFrom: MoneySource;
  paymentDate: string;
  note?: string | null;
  createdByName?: string | null;
  createdAt: string;
};

export type AdminLoan = {
  id: string;
  branchId: string;
  branchName: string;
  lenderName: string;
  amount: number;
  receivedSource: MoneySource;
  loanDate: string;
  note?: string | null;
  createdByName?: string | null;
  createdAt: string;
  repaidAmount: number;
  outstandingAmount: number;
  status: "OPEN" | "PARTIALLY_PAID" | "PAID";
  repayments: AdminLoanRepayment[];
};

export type AdminLoanData = {
  range: {
    preset: AdminRangePreset;
    start: string;
    end: string;
    label: string;
  };
  branches: Branch[];
  sources: MoneySource[];
  summary: {
    totalLoanTaken: number;
    totalLoanRepaid: number;
    outstandingLoanBalance: number;
    openLoanCount: number;
    paidLoanCount: number;
  };
  periodSummary: {
    totalLoanTaken: number;
    totalLoanRepaid: number;
  };
  loans: AdminLoan[];
};

export type AdminInvestmentPayment = {
  id: string;
  commitmentId: string;
  branchId: string;
  branchName: string;
  amount: number;
  receivedSource: MoneySource;
  paymentDate: string;
  note?: string | null;
  createdByName?: string | null;
  createdAt: string;
};

export type AdminInvestmentCommitment = {
  id: string;
  partnerId: string;
  amount: number;
  paidAmount: number;
  unpaidAmount: number;
  commitmentDate: string;
  note?: string | null;
  createdByName?: string | null;
  createdAt: string;
  payments: AdminInvestmentPayment[];
};

export type AdminInvestmentPartner = {
  id: string;
  name: string;
  note?: string | null;
  createdByName?: string | null;
  createdAt: string;
  committedAmount: number;
  paidAmount: number;
  unpaidAmount: number;
  equityPercent: number;
  commitments: AdminInvestmentCommitment[];
};

export type AdminInvestmentData = {
  branches: Branch[];
  sources: MoneySource[];
  summary: {
    totalCommitted: number;
    totalPaid: number;
    totalUnpaid: number;
    partnerCount: number;
  };
  partners: AdminInvestmentPartner[];
};

export type AdminPackagingRuleData = {
  serviceTypes: string[];
  quantityModes: Array<"FIXED" | "PER_ITEM_STEP">;
  products: Array<{ id: string; name: string; categoryId: string }>;
  categories: Array<{ id: string; name: string }>;
  packagingItems: Array<{ id: string; name: string; unit: string; costPerUnit: number }>;
  rules: Array<{
    id: string;
    productId?: string | null;
    productName?: string | null;
    categoryId?: string | null;
    categoryName?: string | null;
    serviceType: string;
    packagingIngredientId: string;
    packagingIngredientName: string;
    quantityMode: "FIXED" | "PER_ITEM_STEP";
    quantity: number;
    itemStep?: number | null;
  }>;
};

export type AdminMoneyTransferData = {
  sources: MoneySource[];
  branches: Array<{ id: string; name: string }>;
  transfers: Array<{
    id: string;
    branchId: string;
    branchName: string;
    fromSource: MoneySource;
    toSource: MoneySource;
    amount: number;
    transferDate: string;
    note?: string | null;
    createdByName?: string | null;
    createdAt: string;
  }>;
};

export type AdminDailyClosingData = {
  branchId: string;
  closingDate: string;
  opening: Record<MoneySource, number>;
  openingSource: "NONE" | "OPENING_BALANCE" | "PREVIOUS_CLOSING";
  openingSourceDate: string | null;
  openingBalanceDate: string | null;
  openingBalance: {
    id: string;
    balanceDate: string;
    cashBalance: number;
    easypaisaBalance: number;
    jazzcashBalance: number;
    note?: string | null;
  } | null;
  sales: Record<MoneySource, number>;
  foodpandaSales: number;
  expenses: Record<MoneySource, number>;
  transferIn: Record<MoneySource, number>;
  transferOut: Record<MoneySource, number>;
  additionIn: Record<MoneySource, number>;
  loanIn: Record<MoneySource, number>;
  investmentIn: Record<MoneySource, number>;
  loanOut: Record<MoneySource, number>;
  additionsToday: Array<{
    id: string;
    branchId: string;
    amount: number;
    toSource: MoneySource;
    reason: string;
    additionDate: string;
    createdByName?: string | null;
    createdAt: string;
  }>;
  expected: Record<MoneySource, number>;
  currentClosing: {
    id: string;
    closingDate: string;
    cashExpected: number;
    cashCounted: number;
    cashDifference: number;
    easypaisaExpected: number;
    easypaisaCounted: number;
    easypaisaDifference: number;
    jazzcashExpected: number;
    jazzcashCounted: number;
    jazzcashDifference: number;
    note?: string | null;
    isLocked: boolean;
    closedByName?: string | null;
    createdAt: string;
  } | null;
  transfersToday: Array<{
    id: string;
    branchId: string;
    fromSource: MoneySource;
    toSource: MoneySource;
    amount: number;
    transferDate: string;
    note?: string | null;
    createdByName?: string | null;
    createdAt: string;
  }>;
  recentClosings: Array<{
    id: string;
    closingDate: string;
    cashExpected: number;
    cashCounted: number;
    cashDifference: number;
    easypaisaExpected: number;
    easypaisaCounted: number;
    easypaisaDifference: number;
    jazzcashExpected: number;
    jazzcashCounted: number;
    jazzcashDifference: number;
    note?: string | null;
    isLocked: boolean;
    closedByName?: string | null;
    createdAt: string;
  }>;
};

export type AdminFoodpandaSettlementCycle = {
  id: string | null;
  weekStart: string;
  weekEnd: string;
  totalOrders: number;
  grossSales: number;
  commission: number;
  otherCharges: number;
  expectedNet: number;
  status: "PENDING" | "RECEIVED";
  amountReceived: number | null;
  receivedSource: MoneySource;
  receivedAt: string | null;
  transferReference: string | null;
  notes: string | null;
};

export type AdminFoodpandaSettlementData = {
  period: "week" | "month" | "year";
  range: { start: string; end: string; label: string };
  summary: {
    pendingReceivables: number;
    expectedThisWeek: number;
    totalReceived: number;
    outstandingAmount: number;
    lastSettlementDate: string | null;
  };
  cycles: AdminFoodpandaSettlementCycle[];
  nextPending: AdminFoodpandaSettlementCycle | null;
};

export type AdminCashPositionData = {
  available: Record<MoneySource, number> & { total: number };
  pendingReceivables: { foodpanda: number; other: number; total: number };
  upcomingObligations: { fixedExpenses: number; loanInstallments: number; supplierPayables: number; total: number };
  projectedAfterPayments: number;
  health: "healthy" | "watch" | "risk";
};

export type AdminVendor = {
  id: string;
  ingredientCategory: string;
  vendorName: string;
  contactNumber?: string;
  type?: string;
  provides?: string;
  quotedPrice?: string;
  rateListUrl?: string;
  notes?: string;
  isActive?: boolean;
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
  roleCode: "SUPER_ADMIN" | "POS_STAFF" | "CUSTOMER";
  roleLabel: string;
  isActive: boolean;
  canAccessAdmin: boolean;
  canAccessPos: boolean;
  permissionKeys: string[];
  permissions: Array<{ key: string; label: string }>;
  branchId?: string;
  branchName?: string;
  branches?: Array<{ id: string; name: string; slug: string; isPrimary: boolean }>;
  lastLoginAt?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminUserData = {
  users: AdminUser[];
};

export type RiderAvailability = "AVAILABLE" | "ON_DELIVERY" | "OFF_DUTY";

export type RiderVehicleType = "MOTORCYCLE" | "SCOOTER" | "BICYCLE" | "CAR" | "RICKSHAW";

export type AdminRider = {
  id: string;
  branchId: string;
  name: string;
  /** Canonical digits, e.g. 923001234567. Use phoneDisplay for humans. */
  phone: string;
  phoneDisplay: string;
  altPhone?: string | null;
  cnic?: string | null;
  licenceNumber?: string | null;
  vehicleType: RiderVehicleType;
  vehiclePlate?: string | null;
  availability: RiderAvailability;
  isActive: boolean;
  notes?: string | null;
  activeDeliveryCount: number;
  totalDeliveryCount: number;
  createdByName?: string | null;
  createdAt: string;
  updatedAt: string;
};

export type AdminRiderData = {
  riders: AdminRider[];
  vehicleTypes: RiderVehicleType[];
  branchId: string;
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
  foodPackagingCost?: number | null;
  costSettingsUpdatedAt?: string | null;
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
  cashierUsername?: string | null;
  cashierName?: string | null;
  placedAt: string;
  acceptedAt?: string | null;
  cancellationReason?: string | null;
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
      optionId: string;
      optionName: string;
      priceDelta: number;
    }>;
  }>;
};

export type PosCatalogProduct = {
  id: string;
  name: string;
  categoryId: string;
  categorySlug?: string;
  categoryName: string;
  price: number;
  addOnGroups: AddOnGroup[];
  bundleComponents: BundleComponent[];
};

export type PosPromotion = {
  key: string;
  name: string;
  isActive: boolean;
  threshold: number;
  eligibleCategorySlug: string;
  rewardProductSlug: string;
  rewardProductId: string | null;
  rewardProductName: string;
  rewardUnitPrice: number | null;
  appliesTo: string[];
  available: boolean;
  unavailableReason?: string;
};

export type PromotionStats = {
  range: { preset: string; label: string; start?: string; end?: string };
  promotionOrders: number;
  totalOrders: number;
  participationRate: number;
  netRevenue: number;
  grossSales: number;
  promotionDiscount: number;
  averageOrderValue: number;
  freeRewardUnits: number;
  averageDiscountPerOrder: number;
  discountRate: number;
  trend: Array<{ date: string; label: string; orders: number; netRevenue: number; discount: number }>;
};

export type AdminPromotionData = {
  promotion: PosPromotion;
  stats: { allTime: PromotionStats; period: PromotionStats };
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
  promotionName?: string | null;
  promotionDiscountAmount?: number | null;
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
    promotionFreeQuantity?: number;
    unitPrice: number;
    taxRate: number;
    taxAmount: number;
    lineTotal: number;
    note?: string | null;
    bundleComponents: BundleComponent[];
    addOns: Array<{
      id: string;
      optionId: string;
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
  promotionName?: string | null;
  promotionDiscountAmount?: number | null;
  foodpandaOrderNumber: string;
  items: Array<{
    id: string;
    productId: string | null;
    productName: string;
    categoryName: string;
    quantity: number;
    promotionFreeQuantity?: number;
    unitPrice: number;
    customDescription?: string | null;
    note?: string | null;
    bundleComponents: BundleComponent[];
    addOns: Array<{
      id: string;
      optionId: string;
      optionName: string;
      priceDelta: number;
    }>;
    selections?: Array<{
      groupId: string;
      optionIds: string[];
    }>;
    product?: {
      addOnGroups: AddOnGroup[];
    } | null;
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

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

export type DashboardData = {
  kpis: {
    todayOrders: number;
    revenue: number;
    totalCustomers: number;
    averageOrderValue: number;
  };
  topProducts: Array<{ productName: string; quantity: number }>;
  recentOrders: Array<{
    id: string;
    orderNumber: string;
    customerName: string;
    status: string;
    totalAmount: number;
  }>;
  lowStock: Array<{
    ingredient: string;
    branch: string;
    quantityOnHand: number;
  }>;
  sales: Array<{ label: string; revenue: number }>;
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
  category: Category;
};

export type AdminOrder = {
  id: string;
  orderNumber: string;
  channel: string;
  serviceType: string;
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
    addOns: Array<{
      id: string;
      optionName: string;
      priceDelta: number;
    }>;
  }>;
};

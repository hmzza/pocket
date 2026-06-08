import { PrismaClient, DiscountType, PaymentMethod, PaymentStatus, RoleCode } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

const nutrition = (calories: number, protein: number, carbs: number, fats: number) => ({
  calories,
  macros: { protein, carbs, fats }
});

async function main() {
  const [customerRole, adminRole, superAdminRole] = await Promise.all([
    prisma.role.upsert({
      where: { code: RoleCode.CUSTOMER },
      update: { label: "Customer" },
      create: { code: RoleCode.CUSTOMER, label: "Customer" }
    }),
    prisma.role.upsert({
      where: { code: RoleCode.ADMIN },
      update: { label: "Admin" },
      create: { code: RoleCode.ADMIN, label: "Admin" }
    }),
    prisma.role.upsert({
      where: { code: RoleCode.SUPER_ADMIN },
      update: { label: "Super Admin" },
      create: { code: RoleCode.SUPER_ADMIN, label: "Super Admin" }
    })
  ]);

  const adminPasswordHash = await bcrypt.hash(process.env.INITIAL_ADMIN_PASSWORD ?? "PocketAdmin123!", 12);
  const customerPasswordHash = await bcrypt.hash("PocketCustomer123!", 12);

  const admin = await prisma.user.upsert({
    where: { email: process.env.INITIAL_ADMIN_EMAIL ?? "admin@pocketshawarma.com" },
    update: {
      name: "Pocket Admin",
      phone: "+92-300-0000001",
      passwordHash: adminPasswordHash,
      roleId: superAdminRole.id
    },
    create: {
      name: "Pocket Admin",
      email: process.env.INITIAL_ADMIN_EMAIL ?? "admin@pocketshawarma.com",
      phone: "+92-300-0000001",
      passwordHash: adminPasswordHash,
      roleId: superAdminRole.id
    }
  });

  const customer = await prisma.user.upsert({
    where: { email: "customer@pocketshawarma.com" },
    update: {
      name: "Ayesha Khan",
      phone: "+92-300-0000022",
      passwordHash: customerPasswordHash,
      roleId: customerRole.id
    },
    create: {
      name: "Ayesha Khan",
      email: "customer@pocketshawarma.com",
      phone: "+92-300-0000022",
      passwordHash: customerPasswordHash,
      roleId: customerRole.id
    }
  });

  const branch = await prisma.branch.upsert({
    where: { slug: "islamabad-g11" },
    update: {
      name: "Pocket G-11 Markaz",
      city: "Islamabad",
      addressLine1: "Shop #17, Al Ghaffar Mall, G-11 Markaz",
      phone: "+92-300-POCKET1",
      email: "g11@pocketshawarma.com",
      deliveryFee: 180
    },
    create: {
      slug: "islamabad-g11",
      name: "Pocket G-11 Markaz",
      city: "Islamabad",
      addressLine1: "Shop #17, Al Ghaffar Mall, G-11 Markaz",
      phone: "+92-300-POCKET1",
      email: "g11@pocketshawarma.com",
      deliveryFee: 180,
      hours: {
        create: Array.from({ length: 7 }).map((_, dayOfWeek) => ({
          dayOfWeek,
          openTime: "12:00",
          closeTime: "23:45"
        }))
      }
    }
  });

  await prisma.address.upsert({
    where: { id: "customer-default-address" },
    update: {
      userId: customer.id,
      label: "Home",
      addressLine1: "House 14, Street 10, G-11/3",
      city: "Islamabad",
      instructions: "Ring the bell once",
      isDefault: true
    },
    create: {
      id: "customer-default-address",
      userId: customer.id,
      label: "Home",
      addressLine1: "House 14, Street 10, G-11/3",
      city: "Islamabad",
      instructions: "Ring the bell once",
      isDefault: true
    }
  });

  const cmsEntries = [
    {
      key: "homepage.hero",
      title: "Hero",
      content: {
        eyebrow: "Islamabad's newest shawarma ritual",
        headline: "POCKET",
        subheadline: "Real Shawarma, Served The Pocket Way",
        description: "Fresh carved wraps, loaded fries, bold sauces, and fast delivery from G-11 Markaz.",
        primaryCta: { label: "Order Now", href: "/menu" },
        secondaryCta: { label: "View Menu", href: "/menu" }
      }
    },
    {
      key: "homepage.why-pocket",
      title: "Why Pocket",
      content: [
        { title: "Fresh ingredients", description: "Daily prepped veg, hand-seasoned proteins, signature sauces." },
        { title: "Fast service", description: "Built for walk-ins, pickups, and rush-hour delivery." },
        { title: "Premium taste", description: "A bolder shawarma profile with house-crafted toppings." }
      ]
    },
    {
      key: "homepage.testimonials",
      title: "Testimonials",
      content: [
        { author: "Hassan R.", body: "Pocket special with extra sauce is already my default lunch order.", rating: 5 },
        { author: "Maria N.", body: "Loaded fries hit the right balance. Fast prep and clean packaging.", rating: 5 },
        { author: "Ali Z.", body: "The wraps actually taste premium. Good portions too.", rating: 4 }
      ]
    },
    {
      key: "faq",
      title: "FAQ",
      content: [
        { question: "Do you deliver outside G-11?", answer: "Delivery zones are configured per branch and expand as new outlets launch." },
        { question: "Can I preorder for pickup?", answer: "Yes. Pickup windows are available during checkout." }
      ]
    }
  ];

  await Promise.all(
    cmsEntries.map((entry) =>
      prisma.cmsContent.upsert({
        where: { key: entry.key },
        update: { title: entry.title, content: entry.content },
        create: entry
      })
    )
  );

  await Promise.all([
    prisma.setting.upsert({
      where: { key: "store.contact" },
      update: {
        value: {
          phone: "+92-300-POCKET1",
          email: "hello@pocketshawarma.com",
          instagram: "@pocket.pakistan"
        }
      },
      create: {
        key: "store.contact",
        value: {
          phone: "+92-300-POCKET1",
          email: "hello@pocketshawarma.com",
          instagram: "@pocket.pakistan"
        }
      }
    }),
    prisma.setting.upsert({
      where: { key: "store.seo" },
      update: {
        value: {
          title: "Pocket - The Shawarma Spot",
          description: "Pocket Shawarma Spot in Islamabad serving bold wraps, loaded fries, and combo meals."
        }
      },
      create: {
        key: "store.seo",
        value: {
          title: "Pocket - The Shawarma Spot",
          description: "Pocket Shawarma Spot in Islamabad serving bold wraps, loaded fries, and combo meals."
        }
      }
    })
  ]);

  const categories = await Promise.all([
    prisma.category.upsert({
      where: { slug: "shawarmas" },
      update: { name: "Shawarmas", description: "Pocket signature wraps", sortOrder: 1, imageUrl: "/images/shawarma-pocket.svg" },
      create: { slug: "shawarmas", name: "Shawarmas", description: "Pocket signature wraps", sortOrder: 1, imageUrl: "/images/shawarma-pocket.svg" }
    }),
    prisma.category.upsert({
      where: { slug: "fries" },
      update: { name: "Fries", description: "Loaded sides and spice hits", sortOrder: 2, imageUrl: "/images/loaded-fries.svg" },
      create: { slug: "fries", name: "Fries", description: "Loaded sides and spice hits", sortOrder: 2, imageUrl: "/images/loaded-fries.svg" }
    }),
    prisma.category.upsert({
      where: { slug: "drinks" },
      update: { name: "Drinks", description: "Cold add-ons", sortOrder: 3, imageUrl: "/images/pocket-drink.svg" },
      create: { slug: "drinks", name: "Drinks", description: "Cold add-ons", sortOrder: 3, imageUrl: "/images/pocket-drink.svg" }
    }),
    prisma.category.upsert({
      where: { slug: "combos" },
      update: { name: "Combos", description: "Pocket bundles", sortOrder: 4, imageUrl: "/images/pocket-combo.svg" },
      create: { slug: "combos", name: "Combos", description: "Pocket bundles", sortOrder: 4, imageUrl: "/images/pocket-combo.svg" }
    })
  ]);

  const categoryMap = Object.fromEntries(categories.map((category) => [category.slug, category]));

  const productSeeds = [
    {
      slug: "pocket-chicken-shawarma",
      sku: "PKT-SHW-001",
      name: "Pocket Chicken Shawarma",
      description: "Charred chicken, pickled slaw, garlic sauce, and crunchy lettuce wrapped Pocket style.",
      categorySlug: "shawarmas",
      ingredients: ["Chicken", "Garlic sauce", "Pickles", "Lettuce"],
      basePrice: 590,
      calories: 640,
      featured: true,
      bestSeller: true,
      prepTimeMinutes: 16,
      spiceLevel: 2,
      nutritionInfo: nutrition(640, 31, 43, 28),
      images: [
        { url: "/images/shawarma-pocket.svg", alt: "Pocket chicken shawarma", sortOrder: 1 }
      ]
    },
    {
      slug: "pocket-beef-shawarma",
      sku: "PKT-SHW-002",
      name: "Pocket Beef Shawarma",
      description: "Slow-spiced beef, tahini aioli, onions, and sumac fries crunch tucked into a toasted wrap.",
      categorySlug: "shawarmas",
      ingredients: ["Beef", "Tahini aioli", "Onions", "Sumac"],
      basePrice: 690,
      calories: 700,
      featured: true,
      bestSeller: false,
      prepTimeMinutes: 18,
      spiceLevel: 3,
      nutritionInfo: nutrition(700, 34, 45, 32),
      images: [
        { url: "/images/shawarma-beef.svg", alt: "Pocket beef shawarma", sortOrder: 1 }
      ]
    },
    {
      slug: "pocket-special-shawarma",
      sku: "PKT-SHW-003",
      name: "Pocket Special Shawarma",
      description: "Double protein, olives, corn, jalapeno cream, and Pocket fire sauce.",
      categorySlug: "shawarmas",
      ingredients: ["Chicken", "Beef", "Olives", "Corn", "Pocket sauce"],
      basePrice: 790,
      calories: 820,
      featured: true,
      bestSeller: true,
      prepTimeMinutes: 20,
      spiceLevel: 4,
      nutritionInfo: nutrition(820, 44, 50, 40),
      images: [
        { url: "/images/pocket-special.svg", alt: "Pocket special shawarma", sortOrder: 1 }
      ]
    },
    {
      slug: "loaded-fries",
      sku: "PKT-FRY-001",
      name: "Loaded Fries",
      description: "Crispy fries with chicken shawarma, garlic drizzle, pickled onions, and parsley.",
      categorySlug: "fries",
      ingredients: ["Fries", "Chicken", "Garlic drizzle", "Onions"],
      basePrice: 470,
      calories: 510,
      featured: false,
      bestSeller: true,
      prepTimeMinutes: 12,
      spiceLevel: 2,
      nutritionInfo: nutrition(510, 18, 53, 24),
      images: [
        { url: "/images/loaded-fries.svg", alt: "Loaded fries", sortOrder: 1 }
      ]
    },
    {
      slug: "masala-fries",
      sku: "PKT-FRY-002",
      name: "Masala Fries",
      description: "Crispy fries dusted in Pocket masala and served with cool dip.",
      categorySlug: "fries",
      ingredients: ["Fries", "Masala seasoning", "Dip"],
      basePrice: 280,
      calories: 390,
      featured: false,
      bestSeller: false,
      prepTimeMinutes: 8,
      spiceLevel: 3,
      nutritionInfo: nutrition(390, 6, 49, 18),
      images: [
        { url: "/images/masala-fries.svg", alt: "Masala fries", sortOrder: 1 }
      ]
    },
    {
      slug: "coke",
      sku: "PKT-DRK-001",
      name: "Coke",
      description: "Chilled can.",
      categorySlug: "drinks",
      ingredients: ["Carbonated beverage"],
      basePrice: 120,
      calories: 140,
      featured: false,
      bestSeller: true,
      prepTimeMinutes: 1,
      spiceLevel: 0,
      nutritionInfo: nutrition(140, 0, 39, 0),
      images: [
        { url: "/images/pocket-drink.svg", alt: "Coke can", sortOrder: 1 }
      ]
    },
    {
      slug: "shawarma-drink-combo",
      sku: "PKT-CMB-001",
      name: "Shawarma + Drink",
      description: "Pocket chicken shawarma paired with a chilled drink.",
      categorySlug: "combos",
      ingredients: ["Chicken shawarma", "Soft drink"],
      basePrice: 670,
      calories: 780,
      featured: true,
      bestSeller: true,
      prepTimeMinutes: 16,
      spiceLevel: 2,
      nutritionInfo: nutrition(780, 31, 82, 28),
      images: [
        { url: "/images/pocket-combo.svg", alt: "Shawarma combo", sortOrder: 1 }
      ]
    },
    {
      slug: "shawarma-fries-drink-combo",
      sku: "PKT-CMB-002",
      name: "Shawarma + Fries + Drink",
      description: "The all-in Pocket order built for lunch rush or late-night cravings.",
      categorySlug: "combos",
      ingredients: ["Chicken shawarma", "Fries", "Soft drink"],
      basePrice: 890,
      calories: 1090,
      featured: true,
      bestSeller: true,
      prepTimeMinutes: 20,
      spiceLevel: 2,
      nutritionInfo: nutrition(1090, 38, 121, 42),
      images: [
        { url: "/images/combo-meal.svg", alt: "Pocket meal combo", sortOrder: 1 }
      ]
    }
  ];

  const products = [];
  for (const seed of productSeeds) {
    const product = await prisma.product.upsert({
      where: { slug: seed.slug },
      update: {
        categoryId: categoryMap[seed.categorySlug].id,
        sku: seed.sku,
        name: seed.name,
        description: seed.description,
        ingredients: seed.ingredients,
        basePrice: seed.basePrice,
        calories: seed.calories,
        featured: seed.featured,
        bestSeller: seed.bestSeller,
        prepTimeMinutes: seed.prepTimeMinutes,
        spiceLevel: seed.spiceLevel,
        nutritionInfo: seed.nutritionInfo
      },
      create: {
        categoryId: categoryMap[seed.categorySlug].id,
        slug: seed.slug,
        sku: seed.sku,
        name: seed.name,
        description: seed.description,
        ingredients: seed.ingredients,
        basePrice: seed.basePrice,
        calories: seed.calories,
        featured: seed.featured,
        bestSeller: seed.bestSeller,
        prepTimeMinutes: seed.prepTimeMinutes,
        spiceLevel: seed.spiceLevel,
        nutritionInfo: seed.nutritionInfo
      }
    });

    await prisma.productImage.deleteMany({ where: { productId: product.id } });
    await prisma.productImage.createMany({
      data: seed.images.map((image) => ({
        productId: product.id,
        ...image
      }))
    });

    await prisma.branchProduct.upsert({
      where: { branchId_productId: { branchId: branch.id, productId: product.id } },
      update: { price: seed.basePrice, isAvailable: true },
      create: { branchId: branch.id, productId: product.id, price: seed.basePrice, isAvailable: true }
    });

    products.push(product);
  }

  const chicken = products.find((product) => product.slug === "pocket-chicken-shawarma");
  const beef = products.find((product) => product.slug === "pocket-beef-shawarma");
  const special = products.find((product) => product.slug === "pocket-special-shawarma");

  if (chicken && beef && special) {
    await prisma.addOnGroup.deleteMany({ where: { productId: { in: [chicken.id, beef.id, special.id] } } });
    for (const product of [chicken, beef, special]) {
      const group = await prisma.addOnGroup.create({
        data: {
          productId: product.id,
          name: "Customize Your Wrap",
          minSelect: 0,
          maxSelect: 3,
          sortOrder: 1,
          options: {
            create: [
              { name: "Extra cheese", priceDelta: 90, sortOrder: 1 },
              { name: "Extra sauce", priceDelta: 50, sortOrder: 2 },
              { name: "Double meat", priceDelta: 190, sortOrder: 3 }
            ]
          }
        }
      });

      if (product.id === special.id) {
        await prisma.addOnOption.create({
          data: {
            groupId: group.id,
            name: "Pocket fire sauce",
            priceDelta: 40,
            sortOrder: 4
          }
        });
      }
    }
  }

  const supplier = await prisma.supplier.upsert({
    where: { id: "default-supplier" },
    update: { name: "Capital Fresh Foods", phone: "+92-51-1111111" },
    create: { id: "default-supplier", name: "Capital Fresh Foods", phone: "+92-51-1111111" }
  });

  const ingredients = await Promise.all([
    prisma.ingredient.upsert({
      where: { sku: "ING-CHK-001" },
      update: { name: "Chicken strips", unit: "kg", reorderLevel: 10, costPerUnit: 890, supplierId: supplier.id },
      create: { sku: "ING-CHK-001", name: "Chicken strips", unit: "kg", reorderLevel: 10, costPerUnit: 890, supplierId: supplier.id }
    }),
    prisma.ingredient.upsert({
      where: { sku: "ING-BEF-001" },
      update: { name: "Beef slices", unit: "kg", reorderLevel: 8, costPerUnit: 1150, supplierId: supplier.id },
      create: { sku: "ING-BEF-001", name: "Beef slices", unit: "kg", reorderLevel: 8, costPerUnit: 1150, supplierId: supplier.id }
    }),
    prisma.ingredient.upsert({
      where: { sku: "ING-SAU-001" },
      update: { name: "Garlic sauce", unit: "ltr", reorderLevel: 6, costPerUnit: 420, supplierId: supplier.id },
      create: { sku: "ING-SAU-001", name: "Garlic sauce", unit: "ltr", reorderLevel: 6, costPerUnit: 420, supplierId: supplier.id }
    }),
    prisma.ingredient.upsert({
      where: { sku: "ING-FRY-001" },
      update: { name: "Fries", unit: "kg", reorderLevel: 12, costPerUnit: 280, supplierId: supplier.id },
      create: { sku: "ING-FRY-001", name: "Fries", unit: "kg", reorderLevel: 12, costPerUnit: 280, supplierId: supplier.id }
    })
  ]);

  for (const ingredient of ingredients) {
    const inventory = await prisma.branchInventory.upsert({
      where: { branchId_ingredientId: { branchId: branch.id, ingredientId: ingredient.id } },
      update: { quantityOnHand: ingredient.sku === "ING-BEF-001" ? 6 : 14, lowStockAlert: ingredient.sku === "ING-BEF-001" },
      create: {
        branchId: branch.id,
        ingredientId: ingredient.id,
        quantityOnHand: ingredient.sku === "ING-BEF-001" ? 6 : 14,
        lowStockAlert: ingredient.sku === "ING-BEF-001"
      }
    });

    await prisma.inventoryTransaction.create({
      data: {
        branchInventoryId: inventory.id,
        type: "PURCHASE",
        quantity: inventory.quantityOnHand,
        note: "Opening stock seed"
      }
    });
  }

  const pocketChicken = products.find((product) => product.slug === "pocket-chicken-shawarma");
  if (pocketChicken) {
    await prisma.favorite.upsert({
      where: { userId_productId: { userId: customer.id, productId: pocketChicken.id } },
      update: {},
      create: { userId: customer.id, productId: pocketChicken.id }
    });

    await prisma.review.upsert({
      where: { id: "review-pocket-chicken" },
      update: {
        userId: customer.id,
        productId: pocketChicken.id,
        rating: 5,
        title: "High repeat order potential",
        body: "Good crunch, strong garlic, and it still arrives well packed."
      },
      create: {
        id: "review-pocket-chicken",
        userId: customer.id,
        productId: pocketChicken.id,
        rating: 5,
        title: "High repeat order potential",
        body: "Good crunch, strong garlic, and it still arrives well packed."
      }
    });
  }

  await prisma.coupon.upsert({
    where: { code: "POCKET10" },
    update: {
      title: "Pocket launch offer",
      type: DiscountType.PERCENTAGE,
      value: 10,
      usageLimit: 500,
      expiresAt: new Date("2026-12-31T23:59:59Z")
    },
    create: {
      code: "POCKET10",
      title: "Pocket launch offer",
      description: "10% off for opening-week orders",
      type: DiscountType.PERCENTAGE,
      value: 10,
      usageLimit: 500,
      expiresAt: new Date("2026-12-31T23:59:59Z")
    }
  });

  const cart = await prisma.shoppingCart.upsert({
    where: { userId: customer.id },
    update: { branchId: branch.id },
    create: { userId: customer.id, branchId: branch.id }
  });

  if (pocketChicken) {
    await prisma.cartItem.upsert({
      where: { id: "demo-cart-item" },
      update: {
        cartId: cart.id,
        productId: pocketChicken.id,
        quantity: 2,
        selectedAddOnIds: []
      },
      create: {
        id: "demo-cart-item",
        cartId: cart.id,
        productId: pocketChicken.id,
        quantity: 2,
        selectedAddOnIds: []
      }
    });
  }

  const combo = products.find((product) => product.slug === "shawarma-drink-combo");
  const customerAddress = await prisma.address.findFirstOrThrow({ where: { userId: customer.id, isDefault: true } });
  const launchCoupon = await prisma.coupon.findUniqueOrThrow({ where: { code: "POCKET10" } });

  if (combo) {
    await prisma.order.upsert({
      where: { orderNumber: "PKT-2026-000123" },
      update: {
        customerId: customer.id,
        branchId: branch.id,
        addressId: customerAddress.id,
        couponId: launchCoupon.id,
        paymentMethod: PaymentMethod.CASH_ON_DELIVERY,
        paymentStatus: PaymentStatus.PENDING,
        subtotal: combo.basePrice,
        taxAmount: 80,
        deliveryFee: 180,
        discountAmount: 67,
        totalAmount: 883,
        status: "OUT_FOR_DELIVERY"
      },
      create: {
        orderNumber: "PKT-2026-000123",
        customerId: customer.id,
        branchId: branch.id,
        addressId: customerAddress.id,
        couponId: launchCoupon.id,
        paymentMethod: PaymentMethod.CASH_ON_DELIVERY,
        paymentStatus: PaymentStatus.PENDING,
        subtotal: combo.basePrice,
        taxAmount: 80,
        deliveryFee: 180,
        discountAmount: 67,
        totalAmount: 883,
        status: "OUT_FOR_DELIVERY",
        expectedDeliveryAt: new Date(Date.now() + 25 * 60 * 1000),
        items: {
          create: [
            {
              productId: combo.id,
              productName: combo.name,
              quantity: 1,
              unitPrice: combo.basePrice
            }
          ]
        }
      }
    });
  }

  await Promise.all([
    prisma.notification.create({
      data: {
        type: "ORDER",
        title: "New order received",
        message: "PKT-2026-000123 moved to Out For Delivery.",
        userId: admin.id,
        metadata: { orderNumber: "PKT-2026-000123" }
      }
    }),
    prisma.notification.create({
      data: {
        type: "STOCK",
        title: "Low stock warning",
        message: "Beef slices are below reorder level at G-11 Markaz.",
        userId: admin.id,
        metadata: { ingredient: "Beef slices", branch: branch.name }
      }
    })
  ]);

  await prisma.auditLog.create({
    data: {
      actorId: admin.id,
      action: "seed.bootstrap",
      entityType: "system",
      entityId: "seed",
      payload: { branch: branch.slug, categories: categories.length, products: products.length }
    }
  });
}

main()
  .then(async () => {
    await prisma.$disconnect();
  })
  .catch(async (error) => {
    console.error(error);
    await prisma.$disconnect();
    process.exit(1);
  });


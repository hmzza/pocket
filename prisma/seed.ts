import { PrismaClient, DiscountType, PaymentMethod, PaymentStatus, RoleCode } from "@prisma/client";
import bcrypt from "bcryptjs";
import { INVENTORY_ITEMS, PREPARED_RECIPE_BY_SKU, PRODUCT_RECIPE_BY_SLUG } from "../apps/api/src/lib/inventory-config.js";

const prisma = new PrismaClient();

const nutrition = (calories: number, protein: number, carbs: number, fats: number) => ({
  calories,
  macros: { protein, carbs, fats }
});

async function main() {
  const seedVersion = Number(process.env.SEED_VERSION ?? "6");
  const forceSeed = process.env.FORCE_SEED === "true";
  const existingSeedMarker = await prisma.setting.findUnique({
    where: { key: "system.seed.version" }
  });

  const existingSeedVersion = Number((existingSeedMarker?.value as { version?: unknown } | null)?.version ?? 0);

  if (existingSeedMarker && existingSeedVersion === seedVersion && !forceSeed) {
    console.log(`Seed marker found for version ${seedVersion}. Skipping seed.`);
    return;
  }

  const [customerRole, adminRole, superAdminRole, posStaffRole] = await Promise.all([
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
    }),
    prisma.role.upsert({
      where: { code: RoleCode.POS_STAFF },
      update: { label: "POS Staff" },
      create: { code: RoleCode.POS_STAFF, label: "POS Staff" }
    })
  ]);

  const adminPasswordHash = await bcrypt.hash(process.env.INITIAL_ADMIN_PASSWORD ?? "PocketAdmin123!", 12);
  const posPasswordHash = await bcrypt.hash(process.env.INITIAL_POS_PASSWORD ?? "PocketPos123!", 12);
  const customerPasswordHash = await bcrypt.hash("PocketCustomer123!", 12);

  const admin = await prisma.user.upsert({
    where: { email: process.env.INITIAL_ADMIN_EMAIL ?? "admin@pocketshawarma.com" },
    update: {
      name: "Pocket Admin",
      username: "superadmin_pocket",
      phone: "+92-300-0000001",
      passwordHash: adminPasswordHash,
      roleId: superAdminRole.id,
      canAccessAdmin: true,
      canAccessPos: true
    },
    create: {
      name: "Pocket Admin",
      username: "superadmin_pocket",
      email: process.env.INITIAL_ADMIN_EMAIL ?? "admin@pocketshawarma.com",
      phone: "+92-300-0000001",
      passwordHash: adminPasswordHash,
      roleId: superAdminRole.id,
      canAccessAdmin: true,
      canAccessPos: true
    }
  });

  const customer = await prisma.user.upsert({
    where: { email: "customer@pocketshawarma.com" },
    update: {
      name: "Ayesha Khan",
      username: "ayesha_khan",
      phone: "+92-300-0000022",
      passwordHash: customerPasswordHash,
      roleId: customerRole.id,
      canAccessAdmin: false,
      canAccessPos: false
    },
    create: {
      name: "Ayesha Khan",
      username: "ayesha_khan",
      email: "customer@pocketshawarma.com",
      phone: "+92-300-0000022",
      passwordHash: customerPasswordHash,
      roleId: customerRole.id,
      canAccessAdmin: false,
      canAccessPos: false
    }
  });

  await prisma.user.upsert({
    where: { email: process.env.INITIAL_POS_EMAIL ?? "counter@pocketshawarma.com" },
    update: {
      name: "Pocket Counter",
      username: "pocket_counter",
      phone: "+92-300-0000033",
      passwordHash: posPasswordHash,
      roleId: posStaffRole.id,
      canAccessAdmin: true,
      canAccessPos: true
    },
    create: {
      name: "Pocket Counter",
      username: "pocket_counter",
      email: process.env.INITIAL_POS_EMAIL ?? "counter@pocketshawarma.com",
      phone: "+92-300-0000033",
      passwordHash: posPasswordHash,
      roleId: posStaffRole.id,
      canAccessAdmin: true,
      canAccessPos: true
    }
  });

  const branch = await prisma.branch.upsert({
    where: { slug: "islamabad-g11" },
    update: {
      name: "Pocket G-11 Markaz",
      city: "Islamabad",
      addressLine1: "Shop #17, Al Ghaffar Mall, G-11 Markaz",
      phone: "+92 329 5196981",
      email: "g11@pocketshawarma.com",
      deliveryFee: 180
    },
    create: {
      slug: "islamabad-g11",
      name: "Pocket G-11 Markaz",
      city: "Islamabad",
      addressLine1: "Shop #17, Al Ghaffar Mall, G-11 Markaz",
      phone: "+92 329 5196981",
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
        description: "Fresh shawarmas, crispy fries, chillers, shakes, and fast delivery from G-11 Markaz.",
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
        { author: "Hassan R.", body: "Classic Pocket is clean, filling, and easy to recommend.", rating: 5 },
        { author: "Maria N.", body: "Loaded Fries and the chillers both hold up really well.", rating: 5 },
        { author: "Ali Z.", body: "The shakes are consistent and the portions are solid.", rating: 4 }
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
          phone: "+92 329 5196981",
          email: "hello@pocketshawarma.com",
          instagram: "@pocket.pakistan"
        }
      },
      create: {
        key: "store.contact",
        value: {
          phone: "+92 329 5196981",
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
          description: "Pocket Shawarma Spot in Islamabad serving shawarmas, fries, chillers, shakes, and soft drinks."
        }
      },
      create: {
        key: "store.seo",
        value: {
          title: "Pocket - The Shawarma Spot",
          description: "Pocket Shawarma Spot in Islamabad serving shawarmas, fries, chillers, shakes, and soft drinks."
        }
      }
    }),
    prisma.setting.upsert({
      where: { key: "homepage.slider" },
      update: {
        value: {
          intervalMs: 4500,
          images: [
            { url: "/images/pocket-mai-rocket-shawarma.png", alt: "Pocket Mai Rocket" },
            { url: "/images/classic-shawarma.png", alt: "Classic Pocket" },
            { url: "/images/spicy-shawarma.png", alt: "Spicy Pocket" },
            { url: "/images/loaded-fries.png", alt: "Loaded Fries" }
          ]
        }
      },
      create: {
        key: "homepage.slider",
        value: {
          intervalMs: 4500,
          images: [
            { url: "/images/pocket-mai-rocket-shawarma.png", alt: "Pocket Mai Rocket" },
            { url: "/images/classic-shawarma.png", alt: "Classic Pocket" },
            { url: "/images/spicy-shawarma.png", alt: "Spicy Pocket" },
            { url: "/images/loaded-fries.png", alt: "Loaded Fries" }
          ]
        }
      }
    })
  ]);

  const categorySeeds = [
    {
      legacySlug: "shawarmas",
      slug: "shawarma",
      name: "Shawarma",
      description: "Pocket signature wraps",
      sortOrder: 1,
      imageUrl: "/images/classic-shawarma.png",
      isActive: true
    },
    {
      legacySlug: "fries",
      slug: "fries",
      name: "Fries",
      description: "Crispy sides and spice hits",
      sortOrder: 2,
      imageUrl: "/images/loaded-fries.png",
      isActive: true
    },
    {
      slug: "make-it-a-meal",
      name: "Make It A Meal",
      description: "Pocket wraps bundled with fries and your drink pick",
      sortOrder: 4,
      imageUrl: "/images/pocket-mai-rocket-shawarma.png",
      isActive: true
    },
    {
      slug: "add-ons",
      name: "Add-ons",
      description: "Custom extras",
      sortOrder: 3,
      imageUrl: "/images/loaded-fries.png",
      isActive: true
    },
    {
      legacySlug: "drinks",
      slug: "chillers",
      name: "Chillers",
      description: "Fruit chillers",
      sortOrder: 5,
      imageUrl: "/images/kiwi-passion-chiller.png",
      isActive: true
    },
    {
      legacySlug: "combos",
      slug: "ice-cream-shakes",
      name: "Ice Cream Shakes",
      description: "Creamy shakes",
      sortOrder: 6,
      imageUrl: "/images/chocolate-shake.png",
      isActive: true
    },
    {
      slug: "soft-drinks",
      name: "Soft Drinks",
      description: "Classic soft drinks",
      sortOrder: 7,
      imageUrl: "/images/kiwi-passion-chiller.png",
      isActive: true
    }
  ];

  const categories = [];
  for (const seed of categorySeeds) {
    const existingCategory =
      (await prisma.category.findUnique({ where: { slug: seed.slug } })) ??
      (seed.legacySlug ? await prisma.category.findUnique({ where: { slug: seed.legacySlug } }) : null);

    const category = existingCategory
      ? await prisma.category.update({
          where: { id: existingCategory.id },
          data: {
            slug: seed.slug,
            name: seed.name,
            description: seed.description,
            sortOrder: seed.sortOrder,
            imageUrl: seed.imageUrl,
            isActive: seed.isActive
          }
        })
      : await prisma.category.create({
          data: {
            slug: seed.slug,
            name: seed.name,
            description: seed.description,
            sortOrder: seed.sortOrder,
            imageUrl: seed.imageUrl,
            isActive: seed.isActive
          }
        });

    categories.push(category);
  }

  const categoryMap = Object.fromEntries(categories.map((category) => [category.slug, category]));

  const mealSelectionOptions = [
    { code: "pepsi", name: "Fries + Pepsi", priceDelta: 250 },
    { code: "7up", name: "Fries + 7UP", priceDelta: 250 },
    { code: "fanta", name: "Fries + Fanta", priceDelta: 250 },
    { code: "chocolate", name: "Fries + Chocolate Shake", priceDelta: 450 },
    { code: "vanilla", name: "Fries + Vanilla Shake", priceDelta: 450 },
    { code: "mango", name: "Fries + Mango Shake", priceDelta: 450 },
    { code: "oreo", name: "Fries + Oreo Shake", priceDelta: 450 },
    { code: "strawberry", name: "Fries + Strawberry Shake", priceDelta: 450 },
    { code: "kiwi", name: "Fries + Kiwi Passion", priceDelta: 550 },
    { code: "cherry", name: "Fries + Strawberry Cherry", priceDelta: 550 },
    { code: "watermelon", name: "Fries + Watermelon Guava", priceDelta: 550 }
  ];

  const productSeeds = [
    {
      legacySlug: "pocket-chicken-shawarma",
      slug: "classic-pocket",
      sku: "PKT-SHW-001",
      name: "Classic Pocket",
      description: "Juicy chicken with classic shawarma sauce, iceberg, carrot, cucumber, and cheese.",
      categorySlug: "shawarma",
      ingredients: ["Chicken", "Classic shawarma sauce", "Iceberg", "Carrot", "Cucumber", "Cheese"],
      basePrice: 450,
      calories: 560,
      featured: true,
      bestSeller: true,
      sortOrder: 1,
      nutritionInfo: nutrition(560, 29, 41, 24),
      images: [{ url: "/images/classic-shawarma.png", alt: "Classic Pocket", sortOrder: 1 }]
    },
    {
      legacySlug: "pocket-beef-shawarma",
      slug: "spicy-pocket",
      sku: "PKT-SHW-002",
      name: "Spicy Pocket",
      description: "Juicy chicken with spicy jalapeno sauce, iceberg, carrot, cucumber, and cheese.",
      categorySlug: "shawarma",
      ingredients: ["Chicken", "Spicy jalapeno sauce", "Iceberg", "Carrot", "Cucumber", "Cheese"],
      basePrice: 550,
      calories: 590,
      featured: true,
      bestSeller: true,
      sortOrder: 2,
      nutritionInfo: nutrition(590, 30, 42, 27),
      images: [{ url: "/images/spicy-shawarma.png", alt: "Spicy Pocket", sortOrder: 1 }]
    },
    {
      legacySlug: "pocket-special-shawarma",
      slug: "pocket-mai-rocket",
      sku: "PKT-SHW-003",
      name: "Pocket Mai Rocket",
      description: "Premium pocket with black olives, jalapeno, corn, mushrooms, cheese, and your choice of classic or spicy sauce.",
      categorySlug: "shawarma",
      ingredients: ["Chicken", "Black olives", "Jalapeno", "Corn", "Mushrooms", "Cheese"],
      basePrice: 750,
      calories: 760,
      featured: true,
      bestSeller: true,
      sortOrder: 3,
      nutritionInfo: nutrition(760, 36, 45, 34),
      images: [{ url: "/images/pocket-mai-rocket-shawarma.png", alt: "Pocket Mai Rocket", sortOrder: 1 }]
    },
    {
      slug: "thela-fries",
      sku: "PKT-FRY-001",
      name: "Thela Fries",
      description: "Crispy french fries with spicy masala.",
      categorySlug: "fries",
      ingredients: ["French fries", "Spicy masala"],
      basePrice: 180,
      calories: 360,
      featured: false,
      bestSeller: true,
      sortOrder: 1,
      nutritionInfo: nutrition(360, 4, 44, 18),
      images: [{ url: "/images/thela-fries.png", alt: "Thela Fries", sortOrder: 1 }]
    },
    {
      slug: "loaded-fries",
      sku: "PKT-FRY-003",
      name: "Loaded Fries",
      description: "Loaded with cheese sauce, jalapeno, olives, corn, and juicy chicken.",
      categorySlug: "fries",
      ingredients: ["French fries", "Cheese sauce", "Jalapeno", "Olives", "Corn", "Chicken"],
      basePrice: 399,
      calories: 640,
      featured: true,
      bestSeller: true,
      sortOrder: 2,
      nutritionInfo: nutrition(640, 17, 50, 30),
      images: [{ url: "/images/loaded-fries.png", alt: "Loaded Fries", sortOrder: 1 }]
    },
    {
      slug: "olives",
      sku: "PKT-ADD-001",
      name: "Olives",
      description: "Add-on item.",
      categorySlug: "add-ons",
      ingredients: ["Olives"],
      basePrice: 40,
      calories: 40,
      featured: false,
      bestSeller: false,
      sortOrder: 1,
      nutritionInfo: nutrition(40, 0, 2, 4),
      images: [{ url: "/images/loaded-fries.png", alt: "Olives", sortOrder: 1 }]
    },
    {
      slug: "mushrooms",
      sku: "PKT-ADD-002",
      name: "Mushrooms",
      description: "Add-on item.",
      categorySlug: "add-ons",
      ingredients: ["Mushrooms"],
      basePrice: 40,
      calories: 35,
      featured: false,
      bestSeller: false,
      sortOrder: 2,
      nutritionInfo: nutrition(35, 1, 4, 0),
      images: [{ url: "/images/loaded-fries.png", alt: "Mushrooms", sortOrder: 1 }]
    },
    {
      slug: "chicken-add-on",
      sku: "PKT-ADD-003",
      name: "Chicken",
      description: "Add-on item.",
      categorySlug: "add-ons",
      ingredients: ["Chicken"],
      basePrice: 90,
      calories: 120,
      featured: false,
      bestSeller: false,
      sortOrder: 3,
      nutritionInfo: nutrition(120, 14, 0, 5),
      images: [{ url: "/images/loaded-fries.png", alt: "Chicken add-on", sortOrder: 1 }]
    },
    {
      slug: "cheese",
      sku: "PKT-ADD-004",
      name: "Cheese",
      description: "Add-on item.",
      categorySlug: "add-ons",
      ingredients: ["Cheese"],
      basePrice: 40,
      calories: 80,
      featured: false,
      bestSeller: false,
      sortOrder: 4,
      nutritionInfo: nutrition(80, 4, 1, 6),
      images: [{ url: "/images/loaded-fries.png", alt: "Cheese", sortOrder: 1 }]
    },
    {
      slug: "classic-pocket-make-it-a-meal",
      sku: "PKT-ML-001",
      name: "Classic Pocket - Make It A Meal",
      description: "Classic Pocket bundled with fries and your drink pick.",
      categorySlug: "make-it-a-meal",
      ingredients: ["Chicken", "Classic shawarma sauce", "Iceberg", "Carrot", "Cucumber", "Cheese", "Fries", "Drink"],
      basePrice: 450,
      calories: 560,
      featured: true,
      bestSeller: false,
      sortOrder: 1,
      nutritionInfo: nutrition(560, 29, 41, 24),
      images: [{ url: "/images/classic-shawarma.png", alt: "Classic Pocket meal", sortOrder: 1 }]
    },
    {
      slug: "spicy-pocket-make-it-a-meal",
      sku: "PKT-ML-002",
      name: "Spicy Pocket - Make It A Meal",
      description: "Spicy Pocket bundled with fries and your drink pick.",
      categorySlug: "make-it-a-meal",
      ingredients: ["Chicken", "Spicy jalapeno sauce", "Iceberg", "Carrot", "Cucumber", "Cheese", "Fries", "Drink"],
      basePrice: 550,
      calories: 590,
      featured: true,
      bestSeller: false,
      sortOrder: 2,
      nutritionInfo: nutrition(590, 30, 42, 27),
      images: [{ url: "/images/spicy-shawarma.png", alt: "Spicy Pocket meal", sortOrder: 1 }]
    },
    {
      slug: "pocket-mai-rocket-make-it-a-meal",
      sku: "PKT-ML-003",
      name: "Pocket Mai Rocket - Make It A Meal",
      description: "Pocket Mai Rocket bundled with fries and your drink pick.",
      categorySlug: "make-it-a-meal",
      ingredients: ["Chicken", "Black olives", "Jalapeno", "Corn", "Mushrooms", "Cheese", "Fries", "Drink"],
      basePrice: 750,
      calories: 760,
      featured: true,
      bestSeller: false,
      sortOrder: 3,
      nutritionInfo: nutrition(760, 36, 45, 34),
      images: [{ url: "/images/pocket-mai-rocket-shawarma.png", alt: "Pocket Mai Rocket meal", sortOrder: 1 }]
    },
    {
      legacySlug: "coke",
      slug: "kiwi-passion",
      sku: "PKT-CHL-001",
      name: "Kiwi Passion",
      description: "Fruit chiller.",
      categorySlug: "chillers",
      ingredients: ["Kiwi", "Passion fruit"],
      basePrice: 400,
      calories: 220,
      featured: false,
      bestSeller: true,
      sortOrder: 1,
      nutritionInfo: nutrition(220, 1, 54, 0),
      images: [{ url: "/images/kiwi-passion-chiller.png", alt: "Kiwi Passion", sortOrder: 1 }]
    },
    {
      legacySlug: "sprite",
      slug: "strawberry-cherry",
      sku: "PKT-CHL-002",
      name: "Strawberry Cherry",
      description: "Fruit chiller.",
      categorySlug: "chillers",
      ingredients: ["Strawberry", "Cherry"],
      basePrice: 400,
      calories: 230,
      featured: false,
      bestSeller: false,
      sortOrder: 2,
      nutritionInfo: nutrition(230, 1, 56, 0),
      images: [{ url: "/images/strawberyy-cherry-chiller.png", alt: "Strawberry Cherry", sortOrder: 1 }]
    },
    {
      legacySlug: "mirinda",
      slug: "watermelon-guava",
      sku: "PKT-CHL-003",
      name: "Watermelon Guava",
      description: "Fruit chiller.",
      categorySlug: "chillers",
      ingredients: ["Watermelon", "Guava"],
      basePrice: 400,
      calories: 240,
      featured: false,
      bestSeller: false,
      sortOrder: 3,
      nutritionInfo: nutrition(240, 1, 58, 0),
      images: [{ url: "/images/watermelon-guava-chiller.png", alt: "Watermelon Guava", sortOrder: 1 }]
    },
    {
      slug: "chocolate",
      sku: "PKT-SHK-001",
      name: "Chocolate",
      description: "Ice cream shake.",
      categorySlug: "ice-cream-shakes",
      ingredients: ["Chocolate ice cream", "Milk"],
      basePrice: 300,
      calories: 410,
      featured: true,
      bestSeller: true,
      sortOrder: 1,
      nutritionInfo: nutrition(410, 8, 48, 18),
      images: [{ url: "/images/chocolate-shake.png", alt: "Chocolate shake", sortOrder: 1 }]
    },
    {
      slug: "vanilla",
      sku: "PKT-SHK-002",
      name: "Vanilla",
      description: "Ice cream shake.",
      categorySlug: "ice-cream-shakes",
      ingredients: ["Vanilla ice cream", "Milk"],
      basePrice: 300,
      calories: 390,
      featured: false,
      bestSeller: false,
      sortOrder: 2,
      nutritionInfo: nutrition(390, 7, 46, 16),
      images: [{ url: "/images/vanilla-shake.png", alt: "Vanilla shake", sortOrder: 1 }]
    },
    {
      slug: "mango",
      sku: "PKT-SHK-003",
      name: "Mango",
      description: "Ice cream shake.",
      categorySlug: "ice-cream-shakes",
      ingredients: ["Mango", "Ice cream", "Milk"],
      basePrice: 300,
      calories: 400,
      featured: false,
      bestSeller: true,
      sortOrder: 3,
      nutritionInfo: nutrition(400, 7, 49, 15),
      images: [{ url: "/images/vanilla-shake.png", alt: "Mango shake", sortOrder: 1 }]
    },
    {
      slug: "oreo",
      sku: "PKT-SHK-004",
      name: "Oreo",
      description: "Ice cream shake.",
      categorySlug: "ice-cream-shakes",
      ingredients: ["Oreo", "Ice cream", "Milk"],
      basePrice: 300,
      calories: 430,
      featured: false,
      bestSeller: false,
      sortOrder: 4,
      nutritionInfo: nutrition(430, 8, 52, 18),
      images: [{ url: "/images/oreo-shake-shake.png", alt: "Oreo shake", sortOrder: 1 }]
    },
    {
      slug: "strawberry",
      sku: "PKT-SHK-005",
      name: "Strawberry",
      description: "Ice cream shake.",
      categorySlug: "ice-cream-shakes",
      ingredients: ["Strawberry", "Ice cream", "Milk"],
      basePrice: 300,
      calories: 395,
      featured: false,
      bestSeller: false,
      sortOrder: 5,
      nutritionInfo: nutrition(395, 7, 47, 16),
      images: [{ url: "/images/strawberyy-cherry-chiller.png", alt: "Strawberry shake", sortOrder: 1 }]
    },
    {
      slug: "pepsi",
      sku: "PKT-SFT-001",
      name: "Pepsi",
      description: "Soft drink.",
      categorySlug: "soft-drinks",
      ingredients: ["Carbonated beverage"],
      basePrice: 100,
      calories: 140,
      featured: false,
      bestSeller: true,
      sortOrder: 1,
      nutritionInfo: nutrition(140, 0, 39, 0),
      images: [{ url: "/images/kiwi-passion-chiller.png", alt: "Pepsi", sortOrder: 1 }]
    },
    {
      slug: "seven-up",
      sku: "PKT-SFT-002",
      name: "7UP",
      description: "Soft drink.",
      categorySlug: "soft-drinks",
      ingredients: ["Carbonated beverage"],
      basePrice: 100,
      calories: 135,
      featured: false,
      bestSeller: false,
      sortOrder: 2,
      nutritionInfo: nutrition(135, 0, 38, 0),
      images: [{ url: "/images/kiwi-passion-chiller.png", alt: "7UP", sortOrder: 1 }]
    },
    {
      slug: "fanta",
      sku: "PKT-SFT-003",
      name: "Fanta",
      description: "Soft drink.",
      categorySlug: "soft-drinks",
      ingredients: ["Carbonated beverage"],
      basePrice: 100,
      calories: 145,
      featured: false,
      bestSeller: false,
      sortOrder: 3,
      nutritionInfo: nutrition(145, 0, 40, 0),
      images: [{ url: "/images/kiwi-passion-chiller.png", alt: "Fanta", sortOrder: 1 }]
    }
  ];

  const products = [];
  const retiredProductSlugs = [
    "garlic-mayo-fries",
    "masala-fries",
    "shawarma-drink-combo",
    "shawarma-fries-drink-combo"
  ];

  for (const seed of productSeeds) {
    const existingProduct =
      (await prisma.product.findUnique({ where: { slug: seed.slug } })) ??
      (seed.legacySlug ? await prisma.product.findUnique({ where: { slug: seed.legacySlug } }) : null);

    const product = existingProduct
      ? await prisma.product.update({
          where: { id: existingProduct.id },
          data: {
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
            nutritionInfo: seed.nutritionInfo,
            sortOrder: seed.sortOrder,
            isActive: true
          }
        })
      : await prisma.product.create({
          data: {
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
            nutritionInfo: seed.nutritionInfo,
            sortOrder: seed.sortOrder
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
      update: { price: seed.basePrice, isAvailable: true, stockStatus: "IN_STOCK" },
      create: { branchId: branch.id, productId: product.id, price: seed.basePrice, isAvailable: true, stockStatus: "IN_STOCK" }
    });

    const existingGroups = await prisma.addOnGroup.findMany({
      where: { productId: product.id },
      include: { options: true }
    });

    async function syncAddOnGroup(config: {
      name: string;
      minSelect: number;
      maxSelect: number;
      isRequired: boolean;
      sortOrder: number;
      options: Array<{ name: string; priceDelta: number; sortOrder: number }>;
    }) {
      const existingGroup = existingGroups.find((group) => group.name === config.name);
      const group = existingGroup
        ? await prisma.addOnGroup.update({
            where: { id: existingGroup.id },
            data: {
              minSelect: config.minSelect,
              maxSelect: config.maxSelect,
              isRequired: config.isRequired,
              sortOrder: config.sortOrder
            }
          })
        : await prisma.addOnGroup.create({
            data: {
              productId: product.id,
              name: config.name,
              minSelect: config.minSelect,
              maxSelect: config.maxSelect,
              isRequired: config.isRequired,
              sortOrder: config.sortOrder
            }
          });

      const existingOptions = existingGroup?.options ?? [];
      for (const option of config.options) {
        const existingOption = existingOptions.find((entry) => entry.name === option.name);
        if (existingOption) {
          await prisma.addOnOption.update({
            where: { id: existingOption.id },
            data: {
              priceDelta: option.priceDelta,
              sortOrder: option.sortOrder,
              isActive: true
            }
          });
        } else {
          await prisma.addOnOption.create({
            data: {
              groupId: group.id,
              name: option.name,
              priceDelta: option.priceDelta,
              sortOrder: option.sortOrder,
              isActive: true
            }
          });
        }
      }
    }

    if (seed.slug === "pocket-mai-rocket" || seed.slug === "pocket-mai-rocket-make-it-a-meal") {
      await syncAddOnGroup({
        name: "Choose Sauce",
        minSelect: 1,
        maxSelect: 1,
        isRequired: true,
        sortOrder: 1,
        options: [
          { name: "Classic shawarma sauce", priceDelta: 0, sortOrder: 1 },
          { name: "Spicy jalapeno sauce", priceDelta: 0, sortOrder: 2 }
        ]
      });
    }

    if (seed.slug === "loaded-fries") {
      await prisma.addOnGroup.deleteMany({
        where: {
          productId: product.id,
          name: "Extras"
        }
      });
    }

    if (seed.slug === "thela-fries") {
      await syncAddOnGroup({
        name: "Extras",
        minSelect: 0,
        maxSelect: 1,
        isRequired: false,
        sortOrder: 1,
        options: [{ name: "Garlic Mayo Sauce", priceDelta: 50, sortOrder: 1 }]
      });
    }

    if (seed.slug.endsWith("make-it-a-meal")) {
      await syncAddOnGroup({
        name: "Choose your meal pairing",
        minSelect: 1,
        maxSelect: 1,
        isRequired: true,
        sortOrder: seed.slug === "pocket-mai-rocket-make-it-a-meal" ? 2 : 1,
        options: mealSelectionOptions.map((option, index) => ({
          name: option.name,
          priceDelta: option.priceDelta,
          sortOrder: index + 1
        }))
      });
    }

    products.push(product);
  }

  await prisma.product.updateMany({
    where: { slug: { in: retiredProductSlugs } },
    data: { isActive: false }
  });

  const retiredProducts = await prisma.product.findMany({
    where: { slug: { in: retiredProductSlugs } },
    select: { id: true }
  });

  if (retiredProducts.length) {
    await prisma.branchProduct.updateMany({
      where: { branchId: branch.id, productId: { in: retiredProducts.map((product) => product.id) } },
      data: { isAvailable: false }
    });
  }

  const supplier = await prisma.supplier.upsert({
    where: { id: "default-supplier" },
    update: { name: "Capital Fresh Foods", phone: "+92-51-1111111" },
    create: { id: "default-supplier", name: "Capital Fresh Foods", phone: "+92-51-1111111" }
  });

  const ingredients = await Promise.all(
    INVENTORY_ITEMS.map((item) =>
      prisma.ingredient.upsert({
        where: { sku: item.sku },
        update: {
          name: item.name,
          unit: item.unit,
          type: item.type,
          reorderLevel: item.reorderLevel,
          costPerUnit: item.costPerUnit,
          caloriesPerUnit: item.caloriesPerUnit,
          supplierId: supplier.id
        },
        create: {
          sku: item.sku,
          name: item.name,
          unit: item.unit,
          type: item.type,
          reorderLevel: item.reorderLevel,
          costPerUnit: item.costPerUnit,
          caloriesPerUnit: item.caloriesPerUnit,
          supplierId: supplier.id
        }
      })
    )
  );

  const ingredientBySku = new Map(ingredients.map((ingredient) => [ingredient.sku, ingredient]));

  for (const item of INVENTORY_ITEMS) {
    const ingredient = ingredientBySku.get(item.sku);
    if (!ingredient) continue;

    const inventory = await prisma.branchInventory.upsert({
      where: { branchId_ingredientId: { branchId: branch.id, ingredientId: ingredient.id } },
      update: {
        quantityOnHand: item.openingStock,
        lowStockAlert: item.openingStock <= item.reorderLevel
      },
      create: {
        branchId: branch.id,
        ingredientId: ingredient.id,
        quantityOnHand: item.openingStock,
        lowStockAlert: item.openingStock <= item.reorderLevel
      }
    });

    await prisma.inventoryTransaction.deleteMany({
      where: {
        branchInventoryId: inventory.id,
        referenceType: "SEED"
      }
    });

    await prisma.inventoryTransaction.create({
      data: {
        branchInventoryId: inventory.id,
        actorId: admin.id,
        type: "PURCHASE",
        quantity: item.openingStock,
        balanceAfter: item.openingStock,
        note: "Opening stock seed",
        referenceType: "SEED"
      }
    });
  }

  for (const product of products) {
    const recipe = PRODUCT_RECIPE_BY_SLUG[product.slug] ?? [];

    for (const component of recipe) {
      const ingredient = ingredientBySku.get(component.ingredientSku);
      if (!ingredient) continue;

      await prisma.productIngredient.upsert({
        where: {
          productId_ingredientId: {
            productId: product.id,
            ingredientId: ingredient.id
          }
        },
        update: {
          quantityNeeded: component.quantity
        },
        create: {
          productId: product.id,
          ingredientId: ingredient.id,
          quantityNeeded: component.quantity
        }
      });
    }

  }

  for (const [preparedSku, recipe] of Object.entries(PREPARED_RECIPE_BY_SKU)) {
    const parent = ingredientBySku.get(preparedSku);
    if (!parent) continue;

    for (const component of recipe) {
      const ingredient = ingredientBySku.get(component.ingredientSku);
      if (!ingredient) continue;

      await prisma.ingredientComponent.upsert({
        where: {
          parentIngredientId_componentIngredientId: {
            parentIngredientId: parent.id,
            componentIngredientId: ingredient.id
          }
        },
        update: {
          quantityNeeded: component.quantity
        },
        create: {
          parentIngredientId: parent.id,
          componentIngredientId: ingredient.id,
          quantityNeeded: component.quantity
        }
      });
    }

  }

  const classicPocket = products.find((product) => product.slug === "classic-pocket");
  if (classicPocket) {
    await prisma.favorite.upsert({
      where: { userId_productId: { userId: customer.id, productId: classicPocket.id } },
      update: {},
      create: { userId: customer.id, productId: classicPocket.id }
    });

    await prisma.review.upsert({
      where: { id: "review-classic-pocket" },
      update: {
        userId: customer.id,
        productId: classicPocket.id,
        rating: 5,
        title: "High repeat order potential",
        body: "Classic Pocket stays crisp and balanced on repeat orders."
      },
      create: {
        id: "review-classic-pocket",
        userId: customer.id,
        productId: classicPocket.id,
        rating: 5,
        title: "High repeat order potential",
        body: "Classic Pocket stays crisp and balanced on repeat orders."
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

  if (classicPocket) {
    await prisma.cartItem.upsert({
      where: { id: "demo-cart-item" },
      update: {
        cartId: cart.id,
        productId: classicPocket.id,
        quantity: 2,
        selectedAddOnIds: []
      },
      create: {
        id: "demo-cart-item",
        cartId: cart.id,
        productId: classicPocket.id,
        quantity: 2,
        selectedAddOnIds: []
      }
    });
  }

  const classicPocketOrder = classicPocket;
  const customerAddress = await prisma.address.findFirstOrThrow({ where: { userId: customer.id, isDefault: true } });
  const launchCoupon = await prisma.coupon.findUniqueOrThrow({ where: { code: "POCKET10" } });

  if (classicPocketOrder) {
    await prisma.order.upsert({
      where: { orderNumber: "PKT-2026-000123" },
      update: {
        customerId: customer.id,
        branchId: branch.id,
        addressId: customerAddress.id,
        couponId: launchCoupon.id,
        paymentMethod: PaymentMethod.CASH_ON_DELIVERY,
        paymentStatus: PaymentStatus.PENDING,
        channel: "ONLINE",
        serviceType: "DELIVERY",
        customerName: customer.name,
        customerPhone: customer.phone,
        subtotal: classicPocketOrder.basePrice,
        taxRate: 12,
        taxAmount: 54,
        deliveryFee: 180,
        discountAmount: 0,
        totalAmount: 684,
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
        channel: "ONLINE",
        serviceType: "DELIVERY",
        customerName: customer.name,
        customerPhone: customer.phone,
        subtotal: classicPocketOrder.basePrice,
        taxRate: 12,
        taxAmount: 54,
        deliveryFee: 180,
        discountAmount: 0,
        totalAmount: 684,
        status: "OUT_FOR_DELIVERY",
        expectedDeliveryAt: new Date(Date.now() + 25 * 60 * 1000),
        items: {
          create: [
            {
              productId: classicPocketOrder.id,
              productName: classicPocketOrder.name,
              quantity: 1,
              unitPrice: classicPocketOrder.basePrice
            }
          ]
        }
      }
    });
  }

  await Promise.all([
    prisma.expense.upsert({
      where: { id: "expense-opening-stock" },
      update: {
        branchId: branch.id,
        createdById: admin.id,
        title: "Opening stock purchase",
        category: "Inventory",
        amount: 18500,
        expenseDate: new Date("2026-06-15T10:00:00Z"),
        vendor: supplier.name,
        billReference: "INV-1001",
        notes: "Initial ingredient and packaging buy-in."
      },
      create: {
        id: "expense-opening-stock",
        branchId: branch.id,
        createdById: admin.id,
        title: "Opening stock purchase",
        category: "Inventory",
        amount: 18500,
        expenseDate: new Date("2026-06-15T10:00:00Z"),
        vendor: supplier.name,
        billReference: "INV-1001",
        notes: "Initial ingredient and packaging buy-in."
      }
    }),
    prisma.expense.upsert({
      where: { id: "expense-utility-bill" },
      update: {
        branchId: branch.id,
        createdById: admin.id,
        title: "Electricity bill",
        category: "Utilities",
        amount: 6200,
        expenseDate: new Date("2026-06-17T18:00:00Z"),
        vendor: "IESCO",
        billReference: "UTIL-204",
        notes: "June billing cycle."
      },
      create: {
        id: "expense-utility-bill",
        branchId: branch.id,
        createdById: admin.id,
        title: "Electricity bill",
        category: "Utilities",
        amount: 6200,
        expenseDate: new Date("2026-06-17T18:00:00Z"),
        vendor: "IESCO",
        billReference: "UTIL-204",
        notes: "June billing cycle."
      }
    })
  ]);

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
        message: "Chicken stock needs review at G-11 Markaz.",
        userId: admin.id,
        metadata: { ingredient: "Chicken", branch: branch.name }
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

  await prisma.setting.upsert({
    where: { key: "system.seed.version" },
    update: {
      value: {
        version: seedVersion,
        seededAt: new Date().toISOString()
      }
    },
    create: {
      key: "system.seed.version",
      value: {
        version: seedVersion,
        seededAt: new Date().toISOString()
      }
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

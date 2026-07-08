const imageMap: Record<string, string> = {
  "/images/hero-pocket.svg": "/images/pocket-mai-rocket-shawarma.png",
  "/images/shawarma-pocket.svg": "/images/classic-shawarma.png",
  "/images/shawarma-beef.svg": "/images/spicy-shawarma.png",
  "/images/pocket-special.svg": "/images/pocket-mai-rocket-shawarma.png",
  "/images/loaded-fries.svg": "/images/loaded-fries.png",
  "/images/combo-meal.svg": "/images/pocket-mai-rocket-shawarma.png",
  "/images/brand-grid.svg": "/images/loaded-fries.png",
  "/images/pocket-drink.svg": "/images/kiwi-passion-chiller.png",
  "/images/pocket-combo.svg": "/images/chocolate-shake.png"
};

const uploadedImagePattern = /^\/images\/(.+-[0-9a-z]+-[0-9a-f]{8}\.(png|jpg|jpeg))$/i;

export function resolvePocketImagePath(path?: string | null, fallback = "/images/classic-shawarma.png") {
  if (!path) {
    return fallback;
  }

  if (path.startsWith("http://") || path.startsWith("https://")) {
    return path;
  }

  if (path.endsWith(".png") || path.endsWith(".webp") || path.endsWith(".jpg") || path.endsWith(".jpeg")) {
    const uploadedMatch = path.match(uploadedImagePattern);
    if (uploadedMatch) {
      return `/uploads/images/${uploadedMatch[1]}`;
    }
    return path;
  }

  return imageMap[path] ?? path;
}

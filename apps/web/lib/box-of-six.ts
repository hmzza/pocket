export const BOX_OF_SIX_SIZE = 6;
export const BOX_OF_SIX_GROUP_NAME = "Choose your box items";

function normalize(value: string | null | undefined) {
  return (value ?? "").trim().toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

export function isBoxOfSixProduct(product: { name?: string | null; slug?: string | null }) {
  const name = normalize(product.name);
  const slug = normalize(product.slug);
  return /\bbox of 6\b/.test(name) || /\bbox 6\b/.test(name) || slug === "box-of-6" || slug === "box-6" || /\bbox of 6\b/.test(slug) || /\bbox 6\b/.test(slug);
}

export function isBoxOfSixGroup(group: { name?: string | null }) {
  return normalize(group.name) === normalize(BOX_OF_SIX_GROUP_NAME);
}

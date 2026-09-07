export type DisplayBundleComponent = {
  productName: string;
  quantity: number;
};

type SelectionGroup = "Rocket sauces" | "Pockets" | "Wraps" | "Drinks";

const selectionPatterns: Array<{ label: SelectionGroup; pattern: RegExp }> = [
  { label: "Rocket sauces", pattern: /^Rocket\s+\d+\s+sauce:\s*(.+)$/i },
  { label: "Pockets", pattern: /^Pocket\s+\d+:\s*(.+)$/i },
  { label: "Wraps", pattern: /^Wrap\s+\d+:\s*(.+)$/i },
  { label: "Drinks", pattern: /^Drink\s+\d+:\s*(.+)$/i }
];

const selectionOrder: SelectionGroup[] = ["Rocket sauces", "Pockets", "Wraps", "Drinks"];

function parseSelection(name: string) {
  for (const entry of selectionPatterns) {
    const match = name.match(entry.pattern);
    if (match?.[1]) return { label: entry.label, name: match[1].trim() };
  }
  return null;
}

function countedList(values: string[], multiplier: number) {
  const counts = new Map<string, number>();
  for (const value of values) counts.set(value, (counts.get(value) ?? 0) + multiplier);
  return Array.from(counts, ([name, count]) => `${count}× ${name}`).join(", ");
}

export function hasDealSelections(optionNames: string[]) {
  return optionNames.some((name) => parseSelection(name) !== null);
}

export function formatSelectionLines(optionNames: string[], multiplier = 1) {
  const groups = new Map<SelectionGroup, string[]>();
  const regular: string[] = [];

  for (const optionName of optionNames) {
    const parsed = parseSelection(optionName);
    if (!parsed) {
      regular.push(optionName);
      continue;
    }
    groups.set(parsed.label, [...(groups.get(parsed.label) ?? []), parsed.name]);
  }

  return [
    ...selectionOrder.flatMap((label) => {
      const values = groups.get(label);
      return values?.length ? [`${label}: ${countedList(values, multiplier)}`] : [];
    }),
    ...(regular.length ? [`Options: ${regular.join(", ")}`] : [])
  ];
}

export function formatBundleSummary(components: DisplayBundleComponent[], multiplier = 1) {
  return components.map((component) => `${component.quantity * multiplier}× ${component.productName}`).join(", ");
}

/**
 * Builds one readable item summary and removes deal choices from the component
 * list when the API has also materialized those choices as bundle components.
 */
export function formatItemDetailLines(
  components: DisplayBundleComponent[],
  optionNames: string[],
  { componentMultiplier = 1, selectionMultiplier = 1 }: { componentMultiplier?: number; selectionMultiplier?: number } = {}
) {
  const dealSelections = optionNames.map(parseSelection).filter((value): value is NonNullable<typeof value> => Boolean(value));
  let fixedComponents = components.map((component) => ({
    productName: component.productName,
    quantity: component.quantity * componentMultiplier
  }));

  if (dealSelections.length) {
    const selectedProducts = new Map<string, number>();
    for (const selection of dealSelections) {
      if (selection.label === "Rocket sauces") continue;
      selectedProducts.set(selection.name, (selectedProducts.get(selection.name) ?? 0) + selectionMultiplier);
    }

    fixedComponents = fixedComponents.flatMap((component) => {
      const selectedQuantity = selectedProducts.get(component.productName) ?? 0;
      const remaining = Math.max(0, component.quantity - selectedQuantity);
      return remaining ? [{ ...component, quantity: remaining }] : [];
    });
  }

  return [
    ...(fixedComponents.length ? [`Includes: ${formatBundleSummary(fixedComponents)}`] : []),
    ...formatSelectionLines(optionNames, selectionMultiplier)
  ];
}

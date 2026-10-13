import type { FinanceDatabase } from "./storage/database";

export const HOME_VISUALIZATIONS = [
  { id: "activity", label: "Spending activity tiles" },
  { id: "summary", label: "Income and expense summary" },
  { id: "balances", label: "Where your money is" },
  { id: "categories", label: "Spending by category chart" },
  { id: "budgets", label: "Budget overview" },
  { id: "trend", label: "Spending trend" },
  { id: "comparison", label: "Income vs. expenses" },
] as const;
export type HomeVisualization = (typeof HOME_VISUALIZATIONS)[number]["id"];
export const DEFAULT_HOME_VISUALIZATIONS: HomeVisualization[] = [
  "activity",
  "summary",
  "categories",
  "budgets",
];
export function validateHomeVisualizations(
  value: unknown,
): HomeVisualization[] {
  if (
    !Array.isArray(value) ||
    new Set(value).size !== value.length ||
    value.some((id) => !HOME_VISUALIZATIONS.some((option) => option.id === id))
  )
    throw new Error("Choose valid Home visualizations.");
  return HOME_VISUALIZATIONS.filter((option) => value.includes(option.id)).map(
    (option) => option.id,
  );
}
export function readHomeVisualizations(value?: string): HomeVisualization[] {
  try {
    return value === undefined
      ? [...DEFAULT_HOME_VISUALIZATIONS]
      : validateHomeVisualizations(JSON.parse(value));
  } catch {
    return [...DEFAULT_HOME_VISUALIZATIONS];
  }
}

export async function loadHomeVisualizations(
  db: FinanceDatabase,
): Promise<HomeVisualization[]> {
  const saved = await db.getFirstAsync<{ value: string }>(
    "SELECT value FROM preferences WHERE key = 'homeVisualizations'",
  );
  return readHomeVisualizations(saved?.value);
}
export async function saveHomeVisualizations(
  db: FinanceDatabase,
  selected: readonly HomeVisualization[],
): Promise<void> {
  const value = JSON.stringify(validateHomeVisualizations(selected));
  await db.runAsync(
    "INSERT INTO preferences(key, value) VALUES ('homeVisualizations', ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value",
    value,
  );
}

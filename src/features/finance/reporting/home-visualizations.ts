import type { FinanceDatabase } from "../storage/database";

export const HOME_VISUALIZATIONS = [
  { id: "activity", label: "Spending activity tiles", description: "See which days had more spending." },
  { id: "summary", label: "Income and expense summary", description: "See income, expenses, and their difference for the selected period." },
  { id: "balances", label: "Where your money is", description: "See where your money is held across your accounts." },
  { id: "categories", label: "Spending by category chart", description: "Explore spending by category and view its transactions." },
  { id: "budgets", label: "Budget overview", description: "Track spending against your current budget limits." },
  { id: "daily-spending", label: "Daily spending bar chart", description: "Compare spending amounts by day." },
  { id: "trend", label: "Spending trend", description: "Follow how daily spending changes over time." },
  { id: "comparison", label: "Income vs. expenses", description: "Compare income and expenses across recent months." },
] as const;
export type HomeVisualization = (typeof HOME_VISUALIZATIONS)[number]["id"];
export const DEFAULT_HOME_VISUALIZATIONS: HomeVisualization[] = [];
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

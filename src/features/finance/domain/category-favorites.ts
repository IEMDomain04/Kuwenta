import { CATEGORIES } from './types';
export type FavoriteKind = 'INCOME' | 'EXPENSE';
export function readCategoryFavorites(value: string | null, kind: FavoriteKind): string[] {
  try {
    const parsed: unknown = JSON.parse(value ?? '[]');
    return Array.isArray(parsed) ? [...new Set(parsed.filter((item): item is string => typeof item === 'string' && (CATEGORIES[kind] as readonly string[]).includes(item)))].slice(0, 10) : [];
  } catch { return []; }
}

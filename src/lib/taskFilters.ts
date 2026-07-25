import type {CategoryDef, Task} from "../types";
import {FALLBACK_CATEGORY_ID} from "../types";

export interface TaskFilterValues {
  query: string;
  categories: string[];
}

export type SortDirection = "asc" | "desc";
const LEVEL_RANK = {low: 0, medium: 1, high: 2};

export function availableTaskCategories(tasks: Task[], categories: CategoryDef[]): CategoryDef[] {
  const usedCategoryIds = new Set(tasks.map((task) => task.category));
  return categories
    .filter((category) => usedCategoryIds.has(category.id))
    .sort((left, right) => {
      if (left.id === FALLBACK_CATEGORY_ID) return right.id === FALLBACK_CATEGORY_ID ? 0 : 1;
      if (right.id === FALLBACK_CATEGORY_ID) return -1;
      return left.label.localeCompare(right.label, undefined, {sensitivity: "base"});
    });
}

export function filterTasksByRecentDays(tasks: Task[], days: number | null, now = Date.now()): Task[] {
  if (days == null) return tasks;
  const cutoff = now - days * 86_400_000;
  return tasks.filter((task) => task.updatedAt >= cutoff);
}

export function sortTasksByPriorityAndEffort(
  tasks: Task[],
  priorityDirection: SortDirection,
  effortDirection: SortDirection,
): Task[] {
  return [...tasks].sort((left, right) => {
    const priorityDifference = LEVEL_RANK[left.risk] - LEVEL_RANK[right.risk];
    if (priorityDifference !== 0) return priorityDirection === "desc" ? -priorityDifference : priorityDifference;

    const effortDifference = LEVEL_RANK[left.effort] - LEVEL_RANK[right.effort];
    return effortDirection === "desc" ? -effortDifference : effortDifference;
  });
}

export function filterTasks(tasks: Task[], filters: TaskFilterValues): Task[] {
  const query = filters.query.trim().toLowerCase();
  const availableCategoryIds = new Set(tasks.map((task) => task.category));
  const selectedCategoryIds = new Set(filters.categories.filter((id) => availableCategoryIds.has(id)));

  return tasks.filter((task) => {
    if (selectedCategoryIds.size > 0 && !selectedCategoryIds.has(task.category)) return false;
    if (!query) return true;

    return [task.title, task.description, ...task.tags, task.assignee?.name ?? "", task.assignee?.login ?? ""]
      .join(" ")
      .toLowerCase()
      .includes(query);
  });
}

import type {CategoryDef, Task} from "../types";

export interface TaskFilterValues {
  query: string;
  categories: string[];
}

export function availableTaskCategories(tasks: Task[], categories: CategoryDef[]): CategoryDef[] {
  const usedCategoryIds = new Set(tasks.map((task) => task.category));
  return categories.filter((category) => usedCategoryIds.has(category.id));
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

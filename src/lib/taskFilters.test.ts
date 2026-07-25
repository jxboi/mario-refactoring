import {describe, expect, it} from "vitest";
import {newTask} from "./store";
import {availableTaskCategories, filterTasks} from "./taskFilters";
import {TASK_CATEGORIES} from "../types";

const tasks = [
  {...newTask(), id: "bug", title: "Fix checkout", category: "bug"},
  {...newTask(), id: "docs", title: "Write guide", category: "documentation"},
  {...newTask(), id: "other", title: "Call support", category: "other"},
];

describe("task category filters", () => {
  it("only offers categories used by at least one task", () => {
    expect(availableTaskCategories(tasks, TASK_CATEGORIES).map((category) => category.id)).toEqual([
      "bug",
      "documentation",
      "other",
    ]);
  });

  it("sorts categories alphabetically with Other last", () => {
    const categories = [
      {id: "research", label: "Research", glyph: "R", groupId: "general"},
      {id: "other", label: "Other", glyph: "·", groupId: "general"},
      {id: "feature", label: "Feature", glyph: "F", groupId: "general"},
    ];
    const categoryTasks = categories.map((category) => ({
      ...newTask(),
      id: category.id,
      category: category.id,
    }));

    expect(availableTaskCategories(categoryTasks, categories).map((category) => category.label)).toEqual([
      "Feature",
      "Research",
      "Other",
    ]);
  });

  it("shows tasks from any selected category and combines with search", () => {
    expect(filterTasks(tasks, {query: "", categories: ["bug", "documentation"]}).map((task) => task.id)).toEqual([
      "bug",
      "docs",
    ]);
    expect(filterTasks(tasks, {query: "guide", categories: ["bug", "documentation"]}).map((task) => task.id)).toEqual([
      "docs",
    ]);
  });

  it("ignores a selected category after its last task is removed", () => {
    expect(filterTasks(tasks, {query: "", categories: ["feature"]})).toEqual(tasks);
  });
});

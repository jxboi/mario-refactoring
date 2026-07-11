import {describe, expect, it} from "vitest";
import {PLAN_CATEGORIES} from "../types";
import {parseRefactorJson, readProjectType} from "./parse";

describe("project type parsing", () => {
  it("recognizes new and legacy project type names", () => {
    expect(readProjectType(JSON.stringify({type: "planning", items: []}))).toBe("plan");
    expect(readProjectType(JSON.stringify({type: "coding", items: []}))).toBe("coding");
    expect(readProjectType(JSON.stringify({type: "refactoring", items: []}))).toBe("coding");
  });

  it("uses Plan stage labels and retains parent ids for destination validation", () => {
    const result = parseRefactorJson(JSON.stringify({type: "plan", items: [{title: "Launch", status: "ready", parentIds: ["one", "one"]}]}), PLAN_CATEGORIES);
    expect(result.rows[0].item?.stage).toBe("reviewing");
    expect(result.rows[0].item?.parentIds).toEqual(["one"]);
  });
});

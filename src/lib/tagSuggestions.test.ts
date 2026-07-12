import {describe,expect,it} from "vitest";
import {tagSuggestions} from "./tagSuggestions";

describe("smart tag suggestions",()=>{
  it("returns tags tailored to a built-in category",()=>{
    expect(tagSuggestions("bug",[])).toEqual(["defect","regression","needs-triage"]);
  });

  it("uses the category name and group for custom categories",()=>{
    expect(tagSuggestions("security-review",[{id:"security-review",label:"Security Review",glyph:"·",groupId:"work"}]))
      .toEqual(["security-review","action-item","delivery"]);
  });
});

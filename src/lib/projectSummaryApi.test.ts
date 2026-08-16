import {beforeEach, describe, expect, it, vi} from "vitest";
import {summariseProject} from "./projectSummaryApi";

describe("project summary API client", () => {
  beforeEach(() => vi.restoreAllMocks());

  it("posts only workspace and project identifiers", async () => {
    const fetchMock = vi.fn(async () => ({ok: true, status: 200, json: async () => ({summary: "AI project summary\n\nOverview\nReady."})}));
    vi.stubGlobal("fetch", fetchMock);
    await expect(summariseProject("workspace-1", "project-1")).resolves.toContain("Overview");
    expect(fetchMock).toHaveBeenCalledWith("/api/project-summary", expect.objectContaining({method: "POST", body: JSON.stringify({workspaceId: "workspace-1", projectId: "project-1"})}));
  });

  it("surfaces server errors and rejects empty summaries", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ok: false, status: 502, json: async () => ({error: "AI summary service is unavailable."})})));
    await expect(summariseProject("workspace-1", "project-1")).rejects.toThrow("AI summary service is unavailable");
    vi.stubGlobal("fetch", vi.fn(async () => ({ok: true, status: 200, json: async () => ({summary: ""})})));
    await expect(summariseProject("workspace-1", "project-1")).rejects.toThrow("empty");
  });
});

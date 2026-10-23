import {describe, expect, it, vi} from "vitest";
import {newProject, newWorkspace, type AppState} from "../../src/lib/store.js";
import {createProjectSummaryHandler} from "../../api/project-summary.js";
import type {BodyRequest} from "../../api/_http.js";
import type {ApiResponse} from "../../api/_auth.js";

function response() {
  const result = {statusCode: 0, body: undefined as unknown, headers: {} as Record<string, string | string[]>};
  const res: ApiResponse = {
    setHeader: (name, value) => { result.headers[name] = value; },
    status: (code) => { result.statusCode = code; return res; },
    json: (body) => { result.body = body; },
    end: () => undefined,
  };
  return {res, result};
}

function state(editor = false): AppState {
  const project = {...newProject("Launch"), id: "project-1", ...(editor ? {collaboration: {shareId: "share-1", ownerId: "github:1", ownerLogin: "octocat", role: "editor" as const, version: 1}} : {})};
  const workspace = {...newWorkspace("Product"), id: editor ? "shared:share-1" : "workspace-1", projects: [project]};
  return {workspaces: [workspace], activeWorkspaceId: workspace.id};
}

function request(body: unknown, method = "POST"): BodyRequest {
  return {method, headers: {}, body} as BodyRequest;
}

describe("project summary endpoint", () => {
  it("allows only POST", async () => {
    const authenticate = vi.fn(async () => "github:1");
    const handler = createProjectSummaryHandler({authenticate, loadState: vi.fn(), generate: vi.fn()});
    const {res, result} = response();
    await handler(request(null, "GET"), res);
    expect(result).toMatchObject({statusCode: 405, body: {error: "Method not allowed."}});
    expect(result.headers.Allow).toBe("POST");
    expect(authenticate).not.toHaveBeenCalled();
  });

  it("returns authentication errors without loading project data", async () => {
    const loadState = vi.fn();
    const handler = createProjectSummaryHandler({authenticate: vi.fn(async () => { throw Object.assign(new Error("Sign in required."), {status: 401}); }), loadState, generate: vi.fn()});
    const {res, result} = response();
    await handler(request({workspaceId: "workspace-1", projectId: "project-1"}), res);
    expect(result).toMatchObject({statusCode: 401, body: {error: "Sign in required."}});
    expect(loadState).not.toHaveBeenCalled();
  });

  it.each([{editor: false, workspaceId: "workspace-1"}, {editor: true, workspaceId: "shared:share-1"}])("generates for accessible owner/editor projects", async ({editor, workspaceId}) => {
    const generate = vi.fn(async () => "AI project summary\n\nOverview\nReady to ship.");
    const handler = createProjectSummaryHandler({authenticate: vi.fn(async () => "github:2"), loadState: vi.fn(async () => state(editor)), generate});
    const {res, result} = response();
    await handler(request({workspaceId, projectId: "project-1"}), res);
    expect(result).toMatchObject({statusCode: 200, body: {summary: "AI project summary\n\nOverview\nReady to ship."}});
    expect(generate).toHaveBeenCalledWith(expect.objectContaining({id: "project-1"}), expect.any(Array));
  });

  it("does not reveal inaccessible projects", async () => {
    const generate = vi.fn();
    const handler = createProjectSummaryHandler({authenticate: vi.fn(async () => "github:2"), loadState: vi.fn(async () => state()), generate});
    const {res, result} = response();
    await handler(request({workspaceId: "workspace-1", projectId: "other"}), res);
    expect(result).toMatchObject({statusCode: 404, body: {error: "Project not found."}});
    expect(generate).not.toHaveBeenCalled();
  });

  it("maps provider and empty-output failures to a safe service error", async () => {
    for (const generate of [vi.fn(async () => { throw new Error("secret provider detail"); }), vi.fn(async () => "")]) {
      const handler = createProjectSummaryHandler({authenticate: vi.fn(async () => "github:1"), loadState: vi.fn(async () => state()), generate});
      const {res, result} = response();
      await handler(request({workspaceId: "workspace-1", projectId: "project-1"}), res);
      expect(result).toMatchObject({statusCode: 502, body: {error: "AI summary service is unavailable."}});
      expect(JSON.stringify(result.body)).not.toContain("secret provider detail");
    }
  });
});

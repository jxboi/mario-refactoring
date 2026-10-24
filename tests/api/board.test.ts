import {afterEach, beforeEach, describe, expect, it, vi} from "vitest";
import handler from "../../api/board.js";
import type {ApiResponse} from "../../api/_auth.js";
import type {BodyRequest} from "../../api/_http.js";
import {fetchRemoteBoard, saveRemoteBoard} from "../../src/lib/remoteBoard.js";
import {newProject, newWorkspace, type AppState} from "../../src/lib/store.js";

const db = vi.hoisted(() => ({query: vi.fn(), ensureSchema: vi.fn()}));
vi.mock("../../api/_db.js", () => ({getQuery: () => db.query, ensureSchema: db.ensureSchema}));
vi.mock("../../api/_automationQueue.js", () => ({dispatchPendingRuns: vi.fn(async () => {})}));

interface Snapshot {state: AppState; version: number; updated_at: string;}
const boards = new Map<string, Snapshot>();
const profiles: string[] = [];

function state(): AppState {
  const workspace = newWorkspace("Sync test");
  workspace.projects = [newProject("Initial project")];
  return {workspaces: [workspace], activeWorkspaceId: workspace.id};
}

async function invoke(method: string, headers: Record<string, string>, body?: unknown) {
  let status = 200, result: unknown;
  const responseHeaders = new Headers();
  const response: ApiResponse = {
    setHeader(name, value) {responseHeaders.set(name, Array.isArray(value) ? value.join(", ") : value);},
    status(value) {status = value; return response;},
    json(value) {result = value;},
    end() {},
  };
  await handler({method, headers, body, async *[Symbol.asyncIterator]() {}} as BodyRequest, response);
  return Response.json(result, {status, headers: responseHeaders});
}

beforeEach(() => {
  boards.clear();
  profiles.length = 0;
  db.query.mockReset();
  db.ensureSchema.mockReset();
  // Only external boundaries are simulated: GitHub, Postgres and queue dispatch.
  // The client, endpoint, authentication, normalization and collaboration code run.
  db.query.mockImplementation(async (parts: TemplateStringsArray, ...values: unknown[]) => {
    const query = parts.join("?").replace(/\s+/g, " ").trim();
    if (query.startsWith("insert into user_profiles")) {profiles.push(String(values[0])); return [];}
    if (query.includes("from project_members")) return [];
    if (query.includes("from automation_rules")) return [];
    if (query.startsWith("select state, version, updated_at from boards")) {
      const row = boards.get(String(values[0]));
      return row && (values.length === 1 || row.version === values[1]) ? [structuredClone(row)] : [];
    }
    if (query.startsWith("insert into boards")) {
      const userId = String(values[0]);
      if (boards.has(userId)) return [];
      const row = {state: JSON.parse(String(values[1])), version: 1, updated_at: new Date().toISOString()};
      boards.set(userId, row);
      return [structuredClone(row)];
    }
    if (query.startsWith("with updated_board as")) {
      const userId = String(values[1]), row = boards.get(userId);
      if (!row || row.version !== values[2]) return [];
      const next = {state: JSON.parse(String(values[0])), version: row.version + 1, updated_at: new Date().toISOString()};
      boards.set(userId, next);
      return [structuredClone(next)];
    }
    throw new Error(`Unexpected test query: ${query}`);
  });
  vi.stubGlobal("fetch", vi.fn(async (url: string, init?: RequestInit) => {
    if (url === "https://api.github.com/user") {
      const token = new Headers(init?.headers).get("authorization");
      const id = token === "Bearer alice-test-token" ? 1 : token === "Bearer bob-test-token" ? 2 : null;
      return id ? Response.json({id, login: id === 1 ? "alice" : "bob"}) : Response.json({}, {status: 401});
    }
    expect(url).toBe("/api/board");
    const headers = Object.fromEntries(new Headers(init?.headers).entries());
    return invoke(init?.method ?? "GET", headers, init?.body);
  }));
});

afterEach(() => {vi.unstubAllGlobals(); vi.restoreAllMocks();});

describe("authenticated board sync (simulated external services)", () => {
  it("creates, reads, updates and reads back through the real client and handler", async () => {
    const empty = await fetchRemoteBoard("alice-test-token");
    expect(empty).toEqual({state: null, version: 0, updatedAt: null});
    const initial = state();
    const created = await saveRemoteBoard("alice-test-token", initial, empty.version);
    expect(created.version).toBe(1);
    expect((await fetchRemoteBoard("alice-test-token")).state).toEqual(created.state);
    const edited = structuredClone(created.state!);
    edited.workspaces[0].projects[0].title = "Saved after editing";
    const saved = await saveRemoteBoard("alice-test-token", edited, created.version);
    const reloaded = await fetchRemoteBoard("alice-test-token");
    expect(reloaded).toEqual(saved);
    expect(reloaded.version).toBe(2);
    expect(reloaded.state?.workspaces[0].projects[0].title).toBe("Saved after editing");
    expect(profiles.every(id => id === "github:1")).toBe(true);
  });

  it("rejects a stale save and returns canonical state without overwriting it", async () => {
    const created = await saveRemoteBoard("alice-test-token", state(), 0);
    const edited = structuredClone(created.state!);
    edited.workspaces[0].name = "Newer session";
    const saved = await saveRemoteBoard("alice-test-token", edited, 1);
    await expect(saveRemoteBoard("alice-test-token", created.state!, 1)).rejects.toMatchObject({status: 409, remote: saved});
    expect(await fetchRemoteBoard("alice-test-token")).toEqual(saved);
  });

  it("isolates boards by authenticated GitHub identity", async () => {
    const alice = await saveRemoteBoard("alice-test-token", state(), 0);
    expect((await fetchRemoteBoard("bob-test-token")).state).toBeNull();
    const bob = state();
    bob.workspaces[0].name = "Bob's workspace";
    await saveRemoteBoard("bob-test-token", bob, 0);
    expect(await fetchRemoteBoard("alice-test-token")).toEqual(alice);
    expect((await fetchRemoteBoard("bob-test-token")).state?.workspaces[0].name).toBe("Bob's workspace");
  });

  it("accepts the session cookie used by the browser", async () => {
    const result = await invoke("GET", {cookie: "chisel_github_session=alice-test-token"});
    expect(result.status).toBe(200);
    expect(result.headers.get("cache-control")).toBe("no-store");
    expect(profiles).toEqual(["github:1"]);
  });

  it.each([null, "invalid-test-token"])("rejects missing/invalid credentials before database access: %s", async token => {
    await expect(fetchRemoteBoard(token)).rejects.toMatchObject({status: 401});
    expect(db.ensureSchema).not.toHaveBeenCalled();
    expect(db.query).not.toHaveBeenCalled();
  });

  it("rejects invalid state without replacing an existing board", async () => {
    const saved = await saveRemoteBoard("alice-test-token", state(), 0);
    const result = await invoke("PUT", {authorization: "Bearer alice-test-token"}, {state: {}, baseVersion: 1});
    expect(result.status).toBe(400);
    expect(await fetchRemoteBoard("alice-test-token")).toEqual(saved);
  });

  it("reports a storage failure without claiming success or exposing details", async () => {
    vi.spyOn(console, "error").mockImplementation(() => {});
    db.ensureSchema.mockRejectedValueOnce(new Error("private database connection detail"));
    await expect(fetchRemoteBoard("alice-test-token")).rejects.toMatchObject({status: 500, message: "Board storage is unavailable."});
    expect(boards.size).toBe(0);
  });
});

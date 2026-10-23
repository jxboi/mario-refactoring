import {readFileSync, readdirSync} from "node:fs";
import {join} from "node:path";
import {afterEach, describe, expect, it, vi} from "vitest";
import auth from "../../api/auth/[action].js";
import automation from "../../api/automation/[action].js";
import type {ApiResponse} from "../../api/_auth.js";
import type {BodyRequest} from "../../api/_http.js";

function request(action: string, method = "GET"): BodyRequest {
  return {
    method, headers: {}, query: {action},
    async *[Symbol.asyncIterator]() {},
  };
}

function response() {
  const result = {status: 0, body: undefined as unknown, headers: new Map<string, string | string[]>()};
  const res: ApiResponse = {
    setHeader(name, value) { result.headers.set(name.toLowerCase(), value); },
    status(code) { result.status = code; return res; },
    json(body) { result.body = body; },
    end() {},
  };
  return {result, res};
}

afterEach(() => { vi.unstubAllEnvs(); });

describe("consolidated authentication", () => {
  it("returns a signed-out session without contacting GitHub", async () => {
    const {result, res} = response();
    await auth(request("session"), res);
    expect(result.status).toBe(200);
    expect(result.body).toEqual({user: null});
    expect(result.headers.get("cache-control")).toBe("no-store");
  });

  it("preserves the GitHub callback URL and state cookie", async () => {
    vi.stubEnv("GITHUB_CLIENT_ID", "routing-test-client");
    vi.stubEnv("GITHUB_REDIRECT_URI", "https://example.com/api/auth/callback");
    const {result, res} = response();
    await auth(request("start"), res);
    expect(result.status).toBe(302);
    const location = result.headers.get("location");
    if (typeof location !== "string") throw new Error("Missing OAuth redirect");
    const url = new URL(location);
    expect(url.origin).toBe("https://github.com");
    expect(url.searchParams.get("client_id")).toBe("routing-test-client");
    expect(url.searchParams.get("redirect_uri")).toBe("https://example.com/api/auth/callback");
    expect(result.headers.get("set-cookie")).toContain(url.searchParams.get("state"));
  });

  it("rejects an invalid callback without exchanging a token", async () => {
    const {result, res} = response();
    await auth(request("callback"), res);
    expect(result.status).toBe(400);
    expect(result.body).toEqual({error: "Invalid OAuth callback state."});
  });

  it("clears the session on POST logout", async () => {
    const {result, res} = response();
    await auth(request("logout", "POST"), res);
    expect(result.status).toBe(204);
    expect(result.headers.get("set-cookie")).toContain("chisel_github_session=; Max-Age=0");
  });

  it.each(["start", "callback", "session", "logout"])("rejects the wrong method for %s", async (action) => {
    const {result, res} = response();
    await auth(request(action, action === "logout" ? "GET" : "POST"), res);
    expect(result.status).toBe(405);
    expect(result.headers.get("allow")).toBe(action === "logout" ? "POST" : "GET");
  });

  it("returns 404 for unknown actions", async () => {
    const {result, res} = response();
    await auth(request("unknown"), res);
    expect(result.status).toBe(404);
  });
});

describe("consolidated automations", () => {
  it.each(["rules", "runs", "test"])("requires authentication for %s", async (action) => {
    const {result, res} = response();
    await automation(request(action, action === "test" ? "POST" : "GET"), res);
    expect(result.status).toBe(401);
    expect(result.body).toEqual({error: "Sign in with GitHub to use cloud features."});
  });

  it.each(["rules", "runs", "test"])("preserves method validation for %s", async (action) => {
    const {result, res} = response();
    await automation(request(action, "PATCH"), res);
    expect(result.status).toBe(405);
  });

  it("returns 404 for unknown actions", async () => {
    const {result, res} = response();
    await automation(request("unknown"), res);
    expect(result.status).toBe(404);
  });
});

describe("Hobby deployment routing", () => {
  it("preserves legacy automation URLs", () => {
    const config = JSON.parse(readFileSync(new URL("../../vercel.json", import.meta.url), "utf8"));
    expect(config.rewrites).toEqual(expect.arrayContaining([
      {source: "/api/automations", destination: "/api/automation/rules"},
      {source: "/api/automation-runs", destination: "/api/automation/runs"},
      {source: "/api/automations-test", destination: "/api/automation/test"},
    ]));
    expect(config.crons).toContainEqual({path: "/api/automation-dispatch", schedule: "0 3 * * *"});
    expect(config.functions["api/queues/task-automation-actions.ts"].experimentalTriggers[0].topic).toBe("task-automation-actions");
  });

  it("keeps deployable API entrypoints within the Hobby limit and excludes tests", () => {
    function entrypoints(directory: string): string[] {
      return readdirSync(directory, {withFileTypes: true}).flatMap((entry) => {
        if (entry.name.startsWith("_") || entry.name.startsWith(".")) return [];
        const path = join(directory, entry.name);
        return entry.isDirectory() ? entrypoints(path) : path.endsWith(".ts") ? [path] : [];
      });
    }
    const files = entrypoints(new URL("../../api", import.meta.url).pathname);
    expect(files).toHaveLength(8);
    expect(files.length).toBeLessThanOrEqual(12);
    expect(files.some((path) => path.endsWith(".test.ts"))).toBe(false);
  });
});

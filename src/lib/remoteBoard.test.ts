import {afterEach, describe, expect, it, vi} from "vitest";
import {fetchRemoteBoard} from "./remoteBoard";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("remote board responses", () => {
  it("explains when plain Vite serves the API source instead of JSON", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response('import { neon } from "@neondatabase/serverless";', {
      status: 200,
      headers: {"Content-Type": "text/javascript"},
    })));

    await expect(fetchRemoteBoard("token")).rejects.toMatchObject({
      message: "Cloud sync is unavailable in the Vite-only dev server. Run npm run dev:vercel.",
      status: 502,
    });
  });

  it("does not expose JSON parser errors for other invalid responses", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(new Response("<html>Bad gateway</html>", {
      status: 502,
      headers: {"Content-Type": "text/html"},
    })));

    await expect(fetchRemoteBoard("token")).rejects.toThrow("Cloud sync returned an invalid response (502).");
  });

  it("continues to parse valid snapshots", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(Response.json({state: null, version: 3, updatedAt: null})));
    await expect(fetchRemoteBoard("token")).resolves.toEqual({state: null, version: 3, updatedAt: null});
  });
});

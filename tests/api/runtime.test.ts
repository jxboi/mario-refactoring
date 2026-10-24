import {execFileSync} from "node:child_process";
import {mkdtempSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync} from "node:fs";
import {dirname, join, resolve} from "node:path";
import ts from "typescript";
import {expect, it} from "vitest";

it("loads emitted API modules in native Node and reaches authentication", () => {
  const root = resolve(import.meta.dirname, "../..");
  const temporaryRoot = join(root, "node_modules/.tmp");
  mkdirSync(temporaryRoot, {recursive: true});
  const output = mkdtempSync(join(temporaryRoot, "api-runtime-"));
  function files(directory: string): string[] {
    return readdirSync(join(root, directory), {withFileTypes: true}).flatMap(entry => {
      const path = join(directory, entry.name);
      return entry.isDirectory() ? files(path) : path.endsWith(".ts") ? [path] : [];
    });
  }
  try {
    writeFileSync(join(output, "package.json"), JSON.stringify({type: "module"}));
    // Preserve imports as emitted by the server compiler. Vite/Vitest's resolver
    // otherwise hides extensionless ESM imports that crash deployed functions.
    for (const path of [...files("api"), "src/types.ts", ...["store", "skills", "remoteBoard", "automations", "activity"].map(name => `src/lib/${name}.ts`)]) {
      const target = join(output, path.replace(/\.ts$/, ".js"));
      mkdirSync(dirname(target), {recursive: true});
      writeFileSync(target, ts.transpileModule(readFileSync(join(root, path), "utf8"), {
        compilerOptions: {target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext},
      }).outputText);
    }
    const entrypoints = files("api").filter(path => !path.split("/").some(part => part.startsWith("_")));
    writeFileSync(join(output, "smoke.mjs"), `
      import assert from "node:assert/strict";
      for (const path of ${JSON.stringify(entrypoints)}) {
        const module = await import("./" + path.replace(/\\.ts$/, ".js"));
        assert.equal(typeof module.default, "function", path);
      }
      for (const [path, method] of [["board", "GET"], ["activity", "GET"], ["collaboration", "GET"], ["project-summary", "POST"]]) {
        const {default: handler} = await import("./api/" + path + ".js");
        let status, body;
        const response = {setHeader() {}, status(code) {status = code; return this;}, json(value) {body = value;}, end() {}};
        await handler({method, headers: {}, query: {}, async *[Symbol.asyncIterator]() {}}, response);
        assert.equal(status, 401, path);
        assert.match(body.error, /Sign in with GitHub/, path);
      }
      console.log("API startup and auth guards passed");
    `);
    expect(execFileSync(process.execPath, [join(output, "smoke.mjs")], {
      encoding: "utf8", timeout: 20_000,
    })).toContain("API startup and auth guards passed");
  } finally {
    rmSync(output, {recursive: true, force: true});
  }
}, 30_000);

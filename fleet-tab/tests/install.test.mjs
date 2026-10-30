import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm, mkdir, symlink, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";
const installer = fileURLToPath(new URL("../scripts/install.py", import.meta.url));
test("installer copies only runtime files and refuses all name collisions, including dangling symlinks", async () => {
  const destination = await mkdtemp(join(tmpdir(), "fleet-tab-install-"));
  const run = () => spawnSync("python3", [installer, destination], { encoding: "utf8" });
  try {
    assert.equal(run().status, 0);
    assert.deepEqual((await readdir(join(destination, "mods/fleet-tab"))).sort(), ["main.js", "mod.json", "model.js", "spacing.js"]);
    const path = join(destination, "layouts/fleet-tab.json"); await writeFile(path, "keep me");
    assert.equal(run().status, 1); assert.equal(await readFile(path, "utf8"), "keep me");
    await rm(destination, { recursive: true }); await mkdir(destination); await mkdir(join(destination, "themes"));
    await symlink(join(destination, "missing"), join(destination, "themes/fleet-tab.json"));
    assert.equal(run().status, 1); assert.deepEqual(await readdir(destination), ["themes"]);
  } finally { await rm(destination, { recursive: true, force: true }); }
});

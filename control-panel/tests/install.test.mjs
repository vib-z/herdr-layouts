import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, readFile, writeFile, rm, mkdir, symlink, readdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const script = fileURLToPath(new URL("../scripts/install.py", import.meta.url));
test("baking requires an explicit kit path and leaves generated files alone when omitted", async () => {
  const frames = new URL("../mods/control-panel/frames.json", import.meta.url);
  const before = await readFile(frames);
  const reply = spawnSync(process.execPath, [fileURLToPath(new URL("../scripts/bake-frames.mjs", import.meta.url))], { encoding: "utf8" });
  assert.notEqual(reply.status, 0);
  assert.match(reply.stderr, /Usage: node scripts\/bake-frames.mjs/);
  assert.deepEqual(await readFile(frames), before);
});
test("installer copies to a fresh explicit home, refuses a repeat, and leaves existing bytes alone", async () => {
  const home = await mkdtemp(join(tmpdir(), "control-panel-install-"));
  try {
    const first = spawnSync("python3", [script, home], { encoding: "utf8" });
    assert.equal(first.status, 0, first.stderr);
    const target = join(home, "layouts/control-panel.json");
    const before = await readFile(target);
    const second = spawnSync("python3", [script, home], { encoding: "utf8" });
    assert.notEqual(second.status, 0);
    assert.match(second.stderr, /Refusing to overwrite/);
    assert.deepEqual(await readFile(target), before);
    assert.ok((await readFile(join(home, "mods/control-panel/main.js"), "utf8")).includes("class ControlPanel"));
  } finally { await rm(home, { recursive: true, force: true }); }
});
test("installer checks all names before copying and rejects a dangling symlink", async () => {
  for (const mode of ["file", "symlink"]) {
    const home = await mkdtemp(join(tmpdir(), "control-panel-collision-"));
    try {
      await mkdir(join(home, "themes"));
      const target = join(home, "themes/control-panel.json");
      if (mode === "file") await writeFile(target, "existing theme\n");
      else await symlink(join(home, "absent"), target);
      const reply = spawnSync("python3", [script, home], { encoding: "utf8" });
      assert.notEqual(reply.status, 0);
      assert.deepEqual(await readdir(home), ["themes"]);
      if (mode === "file") assert.equal(await readFile(target, "utf8"), "existing theme\n");
    } finally { await rm(home, { recursive: true, force: true }); }
  }
});

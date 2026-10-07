// Assembles the dashboard plugin's web/ into a minimal create-togo-app Next.js
// project (test-harness/.build) exactly the way `togo install` does: the plugin's
// web/ subtree is copied into the project, and files the project already has are
// kept (no overwrite). The project is test-harness/template: the pieces the
// create-togo-app template provides that the plugin relies on.
//
//   node test-harness/assemble.mjs        (from the repo root)
import { cpSync, existsSync, mkdirSync, readdirSync, rmSync, statSync, copyFileSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, "..");
const build = join(here, ".build");
const SKIP = new Set(["node_modules", ".next"]);

// Keep node_modules between runs so a local re-assemble does not reinstall.
mkdirSync(build, { recursive: true });
for (const name of readdirSync(build)) {
  if (name === "node_modules") continue;
  rmSync(join(build, name), { recursive: true, force: true });
}

cpSync(join(here, "template"), build, { recursive: true, filter: (s) => !SKIP.has(s.split(/[\/]/).pop()) });

let injected = 0;
let kept = 0;
function inject(src, dest) {
  for (const name of readdirSync(src)) {
    if (SKIP.has(name)) continue;
    const s = join(src, name);
    const d = join(dest, name);
    if (statSync(s).isDirectory()) {
      inject(s, d);
    } else if (existsSync(d)) {
      kept++; // togo install keeps the project's existing file unless --force
      console.warn(`kept project file (plugin version ignored): ${relative(build, d)}`);
    } else {
      mkdirSync(dirname(d), { recursive: true });
      copyFileSync(s, d);
      injected++;
    }
  }
}
inject(join(root, "web"), build);

// Tests that run against the assembled project.
cpSync(join(here, "tests"), join(build, "tests"), { recursive: true });

console.log(`assembled ${injected} plugin file(s) into ${relative(root, build)} (${kept} kept)`);

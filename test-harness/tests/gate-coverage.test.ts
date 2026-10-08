// The per-page DashboardGate is what keeps a page from rendering: Next renders the page segment
// even when the (app) layout withholds its children, and a soft navigation does not re-run the
// layout. So every page under (app) must wrap its content in the gate, and any other kind of
// route file there (template, default, loading, route handler, server action) needs a review of
// how it is guarded before it is allowed here.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

const appDir = join(import.meta.dirname, "..", "app", "(app)");
const files = (readdirSync(appDir, { recursive: true }) as string[])
  .map((f) => f.replaceAll("\\", "/"))
  .filter((f) => /\.(tsx?|jsx?|mdx?)$/.test(f));

// Files that are not route segments, or are checked below.
const allowed = /(^|\/)(page|view)\.tsx$|^layout\.tsx$|^dashboard-shell\.tsx$/;
const gated = (src: string) =>
  src.includes('from "@/components/dashboard-gate"') && /<DashboardGate>[\s\S]*<\/DashboardGate>/.test(src);

describe("dashboard gate coverage", () => {
  it("finds the (app) pages", () => {
    expect(files.filter((f) => f.endsWith("page.tsx")).length).toBeGreaterThan(0);
  });

  it("has only reviewed kinds of file under (app)", () => {
    expect(files.filter((f) => !allowed.test(f))).toEqual([]);
  });

  it.each(files.filter((f) => f === "layout.tsx" || f.endsWith("/page.tsx") || f === "page.tsx"))(
    "%s renders inside DashboardGate",
    (f) => {
      const src = readFileSync(join(appDir, f), "utf8");
      expect(gated(src), relative(appDir, join(appDir, f))).toBe(true);
      expect(src).not.toMatch(/["']use (server|client)["']/);
    },
  );

  it("keeps server actions out of (app)", () => {
    for (const f of files) {
      expect(readFileSync(join(appDir, f), "utf8"), f).not.toMatch(/["']use server["']/);
    }
  });
});

// jsdom lacks a few browser APIs Nasaq's components touch. Re-applied before each
// test because vitest.setup.ts unstubs globals after each one.
import { beforeEach, vi } from "vitest";
import { FakeEventSource } from "./helpers";

class RO { observe() {} unobserve() {} disconnect() {} }

beforeEach(() => {
  vi.stubGlobal("ResizeObserver", RO);
  vi.stubGlobal("EventSource", FakeEventSource);
});
if (!window.matchMedia) {
  window.matchMedia = ((q: string) => ({ matches: false, media: q, addEventListener() {}, removeEventListener() {}, addListener() {}, removeListener() {}, onchange: null, dispatchEvent: () => false })) as typeof window.matchMedia;
}
Element.prototype.scrollIntoView = Element.prototype.scrollIntoView ?? (() => {});

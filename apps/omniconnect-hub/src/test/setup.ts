import * as matchers from "@testing-library/jest-dom/matchers";
import { expect } from "vitest";

// Extend the same Vitest instance imported by test files in this workspace.
expect.extend(matchers);

// Polyfills required by @xyflow/react under jsdom
if (typeof globalThis.ResizeObserver === "undefined") {
  class ResizeObserverPolyfill {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).ResizeObserver = ResizeObserverPolyfill;
}

if (typeof globalThis.DOMMatrixReadOnly === "undefined") {
  class DOMMatrixReadOnlyPolyfill {
    m22 = 1;
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  (globalThis as any).DOMMatrixReadOnly = DOMMatrixReadOnlyPolyfill;
}

try {
  Object.defineProperties(HTMLElement.prototype, {
    offsetHeight: {
      get(this: HTMLElement) {
        return parseFloat(this.style.height) || 600;
      },
      configurable: true,
    },
    offsetWidth: {
      get(this: HTMLElement) {
        return parseFloat(this.style.width) || 800;
      },
      configurable: true,
    },
  });
} catch {
  // ignore — already defined
}

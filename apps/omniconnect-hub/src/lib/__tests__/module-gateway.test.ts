import { describe, expect, it } from "vitest";
import { resolveModuleDestination } from "@/lib/module-gateway";

describe("resolveModuleDestination", () => {
  it("returns the configured URL for an external module", () => {
    expect(
      resolveModuleDestination("omnihub", {
        omnihub: " https://omni.cockpit.example/app ",
      }),
    ).toBe("https://omni.cockpit.example/app");
  });

  it("returns null when no destination is configured", () => {
    expect(resolveModuleDestination("crm", { crm: "" })).toBeNull();
  });

  it("rejects destinations with unsafe protocols", () => {
    expect(resolveModuleDestination("botify", { botify: "javascript:alert('x')" })).toBeNull();
  });
});

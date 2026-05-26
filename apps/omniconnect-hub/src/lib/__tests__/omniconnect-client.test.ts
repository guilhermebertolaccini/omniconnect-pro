import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

function jsonResponse(body: unknown): Response {
  return new Response(JSON.stringify(body), {
    status: 200,
    headers: { "Content-Type": "application/json" },
  });
}

describe("omniconnectClient session restore", () => {
  beforeEach(() => {
    vi.resetModules();
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("abandons an unresponsive refresh and leaves the user anonymous", async () => {
    vi.useFakeTimers();
    vi.stubGlobal(
      "fetch",
      vi.fn((_url: RequestInfo | URL, init?: RequestInit) => {
        return new Promise<Response>((_resolve, reject) => {
          init?.signal?.addEventListener("abort", () => {
            reject(new DOMException("The request was aborted.", "AbortError"));
          });
        });
      }),
    );

    const client = await import("@/lib/omniconnectClient");
    const restore = client.restoreSession();

    await vi.advanceTimersByTimeAsync(8_000);

    await expect(restore).resolves.toBeNull();
    expect(client.getAuthState()).toEqual({
      user: null,
      accessToken: null,
      status: "anonymous",
    });
  });

  it("does not clear a new login when an older refresh fails", async () => {
    let rejectRefresh: ((error: Error) => void) | undefined;
    const user = {
      id: 1,
      name: "QA User",
      email: "qa@example.test",
      role: "admin" as const,
      tenantId: "tenant-1",
    };

    const fetchMock = vi
      .fn()
      .mockImplementationOnce(
        () =>
          new Promise<Response>((_resolve, reject) => {
            rejectRefresh = reject;
          }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          access_token: "login-access-token",
          access_expires_in: 900,
          user,
        }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const client = await import("@/lib/omniconnectClient");
    const restore = client.restoreSession();
    await client.signIn(user.email, "valid-password");
    rejectRefresh?.(new Error("refresh failed"));
    await restore;

    expect(client.getAuthState()).toEqual({
      user,
      accessToken: "login-access-token",
      status: "authenticated",
    });
  });

  it("switches tenant through the session endpoint without putting scope in the URL", async () => {
    const firstUser = {
      id: 1,
      name: "QA User",
      email: "qa@example.test",
      role: "admin" as const,
      tenantId: "tenant-a",
    };
    const switchedUser = { ...firstUser, role: "digital" as const, tenantId: "tenant-b" };
    const fetchMock = vi
      .fn()
      .mockResolvedValueOnce(
        jsonResponse({ access_token: "access-a", access_expires_in: 900, user: firstUser }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ access_token: "access-b", access_expires_in: 900, user: switchedUser }),
      );
    vi.stubGlobal("fetch", fetchMock);

    const client = await import("@/lib/omniconnectClient");
    await client.signIn(firstUser.email, "valid-password");
    await client.switchTenantSession("tenant-b");

    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit];
    expect(url).toContain("/auth/switch-tenant");
    expect(url).not.toContain("tenant-b");
    expect(init.body).toBe(JSON.stringify({ tenantId: "tenant-b" }));
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer access-a");
    expect(client.getAuthState()).toEqual({
      user: switchedUser,
      accessToken: "access-b",
      status: "authenticated",
    });
  });
});

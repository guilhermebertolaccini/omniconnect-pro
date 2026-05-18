import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  __resetForTests,
  OmniconnectError,
  acceptInvitation,
  getAccessToken,
  getAuthState,
  previewInvitation,
  request,
  restoreSession,
  signIn,
  signOut,
  signUp,
  subscribe,
} from "./omniconnectClient";

const json = (body: unknown, status = 200) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("crm omniconnectClient", () => {
  let fetchMock: ReturnType<typeof vi.fn>;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    __resetForTests();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("signIn stores access token in memory and notifies subscribers", async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        access_token: "access-1",
        access_expires_in: 900,
        user: {
          id: 1,
          name: "Admin CRM",
          email: "admin@example.com",
          role: "admin",
          tenantId: "tenant-a",
        },
      }),
    );

    const seen: string[] = [];
    subscribe((s) => seen.push(s.status));

    const user = await signIn("admin@example.com", "secret-pass");
    expect(user.tenantId).toBe("tenant-a");
    expect(getAccessToken()).toBe("access-1");
    expect(getAuthState().status).toBe("authenticated");
    expect(seen).toEqual(["anonymous", "authenticated"]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/auth/login");
    expect((init as RequestInit).credentials).toBe("include");
    expect((init as RequestInit).method).toBe("POST");
    expect(JSON.parse((init as RequestInit).body as string)).toEqual({
      email: "admin@example.com",
      password: "secret-pass",
    });
  });

  it("request attaches Bearer header when access token is loaded", async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        access_token: "the-access",
        access_expires_in: 900,
        user: {
          id: 1,
          name: "Admin CRM",
          email: "admin@example.com",
          role: "admin",
          tenantId: "tenant-a",
        },
      }),
    );
    await signIn("admin@example.com", "secret-pass");

    fetchMock.mockResolvedValueOnce(json([{ id: "prop-1" }]));
    await request("/crm/properties");

    const lastCall = fetchMock.mock.calls.at(-1)!;
    const init = lastCall[1] as RequestInit;
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer the-access");
  });

  it("on 401 calls /auth/refresh once and retries the original request", async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        access_token: "old-access",
        access_expires_in: 900,
        user: {
          id: 1,
          name: "Admin CRM",
          email: "admin@example.com",
          role: "admin",
          tenantId: "tenant-a",
        },
      }),
    );
    await signIn("admin@example.com", "secret-pass");

    fetchMock
      .mockResolvedValueOnce(json({ message: "expired" }, 401))
      .mockResolvedValueOnce(json({ access_token: "new-access", access_expires_in: 900 }))
      .mockResolvedValueOnce(json({ ok: true }));

    const result = await request<{ ok: true }>("/crm/clients");
    expect(result.ok).toBe(true);
    expect(getAccessToken()).toBe("new-access");

    const refreshCall = fetchMock.mock.calls[2];
    expect(refreshCall[0]).toContain("/auth/refresh");

    const retryCall = fetchMock.mock.calls[3];
    expect(new Headers((retryCall[1] as RequestInit).headers).get("Authorization")).toBe(
      "Bearer new-access",
    );
  });

  it("when refresh fails, clears local session and surfaces 401", async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        access_token: "old",
        access_expires_in: 900,
        user: {
          id: 1,
          name: "Admin CRM",
          email: "admin@example.com",
          role: "admin",
          tenantId: "tenant-a",
        },
      }),
    );
    await signIn("admin@example.com", "secret-pass");

    fetchMock
      .mockResolvedValueOnce(json({ message: "expired" }, 401))
      .mockResolvedValueOnce(json({ message: "refresh failed" }, 401));

    await expect(request("/crm/contracts")).rejects.toBeInstanceOf(OmniconnectError);
    expect(getAuthState().status).toBe("anonymous");
    expect(getAccessToken()).toBeNull();
  });

  it("does not auto-refresh /auth/refresh (no infinite loop)", async () => {
    fetchMock.mockResolvedValueOnce(json({ message: "no cookie" }, 401));
    await expect(restoreSession()).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("signOut clears local state even when backend errors", async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        access_token: "old",
        access_expires_in: 900,
        user: {
          id: 1,
          name: "Admin CRM",
          email: "admin@example.com",
          role: "admin",
          tenantId: "tenant-a",
        },
      }),
    );
    await signIn("admin@example.com", "secret-pass");

    fetchMock.mockResolvedValueOnce(json({ message: "boom" }, 500));
    await signOut();
    expect(getAuthState().status).toBe("anonymous");
    expect(fetchMock.mock.calls.at(-1)?.[0]).toContain("/auth/logout");
  });

  it("signUp hits /auth/register and authenticates", async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        access_token: "fresh",
        access_expires_in: 900,
        user: {
          id: 9,
          name: "Broker Owner",
          email: "owner@example.com",
          role: "admin",
          tenantId: "tenant-z",
        },
        tenant: { id: "tenant-z", name: "Z Imóveis" },
      }),
    );
    const user = await signUp({
      name: "Broker Owner",
      email: "owner@example.com",
      password: "secret-pass",
      tenantName: "Z Imóveis",
    });
    expect(user.tenantId).toBe("tenant-z");
    expect(getAccessToken()).toBe("fresh");
    expect(fetchMock.mock.calls[0][0]).toContain("/auth/register");
  });

  it("previewInvitation and acceptInvitation never include Authorization when anonymous", async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        email: "broker@example.com",
        role: "broker",
        tenantId: "tenant-a",
        tenantName: "Tenant A",
        invitedByName: "Admin",
        expiresAt: "2099-01-01T00:00:00Z",
        isExpired: false,
        isAccepted: false,
      }),
    );
    await previewInvitation("a".repeat(64));
    expect(
      new Headers((fetchMock.mock.calls[0][1] as RequestInit).headers).get("Authorization"),
    ).toBeNull();

    fetchMock.mockResolvedValueOnce(
      json({
        user: {
          id: 11,
          name: "Broker",
          email: "broker@example.com",
          role: "broker",
          tenantId: "tenant-a",
        },
        tenantId: "tenant-a",
        alreadyMember: false,
      }),
    );
    const out = await acceptInvitation("a".repeat(64), {
      name: "Broker",
      password: "supersecret",
    });
    expect(out.tenantId).toBe("tenant-a");
  });
});

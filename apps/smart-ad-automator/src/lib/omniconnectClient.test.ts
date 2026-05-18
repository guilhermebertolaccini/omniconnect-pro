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
  startAdPlatformOAuth,
  subscribe,
} from "./omniconnectClient";

const json = (body: unknown, status = 200) =>
  new Response(typeof body === "string" ? body : JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json" },
  });

describe("omniconnectClient", () => {
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
        user: { id: 1, name: "A", email: "a@a.com", role: "admin", tenantId: "t-a" },
      }),
    );

    const seen: string[] = [];
    subscribe((s) => seen.push(s.status));

    const user = await signIn("a@a.com", "secret-pass");
    expect(user.tenantId).toBe("t-a");
    expect(getAccessToken()).toBe("access-1");
    expect(getAuthState().status).toBe("authenticated");
    expect(seen).toEqual(["anonymous", "authenticated"]);

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/auth/login");
    expect(init.credentials).toBe("include");
    expect(init.method).toBe("POST");
    expect(JSON.parse(init.body as string)).toEqual({
      email: "a@a.com",
      password: "secret-pass",
    });
  });

  it("request attaches Bearer header when access token is loaded", async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        access_token: "the-access",
        access_expires_in: 900,
        user: { id: 1, name: "A", email: "a@a.com", role: "admin", tenantId: "t-a" },
      }),
    );
    await signIn("a@a.com", "secret-pass");

    fetchMock.mockResolvedValueOnce(json({ ok: true }));
    await request("/ad-platform-connections");

    const lastCall = fetchMock.mock.calls.at(-1)!;
    const init = lastCall[1] as RequestInit;
    expect(new Headers(init.headers).get("Authorization")).toBe("Bearer the-access");
  });

  it("on 401 calls /auth/refresh once and retries the original request", async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        access_token: "old-access",
        access_expires_in: 900,
        user: { id: 1, name: "A", email: "a@a.com", role: "admin", tenantId: "t-a" },
      }),
    );
    await signIn("a@a.com", "secret-pass");

    fetchMock
      .mockResolvedValueOnce(json({ message: "expired" }, 401)) // original
      .mockResolvedValueOnce(json({ access_token: "new-access", access_expires_in: 900 })) // refresh
      .mockResolvedValueOnce(json({ ok: true })); // retry

    const result = await request<{ ok: true }>("/things");
    expect(result.ok).toBe(true);
    expect(getAccessToken()).toBe("new-access");

    // Inspect refresh + retry headers
    const refreshCall = fetchMock.mock.calls[2];
    expect(refreshCall[0]).toContain("/auth/refresh");
    expect((refreshCall[1] as RequestInit).method).toBe("POST");

    const retryCall = fetchMock.mock.calls[3];
    expect(new Headers((retryCall[1] as RequestInit).headers).get("Authorization")).toBe(
      "Bearer new-access",
    );
  });

  it("when refresh ALSO fails, clears local session and surfaces 401", async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        access_token: "old",
        access_expires_in: 900,
        user: { id: 1, name: "A", email: "a@a.com", role: "admin", tenantId: "t-a" },
      }),
    );
    await signIn("a@a.com", "secret-pass");

    fetchMock
      .mockResolvedValueOnce(json({ message: "expired" }, 401))
      .mockResolvedValueOnce(json({ message: "refresh failed" }, 401));

    await expect(request("/things")).rejects.toBeInstanceOf(OmniconnectError);
    expect(getAuthState().status).toBe("anonymous");
    expect(getAccessToken()).toBeNull();
  });

  it("does NOT auto-refresh when path is /auth/refresh (no infinite loop)", async () => {
    fetchMock.mockResolvedValueOnce(json({ message: "no cookie" }, 401));
    await expect(restoreSession()).resolves.toBeNull();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("signOut hits /auth/logout and clears local state even when backend errors", async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        access_token: "old",
        access_expires_in: 900,
        user: { id: 1, name: "A", email: "a@a.com", role: "admin", tenantId: "t-a" },
      }),
    );
    await signIn("a@a.com", "secret-pass");

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
        user: { id: 9, name: "Z", email: "z@z.com", role: "admin", tenantId: "t-z" },
        tenant: { id: "t-z", name: "Z Co" },
      }),
    );
    const user = await signUp({
      name: "Z",
      email: "z@z.com",
      password: "secret-pass",
      tenantName: "Z Co",
    });
    expect(user.tenantId).toBe("t-z");
    expect(getAccessToken()).toBe("fresh");

    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("/auth/register");
    expect(JSON.parse((init as RequestInit).body as string)).toMatchObject({
      tenantName: "Z Co",
    });
  });

  it("previewInvitation and acceptInvitation never include Authorization when anonymous", async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        email: "x@a.com",
        role: "operator",
        tenantId: "t-a",
        tenantName: "Tenant A",
        invitedByName: "Boss",
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
        user: { id: 11, name: "X", email: "x@a.com", role: "operator", tenantId: "t-a" },
        tenantId: "t-a",
        alreadyMember: false,
      }),
    );
    const out = await acceptInvitation("a".repeat(64), { name: "X", password: "supersecret" });
    expect(out.tenantId).toBe("t-a");
  });

  it("startAdPlatformOAuth builds the right query (and inherits Bearer)", async () => {
    fetchMock.mockResolvedValueOnce(
      json({
        access_token: "tok",
        access_expires_in: 900,
        user: { id: 1, name: "A", email: "a@a.com", role: "admin", tenantId: "t-a" },
      }),
    );
    await signIn("a@a.com", "secret-pass");

    fetchMock.mockResolvedValueOnce(
      json({
        authorizeUrl: "https://provider/auth",
        state: "opaque",
        expiresAt: "2099-01-01T00:00:00Z",
      }),
    );

    const r = await startAdPlatformOAuth("meta", {
      advertiserCompanyId: "ac-1",
      returnUrl: "/settings/ad-platforms",
    });
    expect(r.authorizeUrl).toBe("https://provider/auth");

    const url = fetchMock.mock.calls.at(-1)?.[0] as string;
    expect(url).toContain("/oauth/meta/start");
    expect(url).toContain("advertiserCompanyId=ac-1");
    expect(url).toContain("returnUrl=%2Fsettings%2Fad-platforms");
  });

  it("OmniconnectError carries status + body", async () => {
    fetchMock.mockResolvedValueOnce(json({ message: "bad" }, 409));
    await expect(request("/x")).rejects.toMatchObject({
      status: 409,
      body: { message: "bad" },
    });
  });
});

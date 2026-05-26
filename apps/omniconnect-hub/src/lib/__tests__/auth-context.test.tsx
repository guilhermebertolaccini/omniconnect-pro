import { render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { AuthProvider, useAuth } from "@/lib/auth-context";

const authApi = vi.hoisted(() => ({
  subscribe: vi.fn(),
  restoreSession: vi.fn(),
  getMyMemberships: vi.fn(),
  signIn: vi.fn(),
  signUp: vi.fn(),
  signOut: vi.fn(),
  switchTenantSession: vi.fn(),
}));

vi.mock("@/lib/omniconnectClient", () => ({
  subscribe: authApi.subscribe,
  restoreSession: authApi.restoreSession,
  getMyMemberships: authApi.getMyMemberships,
  signIn: authApi.signIn,
  signUp: authApi.signUp,
  signOut: authApi.signOut,
  switchTenantSession: authApi.switchTenantSession,
}));

const user = {
  id: 1,
  name: "QA User",
  email: "qa@example.test",
  role: "admin" as const,
  tenantId: "default-tenant",
};

function Probe({ children }: { children?: ReactNode }) {
  const { loading, isAuthenticated, role, tenant } = useAuth();
  return (
    <>
      <p data-testid="auth-state">
        {String(loading)}:{String(isAuthenticated)}:{role}:{tenant.id || "no-tenant"}
      </p>
      {children}
    </>
  );
}

function TenantSwitchProbe() {
  const { tenant, tenantSessionReady, switchTenant } = useAuth();
  return (
    <>
      <p data-testid="tenant-session">
        {tenant.id || "no-tenant"}:{String(tenantSessionReady)}
      </p>
      <button type="button" onClick={() => void switchTenant("tenant-b")}>
        Trocar
      </button>
    </>
  );
}

describe("AuthProvider tenant resolution", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    authApi.subscribe.mockImplementation(
      (listener: (state: { user: typeof user; accessToken: string; status: string }) => void) => {
        listener({ user, accessToken: "token", status: "authenticated" });
        return () => undefined;
      },
    );
    authApi.restoreSession.mockResolvedValue(user);
  });

  it("never promotes an authenticated user without membership to administrator", async () => {
    authApi.getMyMemberships.mockResolvedValue([]);

    render(
      <AuthProvider>
        <Probe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("auth-state")).toHaveTextContent("false:true:atendente:no-tenant");
    });
  });

  it("updates the visible tenant only after the backend returns the scoped session", async () => {
    const scopedUser = { ...user, tenantId: "tenant-a" };
    const switchedUser = { ...user, tenantId: "tenant-b" };
    let publish:
      | ((state: { user: typeof user; accessToken: string; status: string }) => void)
      | null = null;
    authApi.subscribe.mockImplementation((listener) => {
      publish = listener;
      listener({ user: scopedUser, accessToken: "token-a", status: "authenticated" });
      return () => undefined;
    });
    authApi.restoreSession.mockResolvedValue(scopedUser);
    authApi.getMyMemberships.mockResolvedValue([
      { tenantId: "tenant-a", tenantName: "Empresa A", role: "admin", isActive: true },
      { tenantId: "tenant-b", tenantName: "Empresa B", role: "digital", isActive: true },
    ]);
    authApi.switchTenantSession.mockImplementation(async () => {
      publish?.({ user: switchedUser, accessToken: "token-b", status: "authenticated" });
      return switchedUser;
    });

    render(
      <AuthProvider>
        <TenantSwitchProbe />
      </AuthProvider>,
    );

    await waitFor(() => {
      expect(screen.getByTestId("tenant-session")).toHaveTextContent("tenant-a:true");
    });
    await userEvent.click(screen.getByRole("button", { name: "Trocar" }));
    await waitFor(() => {
      expect(screen.getByTestId("tenant-session")).toHaveTextContent("tenant-b:true");
    });
    expect(authApi.switchTenantSession).toHaveBeenCalledWith("tenant-b");
  });
});

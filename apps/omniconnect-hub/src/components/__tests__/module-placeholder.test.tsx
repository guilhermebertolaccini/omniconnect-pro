import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ModulePlaceholder } from "@/components/module-placeholder";
import { resolveModuleDestination } from "@/lib/module-gateway";

const authState = vi.hoisted(() => ({
  tenant: { id: "tenant-a", name: "Empresa A", initials: "EA" },
  tenantSessionReady: true,
  switchingTenant: false,
}));


vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

vi.mock("@/lib/module-gateway", () => ({
  resolveModuleDestination: vi.fn(),
}));

vi.mock("@/lib/auth-context", () => ({
  useAuth: () => authState,
}));


const mockedResolveModuleDestination = vi.mocked(resolveModuleDestination);

describe("ModulePlaceholder", () => {
  beforeEach(() => {
    mockedResolveModuleDestination.mockReset();
    authState.tenantSessionReady = true;
    authState.switchingTenant = false;
  });

  it("opens a module through its configured destination", () => {
    mockedResolveModuleDestination.mockReturnValue("https://omni.cockpit.example/");

    render(<ModulePlaceholder moduleId="omnihub" />);

    const link = screen.getByRole("link", { name: "Abrir OmniHub Conversas em nova aba" });
    expect(link).toHaveAttribute("href", "https://omni.cockpit.example/");
    expect(link).toHaveAttribute("target", "_blank");
    expect(link).toHaveAttribute("rel", "noopener noreferrer");
  });

  it("shows an unavailable state when the destination is missing", () => {
    mockedResolveModuleDestination.mockReturnValue(null);

    render(<ModulePlaceholder moduleId="crm" />);

    expect(screen.getByRole("button", { name: "Módulo indisponível" })).toBeDisabled();
    expect(screen.getByText(/ainda não foi configurado neste ambiente/i)).toBeInTheDocument();
  });

  it("blocks navigation while the selected tenant is not confirmed by the session", () => {
    mockedResolveModuleDestination.mockReturnValue("https://omni.cockpit.example/");
    authState.tenantSessionReady = false;

    render(<ModulePlaceholder moduleId="omnihub" />);

    expect(
      screen.queryByRole("link", { name: /abrir OmniHub Conversas/i }),
    ).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "Sessão da empresa indisponível" })).toBeDisabled();
    expect(screen.getByText(/empresa ativa e confirmada/i)).toBeInTheDocument();
  });
});

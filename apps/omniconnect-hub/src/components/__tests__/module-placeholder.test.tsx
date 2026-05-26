import type { ReactNode } from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { ModulePlaceholder } from "@/components/module-placeholder";
import { resolveModuleDestination } from "@/lib/module-gateway";

vi.mock("@tanstack/react-router", () => ({
  Link: ({ children, to }: { children: ReactNode; to: string }) => <a href={to}>{children}</a>,
}));

vi.mock("@/lib/module-gateway", () => ({
  resolveModuleDestination: vi.fn(),
}));

const mockedResolveModuleDestination = vi.mocked(resolveModuleDestination);

describe("ModulePlaceholder", () => {
  beforeEach(() => {
    mockedResolveModuleDestination.mockReset();
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
});

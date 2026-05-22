import { describe, it, expect, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { JourneyNode } from "@/components/journey-node";
import type { JourneyNodeData } from "@/lib/leads-data";

const node: JourneyNodeData = {
  id: "n1",
  type: "email",
  title: "Boas-vindas",
  description: "Enviar e-mail de boas-vindas",
  position: { x: 0, y: 0 },
};

describe("JourneyNode", () => {
  it("dispara onSelect ao clicar no card", async () => {
    const onSelect = vi.fn();
    render(<JourneyNode node={node} onSelect={onSelect} />);
    const user = userEvent.setup();
    await user.click(screen.getByText("Boas-vindas"));
    expect(onSelect).toHaveBeenCalledTimes(1);
  });

  it("aplica destaque visual quando selecionado", () => {
    const { container, rerender } = render(<JourneyNode node={node} isSelected={false} />);
    const card = container.firstChild as HTMLElement;
    expect(card.className).not.toMatch(/ring-primary/);
    rerender(<JourneyNode node={node} isSelected />);
    expect((container.firstChild as HTMLElement).className).toMatch(/ring-primary/);
  });

  it("dispara onDelete sem propagar para onSelect", async () => {
    const onSelect = vi.fn();
    const onDelete = vi.fn();
    render(<JourneyNode node={node} onSelect={onSelect} onDelete={onDelete} />);
    const user = userEvent.setup();
    // delete button is the only <button>
    await user.click(screen.getByRole("button"));
    expect(onDelete).toHaveBeenCalledTimes(1);
    expect(onSelect).not.toHaveBeenCalled();
  });
});

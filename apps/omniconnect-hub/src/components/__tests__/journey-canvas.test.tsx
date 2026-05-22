import { describe, it, expect } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { JourneyCanvas } from "@/components/journey-canvas";
import type { JourneyNodeData } from "@/lib/leads-data";

const nodes: JourneyNodeData[] = [
  { id: "n1", type: "trigger", title: "Lead entrou no CRM", description: "Gatilho inicial", position: { x: 50, y: 50 } },
  { id: "n2", type: "email", title: "Boas-vindas", description: "E-mail D+0", position: { x: 50, y: 220 } },
];

describe("JourneyCanvas seleção", () => {
  it("clique rápido no card abre o painel lateral de configuração", async () => {
    render(<JourneyCanvas initialNodes={nodes} />);
    // Estado inicial: nenhum bloco selecionado
    expect(screen.getByText("Selecione um bloco")).toBeInTheDocument();

    const user = userEvent.setup();
    await user.click(screen.getByText("Boas-vindas"));

    // Painel troca para "Editando bloco selecionado"
    expect(screen.getByText("Editando bloco selecionado")).toBeInTheDocument();
    // E o input do título do bloco aparece com o valor do nó
    const titleInput = screen.getByDisplayValue("Boas-vindas") as HTMLInputElement;
    expect(titleInput).toBeInTheDocument();
  });

  it("clique simples NÃO inicia um drag (o bloco permanece com o mesmo título)", async () => {
    render(<JourneyCanvas initialNodes={nodes} />);
    const user = userEvent.setup();
    await user.click(screen.getByText("Boas-vindas"));

    // Bloco continua na canvas com o mesmo título e o painel ficou aberto
    expect(screen.getAllByText("Boas-vindas").length).toBeGreaterThan(0);
    expect(screen.getByText("Editando bloco selecionado")).toBeInTheDocument();
  });

  it("clicar no fundo do canvas (pane) desmarca a seleção", async () => {
    const { container } = render(<JourneyCanvas initialNodes={nodes} />);
    const user = userEvent.setup();
    await user.click(screen.getByText("Boas-vindas"));
    expect(screen.getByText("Editando bloco selecionado")).toBeInTheDocument();

    const pane = container.querySelector(".react-flow__pane") as HTMLElement | null;
    expect(pane).toBeTruthy();
    await user.click(pane!);
    expect(screen.getByText("Selecione um bloco")).toBeInTheDocument();
  });
});

import { corsHeaders } from "npm:@supabase/supabase-js@2/cors";

/**
 * parse-document-pdf
 * Receives { pdfBase64, kind: "proposal" | "contract" } and returns structured JSON
 * extracted by Lovable AI Gateway (Gemini multimodal).
 */

const PROPOSAL_SCHEMA = {
  type: "object",
  properties: {
    clientName: { type: "string", description: "Nome completo do cliente comprador" },
    clientCpfCnpj: { type: "string", description: "CPF ou CNPJ do cliente" },
    propertyName: { type: "string", description: "Nome do empreendimento ou imóvel" },
    unitNumber: { type: "string", description: "Número/identificação da unidade" },
    originalPrice: { type: "number", description: "Preço original em reais (apenas números)" },
    discountPercent: { type: "number", description: "Percentual de desconto" },
    finalPrice: { type: "number", description: "Preço final em reais" },
    downPayment: { type: "number", description: "Valor da entrada em reais" },
    downPaymentPercent: { type: "number", description: "Percentual de entrada" },
    installments: { type: "number", description: "Quantidade de parcelas" },
    installmentValue: { type: "number", description: "Valor da parcela em reais" },
    balloon: { type: "number", description: "Valor do balão em reais (0 se não houver)" },
    balloonPercent: { type: "number", description: "Percentual do balão" },
    interestRate: { type: "number", description: "Juros mensal em percentual" },
    method: { type: "string", enum: ["sac", "price"], description: "Sistema de amortização" },
    indexer: { type: "string", enum: ["none", "incc", "ipca"], description: "Indexador" },
    validityDays: { type: "number", description: "Validade da proposta em dias" },
    notes: { type: "string", description: "Observações relevantes" },
  },
  required: ["clientName", "finalPrice"],
};

const CONTRACT_SCHEMA = {
  type: "object",
  properties: {
    clientName: { type: "string" },
    clientCpfCnpj: { type: "string" },
    propertyName: { type: "string" },
    unitNumber: { type: "string" },
    finalPrice: { type: "number" },
    downPayment: { type: "number" },
    downPaymentPercent: { type: "number" },
    installments: { type: "number" },
    installmentValue: { type: "number" },
    balloon: { type: "number" },
    balloonPercent: { type: "number" },
    interestRate: { type: "number" },
    method: { type: "string", enum: ["sac", "price"] },
    indexer: { type: "string", enum: ["none", "incc", "ipca"] },
    notes: { type: "string" },
  },
  required: ["clientName", "finalPrice"],
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });

  try {
    const body = await req.json();
    const { pdfBase64, kind } = body ?? {};
    if (!pdfBase64 || typeof pdfBase64 !== "string") {
      return new Response(JSON.stringify({ error: "pdfBase64 obrigatório" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }
    const targetKind = kind === "contract" ? "contract" : "proposal";
    const schema = targetKind === "contract" ? CONTRACT_SCHEMA : PROPOSAL_SCHEMA;
    const fnName =
      targetKind === "contract" ? "extract_contract_data" : "extract_proposal_data";

    const apiKey = Deno.env.get("LOVABLE_API_KEY");
    if (!apiKey) {
      return new Response(JSON.stringify({ error: "LOVABLE_API_KEY não configurada" }), {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const systemPrompt =
      targetKind === "contract"
        ? "Você é um assistente que extrai dados estruturados de contratos imobiliários em PDF. Retorne SEMPRE valores numéricos puros (sem R$, pontos ou vírgulas como separadores de milhar)."
        : "Você é um assistente que extrai dados estruturados de propostas comerciais imobiliárias em PDF. Retorne SEMPRE valores numéricos puros (sem R$, pontos ou vírgulas como separadores de milhar).";

    const aiRes = await fetch("https://ai.gateway.lovable.dev/v1/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Lovable-API-Key": apiKey,
      },
      body: JSON.stringify({
        model: "google/gemini-2.5-flash",
        messages: [
          { role: "system", content: systemPrompt },
          {
            role: "user",
            content: [
              {
                type: "text",
                text:
                  targetKind === "contract"
                    ? "Extraia todos os dados estruturados deste contrato imobiliário."
                    : "Extraia todos os dados estruturados desta proposta comercial imobiliária.",
              },
              {
                type: "file",
                file: {
                  filename: "documento.pdf",
                  file_data: `data:application/pdf;base64,${pdfBase64}`,
                },
              },
            ],
          },
        ],
        tools: [
          {
            type: "function",
            function: {
              name: fnName,
              description: "Retorna os dados extraídos do documento",
              parameters: schema,
            },
          },
        ],
        tool_choice: { type: "function", function: { name: fnName } },
      }),
    });

    if (!aiRes.ok) {
      const text = await aiRes.text();
      const status = aiRes.status === 429 || aiRes.status === 402 ? aiRes.status : 500;
      return new Response(
        JSON.stringify({
          error:
            aiRes.status === 429
              ? "Limite de requisições excedido. Tente novamente em instantes."
              : aiRes.status === 402
              ? "Créditos de IA esgotados. Adicione créditos no workspace."
              : `Falha na IA: ${text}`,
        }),
        { status, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const data = await aiRes.json();
    const toolCall = data?.choices?.[0]?.message?.tool_calls?.[0];
    const argsRaw = toolCall?.function?.arguments;
    let extracted: any = {};
    if (argsRaw) {
      try {
        extracted = typeof argsRaw === "string" ? JSON.parse(argsRaw) : argsRaw;
      } catch (_) {
        extracted = {};
      }
    }

    return new Response(JSON.stringify({ extracted }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: (err as Error).message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});
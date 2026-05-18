/**
 * Redact PII before sending text to an LLM provider. The goal is
 * defence-in-depth, not a leak-proof guarantee: we strip the obvious
 * Brazilian identifiers, money figures, and contact info so they don't
 * end up in OpenAI logs / prompt caches. Real estate conversations
 * routinely carry CPF, CNPJ, CEP, address fragments, income, contract
 * numbers and dates of birth, so each pattern below is grounded in
 * actual operator chat samples.
 *
 * Order matters: longer / more specific patterns run first so that, for
 * example, a CNPJ never collapses into the looser "long-digit-run"
 * fallback used for phone numbers.
 *
 * All patterns are anchored on word/line boundaries to avoid eating
 * substrings of unrelated tokens (e.g. a UUID).
 */
export function redactPII(text: string): string {
  if (!text) return text;

  let out = text;

  // Email — well-defined, do first.
  out = out.replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]');

  // CNPJ: 00.000.000/0000-00 or 14 digits in a row.
  out = out.replace(/\b\d{2}\.?\d{3}\.?\d{3}\/?\d{4}-?\d{2}\b/g, '[CNPJ]');

  // CPF: 000.000.000-00 or 11 digits in a row.
  out = out.replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[CPF]');

  // RG: 00.000.000-X (digit or X). Run after CPF.
  out = out.replace(/\b\d{2}\.?\d{3}\.?\d{3}-?[\dxX]\b/g, '[RG]');

  // CEP: 00000-000 or 8 digits with no other punctuation.
  out = out.replace(/\b\d{5}-?\d{3}\b/g, '[CEP]');

  // Date of birth (or any date) in dd/mm/yyyy, dd-mm-yyyy, dd.mm.yyyy,
  // dd/mm/yy. We keep the precision permissive — a chat saying "nasci
  // em 14/02/85" should be redacted too.
  out = out.replace(
    /\b(0?[1-9]|[12]\d|3[01])[\/\-.](0?[1-9]|1[0-2])[\/\-.](\d{2}|\d{4})\b/g,
    '[DATE]',
  );

  // Brazilian money figures attached to income/salary/renda labels.
  // Examples: "renda R$ 5.000", "salário de 4500,00", "ganho mensal
  // 12 mil". We are intentionally aggressive here: if the speaker
  // tagged the number as income, the value is sensitive.
  out = out.replace(
    /\b(renda|sal[áa]rio|ganho(?:s)?\s+mensa(?:l|is)?|rendimento(?:s)?)\b[^\d\n]{0,20}(r\$\s?)?\d{1,3}(?:[.,\s]?\d{3})*(?:[.,]\d{2})?(?:\s?mil)?/gi,
    '$1 [INCOME]',
  );

  // Contract / process numbers tagged explicitly. Examples:
  // "contrato 123456", "nº contrato 12-345/2024", "matrícula 9999".
  out = out.replace(
    /\b(contrato|n[º°o]?\s*contrato|matr[íi]cula|processo|protocolo|reserva)\b[^\d\n]{0,8}([a-zA-Z0-9.\-\/]{4,})/gi,
    '$1 [CONTRACT]',
  );

  // Address fragments: "rua/av/avenida/alameda/travessa/praça/estrada
  // <name>, [n / nº / numero] <digits>". We mask only the number, not
  // the whole street name, to keep enough context for the AI to
  // understand it was a location reference.
  out = out.replace(
    /\b(rua|av\.?|avenida|alameda|travessa|pra[çc]a|estrada|rodovia)\s+([^\n,]{1,40}),\s*(n[º°o]?\.?\s*|n[uú]mero\s+)?(\d{1,6})\b/gi,
    '$1 $2, [ADDR_NUM]',
  );

  // Phone — run LAST so that higher-priority numeric IDs (CPF, CNPJ,
  // RG, CEP) have already been masked. Two passes:
  //   1) tolerant formatted form: optional +DDI, optional area-code in
  //      parens, separators (space / dot / dash), optional leading 9.
  //      No \b anchors because `+` and `(` are non-word chars.
  //   2) bare 10–11 digit run anchored on word boundaries.
  out = out.replace(
    /(?:\+?\d{1,3}[\s.-]?)?\(?\d{2,3}\)?[\s.-]?9?\d{4}[\s.-]?\d{4}/g,
    '[PHONE]',
  );
  out = out.replace(/\b\d{10,11}\b/g, '[PHONE]');

  return out;
}

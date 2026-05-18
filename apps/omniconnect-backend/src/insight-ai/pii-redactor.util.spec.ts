import { redactPII } from './pii-redactor.util';

describe('redactPII', () => {
  it('returns empty/falsy input untouched', () => {
    expect(redactPII('')).toBe('');
    expect(redactPII(undefined as any)).toBe(undefined);
  });

  it('redacts emails', () => {
    expect(redactPII('contato em joao.silva@example.com.br ok')).toContain('[EMAIL]');
  });

  it('redacts CPF in formatted and unformatted form', () => {
    expect(redactPII('CPF 123.456.789-00')).toContain('[CPF]');
    expect(redactPII('cpf 12345678900')).toContain('[CPF]');
  });

  it('redacts CNPJ', () => {
    expect(redactPII('empresa 12.345.678/0001-90')).toContain('[CNPJ]');
    expect(redactPII('cnpj 12345678000190')).toContain('[CNPJ]');
  });

  it('does not collapse CNPJ into CPF or PHONE', () => {
    const out = redactPII('cnpj 12.345.678/0001-90');
    expect(out).toContain('[CNPJ]');
    expect(out).not.toContain('[CPF]');
  });

  it('redacts RG with and without separators', () => {
    expect(redactPII('RG 12.345.678-9')).toContain('[RG]');
    expect(redactPII('RG 12345678X')).toContain('[RG]');
  });

  it('redacts CEP', () => {
    expect(redactPII('CEP 01310-100')).toContain('[CEP]');
    expect(redactPII('cep 01310100')).toContain('[CEP]');
  });

  it('redacts dates (dd/mm/yyyy, dd-mm-yyyy, dd.mm.yy)', () => {
    expect(redactPII('nascido em 14/02/1985')).toContain('[DATE]');
    expect(redactPII('data 03-09-1979')).toContain('[DATE]');
    expect(redactPII('aniversário 1.1.90')).toContain('[DATE]');
  });

  it('redacts income/salary phrases', () => {
    expect(redactPII('renda R$ 5.000,00')).toMatch(/renda \[INCOME\]/i);
    expect(redactPII('salário de 4500')).toMatch(/sal[áa]rio \[INCOME\]/i);
    expect(redactPII('ganho mensal 12 mil')).toMatch(/ganho mensal \[INCOME\]/i);
  });

  it('redacts contract / process numbers attached to a label', () => {
    expect(redactPII('contrato 123456')).toMatch(/contrato \[CONTRACT\]/i);
    expect(redactPII('matrícula 9999')).toMatch(/matr[íi]cula \[CONTRACT\]/i);
    expect(redactPII('reserva ABC-123')).toMatch(/reserva \[CONTRACT\]/i);
  });

  it('redacts addresses keeping the street name but masking the number', () => {
    const out = redactPII('moro na Rua das Flores, 123, apto 4');
    expect(out).toMatch(/Rua das Flores/i);
    expect(out).toMatch(/\[ADDR_NUM\]/);
    expect(out).not.toMatch(/, 123/);
  });

  it('redacts phone numbers in BR formats with separators', () => {
    expect(redactPII('+55 (11) 99999-8888')).toContain('[PHONE]');
    expect(redactPII('telefone (11) 99999-1234')).toContain('[PHONE]');
    expect(redactPII('me liga 11 9999-8888')).toContain('[PHONE]');
  });

  it('redacts an unseparated 11-digit run as [CPF] (conservative — CPF wins over phone)', () => {
    // 11-digit unseparated runs are ambiguous (could be a CPF without
    // dots/dash or a mobile without spaces). LGPD risk is higher for
    // CPF, so we let the CPF regex (which runs first) win.
    expect(redactPII('me liga 11999998888')).toContain('[CPF]');
  });

  it('preserves harmless text', () => {
    const out = redactPII('Olá, tudo bem? Vamos marcar a visita.');
    expect(out).toBe('Olá, tudo bem? Vamos marcar a visita.');
  });

  it('handles a multi-pii message without losing readable structure', () => {
    const input =
      'Boa tarde. CPF 123.456.789-00, CEP 01310-100, renda R$ 8.000,00. ' +
      'Contato joao@example.com, telefone (11) 99999-1234. Contrato 4567.';
    const out = redactPII(input);
    expect(out).toContain('[CPF]');
    expect(out).toContain('[CEP]');
    expect(out).toMatch(/renda \[INCOME\]/i);
    expect(out).toContain('[EMAIL]');
    expect(out).toMatch(/\[PHONE\]/);
    expect(out).toMatch(/contrato \[CONTRACT\]/i);
    // Sanity: we did not destroy the sentence skeleton.
    expect(out.toLowerCase()).toContain('boa tarde');
  });
});

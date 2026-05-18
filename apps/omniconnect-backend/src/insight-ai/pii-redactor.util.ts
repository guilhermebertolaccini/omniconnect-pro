export function redactPII(text: string): string {
  if (!text) return text;
  
  return text
    // Redact CPF: 000.000.000-00 or 00000000000
    .replace(/\b\d{3}\.?\d{3}\.?\d{3}-?\d{2}\b/g, '[CPF]')
    // Redact RG: mostly formats like 00.000.000-X or 00.000.000-0
    .replace(/\b\d{2}\.?\d{3}\.?\d{3}-?[\dxX]\b/g, '[RG]')
    // Redact Phone: 10 or 11 digits
    .replace(/\b\d{10,11}\b/g, '[PHONE]')
    // Redact Email
    .replace(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g, '[EMAIL]');
}

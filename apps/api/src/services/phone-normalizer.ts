import { parsePhoneNumberFromString } from "libphonenumber-js";

export interface PhoneNormalizationResult {
  valid: boolean;
  e164: string | null;
  original: string;
  reason?: string;
}

/**
 * Normaliza um telefone para E.164. Assume Brasil (BR) como país padrão
 * quando o número não vem com código de país explícito, mas aceita
 * números internacionais completos (+xx...).
 */
export function normalizePhoneToE164(
  rawPhone: string,
  defaultCountry: "BR" = "BR"
): PhoneNormalizationResult {
  const original = rawPhone?.trim() ?? "";

  if (!original) {
    return { valid: false, e164: null, original, reason: "telefone vazio" };
  }

  const phoneNumber = parsePhoneNumberFromString(original, defaultCountry);

  if (!phoneNumber || !phoneNumber.isValid()) {
    return { valid: false, e164: null, original, reason: "telefone inválido" };
  }

  return { valid: true, e164: phoneNumber.number, original };
}

import { parse } from "csv-parse/sync";
import * as XLSX from "xlsx";
import { prisma } from "../../utils/prisma";
import { normalizePhoneToE164 } from "../../services/phone-normalizer";
import { logger } from "../../utils/logger";

export interface RawLeadRow {
  firstName?: string;
  lastName?: string;
  phone?: string;
  email?: string;
  source?: string;
  campaignName?: string;
  development?: string;
  brokerId?: string;
  tags?: string;
  notes?: string;
  whatsapp_opt_in?: string;
  opt_in_date?: string;
  opt_in_source?: string;
  opt_in_text?: string;
}

export interface ImportSummary {
  totalRows: number;
  imported: number;
  duplicates: number;
  invalidPhones: number;
  missingRequiredFields: number;
  errors: Array<{ row: number; reason: string }>;
}

function parseCsvBuffer(buffer: Buffer): RawLeadRow[] {
  return parse(buffer, { columns: true, skip_empty_lines: true, trim: true });
}

function parseXlsxBuffer(buffer: Buffer): RawLeadRow[] {
  const workbook = XLSX.read(buffer, { type: "buffer" });
  const firstSheet = workbook.Sheets[workbook.SheetNames[0]];
  return XLSX.utils.sheet_to_json<RawLeadRow>(firstSheet, { defval: "" });
}

export function parseLeadsFile(buffer: Buffer, mimetype: string): RawLeadRow[] {
  if (mimetype.includes("csv") || mimetype.includes("text/plain")) {
    return parseCsvBuffer(buffer);
  }
  return parseXlsxBuffer(buffer);
}

/**
 * Importa leads a partir de linhas já parseadas de um arquivo CSV/XLSX.
 * Normaliza telefone para E.164, detecta duplicados e campos ausentes,
 * e grava corretamente os campos de opt-in exigidos por compliance.
 */
export async function importLeadsFromRows(rows: RawLeadRow[], importedByUserId: string): Promise<ImportSummary> {
  const summary: ImportSummary = {
    totalRows: rows.length,
    imported: 0,
    duplicates: 0,
    invalidPhones: 0,
    missingRequiredFields: 0,
    errors: [],
  };

  for (let i = 0; i < rows.length; i++) {
    const row = rows[i];
    const rowNumber = i + 2; // considerando linha de header

    if (!row.firstName || !row.phone) {
      summary.missingRequiredFields++;
      summary.errors.push({ row: rowNumber, reason: "nome ou telefone ausente" });
      continue;
    }

    const phoneResult = normalizePhoneToE164(row.phone);
    if (!phoneResult.valid || !phoneResult.e164) {
      summary.invalidPhones++;
      summary.errors.push({ row: rowNumber, reason: `telefone inválido: ${row.phone}` });
      continue;
    }

    const existing = await prisma.lead.findUnique({ where: { phoneE164: phoneResult.e164 } });
    if (existing) {
      summary.duplicates++;
      summary.errors.push({ row: rowNumber, reason: `telefone duplicado: ${phoneResult.e164}` });
      continue;
    }

    const optIn = String(row.whatsapp_opt_in).toLowerCase() === "true" || row.whatsapp_opt_in === "1";

    try {
      await prisma.lead.create({
        data: {
          firstName: row.firstName,
          lastName: row.lastName ?? null,
          phoneE164: phoneResult.e164,
          email: row.email || null,
          source: row.source || "csv",
          campaignName: row.campaignName || null,
          development: row.development || null,
          brokerId: row.brokerId || null,
          tags: row.tags ? row.tags.split(",").map((t) => t.trim()) : [],
          notes: row.notes || null,
          consent: {
            create: {
              optIn,
              optInDate: optIn ? new Date(row.opt_in_date || Date.now()) : null,
              optInSource: optIn ? row.opt_in_source || row.source || "csv" : null,
              optInText: optIn ? row.opt_in_text || null : null,
            },
          },
          consentLogs: optIn
            ? {
                create: {
                  event: "OPT_IN",
                  source: row.opt_in_source || row.source || "csv",
                  text: row.opt_in_text || null,
                },
              }
            : undefined,
        },
      });
      summary.imported++;
    } catch (err) {
      logger.error({ err, row: rowNumber }, "Falha ao importar linha de lead");
      summary.errors.push({ row: rowNumber, reason: "erro interno ao gravar lead" });
    }
  }

  logger.info({ importedByUserId, summary }, "Importação de leads concluída");
  return summary;
}

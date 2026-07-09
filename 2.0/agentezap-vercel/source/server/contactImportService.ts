import * as XLSX from 'xlsx';
import { randomUUID } from 'crypto';

interface ColumnMapping {
  nameColumn: number | null;
  phoneColumn: number | null;
}

function autoMapContactColumns(headers: string[]): ColumnMapping {
  const nameRegex = /nome|name|contato|cliente/i;
  const phoneRegex = /tel|fone|phone|celular|whatsapp|numero|número/i;

  let nameColumn: number | null = null;
  let phoneColumn: number | null = null;

  for (let i = 0; i < headers.length; i++) {
    const header = headers[i].toString().trim();
    if (nameColumn === null && nameRegex.test(header)) {
      nameColumn = i;
    }
    if (phoneColumn === null && phoneRegex.test(header)) {
      phoneColumn = i;
    }
  }

  // Fallback: primeira coluna é nome, segunda é telefone
  if (nameColumn === null) nameColumn = 0;
  if (phoneColumn === null) phoneColumn = 1;

  return { nameColumn, phoneColumn };
}

export interface ParsedPreview {
  headers: string[];
  preview: string[][];
  suggestedMapping: ColumnMapping;
  totalRows: number;
}

export async function parseContactFile(buffer: Buffer, mimetype: string): Promise<ParsedPreview> {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    const data = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: '',
      blankrows: false,
    }) as string[][];

    if (data.length === 0) {
      throw new Error('Arquivo vazio ou inválido');
    }

    const headers = data[0];
    const preview = data.slice(1, Math.min(11, data.length)); // Máx 10 linhas de preview
    const suggestedMapping = autoMapContactColumns(headers);

    return {
      headers,
      preview,
      suggestedMapping,
      totalRows: data.length - 1, // Excluding header
    };
  } catch (error) {
    throw new Error(`Erro ao processar arquivo: ${error instanceof Error ? error.message : String(error)}`);
  }
}

export interface Contact {
  id: string;
  name: string;
  phone: string;
}

export interface ExtractionResult {
  contacts: Contact[];
  skipped: number;
  total: number;
}

export async function extractContacts(
  buffer: Buffer,
  mimetype: string,
  mapping: ColumnMapping,
): Promise<ExtractionResult> {
  try {
    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheetName = workbook.SheetNames[0];
    const sheet = workbook.Sheets[sheetName];

    const data = XLSX.utils.sheet_to_json(sheet, {
      header: 1,
      defval: '',
      blankrows: false,
    }) as string[][];

    if (data.length === 0) {
      throw new Error('Arquivo vazio ou inválido');
    }

    const contacts: Contact[] = [];
    let skipped = 0;
    const total = Math.max(0, data.length - 1);

    for (let i = 1; i < data.length; i++) {
      const row = data[i];

      // Extrair dados conforme mapeamento
      let name = '';
      let phone = '';

      if (mapping.nameColumn !== null && mapping.nameColumn < row.length) {
        name = row[mapping.nameColumn].toString().trim();
      }

      if (mapping.phoneColumn !== null && mapping.phoneColumn < row.length) {
        phone = row[mapping.phoneColumn].toString().trim();
      }

      // Limpar telefone (remover tudo que não for dígito)
      const cleanedPhone = phone.replace(/\D/g, '');

      // Normalizar: se tiver 10-11 dígitos, prefixar 55; se tiver 12-13, manter
      let finalPhone = '';
      if (cleanedPhone.length === 10 || cleanedPhone.length === 11) {
        finalPhone = '55' + cleanedPhone;
      } else if (cleanedPhone.length === 12 || cleanedPhone.length === 13) {
        finalPhone = cleanedPhone;
      } else {
        // Número inválido - descartar
        skipped++;
        continue;
      }

      // Validação final: deve ter exatamente 12 ou 13 dígitos
      if (!/^\d{12,13}$/.test(finalPhone)) {
        skipped++;
        continue;
      }

      contacts.push({
        id: randomUUID(),
        name,
        phone: finalPhone,
      });
    }

    return {
      contacts,
      skipped,
      total,
    };
  } catch (error) {
    throw new Error(`Erro ao processar arquivo: ${error instanceof Error ? error.message : String(error)}`);
  }
}

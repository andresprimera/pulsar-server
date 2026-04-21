import { BadRequestException } from '@nestjs/common';
import { parse } from 'csv-parse/sync';
import mammoth from 'mammoth';
import * as XLSX from 'xlsx';
import pdfParse from 'pdf-parse';
import {
  CLIENT_CATALOG_TABULAR_REQUIRED_HEADERS,
  CATALOG_IMPORT_ROWS_PER_LLM_BATCH,
} from '@shared/client-catalog-item.contract';
import {
  CATALOG_IMPORT_PDF_MAX_PAGES_MULTIMODAL,
  CATALOG_IMPORT_PDF_MAX_TEXT_BYTES_MULTIMODAL,
  CATALOG_IMPORT_UNSTRUCTURED_TEXT_CHUNK_CHARS,
} from './catalog-import.constants';

export type CatalogImportLlmWorkUnit = {
  userText: string;
  attachments?: Array<{
    buffer: Buffer;
    mimeType: string;
    filename?: string;
  }>;
};

export type TabularExtract = {
  kind: 'tabular';
  headersNormalized: Set<string>;
  rows: Record<string, string>[];
};

export type UnstructuredExtract = {
  kind: 'unstructured';
  text: string;
  /** Optional multimodal attachment (e.g. image or small PDF). */
  multimodal?: {
    buffer: Buffer;
    mimeType: string;
    filename?: string;
  };
};

export type CatalogExtractResult = TabularExtract | UnstructuredExtract;

function normalizeHeaderKey(raw: string): string {
  return String(raw ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, '_');
}

export function assertTabularRequiredHeaders(
  headerKeys: Iterable<string>,
): void {
  const normalized = new Set(
    [...headerKeys].map((h) => normalizeHeaderKey(h)).filter(Boolean),
  );
  const missing = CLIENT_CATALOG_TABULAR_REQUIRED_HEADERS.filter(
    (req) => !normalized.has(req),
  );
  if (missing.length > 0) {
    throw new BadRequestException({
      code: 'CATALOG_IMPORT_MISSING_REQUIRED_MAPPING',
      message:
        'Tabular file is missing required columns for sku, name, and type (case-insensitive headers).',
      missing,
    });
  }
}

function coerceRowStrings(
  row: Record<string, unknown>,
): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(row)) {
    const nk = normalizeHeaderKey(k);
    if (!nk) {
      continue;
    }
    if (v === null || v === undefined) {
      out[nk] = '';
    } else if (typeof v === 'string') {
      out[nk] = v;
    } else if (typeof v === 'number' || typeof v === 'boolean') {
      out[nk] = String(v);
    } else if (v instanceof Date) {
      out[nk] = v.toISOString();
    } else {
      out[nk] = JSON.stringify(v);
    }
  }
  return out;
}

export async function extractCatalogFromUpload(params: {
  buffer: Buffer;
  mimeType: string;
  originalname?: string;
}): Promise<CatalogExtractResult> {
  const mime = params.mimeType.toLowerCase();

  if (mime === 'text/csv') {
    const records = parse(params.buffer, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    }) as Record<string, unknown>[];
    if (!records.length) {
      throw new BadRequestException({
        code: 'CATALOG_IMPORT_EMPTY',
        message: 'CSV contained no data rows.',
      });
    }
    const first = records[0];
    const headerKeys = Object.keys(first);
    assertTabularRequiredHeaders(headerKeys);
    const rows = records.map((r) => coerceRowStrings(r));
    return {
      kind: 'tabular',
      headersNormalized: new Set(
        headerKeys.map((h) => normalizeHeaderKey(h)).filter(Boolean),
      ),
      rows,
    };
  }

  if (
    mime ===
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' ||
    mime === 'application/vnd.ms-excel'
  ) {
    const workbook = XLSX.read(params.buffer, {
      type: 'buffer',
      cellDates: true,
    });
    const sheetName = workbook.SheetNames[0];
    if (!sheetName) {
      throw new BadRequestException({
        code: 'CATALOG_IMPORT_UNREADABLE',
        message: 'Spreadsheet contained no sheets.',
      });
    }
    const sheet = workbook.Sheets[sheetName];
    const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
      defval: '',
    });
    if (!records.length) {
      throw new BadRequestException({
        code: 'CATALOG_IMPORT_EMPTY',
        message: 'Spreadsheet contained no data rows.',
      });
    }
    const headerKeys = Object.keys(records[0]);
    assertTabularRequiredHeaders(headerKeys);
    const rows = records.map((r) => coerceRowStrings(r));
    return {
      kind: 'tabular',
      headersNormalized: new Set(
        headerKeys.map((h) => normalizeHeaderKey(h)).filter(Boolean),
      ),
      rows,
    };
  }

  if (mime === 'application/pdf') {
    const parsed = await pdfParse(params.buffer);
    const text = (parsed.text ?? '').trim();
    if (!text) {
      throw new BadRequestException({
        code: 'CATALOG_IMPORT_UNREADABLE',
        message: 'Could not extract text from PDF.',
      });
    }
    const multimodal =
      parsed.numpages <= CATALOG_IMPORT_PDF_MAX_PAGES_MULTIMODAL &&
      Buffer.byteLength(text, 'utf8') <=
        CATALOG_IMPORT_PDF_MAX_TEXT_BYTES_MULTIMODAL
        ? {
            buffer: params.buffer,
            mimeType: mime,
            filename: params.originalname,
          }
        : undefined;
    return {
      kind: 'unstructured',
      text,
      ...(multimodal ? { multimodal } : {}),
    };
  }

  if (
    mime ===
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ) {
    const result = await mammoth.extractRawText({ buffer: params.buffer });
    const text = (result.value ?? '').trim();
    if (!text) {
      throw new BadRequestException({
        code: 'CATALOG_IMPORT_UNREADABLE',
        message: 'Could not extract text from DOCX.',
      });
    }
    return { kind: 'unstructured', text };
  }

  if (mime.startsWith('image/')) {
    return {
      kind: 'unstructured',
      text: 'The attached image is a catalog or price list. Extract every product or service row you can read.',
      multimodal: {
        buffer: params.buffer,
        mimeType: mime,
        filename: params.originalname,
      },
    };
  }

  throw new BadRequestException({
    code: 'CATALOG_IMPORT_UNSUPPORTED',
    message: `Unsupported MIME type: ${mime}`,
  });
}

export function buildLlmWorkUnitsFromExtract(
  extract: CatalogExtractResult,
): CatalogImportLlmWorkUnit[] {
  if (extract.kind === 'tabular') {
    const units: CatalogImportLlmWorkUnit[] = [];
    for (
      let i = 0;
      i < extract.rows.length;
      i += CATALOG_IMPORT_ROWS_PER_LLM_BATCH
    ) {
      const slice = extract.rows.slice(
        i,
        i + CATALOG_IMPORT_ROWS_PER_LLM_BATCH,
      );
      const lines = slice.map((row) => JSON.stringify(row));
      const userText = [
        'Each line is one CSV/row object with normalized lowercase keys.',
        'Map type to exactly "product" or "service" (lowercase).',
        'Return one catalog item per line in the same order when possible.',
        '',
        ...lines,
      ].join('\n');
      units.push({ userText });
    }
    return units;
  }

  if (extract.multimodal) {
    return [
      {
        userText: extract.text,
        attachments: [extract.multimodal],
      },
    ];
  }

  const text = extract.text;
  if (text.length <= CATALOG_IMPORT_UNSTRUCTURED_TEXT_CHUNK_CHARS) {
    return [{ userText: text }];
  }
  const units: CatalogImportLlmWorkUnit[] = [];
  for (
    let i = 0;
    i < text.length;
    i += CATALOG_IMPORT_UNSTRUCTURED_TEXT_CHUNK_CHARS
  ) {
    const chunk = text.slice(
      i,
      i + CATALOG_IMPORT_UNSTRUCTURED_TEXT_CHUNK_CHARS,
    );
    units.push({
      userText: `Catalog excerpt (part ${units.length + 1}):\n${chunk}`,
    });
  }
  return units;
}

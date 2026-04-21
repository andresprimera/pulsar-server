/** Max upload size per file (multipart / Multer). */
export const CATALOG_IMPORT_MAX_FILE_BYTES = 25 * 1024 * 1024;

/** Use multimodal PDF path only when within these bounds (in addition to MIME allowlist). */
export const CATALOG_IMPORT_PDF_MAX_PAGES_MULTIMODAL = 8;
export const CATALOG_IMPORT_PDF_MAX_TEXT_BYTES_MULTIMODAL = 4 * 1024 * 1024;

/** Chunk unstructured text before sending to the LLM (character budget). */
export const CATALOG_IMPORT_UNSTRUCTURED_TEXT_CHUNK_CHARS = 12_000;

export const CATALOG_IMPORT_ALLOWED_MIMES = new Set([
  'text/csv',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/pdf',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
]);

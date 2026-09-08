/**
 * Code-defined catalog of document/record types.
 *
 * The `documents` table stores `type` as a free `TEXT` value and has no
 * knowledge of which types exist or what mode they imply — all of that lives
 * here. The chosen type's `mode` is the source of truth for which payload a
 * document carries:
 *   - `file`   → the item is a stored upload or an external link.
 *   - `record` → the item has no file; it holds a list of FIELD:VALUE pairs.
 *
 * Adding, renaming, or re-typing a document type is a one-line edit to
 * {@link DOCUMENT_TYPES} — no database or schema change is needed.
 */

export type DocumentTypeMode = 'file' | 'record'

export type DocumentTypeDef = {
  /** Stored in `documents.type`. */
  value: string
  /** Shown in the dropdown. */
  label: string
  /** `file` → upload/link a file; `record` → enter field:value pairs. */
  mode: DocumentTypeMode
  /** (record mode) optional predefined field names to pre-seed the editor. */
  fields?: string[]
}

export const DOCUMENT_TYPES: readonly DocumentTypeDef[] = [
  { value: 'medical_consent', label: 'Medical/Consent', mode: 'file' },
  { value: 'identification', label: 'Identification', mode: 'file' },
  { value: 'report_record', label: 'Report/Record', mode: 'file' },
  { value: 'contract', label: 'Contract', mode: 'file' },
  { value: 'qualification', label: 'Qualification', mode: 'file' },
  { value: 'other', label: 'Other', mode: 'file' },
  {
    value: 'dbs_check',
    label: 'DBS Check',
    mode: 'record',
    fields: ['Certificate No', 'Issue date', 'Status'],
  },
]

/** Resolve a stored `type` value back to its definition, or `undefined`. */
export function getDocumentType(value: string): DocumentTypeDef | undefined {
  return DOCUMENT_TYPES.find((t) => t.value === value)
}

/** True when `value` is a known catalog type with the given mode. */
export function isDocumentTypeOfMode(
  value: string,
  mode: DocumentTypeMode,
): boolean {
  return getDocumentType(value)?.mode === mode
}

import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  render,
  screen,
  fireEvent,
  waitFor,
  within,
} from '@testing-library/react'

vi.mock('@/app/documents/actions', () => ({
  uploadDocumentAction: vi.fn(),
  linkDocumentAction: vi.fn(),
  createRecordAction: vi.fn(),
  updateDocumentAction: vi.fn(),
  deleteDocumentAction: vi.fn(),
}))

vi.mock('@/lib/documentTypes', () => {
  const DOCUMENT_TYPES = [
    { value: 'file_type', label: 'File Type', mode: 'file' },
    { value: 'rec_type', label: 'Rec Type', mode: 'record', fields: ['Ref'] },
  ]
  return {
    DOCUMENT_TYPES,
    getDocumentType: (v: string) => DOCUMENT_TYPES.find((t) => t.value === v),
  }
})

import {
  uploadDocumentAction,
  linkDocumentAction,
  createRecordAction,
  updateDocumentAction,
  deleteDocumentAction,
} from '@/app/documents/actions'
import type { DocumentRow } from '@/db'

import DocumentsSection from './DocumentsSection'

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(uploadDocumentAction).mockResolvedValue(undefined)
  vi.mocked(linkDocumentAction).mockResolvedValue(undefined)
  vi.mocked(createRecordAction).mockResolvedValue(undefined)
  vi.mocked(updateDocumentAction).mockResolvedValue(undefined)
  vi.mocked(deleteDocumentAction).mockResolvedValue(undefined)
})

function doc(overrides: Partial<DocumentRow>): DocumentRow {
  return {
    id: 'd',
    student_id: 'stu-1',
    staff_id: null,
    name: 'Doc',
    type: 'file_type',
    expires_at: null,
    other: null,
    source: 'upload',
    storage_key: 'k',
    external_url: null,
    fields: null,
    file_name: null,
    file_size: null,
    mime_type: null,
    created_by: 's',
    updated_by: null,
    deleted_at: null,
    deleted_by: null,
    created_at: '2026-01-01T00:00:00Z',
    updated_at: '2026-01-01T00:00:00Z',
    ...overrides,
  }
}

const mixed: DocumentRow[] = [
  doc({
    id: 'd1',
    name: 'Passport',
    source: 'upload',
    expires_at: '2030-03-12',
  }),
  doc({
    id: 'd2',
    name: 'Consent',
    source: 'link',
    storage_key: null,
    external_url: 'https://x',
    other: 'note',
  }),
  doc({
    id: 'd3',
    name: 'DBS',
    type: 'rec_type',
    source: 'record',
    storage_key: null,
    fields: [{ field: 'Ref', value: '123' }],
  }),
]

function renderSection(
  props: Partial<React.ComponentProps<typeof DocumentsSection>> = {},
) {
  return render(
    <DocumentsSection
      ownerType="student"
      ownerId="11111111-1111-4111-8111-111111111111"
      documents={mixed}
      canManage
      {...props}
    />,
  )
}

describe('list rendering', () => {
  it('renders every item, with View links only on files and inline record fields', () => {
    const { container } = renderSection()
    expect(screen.getByText('Passport')).toBeTruthy()
    expect(screen.getByText('Consent')).toBeTruthy()
    expect(screen.getByText('DBS')).toBeTruthy()

    const viewLinks = container.querySelectorAll('a[href^="/api/documents/"]')
    expect(viewLinks).toHaveLength(2)
    expect(
      container.querySelector('a[href="/api/documents/d1/download"]'),
    ).toHaveProperty('target', '_blank')

    // record fields shown inline
    expect(screen.getByText('Ref:')).toBeTruthy()
  })

  it('shows an empty state when there are no documents', () => {
    renderSection({ documents: [] })
    expect(screen.getByText('No documents or records yet.')).toBeTruthy()
  })
})

describe('manage gating', () => {
  it('read-only surface hides add/edit/delete but keeps View', () => {
    const { container } = renderSection({ canManage: false })
    expect(screen.queryByText('+ Add document or record')).toBeNull()
    expect(screen.queryByText('Edit')).toBeNull()
    expect(screen.queryByText('Delete')).toBeNull()
    expect(
      container.querySelectorAll('a[href^="/api/documents/"]').length,
    ).toBe(2)
  })

  it('shows add/edit/delete when canManage', () => {
    renderSection()
    expect(screen.getByText('+ Add document or record')).toBeTruthy()
    expect(screen.getAllByText('Edit').length).toBeGreaterThan(0)
  })
})

describe('read-only by default', () => {
  it('renders no form inputs until an action is taken', () => {
    renderSection()
    expect(screen.queryByRole('combobox')).toBeNull()
  })
})

describe('type drives mode', () => {
  it('file type reveals upload/link inputs and no field editor', () => {
    renderSection({ documents: [] })
    fireEvent.click(screen.getByText('+ Add document or record'))
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'file_type' },
    })
    expect(screen.getByLabelText('Upload file')).toBeTruthy()
    expect(screen.queryByLabelText('Field 1 name')).toBeNull()
  })

  it('record type reveals the field editor pre-seeded and no file input', () => {
    renderSection({ documents: [] })
    fireEvent.click(screen.getByText('+ Add document or record'))
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'rec_type' },
    })
    const firstField = screen.getByLabelText('Field 1 name') as HTMLInputElement
    expect(firstField.value).toBe('Ref')
    expect(screen.queryByLabelText('Upload file')).toBeNull()
  })
})

describe('upload flow', () => {
  it('submits an upload with the expiry in the FormData', async () => {
    const { container } = renderSection({ documents: [] })
    fireEvent.click(screen.getByText('+ Add document or record'))
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'file_type' },
    })
    fireEvent.change(container.querySelector('input[name="name"]')!, {
      target: { value: 'Scan' },
    })
    fireEvent.click(screen.getByLabelText('Never'))
    const file = new File(['x'], 'a.pdf', { type: 'application/pdf' })
    fireEvent.change(screen.getByLabelText('Choose file'), {
      target: { files: [file] },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(uploadDocumentAction).toHaveBeenCalled())
    const fd = vi.mocked(uploadDocumentAction).mock.calls[0][0]
    expect(fd.get('expires_at')).toBe('never')
    expect(fd.get('name')).toBe('Scan')
  })

  it('shows a pending "Uploading…" label while the action runs', async () => {
    let resolve!: () => void
    vi.mocked(uploadDocumentAction).mockReturnValue(
      new Promise<void>((r) => {
        resolve = r
      }),
    )
    const { container } = renderSection({ documents: [] })
    fireEvent.click(screen.getByText('+ Add document or record'))
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'file_type' },
    })
    fireEvent.change(container.querySelector('input[name="name"]')!, {
      target: { value: 'Scan' },
    })
    fireEvent.click(screen.getByLabelText('Never'))
    fireEvent.change(screen.getByLabelText('Choose file'), {
      target: {
        files: [new File(['x'], 'a.pdf', { type: 'application/pdf' })],
      },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(screen.getByText('Uploading…')).toBeTruthy())
    resolve()
  })
})

describe('link flow', () => {
  it('submits a link via linkDocumentAction', async () => {
    const { container } = renderSection({ documents: [] })
    fireEvent.click(screen.getByText('+ Add document or record'))
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'file_type' },
    })
    fireEvent.change(container.querySelector('input[name="name"]')!, {
      target: { value: 'Link doc' },
    })
    fireEvent.click(screen.getByLabelText('Never'))
    fireEvent.click(screen.getByLabelText('Paste link'))
    fireEvent.change(screen.getByLabelText('Link URL'), {
      target: { value: 'https://example.com/a.pdf' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(linkDocumentAction).toHaveBeenCalled())
    expect(uploadDocumentAction).not.toHaveBeenCalled()
  })
})

describe('record flow', () => {
  it('adds/removes fields and submits via createRecordAction', async () => {
    const { container } = renderSection({ documents: [] })
    fireEvent.click(screen.getByText('+ Add document or record'))
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'rec_type' },
    })
    fireEvent.change(container.querySelector('input[name="name"]')!, {
      target: { value: 'DBS' },
    })
    fireEvent.click(screen.getByLabelText('Never'))
    // pre-seeded 'Ref' field; add a value and a second field
    fireEvent.change(screen.getByLabelText('Field 1 value'), {
      target: { value: '123' },
    })
    fireEvent.click(screen.getByText('+ Add field'))
    fireEvent.change(screen.getByLabelText('Field 2 name'), {
      target: { value: 'Status' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(createRecordAction).toHaveBeenCalled())
    const fd = vi.mocked(createRecordAction).mock.calls[0][0]
    const parsed = JSON.parse(fd.get('fields') as string)
    expect(parsed).toEqual([
      { field: 'Ref', value: '123' },
      { field: 'Status', value: '' },
    ])
  })

  it('blocks a record with no named fields', async () => {
    const { container } = renderSection({ documents: [] })
    fireEvent.click(screen.getByText('+ Add document or record'))
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'rec_type' },
    })
    fireEvent.change(container.querySelector('input[name="name"]')!, {
      target: { value: 'DBS' },
    })
    fireEvent.click(screen.getByLabelText('Never'))
    fireEvent.click(screen.getByLabelText('Remove field 1'))
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(screen.getByText('Add at least one field')).toBeTruthy()
    expect(createRecordAction).not.toHaveBeenCalled()
  })
})

describe('expiry is compulsory', () => {
  it('blocks submit until Date or Never is chosen', async () => {
    const { container } = renderSection({ documents: [] })
    fireEvent.click(screen.getByText('+ Add document or record'))
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'file_type' },
    })
    fireEvent.change(container.querySelector('input[name="name"]')!, {
      target: { value: 'Scan' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    expect(
      screen.getByText('Choose an expiry date or select Never'),
    ).toBeTruthy()
    expect(uploadDocumentAction).not.toHaveBeenCalled()
  })
})

describe('edit flow', () => {
  it('opens a row read-only and edits via updateDocumentAction', async () => {
    renderSection({ documents: [mixed[1]] }) // the link doc
    expect(screen.queryByRole('combobox')).toBeNull()

    fireEvent.click(screen.getByText('Edit'))
    const select = screen.getByRole('combobox') as HTMLSelectElement
    expect(select.value).toBe('file_type')
    const name = screen.getByDisplayValue('Consent')
    fireEvent.change(name, { target: { value: 'Consent v2' } })
    fireEvent.click(screen.getByRole('button', { name: 'Save' }))

    await waitFor(() => expect(updateDocumentAction).toHaveBeenCalled())
    expect(vi.mocked(updateDocumentAction).mock.calls[0][0]).toBe('d2')
  })

  it('Cancel restores the row without calling the action', () => {
    renderSection({ documents: [mixed[1]] })
    fireEvent.click(screen.getByText('Edit'))
    expect(screen.getByRole('combobox')).toBeTruthy()
    fireEvent.click(screen.getByRole('button', { name: 'Cancel' }))
    expect(screen.queryByRole('combobox')).toBeNull()
    expect(updateDocumentAction).not.toHaveBeenCalled()
  })
})

describe('delete flow', () => {
  it('confirms via dialog before calling deleteDocumentAction', async () => {
    renderSection({ documents: [mixed[0]] })
    fireEvent.click(screen.getByText('Delete'))
    const dialog = screen.getByRole('dialog')
    expect(within(dialog).getByText('Delete document')).toBeTruthy()
    expect(deleteDocumentAction).not.toHaveBeenCalled()

    fireEvent.click(within(dialog).getByRole('button', { name: 'Confirm' }))
    await waitFor(() => expect(deleteDocumentAction).toHaveBeenCalledWith('d1'))
  })

  it('Cancel closes the dialog without deleting', () => {
    renderSection({ documents: [mixed[0]] })
    fireEvent.click(screen.getByText('Delete'))
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', {
        name: 'Cancel',
      }),
    )
    expect(deleteDocumentAction).not.toHaveBeenCalled()
  })
})

describe('error surface', () => {
  it('renders an action error in red', async () => {
    vi.mocked(linkDocumentAction).mockResolvedValue({ error: 'Boom' })
    const { container } = renderSection({ documents: [] })
    fireEvent.click(screen.getByText('+ Add document or record'))
    fireEvent.change(screen.getByRole('combobox'), {
      target: { value: 'file_type' },
    })
    fireEvent.change(container.querySelector('input[name="name"]')!, {
      target: { value: 'Link' },
    })
    fireEvent.click(screen.getByLabelText('Never'))
    fireEvent.click(screen.getByLabelText('Paste link'))
    fireEvent.change(screen.getByLabelText('Link URL'), {
      target: { value: 'https://x' },
    })
    fireEvent.click(screen.getByRole('button', { name: 'Add' }))

    await waitFor(() => expect(screen.getByText('Boom')).toBeTruthy())
  })
})

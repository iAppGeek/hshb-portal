import { describe, it, expect, vi } from 'vitest'
import {
  act,
  fireEvent,
  render,
  renderHook,
  screen,
  waitFor,
} from '@testing-library/react'

import type { ActionResult } from '@/lib/action'

import TextField from './TextField'
import { useServerForm } from './useServerForm'

function TestForm({
  action,
}: {
  action: (formData: FormData) => Promise<ActionResult>
}): React.ReactElement {
  const { handleSubmit, fieldError } = useServerForm(action)
  return (
    <form aria-label="Test form" onSubmit={handleSubmit}>
      <TextField label="Name" name="name" error={fieldError('name')} />
      <TextField label="Email" name="email" error={fieldError('email')} />
      <button type="submit">Save</button>
    </form>
  )
}

function buildForm(fields: Record<string, string> = {}): HTMLFormElement {
  const form = document.createElement('form')
  for (const [name, value] of Object.entries(fields)) {
    const input = document.createElement('input')
    input.name = name
    input.value = value
    form.appendChild(input)
  }
  document.body.appendChild(form)
  return form
}

function submit(form: HTMLFormElement): React.FormEvent<HTMLFormElement> {
  return {
    preventDefault: vi.fn(),
    currentTarget: form,
  } as unknown as React.FormEvent<HTMLFormElement>
}

describe('useServerForm', () => {
  it('sets error and fieldErrors on an error result', async () => {
    const form = buildForm()
    const action = vi.fn().mockResolvedValue({
      error: 'Fix the errors below',
      fieldErrors: { email: 'Invalid email' },
    })
    const { result } = renderHook(() => useServerForm(action))

    await act(async () => {
      result.current.handleSubmit(submit(form))
    })

    expect(result.current.error).toBe('Fix the errors below')
    expect(result.current.fieldErrors).toEqual({ email: 'Invalid email' })
    expect(result.current.fieldError('email')).toBe('Invalid email')
  })

  it('scrolls to and focuses the field that renders as invalid once the errors commit', async () => {
    const scrollIntoView = vi
      .spyOn(Element.prototype, 'scrollIntoView')
      .mockImplementation(() => {})
    const action = vi.fn().mockResolvedValue({
      error: 'Fix the errors below',
      fieldErrors: { email: 'Invalid email' },
    })
    render(<TestForm action={action} />)

    await act(async () => {
      fireEvent.submit(screen.getByRole('form', { name: 'Test form' }))
    })

    const email = screen.getByLabelText('Email')
    await waitFor(() => expect(email).toHaveFocus())
    expect(email).toHaveAttribute('aria-invalid', 'true')
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center' })
    expect(scrollIntoView.mock.contexts).toContain(email)
    scrollIntoView.mockRestore()
  })

  it('does not scroll on a successful submit', async () => {
    const scrollIntoView = vi
      .spyOn(Element.prototype, 'scrollIntoView')
      .mockImplementation(() => {})
    const action = vi.fn().mockResolvedValue(undefined)
    render(<TestForm action={action} />)

    await act(async () => {
      fireEvent.submit(screen.getByRole('form', { name: 'Test form' }))
    })

    expect(action).toHaveBeenCalled()
    expect(scrollIntoView).not.toHaveBeenCalled()
    scrollIntoView.mockRestore()
  })

  it('calls onSuccess with data and clears errors on a data result', async () => {
    const form = buildForm()
    const onSuccess = vi.fn()
    const action = vi.fn().mockResolvedValue({ data: { id: '123' } })
    const { result } = renderHook(() => useServerForm(action, { onSuccess }))

    await act(async () => {
      result.current.handleSubmit(submit(form))
    })

    expect(onSuccess).toHaveBeenCalledWith({ id: '123' })
    expect(result.current.error).toBeNull()
    expect(result.current.fieldErrors).toEqual({})
  })

  it('clears a previous error when resubmitted', async () => {
    const form = buildForm()
    const action = vi
      .fn()
      .mockResolvedValueOnce({
        error: 'Bad',
        fieldErrors: { name: 'Required' },
      })
      .mockResolvedValueOnce(undefined)
    const { result } = renderHook(() => useServerForm(action))

    await act(async () => {
      result.current.handleSubmit(submit(form))
    })
    expect(result.current.error).toBe('Bad')

    await act(async () => {
      result.current.handleSubmit(submit(form))
    })
    expect(result.current.error).toBeNull()
    expect(result.current.fieldErrors).toEqual({})
  })

  it('reset clears error and fieldErrors', async () => {
    const form = buildForm()
    const action = vi.fn().mockResolvedValue({ error: 'Bad' })
    const { result } = renderHook(() => useServerForm(action))

    await act(async () => {
      result.current.handleSubmit(submit(form))
    })
    expect(result.current.error).toBe('Bad')

    act(() => {
      result.current.reset()
    })
    expect(result.current.error).toBeNull()
    expect(result.current.fieldErrors).toEqual({})
  })
})

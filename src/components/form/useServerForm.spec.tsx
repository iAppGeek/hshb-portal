import { describe, it, expect, vi } from 'vitest'
import { act, renderHook } from '@testing-library/react'

import { useServerForm } from './useServerForm'

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
  it('sets error and fieldErrors, and scrolls/focuses the first invalid field, on an error result', async () => {
    const form = buildForm()
    const input = document.createElement('input')
    input.name = 'email'
    input.setAttribute('aria-invalid', 'true')
    form.appendChild(input)
    const scrollIntoView = vi.fn()
    input.scrollIntoView = scrollIntoView
    const focus = vi.spyOn(input, 'focus')

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
    expect(scrollIntoView).toHaveBeenCalledWith({ block: 'center' })
    expect(focus).toHaveBeenCalled()
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

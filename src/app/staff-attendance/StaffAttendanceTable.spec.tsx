import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import {
  render,
  screen,
  fireEvent,
  act,
  within,
  cleanup,
} from '@testing-library/react'

const router = vi.hoisted(() => ({ refresh: vi.fn(), replace: vi.fn() }))

vi.mock('next/navigation', () => ({
  useRouter: () => router,
  usePathname: () => '/staff-attendance',
}))

vi.mock('./actions', () => ({
  signInAction: vi.fn(),
  signOutAction: vi.fn(),
}))

import StaffAttendanceTable from './StaffAttendanceTable'
import { signInAction, signOutAction } from './actions'

beforeEach(() => {
  vi.clearAllMocks()
})

const staffA = {
  id: 'staff-1',
  first_name: 'Jane',
  last_name: 'Smith',
  display_name: null,
  class_name: 'Year 3A',
  class_year_group: '3',
  room_number: '12',
}

const staffB = {
  id: 'staff-2',
  first_name: 'Bob',
  last_name: 'Jones',
  display_name: 'BJ',
  class_name: null,
  class_year_group: null,
  room_number: null,
}

const signedInRecord = {
  id: 'sa-1',
  staff_id: 'staff-1',
  date: '2026-03-18',
  signed_in_at: '2026-03-18T09:00:00Z',
  signed_out_at: null,
  created_at: null,
  updated_at: null,
}

const signedOutRecord = {
  ...signedInRecord,
  signed_out_at: '2026-03-18T17:00:00Z',
}

type Deferred<T> = { promise: Promise<T>; resolve: (value: T) => void }

function deferred<T>(): Deferred<T> {
  let resolve!: (value: T) => void
  const promise = new Promise<T>((r) => {
    resolve = r
  })
  return { promise, resolve }
}

// The grid renders through SimpleGrid/FunctionalGrid's stacked mode, which
// keeps a mobile summary alongside the desktop cells (both in the DOM, one
// hidden by CSS per breakpoint — plans/shared-grids.md §5). The sign-in/out
// form is a real client component either way, so it mounts twice per row;
// submitting either one drives the same server action and the same shared
// (lifted) saved-row state, so tests interact with the first instance.
function firstOf(label: string): HTMLElement {
  return screen.getAllByRole('button', { name: label })[0]
}

describe('StaffAttendanceTable', () => {
  it('renders staff names, class and room', () => {
    render(
      <StaffAttendanceTable
        rows={[
          { staff: staffA, record: null },
          { staff: staffB, record: null },
        ]}
        defaultTime="09:00"
        date="2026-03-18"
        today="2026-03-18"
        role="admin"
        currentStaffId="admin-1"
      />,
    )

    expect(screen.getAllByText('Jane Smith').length).toBeGreaterThan(0)
    expect(screen.getAllByText('BJ').length).toBeGreaterThan(0)
    expect(screen.getByText('Year 3A')).toBeInTheDocument()
    expect(screen.getByText('12')).toBeInTheDocument()
  })

  it('shows Sign In button for staff with no record', () => {
    render(
      <StaffAttendanceTable
        rows={[{ staff: staffA, record: null }]}
        defaultTime="09:00"
        date="2026-03-18"
        today="2026-03-18"
        role="admin"
        currentStaffId="admin-1"
      />,
    )

    expect(screen.getAllByRole('button', { name: 'Sign In' })).toHaveLength(2)
  })

  it('shows Sign Out button and Signed In badge for currently signed-in staff', () => {
    render(
      <StaffAttendanceTable
        rows={[{ staff: staffA, record: signedInRecord }]}
        defaultTime="09:00"
        date="2026-03-18"
        today="2026-03-18"
        role="admin"
        currentStaffId="admin-1"
      />,
    )

    expect(screen.getAllByRole('button', { name: 'Sign Out' })).toHaveLength(2)
    expect(screen.getAllByText(/Signed In/).length).toBeGreaterThan(0)
  })

  it('shows Sign In button for staff who have signed out (re-sign-in)', () => {
    render(
      <StaffAttendanceTable
        rows={[{ staff: staffA, record: signedOutRecord }]}
        defaultTime="09:00"
        date="2026-03-18"
        today="2026-03-18"
        role="admin"
        currentStaffId="admin-1"
      />,
    )

    expect(screen.getAllByRole('button', { name: 'Sign In' })).toHaveLength(2)
    expect(screen.getAllByText(/Out/).length).toBeGreaterThan(0)
  })

  it('calls signInAction on sign in form submit', async () => {
    vi.mocked(signInAction).mockResolvedValue(undefined)

    render(
      <StaffAttendanceTable
        rows={[{ staff: staffA, record: null }]}
        defaultTime="09:00"
        date="2026-03-18"
        today="2026-03-18"
        role="admin"
        currentStaffId="admin-1"
      />,
    )

    await act(async () => {
      fireEvent.submit(firstOf('Sign In').closest('form')!)
    })

    expect(signInAction).toHaveBeenCalled()
  })

  it('calls signOutAction on sign out form submit', async () => {
    vi.mocked(signOutAction).mockResolvedValue(undefined)

    render(
      <StaffAttendanceTable
        rows={[{ staff: staffA, record: signedInRecord }]}
        defaultTime="09:00"
        date="2026-03-18"
        today="2026-03-18"
        role="admin"
        currentStaffId="admin-1"
      />,
    )

    await act(async () => {
      fireEvent.submit(firstOf('Sign Out').closest('form')!)
    })

    expect(signOutAction).toHaveBeenCalled()
  })

  it('displays error message when signInAction returns an error', async () => {
    vi.mocked(signInAction).mockResolvedValue({ error: 'Not authorised' })

    render(
      <StaffAttendanceTable
        rows={[{ staff: staffA, record: null }]}
        defaultTime="09:00"
        date="2026-03-18"
        today="2026-03-18"
        role="admin"
        currentStaffId="admin-1"
      />,
    )

    await act(async () => {
      fireEvent.submit(firstOf('Sign In').closest('form')!)
    })

    expect(screen.getAllByText('Not authorised').length).toBeGreaterThan(0)
  })

  it('displays error message when signOutAction returns an error', async () => {
    vi.mocked(signOutAction).mockResolvedValue({
      error: 'Failed to sign out. Please try again.',
    })

    render(
      <StaffAttendanceTable
        rows={[{ staff: staffA, record: signedInRecord }]}
        defaultTime="09:00"
        date="2026-03-18"
        today="2026-03-18"
        role="admin"
        currentStaffId="admin-1"
      />,
    )

    await act(async () => {
      fireEvent.submit(firstOf('Sign Out').closest('form')!)
    })

    expect(
      screen.getAllByText('Failed to sign out. Please try again.').length,
    ).toBeGreaterThan(0)
  })

  it('renders room and class in the mobile summary line', () => {
    render(
      <StaffAttendanceTable
        rows={[{ staff: staffA, record: null }]}
        defaultTime="09:00"
        date="2026-03-18"
        today="2026-03-18"
        role="admin"
        currentStaffId="admin-1"
      />,
    )

    expect(
      screen.getByText(
        (_, element) => element?.textContent === 'Room 12 · Year 3A',
      ),
    ).toBeInTheDocument()
  })

  it('omits the mobile summary line when both room and class are null', () => {
    render(
      <StaffAttendanceTable
        rows={[{ staff: staffB, record: null }]}
        defaultTime="09:00"
        date="2026-03-18"
        today="2026-03-18"
        role="admin"
        currentStaffId="admin-1"
      />,
    )

    expect(screen.queryByText(/Room \d/)).not.toBeInTheDocument()
  })

  it('renders the status badge once per grid cell (mobile summary + desktop cell)', () => {
    render(
      <StaffAttendanceTable
        rows={[{ staff: staffA, record: signedInRecord }]}
        defaultTime="09:00"
        date="2026-03-18"
        today="2026-03-18"
        role="admin"
        currentStaffId="admin-1"
      />,
    )

    expect(screen.getAllByText(/Signed In/)).toHaveLength(2)
  })

  it('allows secretary to interact with own row (sign in)', async () => {
    vi.mocked(signInAction).mockResolvedValue(undefined)

    render(
      <StaffAttendanceTable
        rows={[
          { staff: staffA, record: null },
          { staff: staffB, record: null },
        ]}
        defaultTime="09:00"
        date="2026-03-18"
        today="2026-03-18"
        role="secretary"
        currentStaffId="staff-1"
      />,
    )

    // staffA is current user (secretary) — should have Sign In buttons
    // (one per grid cell); staffB's row is disabled, so none from there.
    const signInButtons = screen.getAllByRole('button', { name: 'Sign In' })
    expect(signInButtons).toHaveLength(2)

    await act(async () => {
      fireEvent.submit(signInButtons[0].closest('form')!)
    })

    expect(signInAction).toHaveBeenCalled()
  })

  it('disables interaction for secretary on other staff rows', () => {
    render(
      <StaffAttendanceTable
        rows={[
          { staff: staffA, record: null },
          { staff: staffB, record: null },
        ]}
        defaultTime="09:00"
        date="2026-03-18"
        today="2026-03-18"
        role="secretary"
        currentStaffId="staff-1"
      />,
    )

    // Only secretary's own row (staffA) has Sign In buttons.
    const signInButtons = screen.getAllByRole('button', { name: 'Sign In' })
    expect(signInButtons).toHaveLength(2)

    // The disabled row renders tooltip text instead of a form.
    expect(
      screen.getAllByText('You can only sign yourself in/out').length,
    ).toBeGreaterThan(0)
  })

  describe('optimistic sign in / sign out', () => {
    it('flips to signed in straight away, then keeps the saved row', async () => {
      const save = deferred<Awaited<ReturnType<typeof signInAction>>>()
      vi.mocked(signInAction).mockReturnValue(save.promise)

      render(
        <StaffAttendanceTable
          rows={[{ staff: staffA, record: null }]}
          defaultTime="09:00"
          date="2026-03-18"
          today="2026-03-18"
          role="admin"
          currentStaffId="admin-1"
        />,
      )

      await act(async () => {
        fireEvent.submit(firstOf('Sign In').closest('form')!)
      })

      // Still saving: the row already shows as signed in, controls disabled.
      expect(screen.getAllByText(/Signed In/).length).toBeGreaterThan(0)
      expect(
        screen.getAllByRole('button', { name: 'Saving…' })[0],
      ).toBeDisabled()

      await act(async () => {
        save.resolve({ data: signedInRecord })
      })

      expect(
        screen.getAllByRole('button', { name: 'Sign Out' })[0],
      ).toBeEnabled()
      expect(screen.getAllByText(/Signed In/).length).toBeGreaterThan(0)
    })

    it('rolls back to not signed in and shows the error when the save fails', async () => {
      const save = deferred<Awaited<ReturnType<typeof signInAction>>>()
      vi.mocked(signInAction).mockReturnValue(save.promise)

      render(
        <StaffAttendanceTable
          rows={[{ staff: staffA, record: null }]}
          defaultTime="09:00"
          date="2026-03-18"
          today="2026-03-18"
          role="admin"
          currentStaffId="admin-1"
        />,
      )

      await act(async () => {
        fireEvent.submit(firstOf('Sign In').closest('form')!)
      })
      expect(screen.getAllByText(/Signed In/).length).toBeGreaterThan(0)

      await act(async () => {
        save.resolve({ error: 'Failed to sign in. Please try again.' })
      })

      expect(
        screen.getAllByRole('button', { name: 'Sign In' })[0],
      ).toBeEnabled()
      expect(screen.queryByText(/Signed In/)).toBeNull()
      expect(
        screen.getAllByText('Failed to sign in. Please try again.').length,
      ).toBeGreaterThan(0)
    })

    it('shows the signed-out times from the saved row after signing out', async () => {
      vi.mocked(signOutAction).mockResolvedValue({ data: signedOutRecord })

      render(
        <StaffAttendanceTable
          rows={[{ staff: staffA, record: signedInRecord }]}
          defaultTime="17:00"
          date="2026-03-18"
          today="2026-03-18"
          role="admin"
          currentStaffId="admin-1"
        />,
      )

      await act(async () => {
        fireEvent.submit(firstOf('Sign Out').closest('form')!)
      })

      expect(
        screen.getAllByRole('button', { name: 'Sign In' })[0],
      ).toBeEnabled()
      expect(
        screen.getAllByText(/In 09:00 · Out 17:00/).length,
      ).toBeGreaterThan(0)
    })
  })

  describe('print sheet', () => {
    function printSheet(): HTMLElement {
      return screen
        .getByText('Staff Sign-In Sheet')
        .parentElement!.nextElementSibling!.querySelector('table')!
    }

    it('is only rendered when asked for', () => {
      const props = {
        rows: [{ staff: staffA, record: null }],
        defaultTime: '09:00',
        date: '2026-03-18',
        today: '2026-03-18',
        role: 'admin' as const,
        currentStaffId: 'admin-1',
      }
      const { rerender } = render(<StaffAttendanceTable {...props} />)
      expect(screen.queryByText('Staff Sign-In Sheet')).toBeNull()

      rerender(<StaffAttendanceTable {...props} withPrintSheet />)
      expect(screen.getByText('Staff Sign-In Sheet')).toBeInTheDocument()
    })

    it('shows a sign-in as soon as it is saved', async () => {
      vi.mocked(signInAction).mockResolvedValue({ data: signedInRecord })

      render(
        <StaffAttendanceTable
          rows={[{ staff: staffA, record: null }]}
          defaultTime="09:00"
          date="2026-03-18"
          today="2026-03-18"
          role="admin"
          currentStaffId="admin-1"
          withPrintSheet
        />,
      )
      expect(within(printSheet()).queryByText('09:00')).toBeNull()

      await act(async () => {
        fireEvent.submit(firstOf('Sign In').closest('form')!)
      })

      expect(within(printSheet()).getByText('09:00')).toBeInTheDocument()
    })

    it('keeps the rendered rows when a save fails', async () => {
      vi.mocked(signOutAction).mockResolvedValue({
        error: 'Failed to sign out. Please try again.',
      })

      render(
        <StaffAttendanceTable
          rows={[{ staff: staffA, record: signedInRecord }]}
          defaultTime="17:00"
          date="2026-03-18"
          today="2026-03-18"
          role="admin"
          currentStaffId="admin-1"
          withPrintSheet
        />,
      )

      await act(async () => {
        fireEvent.submit(firstOf('Sign Out').closest('form')!)
      })

      expect(within(printSheet()).getByText('09:00')).toBeInTheDocument()
      expect(within(printSheet()).queryByText('17:00')).toBeNull()
    })
  })

  describe('sign-in time', () => {
    function submittedTime(action: (formData: FormData) => unknown): string {
      return String(vi.mocked(action).mock.calls[0][0].get('time'))
    }

    function timeChip(time: string): HTMLElement {
      return screen.getAllByRole('button', {
        name: `Time ${time}, double-click to change`,
      })[0]
    }

    function submit(label: 'Sign In' | 'Sign Out'): Promise<void> {
      return act(async () => {
        fireEvent.submit(firstOf(label).closest('form')!)
      })
    }

    beforeEach(() => {
      vi.useFakeTimers()
      // 09:14:30 GMT == 09:14 in London in March.
      vi.setSystemTime(new Date('2026-03-18T09:14:30Z'))
    })

    afterEach(() => {
      vi.useRealTimers()
    })

    describe('today', () => {
      function renderToday(record: typeof signedInRecord | null = null): void {
        render(
          <StaffAttendanceTable
            rows={[{ staff: staffA, record }]}
            defaultTime="09:14"
            date="2026-03-18"
            today="2026-03-18"
            role="admin"
            currentStaffId="admin-1"
          />,
        )
      }

      it('shows the time as a read-only chip that keeps up with the clock', () => {
        renderToday()

        expect(timeChip('09:14')).toBeInTheDocument()
        expect(screen.queryByLabelText('Time')).toBeNull()

        act(() => vi.advanceTimersByTime(30_000))
        expect(timeChip('09:15')).toBeInTheDocument()

        act(() => vi.advanceTimersByTime(60_000))
        expect(timeChip('09:16')).toBeInTheDocument()
      })

      it('re-fetches the rows on every tick', () => {
        renderToday()

        act(() => vi.advanceTimersByTime(30_000))
        expect(router.refresh).toHaveBeenCalledTimes(1)

        act(() => vi.advanceTimersByTime(60_000))
        expect(router.refresh).toHaveBeenCalledTimes(2)
        expect(router.replace).not.toHaveBeenCalled()
      })

      it('moves to the new day once the date changes', () => {
        vi.setSystemTime(new Date('2026-03-18T23:59:30Z'))
        renderToday()

        act(() => vi.advanceTimersByTime(30_000))

        expect(router.replace).toHaveBeenCalledWith('/staff-attendance')
        expect(router.refresh).not.toHaveBeenCalled()
      })

      it('records the time of the tap, not the time last shown', async () => {
        vi.mocked(signInAction).mockResolvedValue({ data: signedInRecord })
        renderToday()

        // The clock has moved on but no tick has fired yet.
        vi.setSystemTime(new Date('2026-03-18T09:16:05Z'))
        expect(timeChip('09:14')).toBeInTheDocument()
        await submit('Sign In')

        expect(submittedTime(signInAction)).toBe('09:16')
      })

      it('opens a time input on double-click and records the time entered', async () => {
        vi.mocked(signInAction).mockResolvedValue({ data: signedInRecord })
        renderToday()

        fireEvent.doubleClick(timeChip('09:14'))
        const input = screen.getAllByLabelText('Time')[0]
        expect(input).toHaveValue('09:14')
        expect(input).toHaveFocus()

        fireEvent.change(input, { target: { value: '08:45' } })
        await submit('Sign In')

        expect(submittedTime(signInAction)).toBe('08:45')
        // Back to the live clock once saved.
        expect(screen.queryByLabelText('Time')).toBeNull()
        expect(timeChip('09:14')).toBeInTheDocument()
      })

      it('keeps an edited time while the clock ticks', () => {
        renderToday()

        fireEvent.doubleClick(timeChip('09:14'))
        fireEvent.change(screen.getAllByLabelText('Time')[0], {
          target: { value: '08:45' },
        })
        act(() => vi.advanceTimersByTime(90_000))

        expect(screen.getAllByLabelText('Time')[0]).toHaveValue('08:45')
      })

      it('goes back to the live clock on Escape', () => {
        renderToday()

        fireEvent.doubleClick(timeChip('09:14'))
        fireEvent.keyDown(screen.getAllByLabelText('Time')[0], {
          key: 'Escape',
        })

        expect(screen.queryByLabelText('Time')).toBeNull()
        expect(timeChip('09:14')).toBeInTheDocument()
      })

      it('opens the time input from the keyboard', () => {
        renderToday()

        fireEvent.keyDown(timeChip('09:14'), { key: 'Enter' })

        expect(screen.getAllByLabelText('Time')[0]).toHaveValue('09:14')
      })

      it('works the same way for signing out', async () => {
        vi.mocked(signOutAction).mockResolvedValue({ data: signedOutRecord })
        renderToday(signedInRecord)

        vi.setSystemTime(new Date('2026-03-18T17:02:00Z'))
        await submit('Sign Out')
        expect(submittedTime(signOutAction)).toBe('17:02')

        vi.mocked(signOutAction).mockClear()
        vi.mocked(signOutAction).mockResolvedValue({ data: signedOutRecord })
        cleanup()
        renderToday(signedInRecord)
        fireEvent.doubleClick(timeChip('09:14'))
        fireEvent.change(screen.getAllByLabelText('Time')[0], {
          target: { value: '16:30' },
        })
        await submit('Sign Out')
        expect(submittedTime(signOutAction)).toBe('16:30')
      })
    })

    it('opens a past day straight into the time input with its default', async () => {
      vi.mocked(signInAction).mockResolvedValue({ data: signedInRecord })
      render(
        <StaffAttendanceTable
          rows={[{ staff: staffA, record: null }]}
          defaultTime="09:30"
          date="2026-03-14"
          today="2026-03-18"
          role="admin"
          currentStaffId="admin-1"
        />,
      )

      const input = screen.getAllByLabelText('Time')[0]
      expect(input).toHaveValue('09:30')

      act(() => vi.advanceTimersByTime(5 * 60_000))
      expect(router.refresh).not.toHaveBeenCalled()

      await submit('Sign In')
      expect(submittedTime(signInAction)).toBe('09:30')
      // Still open for the next entry.
      expect(screen.getAllByLabelText('Time')[0]).toBeInTheDocument()
    })

    it("shows a future day's default as a chip that does not tick", async () => {
      vi.mocked(signInAction).mockResolvedValue({ data: signedInRecord })
      render(
        <StaffAttendanceTable
          rows={[{ staff: staffA, record: null }]}
          defaultTime="18:00"
          date="2026-03-20"
          today="2026-03-18"
          role="admin"
          currentStaffId="admin-1"
        />,
      )

      expect(timeChip('18:00')).toBeInTheDocument()
      act(() => vi.advanceTimersByTime(5 * 60_000))
      expect(timeChip('18:00')).toBeInTheDocument()
      expect(router.refresh).not.toHaveBeenCalled()

      await submit('Sign In')
      expect(submittedTime(signInAction)).toBe('18:00')
    })
  })

  describe('re-fetched rows', () => {
    const saved = { ...signedInRecord, updated_at: '2026-03-18T09:00:01Z' }
    const props = {
      defaultTime: '09:00',
      date: '2026-03-18',
      today: '2026-03-18',
      role: 'admin' as const,
      currentStaffId: 'admin-1',
    }

    it('keeps a save over a re-fetch that predates it', async () => {
      vi.mocked(signInAction).mockResolvedValue({ data: saved })
      const { rerender } = render(
        <StaffAttendanceTable
          rows={[{ staff: staffA, record: null }]}
          {...props}
        />,
      )

      await act(async () => {
        fireEvent.submit(firstOf('Sign In').closest('form')!)
      })
      rerender(
        <StaffAttendanceTable
          rows={[{ staff: staffA, record: null }]}
          {...props}
        />,
      )

      expect(
        screen.getAllByRole('button', { name: 'Sign Out' })[0],
      ).toBeInTheDocument()
    })

    it('shows a newer row from the server over an earlier save', async () => {
      vi.mocked(signInAction).mockResolvedValue({ data: saved })
      const { rerender } = render(
        <StaffAttendanceTable
          rows={[{ staff: staffA, record: null }]}
          {...props}
        />,
      )

      await act(async () => {
        fireEvent.submit(firstOf('Sign In').closest('form')!)
      })
      // Signed out on a phone since.
      const newer = {
        ...saved,
        signed_out_at: '2026-03-18T17:00:00Z',
        updated_at: '2026-03-18T17:00:01Z',
      }
      rerender(
        <StaffAttendanceTable
          rows={[{ staff: staffA, record: newer }]}
          {...props}
        />,
      )

      expect(
        screen.getAllByRole('button', { name: 'Sign In' })[0],
      ).toBeInTheDocument()
      expect(
        screen.getAllByText(/In 09:00 · Out 17:00/).length,
      ).toBeGreaterThan(0)
    })
  })
})

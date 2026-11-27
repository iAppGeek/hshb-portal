import { describe, it, expect } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

import RegulatedRolesHelp from './RegulatedRolesHelp'

describe('RegulatedRolesHelp', () => {
  it('lists the regulated and non-regulated roles when tapped', () => {
    render(<RegulatedRolesHelp />)

    fireEvent.click(
      screen.getByRole('button', { name: 'Which roles need a DBS?' }),
    )

    const tooltip = screen.getByRole('tooltip')
    expect(tooltip).toHaveTextContent(
      'Regulated: enhanced DBS requiredTeacher, Classroom Assistant, Admin',
    )
    expect(tooltip).toHaveTextContent(
      'Not regulated: DBS not compulsoryAdmin Assistant, Committee',
    )
  })

  it('opens on hover with a mouse', () => {
    render(<RegulatedRolesHelp />)

    fireEvent.pointerEnter(
      screen.getByRole('button', { name: 'Which roles need a DBS?' }),
      { pointerType: 'mouse' },
    )

    expect(screen.getByRole('tooltip')).toBeInTheDocument()
  })
})

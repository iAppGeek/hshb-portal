import { describe, it, expect } from 'vitest'
import { render, screen } from '@testing-library/react'

import DefinitionList from './DefinitionList'

describe('DefinitionList', () => {
  it('renders a title and label/value pairs', () => {
    render(
      <DefinitionList
        title="Child"
        items={[
          { label: 'First name', value: 'Ada' },
          { label: 'Last name', value: 'Lovelace' },
        ]}
      />,
    )
    expect(screen.getByText('Child')).toBeInTheDocument()
    expect(screen.getByText('First name')).toBeInTheDocument()
    expect(screen.getByText('Ada')).toBeInTheDocument()
    expect(screen.getByText('Last name')).toBeInTheDocument()
    expect(screen.getByText('Lovelace')).toBeInTheDocument()
  })

  it('omits the heading when no title is given', () => {
    const { container } = render(
      <DefinitionList items={[{ label: 'Name', value: 'Ada' }]} />,
    )
    expect(container.querySelector('h2')).toBeNull()
  })
})

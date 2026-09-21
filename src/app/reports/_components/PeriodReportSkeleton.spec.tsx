import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'

import PeriodReportSkeleton from './PeriodReportSkeleton'

describe('PeriodReportSkeleton', () => {
  it('renders two table skeletons', () => {
    const { container } = render(<PeriodReportSkeleton />)
    expect(container.querySelectorAll('table').length).toBe(2)
  })
})

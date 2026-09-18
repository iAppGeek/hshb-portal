import type { ReactElement, ReactNode } from 'react'

import { table } from '@/lib/grid/styles'

type Props = {
  children: ReactNode
  /** Screen-reader-only summary of the table's purpose. */
  caption?: string
}

export default function Table({ children, caption }: Props): ReactElement {
  return (
    <table className={table}>
      {caption ? <caption className="sr-only">{caption}</caption> : null}
      {children}
    </table>
  )
}

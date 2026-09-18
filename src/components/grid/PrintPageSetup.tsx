import type { ReactElement } from 'react'

/**
 * The `@page` print setup shared by every print layout: A4 portrait with
 * 10mm margins, and no printed link URLs after anchor text.
 */
export default function PrintPageSetup(): ReactElement {
  return (
    <style>{`@page { size: A4 portrait; margin: 10mm; } @media print { a[href]::after { content: none !important; } }`}</style>
  )
}

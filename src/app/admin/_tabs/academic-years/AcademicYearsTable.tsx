'use client'

import { useState } from 'react'

import Table from '@/components/grid/Table'
import TableCard from '@/components/grid/TableCard'
import Td from '@/components/grid/Td'
import Th from '@/components/grid/Th'
import { rowLink, tbody, thead } from '@/lib/grid/styles'
import type { ActionResult } from '@/lib/action'

import AcademicYearForm from './AcademicYearForm'
import MakeCurrentButton from './MakeCurrentButton'

export type AcademicYearTableRow = {
  id: string
  code: string
  start_date: string
  end_date: string
  is_current: boolean
  classCount: number
  feePlanCount: number
}

type Props = {
  years: AcademicYearTableRow[]
  updateAction: (id: string, formData: FormData) => Promise<ActionResult>
  makeCurrentAction: (
    id: string,
    previousId: string | null,
  ) => Promise<ActionResult>
}

export default function AcademicYearsTable({
  years,
  updateAction,
  makeCurrentAction,
}: Props): React.ReactElement {
  const [editingId, setEditingId] = useState<string | null>(null)
  const currentId = years.find((y) => y.is_current)?.id ?? null

  return (
    <TableCard>
      <Table>
        <thead className={thead}>
          <tr>
            <Th>Code</Th>
            <Th>Start</Th>
            <Th>End</Th>
            <Th>Status</Th>
            <Th>Classes</Th>
            <Th>Fee plans</Th>
            <Th>Actions</Th>
          </tr>
        </thead>
        <tbody className={tbody}>
          {years.map((y) =>
            editingId === y.id ? (
              <tr key={y.id}>
                <Td mobile="scroll" colSpan={7} meta={{ dark: true }}>
                  <AcademicYearForm
                    mode="edit"
                    defaultValues={y}
                    action={(formData) => updateAction(y.id, formData)}
                    submitLabel="Save changes"
                    onDone={() => setEditingId(null)}
                  />
                </Td>
              </tr>
            ) : (
              <tr key={y.id}>
                <Td mobile="scroll">{y.code}</Td>
                <Td mobile="scroll">{y.start_date}</Td>
                <Td mobile="scroll">{y.end_date}</Td>
                <Td mobile="scroll">
                  {y.is_current && (
                    <span className="inline-flex items-center rounded-full bg-green-100 px-2.5 py-0.5 text-xs font-medium text-green-800">
                      Current
                    </span>
                  )}
                </Td>
                <Td mobile="scroll">{y.classCount}</Td>
                <Td mobile="scroll">{y.feePlanCount}</Td>
                <Td mobile="scroll">
                  <div className="flex items-center gap-3">
                    <button
                      type="button"
                      onClick={() => setEditingId(y.id)}
                      className={rowLink}
                    >
                      Edit
                    </button>
                    {!y.is_current && (
                      <MakeCurrentButton
                        yearCode={y.code}
                        action={() => makeCurrentAction(y.id, currentId)}
                      />
                    )}
                  </div>
                </Td>
              </tr>
            ),
          )}
        </tbody>
      </Table>
    </TableCard>
  )
}

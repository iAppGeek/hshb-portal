'use client'

import type { LessonPlanRow } from '@/db'
import {
  FormActions,
  FormGrid,
  FormSection,
  SelectField,
  TextAreaField,
  TextField,
  useServerForm,
} from '@/components/form'
import type { ActionResult } from '@/lib/action'
import { todayInSchoolTz } from '@/lib/datetime'

export type ClassOption = { id: string; name: string; year_group: string }

type Props = {
  initial?: LessonPlanRow
  classes: ClassOption[]
  action: (formData: FormData) => Promise<ActionResult>
  submitLabel: string
}

export default function LessonPlanForm({
  initial,
  classes,
  action,
  submitLabel,
}: Props): React.ReactElement {
  const { handleSubmit, isPending, error, fieldError } = useServerForm(action)

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <FormSection title="Lesson Plan Details">
        <FormGrid>
          {/* A plan's class can't be changed once it is created. */}
          {initial ? (
            <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-500">
              <span className="font-medium text-gray-700">Class: </span>
              {initial.class.name} ({initial.class.year_group})
            </div>
          ) : (
            <SelectField
              label="Class"
              name="class_id"
              required
              defaultValue={classes.length === 1 ? classes[0].id : ''}
              placeholder={classes.length !== 1 ? 'Select a class…' : undefined}
              options={classes.map((c) => ({
                value: c.id,
                label: `${c.name} (${c.year_group})`,
              }))}
              error={fieldError('class_id')}
            />
          )}

          <TextField
            label="Lesson date"
            name="lesson_date"
            type="date"
            required
            defaultValue={initial?.lesson_date ?? todayInSchoolTz()}
            error={fieldError('lesson_date')}
          />

          <TextAreaField
            label="Lesson description"
            name="description"
            required
            rows={4}
            maxLength={300}
            defaultValue={initial?.description}
            className="sm:col-span-2"
            error={fieldError('description')}
          />
        </FormGrid>
      </FormSection>

      <FormActions
        submitLabel={submitLabel}
        isPending={isPending}
        cancelHref="/lesson-plans"
        error={error ?? undefined}
      />
    </form>
  )
}

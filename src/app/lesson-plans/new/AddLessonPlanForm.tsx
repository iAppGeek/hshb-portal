'use client'

import {
  FormActions,
  FormGrid,
  FormSection,
  SelectField,
  TextAreaField,
  TextField,
  useServerForm,
} from '@/components/form'
import { todayInSchoolTz } from '@/lib/datetime'

import { createLessonPlanAction } from '../actions'

type ClassSummary = { id: string; name: string; year_group: string }

type Props = {
  classes: ClassSummary[]
}

function todayDate() {
  return todayInSchoolTz()
}

export default function AddLessonPlanForm({ classes }: Props) {
  const { handleSubmit, isPending, error, fieldError } = useServerForm(
    createLessonPlanAction,
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <FormSection title="Lesson Plan Details">
        <FormGrid>
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

          <TextField
            label="Lesson date"
            name="lesson_date"
            type="date"
            required
            defaultValue={todayDate()}
            error={fieldError('lesson_date')}
          />

          <TextAreaField
            label="Lesson description"
            name="description"
            required
            rows={4}
            maxLength={300}
            className="sm:col-span-2"
            error={fieldError('description')}
          />
        </FormGrid>
      </FormSection>

      <FormActions
        submitLabel="Add Lesson Plan"
        isPending={isPending}
        cancelHref="/lesson-plans"
        error={error ?? undefined}
      />
    </form>
  )
}

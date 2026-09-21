'use client'

import type { LessonPlanRow } from '@/db'
import {
  FormActions,
  FormGrid,
  FormSection,
  TextAreaField,
  TextField,
  useServerForm,
} from '@/components/form'

import { updateLessonPlanAction } from '../../actions'

type Props = {
  plan: LessonPlanRow
}

export default function EditLessonPlanForm({ plan }: Props) {
  const { handleSubmit, isPending, error, fieldError } = useServerForm((fd) =>
    updateLessonPlanAction(plan.id, fd),
  )

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      <FormSection title="Lesson Plan Details">
        <FormGrid>
          <div className="rounded-lg bg-gray-50 px-3 py-2 text-sm text-gray-500">
            <span className="font-medium text-gray-700">Class: </span>
            {plan.class.name} ({plan.class.year_group})
          </div>

          <TextField
            label="Lesson date"
            name="lesson_date"
            type="date"
            required
            defaultValue={plan.lesson_date}
            error={fieldError('lesson_date')}
          />

          <TextAreaField
            label="Lesson description"
            name="description"
            required
            rows={4}
            maxLength={300}
            defaultValue={plan.description}
            className="sm:col-span-2"
            error={fieldError('description')}
          />
        </FormGrid>
      </FormSection>

      <FormActions
        submitLabel="Save changes"
        isPending={isPending}
        cancelHref="/lesson-plans"
        error={error ?? undefined}
      />
    </form>
  )
}

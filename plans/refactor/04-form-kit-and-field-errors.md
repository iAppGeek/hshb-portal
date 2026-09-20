# 04 — Form kit and field-level errors

| Delivers | Cx  | Reuse | Arch | Size | Depends on |
| -------- | :-: | :---: | :--: | :--: | ---------- |
| B1, B3   |  8  |  10   |  4   |  M   | 02         |

## Goal

One set of form components and one submit hook, used by every form in the app. Delete the 27 local
`Field` / `TextField` / `SelectField` / `CheckboxField` / `TextArea` / `Section` / `FormSection`
functions across 13 files and the `LABEL` / `INPUT` class-string constants in the finance forms.
Show validation errors next to the field they belong to instead of one line by the Save button.

## Decisions already made

- Location: `src/components/form/`. Components are **server-compatible** (no hooks) except the
  hook itself and `FormActions` (which reads pending state from props, so it is also server-safe).
- No form library. Native inputs, `FormData`, server actions, `useTransition`.
- Styling: the exact Tailwind classes currently in `AddStudentForm.tsx`'s `Field` become the single
  source in `src/components/form/styles.ts`. Do not restyle.
- Error rendering: `aria-invalid`, `aria-describedby`, red ring on the input, message below in
  `text-sm text-red-600`. Form-level error stays in `FormActions` for errors not tied to a field.
- Mobile: every text input sets `autoComplete` and `inputMode` from a small map by field type
  (`tel` → `inputMode="tel"`, `email` → `"email"`, `postcode` → `autoComplete="postal-code"`,
  money → `inputMode="decimal"`). Dates use `type="date"` (native pickers).
- Only the form-kit components and hook are introduced here. **Merging Add/Edit forms is plan 05.**
  This plan converts existing forms in place, keeping their structure.

## API

```ts
// src/components/form/styles.ts
export const label = 'block text-sm font-medium text-gray-700'
export const input =
  'mt-1 block w-full rounded-lg border border-gray-300 px-3 py-2 text-sm text-gray-900 shadow-sm placeholder:text-gray-400 focus:border-blue-500 focus:ring-1 focus:ring-blue-500 focus:outline-none'
export const inputInvalid =
  'border-red-400 focus:border-red-500 focus:ring-red-500'
export const hint = 'mt-1 text-xs text-gray-400'
export const errorText = 'mt-1 text-sm text-red-600'
export const requiredMark = 'ml-0.5 text-red-500'
```

```tsx
// Shared prop shape
type FieldBase = {
  label: string
  name: string
  required?: boolean
  error?: string          // from fieldErrors[name]
  hint?: string
  className?: string      // wrapper
  disabled?: boolean
}

// src/components/form/TextField.tsx
<TextField {...FieldBase} type?: 'text'|'email'|'tel'|'date'|'time'|'number'|'password'|'search'|'url'
           defaultValue?: string | null; placeholder?: string; autoComplete?: string;
           inputMode?: React.HTMLAttributes<HTMLInputElement>['inputMode']; maxLength?: number;
           min?: string|number; max?: string|number; step?: string|number />
// null defaultValue is treated as undefined so callers can pass DB values directly.

// src/components/form/TextAreaField.tsx
<TextAreaField {...FieldBase} defaultValue?: string|null; rows?: number; maxLength?: number />

// src/components/form/SelectField.tsx
<SelectField {...FieldBase} options: { value: string; label: string }[];
             defaultValue?: string|null; placeholder?: string /* renders <option value=""> */ />

// src/components/form/CheckboxField.tsx
<CheckboxField label name defaultChecked?: boolean; description?: string; error?: string; required?: boolean />
// Renders <input type="checkbox" value="on">; existing zod `checkbox` helper already parses 'on'.

// src/components/form/RadioGroup.tsx
<RadioGroup name legend options: { value; label }[] value: string onChange(value) />  // client; used for
// the "address mode" / "new vs existing guardian" toggles that are currently hand-written.

// src/components/form/FormSection.tsx
<FormSection title description?: string; onRemove?: () => void; removeLabel?: string>children</FormSection>
// Replaces every local FormSection/Section and the bare `rounded-xl bg-white p-6 shadow-sm ring-1 ring-gray-200` wrappers in forms.

// src/components/form/FormGrid.tsx
<FormGrid cols?: 1|2>children</FormGrid>   // the `grid grid-cols-1 gap-4 sm:grid-cols-2` wrapper

// src/components/form/FormActions.tsx
<FormActions submitLabel pendingLabel?: string /* default 'Saving…' */ isPending: boolean
             cancelHref?: string; error?: string; children?: ReactNode /* extra buttons */ />

// src/components/form/FieldError.tsx  (used internally; exported for custom fields)
```

```ts
// src/components/form/useServerForm.ts  ('use client')
export function useServerForm<T = unknown>(
  action: (formData: FormData) => Promise<ActionResult<T>>,
  options?: { onSuccess?: (data: T) => void },
): {
  handleSubmit: (e: React.FormEvent<HTMLFormElement>) => void
  isPending: boolean
  error: string | null
  fieldErrors: Record<string, string>
  fieldError: (name: string) => string | undefined
  reset: () => void
}
```

`handleSubmit`: `preventDefault`, clear errors, `startTransition(async () => { const r = await
action(new FormData(form)); if (r && 'error' in r) { setError(r.error); setFieldErrors(r.fieldErrors
?? {}); scrollToFirstInvalid(form) } else if (r && 'data' in r) onSuccess?.(r.data) })`.
`scrollToFirstInvalid` = `form.querySelector('[aria-invalid="true"]')?.scrollIntoView({ block:
'center' })` then `.focus()`.

Actions with a bound first argument are passed as `(fd) => updateStudentAction(id, fd)`.

## Implementation steps

1. Create the components, hook and styles above with unit tests
   (`src/components/form/*.spec.tsx`): renders label/required mark, wires `aria-describedby` to
   hint/error, `null` defaultValue, select placeholder, `useServerForm` error/fieldErrors/success
   paths.
2. Ensure `runAction` (plan 02) returns `fieldErrors` keyed by the **form field name**. For the
   student form the Zod schema keys already equal the input names (`student_first_name`…), and
   guardian sub-schemas are parsed per prefix — when parsing `extractGuardianFields(formData,
'primary')` inside `run`, prefix the resulting Zod paths with `${prefix}_` before throwing
   `ActionError` with `fieldErrors`. Extend `ActionError` to accept `fieldErrors`.
3. Convert each form to the kit, file by file, without changing layout or copy. Delete the local
   helper functions as you go:
   - `students/new/AddStudentForm.tsx`, `students/[id]/edit/EditStudentForm.tsx` (both; they're
     merged in plan 05 — here only swap primitives)
   - `staff/new/AddStaffForm.tsx`, `staff/[id]/edit/EditStaffForm.tsx`
   - `classes/ClassForm.tsx`
   - `incidents/new/AddIncidentForm.tsx`, `incidents/[id]/edit/EditIncidentForm.tsx`
   - `lesson-plans/new/AddLessonPlanForm.tsx`, `lesson-plans/[id]/edit/EditLessonPlanForm.tsx`
   - `guardians/[id]/edit/EditGuardianForm.tsx`
   - `finance/fee-plans/FeePlanForm.tsx`, `finance/students/[id]/StudentFeesForm.tsx`,
     `finance/students/[id]/PaymentForm.tsx`
   - `hr/staff/[id]/StaffPayrollForm.tsx`
   - `admin/_tabs/academic-years/AcademicYearForm.tsx`,
     `admin/_tabs/class-migration/ClassMigrationForm.tsx`
   - `register/RegistrationForm.tsx`, `register/photo-opt-out/PhotoOptOutForm.tsx`
   - `registrations/[id]/RegistrationReview.tsx` (its read-only `Field`/`Section` become a small
     `DefinitionList` in `src/components/DefinitionList.tsx` — label/value pairs, used again by
     plan 08's view pages)
   - `attendance/AttendanceForm.tsx` and `students/[id]/edit/LeaverSection.tsx` for their
     submit/error footer only.
4. Wire `fieldError(name)` into every field's `error` prop in the converted forms.
5. Remove `ActionResult`'s re-export from `src/lib/schemas.ts` once all imports point at
   `@/lib/action`.
6. Update form specs: they currently find inputs by label — unchanged. Add one assertion per form
   that a `fieldErrors` response marks the right input `aria-invalid`.

## Files

**Create:** `src/components/form/{styles.ts,TextField.tsx,TextAreaField.tsx,SelectField.tsx,CheckboxField.tsx,RadioGroup.tsx,FormSection.tsx,FormGrid.tsx,FormActions.tsx,FieldError.tsx,useServerForm.ts,index.ts}`,
`src/components/DefinitionList.tsx`, specs.
**Modify:** the 20 form files above, `src/lib/action.ts` (`ActionError` with `fieldErrors`).
**Delete:** every local `function Field/TextField/SelectField/CheckboxField/TextArea/Section/FormSection` in `src/app`.

## Acceptance criteria

- `rg "^function (Field|TextField|SelectField|CheckboxField|TextArea|Section|FormSection|Checkbox)\(" src/app` returns nothing.
- `rg "const (LABEL|INPUT) =" src/app` returns nothing.
- Every `<form>` under `src/app` uses `useServerForm` (or is a plain `<form action>` for sign-out /
  one-button actions) — `rg "useTransition" src/app` returns only components that are not forms.
- Submitting the student form with an invalid email shows the error under the email field, scrolls
  to it, and the field is `aria-invalid="true"` (add this as an E2E assertion in
  `e2e/tests/students/add-student.e2e.ts`).
- Visual diff of each form before/after is nil apart from error placement.
- `npm run pipeline:check` green.

## Deliberate UX changes

- Validation errors appear beneath the offending field (form-level message retained for
  non-field errors).
- Mobile keyboards match field type (tel/email/decimal).

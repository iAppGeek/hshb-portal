// Pure class helpers: status (isClassOpen mirrors is_class_open in the
// database) and the school's class order.

/**
 * An open class is active and in the current academic year. Only open classes
 * can take registers or have their enrolments and details changed; every other
 * class (inactive, or from any other year) is read-only.
 */
export function isClassOpen(
  cls: { active: boolean; academic_year_id: string },
  currentYear: { id: string },
): boolean {
  return cls.active && cls.academic_year_id === currentYear.id
}

/** A label that isn't a known stage sorts after A Level, before Test. */
const UNKNOWN_RANK = 900
const TEST_RANK = 1000

const ROMAN: Record<string, number> = { i: 1, ii: 2, iii: 3 }

/**
 * Where a class name or year group sits in the school, youngest first:
 * Nursery, Reception, Year 1–6, GCSE I–III, A Level, then anything
 * unrecognised, then Test. Year groups like 'pre-school' and '3' rank as the
 * matching stage, so the same order works for either label.
 */
function stageRank(label: string): number | null {
  const text = label.trim().toLowerCase()

  if (/^(nursery|pre-?school)\b/.test(text)) return 0
  if (/^reception\b/.test(text)) return 1

  const year = /^(?:year\s*)?(\d+)\b/.exec(text)
  if (year) return 1 + Number(year[1])

  const gcse = /^gcse\s*(\d+|i{1,3})?\b/.exec(text)
  if (gcse) {
    const level = gcse[1]
    if (!level) return 100
    return 100 + (ROMAN[level] ?? Number(level))
  }

  if (/^a[\s-]*levels?\b/.test(text)) return 200
  if (/^test\b/.test(text)) return TEST_RANK
  return null
}

export type SortableClass = { name: string; year_group?: string | null }

/** A class ranks by its name, or by its year group if the name isn't a stage. */
function classRank(cls: SortableClass): number {
  return (
    stageRank(cls.name) ??
    (cls.year_group ? stageRank(cls.year_group) : null) ??
    UNKNOWN_RANK
  )
}

function compareText(a: string, b: string): number {
  return a.localeCompare(b, 'en', { numeric: true })
}

/**
 * Orders classes youngest to oldest (Nursery, Reception, Year 1–6, GCSE I–III,
 * A Level, Test), then by name. Use this wherever classes are listed.
 */
export function compareClasses(a: SortableClass, b: SortableClass): number {
  return (
    classRank(a) - classRank(b) ||
    compareText(a.name, b.name) ||
    compareText(a.year_group ?? '', b.year_group ?? '')
  )
}

/** {@link compareClasses} for bare class names, with no class last. */
export function compareClassNames(a: string | null, b: string | null): number {
  if (a === b) return 0
  if (a === null) return 1
  if (b === null) return -1
  return compareClasses({ name: a }, { name: b })
}

/** {@link compareClasses} for year group labels ('pre-school', '3', 'GCSE'…). */
export function compareYearGroups(a: string, b: string): number {
  return compareClasses({ name: a }, { name: b })
}

/** A copy of `classes` in school order, youngest first. */
export function sortClasses<T extends SortableClass>(
  classes: readonly T[],
): T[] {
  return [...classes].sort(compareClasses)
}

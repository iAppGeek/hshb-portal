// Drizzle rows use camelCase properties (schema.ts); the functions in src/db
// keep the snake_case shapes the app was built on (PostgREST returned column
// names as-is). These two helpers convert at that boundary, typed, so a query
// result or an input keeps its exact field types through the rename.

/**
 * camelCase keys whose snake_case form has a digit segment, which the plain
 * "underscore before a capital" rule cannot produce. casing.spec.ts checks
 * that every schema column round-trips, so a new digit column fails there
 * until it is listed here.
 */
const DIGIT_KEYS = {
  addressLine1: 'address_line_1',
  addressLine2: 'address_line_2',
  additionalContact1: 'additional_contact_1',
  additionalContact2: 'additional_contact_2',
  additionalContact1Id: 'additional_contact_1_id',
  additionalContact2Id: 'additional_contact_2_id',
  additionalContact1Relationship: 'additional_contact_1_relationship',
  additionalContact2Relationship: 'additional_contact_2_relationship',
} as const

type DigitKeys = typeof DIGIT_KEYS

type CamelToSnake<S extends string> = S extends `${infer C}${infer Rest}`
  ? `${C extends Lowercase<C> ? C : `_${Lowercase<C>}`}${CamelToSnake<Rest>}`
  : S

type SnakeToCamel<S extends string> = S extends `${infer Head}_${infer Tail}`
  ? `${Head}${Capitalize<SnakeToCamel<Tail>>}`
  : S

export type SnakeKey<K extends string> = K extends keyof DigitKeys
  ? DigitKeys[K]
  : CamelToSnake<K>

/** `T` with every object key (at any depth) in snake_case. */
export type Snake<T> = T extends readonly (infer U)[]
  ? Snake<U>[]
  : T extends Record<string, unknown>
    ? { [K in keyof T as K extends string ? SnakeKey<K> : K]: Snake<T[K]> }
    : T

/** `T` with its top-level keys in camelCase. */
export type Camel<T> = {
  [K in keyof T as K extends string ? SnakeToCamel<K> : K]: T[K]
}

export function snakeKey(key: string): string {
  return key in DIGIT_KEYS
    ? DIGIT_KEYS[key as keyof DigitKeys]
    : key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)
}

export function camelKey(key: string): string {
  return key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === 'object' &&
    value !== null &&
    Object.getPrototypeOf(value) === Object.prototype
  )
}

function snakeDeep(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(snakeDeep)
  if (!isPlainObject(value)) return value
  return Object.fromEntries(
    Object.entries(value).map(([k, v]) => [snakeKey(k), snakeDeep(v)]),
  )
}

/**
 * A query result with snake_case keys at every depth, including relations
 * loaded with `with`. Not for jsonb payloads, whose keys it would rename too.
 */
export function toSnake<T>(value: T): Snake<T> {
  return snakeDeep(value) as Snake<T>
}

/** A snake_case input object as the camelCase values Drizzle writes. */
export function toCamel<T extends Record<string, unknown>>(input: T): Camel<T> {
  return Object.fromEntries(
    Object.entries(input).map(([k, v]) => [camelKey(k), v]),
  ) as Camel<T>
}

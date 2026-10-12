export type ClassSessionDate = {
  date: string
  taken: boolean
  /** 0 when the register was not taken. */
  roster: number
  /** Present plus late. */
  attended: number
  absent: number
}

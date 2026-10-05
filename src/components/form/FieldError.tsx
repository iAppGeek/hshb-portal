import { errorText } from './styles'

type Props = {
  id: string
  error?: string
  /** Announces the error to screen readers as soon as it appears. */
  announce?: boolean
}

export default function FieldError({
  id,
  error,
  announce = false,
}: Props): React.ReactElement | null {
  if (!error) return null
  return (
    <p id={id} role={announce ? 'alert' : undefined} className={errorText}>
      {error}
    </p>
  )
}

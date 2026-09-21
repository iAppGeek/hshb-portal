import { errorText } from './styles'

type Props = {
  id: string
  error?: string
}

export default function FieldError({
  id,
  error,
}: Props): React.ReactElement | null {
  if (!error) return null
  return (
    <p id={id} className={errorText}>
      {error}
    </p>
  )
}

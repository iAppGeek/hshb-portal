type Props = {
  cols?: 1 | 2
  children: React.ReactNode
}

export default function FormGrid({
  cols = 2,
  children,
}: Props): React.ReactElement {
  return (
    <div
      className={
        cols === 2
          ? 'grid grid-cols-1 gap-4 sm:grid-cols-2'
          : 'grid grid-cols-1 gap-4'
      }
    >
      {children}
    </div>
  )
}

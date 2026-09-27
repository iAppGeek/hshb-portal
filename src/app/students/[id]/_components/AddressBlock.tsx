export default function AddressBlock({
  address_line_1,
  address_line_2,
  city,
  postcode,
}: {
  address_line_1: string | null
  address_line_2: string | null
  city: string | null
  postcode: string | null
}): React.ReactElement {
  return (
    <div className="text-sm text-gray-600">
      {address_line_1 && <p>{address_line_1}</p>}
      {address_line_2 && <p>{address_line_2}</p>}
      {(city || postcode) && (
        <p>{[city, postcode].filter(Boolean).join(', ')}</p>
      )}
    </div>
  )
}

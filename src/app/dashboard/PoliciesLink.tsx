import { POLICIES_URL } from '@/lib/schoolWebsite'

export default function PoliciesLink() {
  return (
    <p className="mt-6 text-sm">
      <a
        href={POLICIES_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-600 underline"
      >
        School policies
      </a>
    </p>
  )
}

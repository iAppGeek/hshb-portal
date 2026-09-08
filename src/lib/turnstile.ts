const VERIFY_URL = 'https://challenges.cloudflare.com/turnstile/v0/siteverify'

export async function verifyTurnstileToken(
  token: string,
  remoteIp?: string | null,
): Promise<boolean> {
  try {
    const body = new URLSearchParams({
      secret: process.env.TURNSTILE_SECRET_KEY ?? '',
      response: token,
    })
    if (remoteIp) body.set('remoteip', remoteIp)

    const res = await fetch(VERIFY_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    })
    if (!res.ok) return false
    const json = (await res.json()) as { success: boolean; hostname?: string }
    if (json.success !== true) return false

    const expectedHostname = process.env.TURNSTILE_EXPECTED_HOSTNAME
    if (expectedHostname) return json.hostname === expectedHostname

    return true
  } catch {
    return false
  }
}

// Public form actions parse turnstile_token for verification, then must not
// pass it on to the insert. Destructuring it into an unused binding trips
// @typescript-eslint/no-unused-vars; this omits it without binding a name.
export function omitTurnstileToken<T extends { turnstile_token: string }>(
  data: T,
): Omit<T, 'turnstile_token'> {
  const rest: Partial<T> = { ...data }
  delete rest.turnstile_token
  return rest as Omit<T, 'turnstile_token'>
}

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

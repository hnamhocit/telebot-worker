/**
 * Utilities to verify Telegram Login Widget data and Telegram Mini App (TMA) initData
 * using Web Crypto API compatible with Cloudflare Workers and standard JS runtimes.
 */

/**
 * Computes SHA-256 hash as Uint8Array
 */
async function sha256(data: string | Uint8Array): Promise<Uint8Array> {
  const bytes = typeof data === 'string' ? new TextEncoder().encode(data) : data
  const hashBuffer = await crypto.subtle.digest('SHA-256', bytes)
  return new Uint8Array(hashBuffer)
}

/**
 * Computes HMAC-SHA-256
 */
async function hmacSha256(
  key: string | Uint8Array,
  data: string | Uint8Array
): Promise<Uint8Array> {
  const keyBytes = typeof key === 'string' ? new TextEncoder().encode(key) : key
  const dataBytes = typeof data === 'string' ? new TextEncoder().encode(data) : data

  const cryptoKey = await crypto.subtle.importKey(
    'raw',
    keyBytes,
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign']
  )

  const signature = await crypto.subtle.sign('HMAC', cryptoKey, dataBytes)
  return new Uint8Array(signature)
}

/**
 * Converts Uint8Array to hex string
 */
function toHex(buffer: Uint8Array): string {
  return Array.from(buffer)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
}

/**
 * Timing-safe string comparison
 */
function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false
  let result = 0
  for (let i = 0; i < a.length; i++) {
    result |= a.charCodeAt(i) ^ b.charCodeAt(i)
  }
  return result === 0
}

/**
 * Verifies authentication data returned by Telegram Login Widget.
 *
 * Algorithm (Telegram official):
 * 1. dataCheckString = sorted pairs of "key=value" joined by "\n" (excluding "hash")
 * 2. secretKey = SHA256(botToken)
 * 3. computedHash = HMAC-SHA256(secretKey, dataCheckString)
 * 4. computedHash === receivedHash
 */
export async function verifyTelegramLoginWidget(
  data: Record<string, any>,
  botToken: string,
  maxAgeSeconds = 86400
): Promise<{ valid: boolean; error?: string; user?: Record<string, any> }> {
  const { hash, ...rest } = data

  if (!hash || typeof hash !== 'string') {
    return { valid: false, error: 'Missing or invalid hash' }
  }

  // Check auth_date expiration
  if (rest.auth_date) {
    const authTime = Number(rest.auth_date)
    const now = Math.floor(Date.now() / 1000)
    if (isNaN(authTime) || (maxAgeSeconds > 0 && now - authTime > maxAgeSeconds)) {
      return { valid: false, error: 'Authentication data has expired' }
    }
  }

  // Build dataCheckString: alphabetical sort by key
  const checkString = Object.keys(rest)
    .filter((k) => rest[k] !== undefined && rest[k] !== null)
    .sort()
    .map((k) => `${k}=${rest[k]}`)
    .join('\n')

  const secretKey = await sha256(botToken)
  const calculatedHmac = await hmacSha256(secretKey, checkString)
  const calculatedHex = toHex(calculatedHmac)

  const isValid = timingSafeEqual(calculatedHex.toLowerCase(), hash.toLowerCase())
  if (!isValid) {
    return { valid: false, error: 'Signature verification failed' }
  }

  return { valid: true, user: rest }
}

/**
 * Validates initData from Telegram Mini Apps (TMA / Telegram WebApp).
 *
 * Algorithm (Telegram official):
 * 1. Parse URLSearchParams
 * 2. Extract and remove "hash"
 * 3. Build dataCheckString: sorted pairs "key=value" joined by "\n"
 * 4. secretKey = HMAC-SHA256("WebAppData", botToken)
 * 5. computedHash = HMAC-SHA256(secretKey, dataCheckString)
 * 6. computedHash === receivedHash
 */
export async function validateMiniAppInitData(
  initData: string,
  botToken: string,
  maxAgeSeconds = 86400
): Promise<{ valid: boolean; error?: string; data?: Record<string, any> }> {
  if (!initData || typeof initData !== 'string') {
    return { valid: false, error: 'Missing or empty initData' }
  }

  const params = new URLSearchParams(initData)
  const hash = params.get('hash')

  if (!hash) {
    return { valid: false, error: 'Missing hash parameter in initData' }
  }

  params.delete('hash')

  // Check auth_date expiration
  const authDateStr = params.get('auth_date')
  if (authDateStr) {
    const authTime = Number(authDateStr)
    const now = Math.floor(Date.now() / 1000)
    if (isNaN(authTime) || (maxAgeSeconds > 0 && now - authTime > maxAgeSeconds)) {
      return { valid: false, error: 'initData has expired' }
    }
  }

  // Build sorted dataCheckString
  const pairs: string[] = []
  for (const [key, val] of params.entries()) {
    pairs.push(`${key}=${val}`)
  }
  pairs.sort()
  const checkString = pairs.join('\n')

  // secretKey = HMAC-SHA-256("WebAppData", botToken)
  const secretKey = await hmacSha256('WebAppData', botToken)
  // calculatedHmac = HMAC-SHA-256(secretKey, checkString)
  const calculatedHmac = await hmacSha256(secretKey, checkString)
  const calculatedHex = toHex(calculatedHmac)

  const isValid = timingSafeEqual(calculatedHex.toLowerCase(), hash.toLowerCase())
  if (!isValid) {
    return { valid: false, error: 'initData signature verification failed' }
  }

  // Parse structured data if present (e.g. user, receiver, chat)
  const parsedData: Record<string, any> = {}
  for (const [key, val] of params.entries()) {
    try {
      parsedData[key] = JSON.parse(val)
    } catch {
      parsedData[key] = val
    }
  }

  return { valid: true, data: parsedData }
}

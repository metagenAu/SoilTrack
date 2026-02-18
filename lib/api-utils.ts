import { NextResponse } from 'next/server'
import { getUserRole, type UserRole } from './auth'

/**
 * Require authentication for an API route. Returns the user role and ID,
 * or a 401 JSON response if unauthenticated.
 */
export async function requireAuth(): Promise<
  | { authenticated: true; role: UserRole; userId: string }
  | { authenticated: false; response: NextResponse }
> {
  const { role, userId } = await getUserRole()

  if (!userId) {
    return {
      authenticated: false,
      response: NextResponse.json(
        { error: 'Authentication required' },
        { status: 401 }
      ),
    }
  }

  return { authenticated: true, role, userId }
}

/**
 * Return a generic error response, logging the real error server-side.
 * Prevents leaking internal details (M6).
 */
export function safeErrorResponse(
  err: unknown,
  context: string,
  status = 500
): NextResponse {
  const message = err instanceof Error ? err.message : String(err)
  console.error(`[${context}]`, message)
  return NextResponse.json(
    { error: 'An internal error occurred. Please try again.' },
    { status }
  )
}

/**
 * Simple in-memory rate limiter (H4).
 *
 * Uses a sliding window counter per key (typically IP or userId).
 * In production, replace with Redis-backed or edge-based rate limiting.
 */
const rateLimitStore = new Map<string, { count: number; resetAt: number }>()

// Periodic cleanup to prevent memory leaks
setInterval(() => {
  const now = Date.now()
  for (const [key, entry] of rateLimitStore) {
    if (entry.resetAt < now) rateLimitStore.delete(key)
  }
}, 60_000)

export function rateLimit(
  key: string,
  { maxRequests = 60, windowMs = 60_000 }: { maxRequests?: number; windowMs?: number } = {}
): { allowed: boolean; response?: NextResponse } {
  const now = Date.now()
  const entry = rateLimitStore.get(key)

  if (!entry || entry.resetAt < now) {
    rateLimitStore.set(key, { count: 1, resetAt: now + windowMs })
    return { allowed: true }
  }

  entry.count++
  if (entry.count > maxRequests) {
    return {
      allowed: false,
      response: NextResponse.json(
        { error: 'Too many requests. Please try again later.' },
        { status: 429 }
      ),
    }
  }

  return { allowed: true }
}

/**
 * Allowed image MIME types for photo uploads (H2).
 */
export const ALLOWED_IMAGE_TYPES = new Set([
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
])

/**
 * Maximum file size for photo uploads: 10 MB.
 */
export const MAX_PHOTO_SIZE = 10 * 1024 * 1024

/**
 * Validate an uploaded photo file by MIME type and size (H2).
 */
export function validatePhotoFile(file: File): string | null {
  if (!ALLOWED_IMAGE_TYPES.has(file.type)) {
    return `Invalid file type "${file.type}". Allowed: JPEG, PNG, WebP, GIF.`
  }
  if (file.size > MAX_PHOTO_SIZE) {
    return `File too large (${(file.size / 1024 / 1024).toFixed(1)} MB). Maximum: 10 MB.`
  }
  return null // valid
}

/**
 * Maximum file size for data uploads (CSV/Excel): 20 MB.
 */
export const MAX_DATA_FILE_SIZE = 20 * 1024 * 1024

/**
 * Allowed data file MIME types.
 */
export const ALLOWED_DATA_TYPES = new Set([
  'text/csv',
  'text/plain',
  'application/vnd.ms-excel',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  'application/octet-stream', // common fallback for .xlsx
])

/**
 * Validate a safe redirect path (M4).
 * Ensures the path is relative and doesn't redirect off-site.
 */
export function validateRedirectPath(path: string): string {
  // Must start with / and not contain protocol markers or double slashes
  if (
    !path.startsWith('/') ||
    path.startsWith('//') ||
    path.includes(':\\') ||
    path.includes('://')
  ) {
    return '/dashboard'
  }
  return path
}

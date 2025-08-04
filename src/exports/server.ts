import merge from 'lodash.merge'
import { PostHog } from 'posthog-node'
// @ts-expect-error: 'next/headers' is only available in Next.js server environment
import { cookies } from 'next/headers'

// --- Re-define the type for the returned document ---
export type ABTestedDocument<T extends Record<string, unknown>> = T & {
  // We can simplify this now, as the server handles everything.
  // We just need to return the final document.
}

// --- Initialize PostHog server-side client ---
const posthogClient = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY || '', {
  host: process.env.POSTHOG_HOST || 'https://app.posthog.com',
})

/**
 * Server-side helper to determine which A/B test variant to serve.
 * It reads from and sets cookies directly, acting as the single source of truth.
 *
 * @param document The original Payload CMS document.
 * @returns The content to display (either the variant or the original).
 */
export const getServerSideABVariant = async <
  D extends {
    abVariant?: Record<string, unknown>
    enableABTesting?: boolean
    posthogFeatureFlagKey?: string
  },
  T extends Record<string, unknown> = Record<string, unknown>,
>(
  document: D & T,
): Promise<T & { posthogAssignedVariantKey?: string | 'unassigned' }> => {
  if (!document?.enableABTesting || !document.abVariant) {
    return { ...document, posthogAssignedVariantKey: 'control' }
  }

  const cookieStore = cookies()
  const featureFlagKey = document.posthogFeatureFlagKey || `ab_test_${String(document.id)}`
  let assignedVariantKey: string | 'unassigned' = 'unassigned'

  try {
    const existingVariantCookie = cookieStore.get(`ph_feature_flag_${featureFlagKey}`)

    if (existingVariantCookie) {
      assignedVariantKey = existingVariantCookie.value
    } else {
      assignedVariantKey = 'unassigned'
    }
  } catch (error) {
    console.error(`[A/B Plugin] Server-side error for flag "${featureFlagKey}":`, error)
    assignedVariantKey = 'unassigned'
  }

  let finalDocument: T = document

  if (assignedVariantKey !== 'unassigned' && assignedVariantKey === 'variant') {
    finalDocument = merge({}, document, document.abVariant) as T
  }

  return {
    ...finalDocument,
    posthogAssignedVariantKey: assignedVariantKey,
    posthogFeatureFlagKey: featureFlagKey,
  }
}

import merge from 'lodash.merge'
import { PostHog } from 'posthog-node'

// --- NEW: Generic Cookie Accessor Interface ---
export interface CookieAccessor {
  get: (name: string) => { value: string } | undefined
  set: (
    name: string,
    value: string,
    options?: {
      path?: string
      expires?: Date
      maxAge?: number
      domain?: string
      secure?: boolean
      httpOnly?: boolean
      sameSite?: 'strict' | 'lax' | 'none'
    },
  ) => void // Re-added 'set' temporarily for clarity if needed elsewhere, but it's not used in getServerSideABVariant directly now.
}

// --- Define the type for the returned document, including the assigned variant key and cookie info ---
export type ABTestedDocument<T extends Record<string, unknown>> = T & {
  posthogAssignedVariantKey?: string // The variant assigned by PostHog
  posthogFeatureFlagKeyUsed?: string
  posthogServerDistinctId?: string // The distinctId determined on the server
  posthogNewDistinctIdGenerated?: string // Only present if a new ID was generated
}

// --- Initialize PostHog server-side client ---
const posthogClient = new PostHog(process.env.NEXT_PUBLIC_POSTHOG_KEY || '', {
  host: process.env.POSTHOG_HOST || 'https://app.posthog.com',
})

/**
 * Server-side helper to determine which A/B test variant to serve.
 * It reads cookies but DOES NOT set them directly. Cookie setting is delegated
 * to a Server Action or Route Handler.
 *
 * @param document The original Payload CMS document.
 * @param cookies The cookies object from Next.js `cookies()`.
 * @returns The content to display (either the variant or the original), augmented with PostHog details for client-side cookie setting.
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
  cookies: CookieAccessor, // Using the generic CookieAccessor interface
): Promise<ABTestedDocument<T>> => {
  // If A/B testing is not enabled, return the original document

  if (!document?.enableABTesting || !document.abVariant) {
    return document
  }

  const featureFlagKey = document.posthogFeatureFlagKey || `ab_test_${String(document.id)}`
  let assignedVariantKey: string = 'control'
  let finalDocument: T = document

  let distinctId = cookies.get('_ph_id')?.value
  let newDistinctIdGenerated: string | undefined

  try {
    if (!distinctId) {
      newDistinctIdGenerated = crypto.randomUUID()
      distinctId = newDistinctIdGenerated // Use the newly generated ID for flag evaluation
    }

    // // --- IMPORTANT DEBUGGING LINES (keeping for now, I'll delete later when I'm sure it's working in production) ---
    // console.log('--- PostHog Server Init Debug ---')
    // console.log('POSTHOG_API_KEY (used for evaluation):', process.env.NEXT_PUBLIC_POSTHOG_KEY)
    // console.log('POSTHOG_HOST:', process.env.NEXT_PUBLIC_POSTHOG_HOST)
    // console.log('---------------------------------')
    // console.log(
    //   `[A/B Plugin] Server-side: Attempting to fetch flag "${featureFlagKey}" for distinct ID "${distinctId}".`,
    // )
    // const allFlags = await posthogClient.getAllFlags(distinctId); // Optional: if you want to see all flags
    // console.log(`[A/B Plugin] Server-side: All flags for distinct ID "${distinctId}":`, JSON.stringify(allFlags, null, 2));
    // --- END IMPORTANT DEBUGGING LINES ---

    const flagResponse = await posthogClient.getFeatureFlag(featureFlagKey, distinctId)
    console.log('Raw flag response:', flagResponse, 'Type:', typeof flagResponse)
    // Handle both boolean and string variants
    // Handle all possible response types
    if (flagResponse === false || flagResponse === null || flagResponse === undefined) {
      assignedVariantKey = 'control'
    } else if (flagResponse === true) {
      assignedVariantKey = 'variant'
    } else if (typeof flagResponse === 'string') {
      // Use the exact string returned by PostHog
      assignedVariantKey = flagResponse
    } else {
      assignedVariantKey = 'control' // fallback
    }
    if (assignedVariantKey === 'variant') {
      finalDocument = merge({}, document, document.abVariant) as T
    } else {
      finalDocument = document
    }

    // console.log(
    //   `[A/B Plugin] Server-side: Flag "${featureFlagKey}" assigned "${assignedVariantKey}" for distinct ID "${distinctId}".`,
    // )
  } catch (error) {
    // console.error(`[A/B Plugin] Server-side error for flag "${featureFlagKey}":`, error)
    assignedVariantKey = 'control'
    finalDocument = document
    if (!distinctId) distinctId = crypto.randomUUID()
  }

  return {
    ...finalDocument,
    posthogAssignedVariantKey: assignedVariantKey,
    posthogFeatureFlagKeyUsed: featureFlagKey,
    posthogServerDistinctId: distinctId,
    posthogNewDistinctIdGenerated: newDistinctIdGenerated,
  }
}

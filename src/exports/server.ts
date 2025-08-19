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

// --- NEW: Request context interface for proper feature flag evaluation ---
export interface RequestContext {
  url?: string
  pathname?: string
  host?: string
  headers?: Record<string, string>
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
 * @param context Optional request context for proper feature flag evaluation with release conditions.
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
  context?: RequestContext, // Optional context for backwards compatibility
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

    // Build person properties with request context for proper release condition evaluation
    const personProperties: Record<string, any> = {}
    
    // Add request context properties that PostHog uses for release conditions
    if (context) {
      // Add URL-related properties
      if (context.url) {
        const urlObj = new URL(context.url)
        personProperties['$current_url'] = context.url
        personProperties['$host'] = urlObj.hostname
        personProperties['$pathname'] = urlObj.pathname
      } else {
        if (context.host) personProperties['$host'] = context.host
        if (context.pathname) personProperties['$pathname'] = context.pathname
      }
      
      // Add any custom headers that might be used in release conditions
      if (context.headers) {
        Object.entries(context.headers).forEach(([key, value]) => {
          personProperties[`$header_${key.toLowerCase().replace(/-/g, '_')}`] = value
        })
      }
    }

    console.log(
      `[A/B Plugin] Server-side: Evaluating flag "${featureFlagKey}" for distinct ID "${distinctId}" with context:`,
      { pathname: personProperties['$pathname'], host: personProperties['$host'] }
    )

    // Pass person properties to PostHog for proper release condition evaluation
    const flagResponse = await posthogClient.getFeatureFlag(
      featureFlagKey,
      distinctId,
      {
        personProperties,
        groups: {},
      }
    )
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

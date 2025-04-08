/**
 * Server-side helper for determining which A/B test variant to serve
 * For use in Next.js App Router with React Server Components
 *
 * @param document The document from Payload CMS containing A/B testing data
 * @param cookies The cookies object from Next.js (from cookies() function)
 * @returns The content to display (either the variant or the original)
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
  cookies: { get: (name: string) => { value: string } | undefined },
): Promise<T> => {
  // If A/B testing is not enabled, return the original document
  if (!document?.enableABTesting || !document.abVariant) {
    return document
  }

  try {
    // Get the feature flag key (use the provided one or generate one)
    const featureFlagKey = document.posthogFeatureFlagKey || `ab_test_${String(document.id)}`

    // Check for existing PostHog distinct_id cookie
    const distinctIdCookie = await Promise.resolve(cookies.get('ph_distinct_id'))

    // Use the cookie value or generate a test ID for development
    const distinctId =
      distinctIdCookie?.value || `test_${Math.random().toString(36).substring(2, 15)}`

    // Simple hash function to determine variant assignment
    // This is a basic implementation - PostHog would handle this more robustly
    const hashCode = (str: string) => {
      let hash = 0
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i)
        hash = (hash << 5) - hash + char
        hash = hash & hash // Convert to 32bit integer
      }
      return hash
    }

    // Create a hash based on the distinct_id and feature flag key
    const hash = hashCode(`${distinctId}:${featureFlagKey}`)

    // Determine if user should see variant (50/50 split)
    const showVariant = Math.abs(hash) % 2 === 0

    if (showVariant) {
      // Return merged document with variant content
      return {
        ...document,
        ...document.abVariant,
      }
    }
  } catch (_error) {
    // In case of error, return the original document
    // Using a more TypeScript-friendly approach instead of console.error
  }

  // Default to original document
  return document
}

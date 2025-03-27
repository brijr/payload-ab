export { BeforeDashboardClient } from '../components/BeforeDashboardClient.js'

/**
 * Helper function to determine which content variant to show based on PostHog feature flag
 * @param document The document from Payload CMS containing A/B testing data
 * @param posthog The PostHog client instance
 * @returns The content to display (either the variant or the original)
 */
export const getABTestVariant = <
  D extends {
    abVariant?: Record<string, unknown>
    enableABTesting?: boolean
    posthogFeatureFlagKey?: string
  },
  T extends Record<string, unknown> = Record<string, unknown>,
>(
  document: D & T,
  posthog?: {
    capture: (event: string, properties: Record<string, unknown>) => void
    isFeatureEnabled: (key: string) => boolean
  },
): T => {
  // If A/B testing is not enabled, return the original document
  if (!document?.enableABTesting) {
    return document
  }

  // If PostHog is not available, return the original document
  if (!posthog) {
    // Using a more TypeScript-friendly approach instead of console.warn
    return document
  }

  // Get the feature flag key (use the provided one or generate one)
  const featureFlagKey = document.posthogFeatureFlagKey || `ab_test_${String(document.id)}`

  try {
    // Check if the user should see the variant
    const showVariant = posthog.isFeatureEnabled(featureFlagKey)

    // If the variant should be shown and it exists, merge it with the original document
    if (showVariant && document.abVariant) {
      // Capture that the variant was shown
      posthog.capture('ab_variant_shown', {
        documentId: document.id,
        featureFlagKey,
        variant: document.posthogVariantName || 'variant',
      })

      // Return a merged document with the variant content
      return {
        ...document,
        ...document.abVariant,
      }
    }

    // Capture that the control was shown
    posthog.capture('ab_control_shown', {
      documentId: document.id,
      featureFlagKey,
    })
  } catch (_error) {
    // Using a more TypeScript-friendly approach instead of console.error
  }

  // Default to the original document
  return document
}

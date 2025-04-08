'use client'

/**
 * Helper function to determine which content variant to show based on PostHog feature flag
 * @param document The document from Payload CMS containing A/B testing data
 * @param posthog The PostHog client instance
 * @returns The content to display (either the variant or the original)
 */

import { useEffect } from 'react'

type ABTrackingProps = {
  distinctId?: string // Optional — PostHog will assign one if not set
  flagKey: string
  variant: string
}

// Minimal PostHog type definition for our needs
type PostHogType = {
  __loaded?: boolean
  capture: (eventName: string, properties: Record<string, unknown>) => void
  getFeatureFlag: (key: string) => boolean | null | string
  identify: (distinctId: string) => void
  isFeatureEnabled: (key: string) => boolean
}

/**
 * Client-side component that tracks A/B test variant exposure
 * This ensures the variant is properly tracked in PostHog analytics
 */
export function TrackAB({ distinctId, flagKey, variant }: ABTrackingProps) {
  useEffect(() => {
    // Only run on client side
    if (typeof window === 'undefined') {
      return
    }

    // Dynamically import PostHog to avoid SSR issues
    const loadPostHog = async () => {
      try {
        // Dynamic import of PostHog
        const PostHogModule = await import('posthog-js')
        const posthog = PostHogModule.default as PostHogType

        if (!posthog.__loaded) {
          return
        }

        // If a distinct ID was provided, identify the user
        if (distinctId) {
          posthog.identify(distinctId)
        }

        // Check if the feature flag is enabled
        // This will automatically capture the $feature_flag_called event
        const isEnabled = posthog.isFeatureEnabled(flagKey)

        // If the feature flag doesn't match our expected variant,
        // we can capture an additional event for more detailed analytics
        if (isEnabled && variant !== 'true') {
          posthog.capture('ab_variant_exposure', {
            distinct_id: distinctId,
            flag_key: flagKey,
            variant,
          })
        }
      } catch (error) {
        // Only log in development
        if (process.env.NODE_ENV === 'development') {
          // eslint-disable-next-line no-console
          console.error('PostHog Feature Flag Error:', error)
        }
      }
    }

    // Execute the async function
    void loadPostHog()
  }, [distinctId, flagKey, variant])

  return null
}

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

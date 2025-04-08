'use client'

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
}

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

        // Evaluate the feature flag
        const flagValue = posthog.getFeatureFlag(flagKey)

        // Capture the feature flag event
        posthog.capture('$feature_flag_called', {
          $feature_flag: flagKey,
          $feature_flag_payload: flagValue,
          $feature_flag_response: variant,
          distinct_id: distinctId,
        })
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

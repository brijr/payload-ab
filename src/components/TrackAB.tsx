'use client'

import { usePostHog } from 'posthog-js/react'
import { useEffect } from 'react'

type ABTrackingProps = {
  distinctId?: string // Optional — PostHog will assign one if not set
  flagKey: string
  variant: string
}

export function TrackAB({ distinctId, flagKey, variant }: ABTrackingProps) {
  const posthog = usePostHog()

  useEffect(() => {
    if (!posthog) {
      return
    }

    try {
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
  }, [posthog, flagKey, variant, distinctId])

  return null
}

declare module 'posthog-js' {
  export interface PostHog {
    [key: string]: unknown
    __loaded?: boolean
    capture: (
      eventName: string,
      properties?: Record<string, unknown>
    ) => void
    debug: (enabled: boolean) => void
    featureFlags: {
      override: (flags: Record<string, boolean | string>) => void
    }
    getFeatureFlag: (key: string) => boolean | null | string
    getFeatureFlagPayload: (key: string) => unknown
    identify: (
      distinctId: string,
      userProperties?: Record<string, unknown>
    ) => void
    init: (
      apiKey: string,
      options?: {
        [key: string]: unknown
        api_host?: string
        capture_pageview?: boolean
      }
    ) => void
    isFeatureEnabled: (key: string) => boolean
    onFeatureFlags: (callback: (flags: string[], variants: Record<string, boolean | string>, meta: { errorsLoading?: boolean }) => void) => void
    reloadFeatureFlags: () => Promise<void>
    reset: () => void
  }

  const posthog: PostHog
  export default posthog
}

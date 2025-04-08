declare module 'posthog-js/react' {
  import type { PostHog } from 'posthog-js'

  /**
   * React hook to access the PostHog instance
   * @returns The PostHog instance
   */
  export function usePostHog(): null | PostHog
}

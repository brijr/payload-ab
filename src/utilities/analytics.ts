/**
 * Analytics utility for A/B testing
 */

import type { AbTestingPluginConfig } from '../index';

let postHogClient: any = null;

/**
 * Initialize PostHog client if API key is provided
 */
export const initializePostHog = async (options: AbTestingPluginConfig) => {
  if (options.analytics?.postHogApiKey && typeof window !== 'undefined') {
    try {
      // Import PostHog dynamically to avoid issues in server environments
      const PostHog = await import('posthog-js');
      PostHog.init(options.analytics.postHogApiKey, {
        api_host: 'https://app.posthog.com',
      });
      postHogClient = PostHog;
      return true;
    } catch (error) {
      console.error('Failed to initialize PostHog:', error);
    }
  }
  return false;
};

/**
 * Track an event with the configured analytics provider
 */
export const trackEvent = (
  options: AbTestingPluginConfig,
  event: {
    variant: string;
    userId?: string;
    properties?: Record<string, any>;
  }
) => {
  // If custom tracking function is provided, use it
  if (options.analytics?.trackEvent) {
    options.analytics.trackEvent(event);
    return;
  }

  // If PostHog is initialized, use it
  if (postHogClient) {
    postHogClient.capture(event.properties?.event || 'A/B Test Event', {
      variant: event.variant,
      ...(event.properties || {}),
    });
  }
};
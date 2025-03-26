import type { CollectionSlug, Config, Field } from 'payload'
import { abTestingMiddleware } from './middleware/abTestingMiddleware'
import { injectAbTestableIntoFields } from './utilities/injectAbTestableIntoFields'
import type { ABTestVariant } from './types'

export type { ABTestVariant } from './types'

export type AbTestingPluginConfig = {
  /**
   * Enable or disable the plugin
   */
  enabled?: boolean
  /**
   * List of collections to enable A/B testing for
   */
  collections?: CollectionSlug[]
  /**
   * List of A/B test variants
   */
  variants: ABTestVariant[]
  /**
   * Default variant to use when no variant is specified
   */
  defaultVariant: string
  /**
   * Whether to fallback to default variant when content is not available
   */
  fallback?: boolean
  /**
   * Analytics integration configuration
   */
  analytics?: {
    /**
     * PostHog API key
     */
    postHogApiKey?: string
    /**
     * Custom tracking function
     */
    trackEvent?: (event: {
      variant: string
      userId?: string
      properties?: Record<string, any>
    }) => void
  }
}

export const abTestingPlugin =
  (pluginOptions: AbTestingPluginConfig) =>
  (config: Config): Config => {
    // Set defaults
    const options = {
      enabled: true,
      fallback: true,
      ...pluginOptions,
    }

    // If plugin is disabled, return original config
    if (options.enabled === false) {
      return config
    }

    // Add A/B testing to collections
    if (options.collections && config.collections) {
      config.collections = config.collections.map(collection => {
        if (options.collections?.includes(collection.slug)) {
          return {
            ...collection,
            fields: injectAbTestableIntoFields(collection.fields || [], options.variants),
          }
        }
        return collection
      })
    }

    // Add the A/B testing options to the Payload config
    if (!config.globals) config.globals = {}
    if (!config.globals.abTesting) {
      config.globals.abTesting = options
    }

    // Add middleware for API endpoints
    if (!config.express) config.express = {}
    if (!config.express.middleware) config.express.middleware = []
    
    config.express.middleware.push({
      function: abTestingMiddleware(options),
    })

    // Add admin components for A/B testing UI
    if (!config.admin) config.admin = {}
    if (!config.admin.components) config.admin.components = {}
    
    // Add components to modify field UI
    if (!config.admin.components.beforeField) config.admin.components.beforeField = []
    config.admin.components.beforeField.push('ab-testing-plugin/client#BeforeFieldComponent')
    
    // Add components to provide variant switcher in admin
    if (!config.admin.components.beforeNavLinks) config.admin.components.beforeNavLinks = []
    config.admin.components.beforeNavLinks.push('ab-testing-plugin/client#VariantSwitcher')

    // Register custom endpoints for A/B testing
    if (!config.endpoints) config.endpoints = []
    
    // Add endpoint to track conversions
    config.endpoints.push({
      path: '/api/ab-testing/track',
      method: 'post',
      handler: async (req, res) => {
        const { variant, event, properties } = req.body;
        const userId = req.user?.id || 'anonymous';
        
        // Track event with analytics provider if configured
        if (options.analytics?.trackEvent) {
          options.analytics.trackEvent({
            variant,
            userId,
            properties: {
              event,
              ...properties,
            },
          });
        }
        
        return res.status(200).json({ success: true });
      },
    });

    return config
  }

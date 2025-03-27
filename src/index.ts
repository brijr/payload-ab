import type { Config, Field } from 'payload'

export interface ABTestingPluginOptions {
  /**
   * List of collection slugs to add A/B testing fields to
   */
  collections: string[]
  /**
   * Enable or disable the plugin
   * @default false
   */
  disabled?: boolean
}

/**
 * Payload CMS plugin for A/B testing with PostHog
 * Adds an optional abVariant field group to specified collections
 */
export const abTestingPlugin = 
  (pluginOptions: ABTestingPluginOptions) =>
  (incomingConfig: Config): Config => {
    // Create a copy of the incoming config
    const config = { ...incomingConfig }

    // Ensure collections exist
    if (!config.collections) {
      config.collections = []
    }

    // If the plugin is disabled, return the config as is
    if (pluginOptions.disabled) {
      return config
    }

    // Map over the collections in the config
    const modifiedCollections = config.collections.map((collection) => {
      // Only modify collections that match our options
      if (pluginOptions.collections.includes(collection.slug)) {
        return {
          ...collection,
          fields: [
            ...(collection.fields || []),
            {
              name: 'abVariant',
              type: 'group',
              admin: {
                description: 'Optional variant for A/B testing'
              },
              fields: [
                {
                  name: 'content',
                  type: 'richText',
                  label: 'Variant Content',
                } as Field,
                // You can add more fields here as needed for your variants
              ],
              label: 'A/B Variant',
              required: false, // optional; if missing, default page will be used
            } as Field,
          ],
        }
      }
      return collection
    })

    // Update the config with the modified collections
    config.collections = modifiedCollections

    return config
  }

// For backward compatibility
export default abTestingPlugin

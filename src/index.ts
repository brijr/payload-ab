import type {
  AfterErrorHook,
  CollectionConfig,
  Config,
  DescriptionFunction,
  Field,
  GroupField,
} from 'payload'

// Define a type for fields that can have a required property
type FieldWithRequired = {
  required?: boolean
  type: string
} & Field

// Define hook argument types
interface BeforeChangeHookArgs {
  collection?: {
    slug: string
  }
  data: {
    [key: string]: unknown
    abVariant?: Record<string, unknown>
    enableABTesting?: boolean
  }
  originalDoc?: {
    [key: string]: unknown
    enableABTesting?: boolean
  }
}

// Define the hook type
type BeforeChangeHook = (args: BeforeChangeHookArgs) => Promise<Record<string, unknown>>

// Define hooks type
interface Hooks {
  afterError?: AfterErrorHook[]
  beforeChange?: BeforeChangeHook[]
}

// Define config type with hooks
interface ConfigWithHooks extends Omit<Config, 'hooks'> {
  collections?: CollectionConfig[]
  hooks?: Hooks
}

export interface ABTestingPluginOptions {
  /**
   * Configuration for collections that should have A/B testing fields
   * Can be either an array of collection slugs or an object with more detailed configuration
   */
  collections: Record<string, ABCollectionConfig> | string[]
  /**
   * Enable or disable the plugin
   * @default false
   */
  disabled?: boolean
  /**
   * PostHog configuration options
   */
  posthog?: PostHogConfig
}

/**
 * PostHog configuration options
 */
export interface PostHogConfig {
  /**
   * PostHog project API key
   */
  apiKey?: string
  /**
   * PostHog feature flag key to use for this experiment
   * If not provided, one will be generated based on the collection slug
   */
  featureFlagKey?: string
  /**
   * PostHog host URL
   * @default 'https://app.posthog.com'
   */
  host?: string
}

export interface ABCollectionConfig {
  /**
   * Enable or disable A/B testing for this collection
   * @default true
   */
  enabled?: boolean
  /**
   * Fields to exclude from the A/B variant
   * Only used when fields is not specified
   * @default ['id', 'createdAt', 'updatedAt']
   */
  excludeFields?: string[]
  /**
   * Fields to include in the A/B variant
   * If not specified, all fields will be included except system fields
   */
  fields?: string[]
}

/**
 * Payload CMS plugin for A/B testing with PostHog
 * Adds an optional abVariant field group to specified collections
 */
export const abTestingPlugin =
  (pluginOptions: ABTestingPluginOptions) =>
  (incomingConfig: Config): Config => {
    // Create a copy of the incoming config with proper typing
    const config = { ...incomingConfig } as ConfigWithHooks

    // Ensure collections exist
    if (!config.collections) {
      config.collections = []
    }

    // If the plugin is disabled, return the config as is
    if (pluginOptions.disabled) {
      return config
    }

    // Validate PostHog configuration if provided
    if (pluginOptions.posthog?.apiKey) {
      if (!pluginOptions.posthog.apiKey.startsWith('phc_')) {
        throw new Error('Invalid PostHog API key format. PostHog API keys should start with "phc_"')
      }
    }

    // Normalize collections config to object format
    const collectionsConfig: Record<string, ABCollectionConfig> = {}

    if (Array.isArray(pluginOptions.collections)) {
      // If collections is an array, convert to object with default config
      pluginOptions.collections.forEach((slug) => {
        collectionsConfig[slug] = { enabled: true }
      })
    } else {
      // If collections is already an object, use it directly
      Object.entries(pluginOptions.collections).forEach(([slug, config]) => {
        collectionsConfig[slug] = { enabled: true, ...config }
      })
    }

    // Track collection field mappings to use in hooks
    const collectionFieldMappings: Record<string, string[]> = {}

    // Map over the collections in the config
    const modifiedCollections = config.collections.map((collection: CollectionConfig) => {
      // Get the collection config if it exists
      const collectionConfig = collectionsConfig[collection.slug]

      // Only modify collections that are in our config and enabled
      if (collectionConfig && collectionConfig.enabled !== false) {
        // Get all content fields from the collection to duplicate them in the variant
        let contentFields = (collection.fields || []).filter((field: Field) => {
          // Check if the field has a name property
          return 'name' in field
        })

        // If specific fields are provided, only include those
        if (collectionConfig.fields && collectionConfig.fields.length > 0) {
          contentFields = contentFields.filter((field: Field) => {
            return 'name' in field && collectionConfig.fields?.includes(field.name)
          })
        } else {
          // Otherwise, exclude system fields and any specified in excludeFields
          const excludeFields = collectionConfig.excludeFields || ['id', 'createdAt', 'updatedAt']
          contentFields = contentFields.filter((field: Field) => {
            return 'name' in field && !excludeFields.includes(field.name)
          })
        }

        // Make sure all fields in the variant are nullable in the database
        const variantFields = contentFields.map((field: Field) => {
          // Clone original field and remove "required" constraint for variants
          const fieldCopy = { ...field } as FieldWithRequired
          fieldCopy.required = false
          return fieldCopy
        })

        // Store field names for this collection to use in hooks
        if (collection.slug) {
          collectionFieldMappings[collection.slug] = contentFields
            .filter((field) => 'name' in field)
            .map((field) => field.name)
        }

        // Add a toggle field to enable/disable A/B testing for this document
        const enableABTestingField: Field = {
          name: 'enableABTesting',
          type: 'checkbox',
          admin: {
            description: 'Check this box to create an A/B testing variant for this document',
            position: 'sidebar',
          },
          defaultValue: false,
          label: 'Enable A/B Testing',
        }

        // Create PostHog fields for feature flag integration
        const posthogFields: Field[] = [
          {
            name: 'posthogFeatureFlagKey',
            type: 'text',
            admin: {
              condition: (data) => data?.enableABTesting === true,
              description: ((args: {
                data: { enableABTesting?: boolean }
                t: (key: string) => string
              }) =>
                args.data?.enableABTesting
                  ? 'PostHog feature flag key for this experiment (auto-generated if left empty)'
                  : 'Enable A/B testing above to configure PostHog integration') as unknown as DescriptionFunction,
              position: 'sidebar',
            },
            label: 'PostHog Feature Flag Key',
            required: false,
          },
          {
            name: 'posthogVariantName',
            type: 'text',
            admin: {
              condition: (data) => data?.enableABTesting === true,
              description: ((args: {
                data: { enableABTesting?: boolean }
                t: (key: string) => string
              }) =>
                args.data?.enableABTesting
                  ? 'Name of this variant in PostHog (defaults to "variant")'
                  : 'Enable A/B testing above to configure PostHog integration') as unknown as DescriptionFunction,
              position: 'sidebar',
            },
            defaultValue: 'variant',
            label: 'Variant Name',
            required: false,
          },
        ]

        // Create a tabs field with an A/B Testing tab
        const abTestingTab: Field = {
          type: 'tabs',
          tabs: [
            // Keep the original tabs/fields as they are
            {
              fields: collection.fields || [],
              label: 'Content',
            },
            // Add a new tab for A/B Testing
            {
              description:
                'Configure A/B testing variants for this content. Enable A/B testing to start the experiment.',
              fields: [
                enableABTestingField,
                ...posthogFields,
                {
                  name: 'abVariant',
                  type: 'group',
                  admin: {
                    className: 'ab-variant-group',
                    condition: (data) => data?.enableABTesting === true,
                    description: ((args: {
                      data: { enableABTesting?: boolean }
                      t: (key: string) => string
                    }) =>
                      args.data?.enableABTesting
                        ? 'Configure your A/B testing variant content here'
                        : 'Enable A/B testing above to start configuring your variant') as unknown as DescriptionFunction,
                  },
                  fields: variantFields,
                  label: 'Variant Content',
                  localized: false,
                  nullable: true,
                  required: false,
                  unique: false,
                } as GroupField,
              ],
              label: 'A/B Testing',
            },
          ],
        }

        // Return the modified collection with tabs
        return {
          ...collection,
          admin: {
            ...collection.admin,
            // Ensure we preserve any existing useAsTitle setting
            useAsTitle: collection.admin?.useAsTitle || 'title',
          },
          fields: [abTestingTab],
        }
      }
      return collection
    })

    // Update the config with the modified collections
    config.collections = modifiedCollections

    // Add hooks to copy content to variant when A/B testing is enabled
    if (!config.hooks) {
      config.hooks = {}
    }

    // Add global beforeChange hook
    if (!config.hooks.beforeChange) {
      config.hooks.beforeChange = []
    }

    // Add collection-specific hooks instead of a global one
    Object.keys(collectionsConfig).forEach((collectionSlug) => {
      // Skip if collection is not enabled
      const collectionConfig = collectionsConfig[collectionSlug]
      if (collectionConfig?.enabled === false) {
        return
      }

      // Find the collection to add the hook to
      const collection = config.collections?.find((c) => c.slug === collectionSlug)
      if (!collection) {
        return
      }

      // Initialize hooks for this collection if needed
      if (!collection.hooks) {
        collection.hooks = {}
      }

      if (!collection.hooks.beforeChange) {
        collection.hooks.beforeChange = []
      }

      // Add the hook for this specific collection
      const copyToVariantHook: BeforeChangeHook = (args: BeforeChangeHookArgs) => {
        try {
          console.log(`[A/B Plugin] copyToVariantHook fired for ${collectionSlug}`, {
            enableABTesting: args.data.enableABTesting,
            hasOriginalDoc: !!args.originalDoc,
          })

          const { data, originalDoc } = args

          // Initialize abVariant if not already present
          if (!data.abVariant || typeof data.abVariant !== 'object') {
            data.abVariant = {}
          }

          // If A/B testing is disabled, clear the variant data and exit early
          if (!data.enableABTesting) {
            data.abVariant = {}
            return Promise.resolve(data)
          }

          // Get the explicitly defined fields to copy from the collection config
          const fieldsToCopy = collectionFieldMappings[collectionSlug] || []
          console.log(`[A/B Plugin] fieldsToCopy for ${collectionSlug}:`, fieldsToCopy)

          // Create a new object for the variant instead of modifying the existing one
          // This ensures we start fresh and only include the fields we explicitly want
          const newVariant: Record<string, unknown> = {}

          // Only copy the fields that are explicitly defined in the configuration
          fieldsToCopy.forEach((fieldName) => {
            // Determine source value: new data overrides originalDoc
            const sourceValue = data[fieldName] !== undefined ? data[fieldName] : originalDoc?.[fieldName]

            if (sourceValue !== undefined) {
              console.log(
                `[A/B Plugin] Copying field ${fieldName} to variant:`,
                typeof sourceValue === 'object' ? 'Complex object' : sourceValue,
              )

              // Handle special cases for complex objects
              if (typeof sourceValue === 'object' && sourceValue !== null) {
                try {
                  // Use JSON parse/stringify for a deep clone
                  newVariant[fieldName] = JSON.parse(JSON.stringify(sourceValue))
                } catch (_err) {
                  // Fallback to shallow copy
                  newVariant[fieldName] = Array.isArray(sourceValue)
                    ? [...sourceValue]
                    : { ...sourceValue }
                }
              } else {
                // For primitive values, assign directly
                newVariant[fieldName] = sourceValue
              }
            }
          })

          // Preserve any PostHog-related fields
          if (data.abVariant?.posthogVariantName) {
            newVariant.posthogVariantName = data.abVariant.posthogVariantName
          }

          if (data.abVariant?.posthogFeatureFlagKey) {
            newVariant.posthogFeatureFlagKey = data.abVariant.posthogFeatureFlagKey
          }

          // Replace the entire abVariant object with our new clean one
          data.abVariant = newVariant

          console.log(`[A/B Plugin] Final variant fields:`, Object.keys(newVariant))

          return Promise.resolve(data)
        } catch (error) {
          console.error(`[A/B Plugin] Error in copyToVariantHook for ${collectionSlug}:`, error)
          return Promise.resolve(args.data)
        }
      }

      // Add the hook to this collection
      collection.hooks.beforeChange.push(copyToVariantHook)
    })

    return config
  }

// For backward compatibility
export default abTestingPlugin

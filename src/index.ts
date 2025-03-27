import type { CollectionConfig, Config, Field, GroupField } from 'payload'

// Define a type for fields that can have a required property
type FieldWithRequired = {
  required?: boolean
  type: string
} & Field

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
          // Create a copy of the field
          const fieldCopy = { ...field }

          // For fields that can have a required property, make sure it's false
          if ('name' in fieldCopy && 'type' in fieldCopy) {
            // Only modify fields that can have a required property
            const fieldTypes = [
              'text',
              'textarea',
              'number',
              'email',
              'code',
              'date',
              'upload',
              'relationship',
              'select',
            ]

            if (fieldTypes.includes(fieldCopy.type as string)) {
              // Type assertion to FieldWithRequired since we've verified it's a field type that can have required
              ;(fieldCopy as FieldWithRequired).required = false
            }
          }

          return fieldCopy
        })

        // Add a toggle field to enable/disable A/B testing for this document
        const enableABTestingField: Field = {
          name: 'enableABTesting',
          type: 'checkbox',
          admin: {
            description: 'Check this box to create an A/B testing variant for this document',
          },
          defaultValue: false,
          label: 'Enable A/B Testing',
        }

        // Create a collapsible field to contain the A/B variant, conditionally shown based on the toggle
        const abVariantField: Field = {
          type: 'collapsible',
          admin: {
            condition: (data) => Boolean(data?.enableABTesting),
            description:
              'Optional variant for A/B testing - contains selected fields from the main content',
            initCollapsed: true,
          },
          fields: [
            {
              name: 'abVariant',
              type: 'group',
              admin: {
                className: 'ab-variant-group',
                description: 'Configure your A/B testing variant content here',
              },
              fields: variantFields,
              label: 'Variant Content',
            } as GroupField,
          ],
          label: 'A/B Testing Variant',
        }

        // Add the A/B testing fields to the collection WITHOUT modifying existing fields
        // This is the safest approach to prevent data loss
        return {
          ...collection,
          fields: [
            ...(collection.fields || []), // Keep all existing fields exactly as they are
            enableABTestingField, // Add the toggle field
            abVariantField, // Add the variant field
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

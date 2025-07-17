import type { CollectionConfig, Config, DescriptionFunction, Field, GroupField } from 'payload'

// Import Endpoints for PostHog API management - NOW IMPORT THE FUNCTION
import { createPostHogEndpoints } from './endpoints/posthog.js'
import {
  BeforeChangeHookArgs,
  FieldWithRequired,
  ConfigWithHooks,
  ABTestingPluginOptions,
  ABCollectionConfig,
  PostHogConfig,
} from './types/index.js'

type BeforeChangeHook = (args: BeforeChangeHookArgs) => Promise<Record<string, unknown> | void>

/**
 * Payload CMS plugin for A/B testing with PostHog
 * Adds an optional abVariant field group to specified collections
 */

export const abTestingPlugin =
  (pluginOptions: ABTestingPluginOptions) =>
  (incomingConfig: Config): Config => {
    // Create a copy of the incoming config with proper typing
    const config = { ...incomingConfig } as ConfigWithHooks

    // --- INTEGRATE ENDPOINTS ---
    // Ensure config.endpoints exists and push your custom endpoints
    if (!config.endpoints) {
      config.endpoints = []
    }
    // Pass the pluginOptions.posthog to the endpoint creation function
    // Ensure the handlers are compatible with Payload's Endpoint type
    const posthogEndpoints = createPostHogEndpoints(pluginOptions.posthog as PostHogConfig).map(
      (endpoint) => ({
        ...endpoint,
        // Ensure the 'method' property is properly typed for Payload's Endpoint type
        handler: endpoint.handler as any, // Type assertion to bypass type incompatibility
        method: endpoint.method.toLowerCase() as
          | 'get'
          | 'post'
          | 'connect'
          | 'delete'
          | 'head'
          | 'options'
          | 'patch'
          | 'put',
      }),
    )
    config.endpoints.push(...posthogEndpoints)

    // console.log(
    //   'Registered endpoints:',
    //   config.endpoints?.map((e) => e.path),
    // )

    const sanitizeObject = (obj: any): any => {
      if (!obj || typeof obj !== 'object') {
        return obj
      }

      // Handle arrays
      if (Array.isArray(obj)) {
        return obj.map(sanitizeObject)
      }

      // Handle objects
      const sanitized = { ...obj }
      // Explicitly delete Payload/MongoDB system fields
      delete sanitized.id
      delete sanitized._id
      delete sanitized.__v
      delete sanitized.createdAt
      delete sanitized.updatedAt

      // Recursively sanitize all properties
      Object.keys(sanitized).forEach((key) => {
        if (typeof sanitized[key] === 'object' && sanitized[key] !== null) {
          sanitized[key] = sanitizeObject(sanitized[key])
        }
      })

      return sanitized
    }
    // --- End: Define Shared Sanitize Object Function ---

    // Ensure collections exist
    if (!config.collections) {
      config.collections = []
    }

    // If the plugin is disabled, return the config as is
    if (pluginOptions.disabled) {
      return config
    }

    // Validate PostHog configuration if provided
    // This check is still useful for providing early warnings in the plugin itself
    if (pluginOptions.posthog?.apiKey) {
      // I modified the plugin to use personal API keys, to allow read and write access to feature flags
      if (!pluginOptions.posthog.apiKey.startsWith('phx_')) {
        console.warn(
          'Invalid PostHog API key format. PostHog personal API keys should start with "phx_"',
        )
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

          // For any field that might contain an ID, add a custom validation hook
          if (
            fieldCopy.type === 'relationship' ||
            fieldCopy.type === 'upload' ||
            fieldCopy.type === 'array' ||
            fieldCopy.type === 'blocks' ||
            fieldCopy.type === 'richText'
          ) {
            // Add hooks to the field if they don't exist
            if (!fieldCopy.hooks) {
              fieldCopy.hooks = {}
            }

            // Add beforeValidate hook to sanitize any potential ID fields
            if (!fieldCopy.hooks.beforeValidate) {
              fieldCopy.hooks.beforeValidate = []
            }

            // Add a hook to sanitize potential ID fields
            fieldCopy.hooks.beforeValidate.push(({ value }) => {
              if (!value) {
                return value
              }

              return sanitizeObject(value)
            })
          }

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
              description:
                'Feature flag key used by PostHog for this experiment. Feature flag keys must be unique. If left empty, it will be auto-generated in the format: posthog_ab_<docId>_<uniqueSuffix>. Allowed characters: letters, numbers, hyphens (-), and underscores (_).' as unknown as DescriptionFunction,
              position: 'sidebar',
            },
            label: '🔑 PostHog Feature Flag Key',
            required: false,
          },
          {
            name: 'posthogFeatureFlagName',
            type: 'text',
            admin: {
              condition: (data) => data?.enableABTesting === true,
              description:
                'Feature flag name used by PostHog for this experiment. If left empty, it will be auto-generated in the format: A/B Test: <docId>.',
              position: 'sidebar',
            },
            label: '🏷️ PostHog Feature Flag Name',
            required: false,
          },
          {
            name: 'posthogVariantName',
            type: 'text',
            admin: {
              condition: (data) => data?.enableABTesting === true,
              description: 'Name of this variant in PostHog (defaults to "variant")',
              position: 'sidebar',
            },
            defaultValue: 'variant',
            label: '🧪 Variant Name',
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
                    description:
                      'Configure your A/B testing variant content here' as unknown as DescriptionFunction,
                  },
                  fields: variantFields,
                  hooks: {
                    // Add a hook to sanitize the variant data before it's saved
                    beforeValidate: [
                      ({ value }) => {
                        // If the value is an object, ensure it doesn't have any system fields
                        if (value && typeof value === 'object') {
                          const sanitizedValue = sanitizeObject(value)
                          return sanitizedValue
                        }
                        return value
                      },
                    ],
                  },
                  label: '🎯 Variant Content',
                  localized: false,
                  nullable: true,
                  required: false,
                  unique: false,
                } as GroupField,
              ],
              label: '📊 A/B Testing',
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
      const copyToVariantHook: BeforeChangeHook = async (
        args: BeforeChangeHookArgs,
      ): Promise<Record<string, unknown>> => {
        const { data: currentData, originalDoc, req } = args

        try {
          req.payload.logger.info(`[A/B Plugin] copyToVariantHook fired for ${collectionSlug}`, {
            enableABTesting: currentData.enableABTesting,
            hasOriginalDoc: !!originalDoc,
          })

          // Initialize abVariant if not already present
          if (!currentData.abVariant || typeof currentData.abVariant !== 'object') {
            currentData.abVariant = {}
          }

          // If A/B testing is disabled, clear the variant data and exit early
          if (!currentData.enableABTesting) {
            currentData.abVariant = {}
            return currentData
          }

          const wasABTestingEnabled = originalDoc?.enableABTesting === true
          const isABTestingEnabled = currentData.enableABTesting === true
          const isFirstTimeEnabling = isABTestingEnabled && !wasABTestingEnabled

          // Logic for enabling A/B testing
          if (isABTestingEnabled) {
            if (isFirstTimeEnabling) {
              req.payload.logger.info(
                `[A/B Plugin] First time enabling A/B testing for ${collectionSlug}, copying content to variant`,
              )

              const fieldsToCopy = collectionFieldMappings[collectionSlug] || []
              console.log(`[A/B Plugin] fieldsToCopy for ${collectionSlug}:`, fieldsToCopy)

              // Create a new object for the variant instead of modifying the existing one
              const newVariant: Record<string, unknown> = {}

              // Only copy the fields that are explicitly defined in the configuration
              fieldsToCopy.forEach((fieldName) => {
                // Determine source value: new data overrides originalDoc
                const sourceValue =
                  currentData[fieldName] !== undefined
                    ? currentData[fieldName]
                    : originalDoc?.[fieldName]

                if (sourceValue !== undefined) {
                  console.log(
                    `[A/B Plugin] Copying field ${fieldName} to variant:`,
                    typeof sourceValue === 'object' ? 'Complex object' : sourceValue,
                  )

                  // Special handling for blocks and complex fields
                  if (
                    fieldName === 'content' ||
                    fieldName === 'callOut' ||
                    fieldName === 'callToAction' ||
                    fieldName === 'subTitle' ||
                    typeof sourceValue === 'object'
                  ) {
                    console.log(`[A/B Plugin] Special handling for complex field: ${fieldName}`)

                    try {
                      // For blocks and complex objects, use a more careful approach
                      // First stringify to break references
                      const jsonString = JSON.stringify(sourceValue)
                      let parsed

                      try {
                        parsed = JSON.parse(jsonString)
                      } catch (err) {
                        console.log(`[A/B Plugin] Error parsing JSON for ${fieldName}:`, err)
                        parsed = sourceValue // Fallback to original
                      }

                      // If we have blocks, ensure we handle them properly
                      if (
                        Array.isArray(parsed) &&
                        parsed.length > 0 &&
                        parsed[0] &&
                        (parsed[0].blockType || parsed[0].type || parsed[0].blockName)
                      ) {
                        console.log(`[A/B Plugin] Detected blocks in ${fieldName}, sanitizing...`)

                        // Process each block to remove problematic fields
                        const sanitizedBlocks = parsed.map((block: any) => {
                          // 1. Get the original block type.
                          const type = block.blockType || block.type || block.blockName

                          // 2. Create a copy of the block's content to modify.
                          //    We will pass this to sanitizeObject.
                          const blockDataToSanitize = { ...block }

                          // 3. Remove original top-level id, _id from this copy before full sanitization.
                          //    Also remove the various type designators because we'll add the canonical `blockType` back.
                          //    sanitizeObject (defined in the outer scope) will handle nested ids.
                          delete blockDataToSanitize.id
                          delete blockDataToSanitize._id
                          delete blockDataToSanitize.blockType // remove if it exists from the data payload
                          delete blockDataToSanitize.type // remove if it exists from the data payload
                          delete blockDataToSanitize.blockName // remove if it exists from the data payload

                          // 4. Recursively sanitize all remaining fields in the block data.
                          const sanitizedInternalFields = sanitizeObject(blockDataToSanitize)

                          // 5. Construct the new block with the correct blockType and sanitized fields.
                          return {
                            blockType: type,
                            ...sanitizedInternalFields,
                          }
                        })

                        newVariant[fieldName] = sanitizedBlocks
                      } else {
                        // For other complex objects, use the recursive sanitizer
                        newVariant[fieldName] = sanitizeObject(parsed)
                      }
                    } catch (err) {
                      console.log(`[A/B Plugin] Error processing ${fieldName}:`, err)
                      // Last resort: try a shallow copy
                      const shallowCopy = Array.isArray(sourceValue)
                        ? [...sourceValue]
                        : { ...sourceValue }
                      newVariant[fieldName] = sanitizeObject(shallowCopy)
                    }
                  } else {
                    // For primitive values, assign directly
                    newVariant[fieldName] = sourceValue
                  }
                }
              })

              // Preserve any PostHog-related fields
              if (currentData.abVariant?.posthogVariantName) {
                newVariant.posthogVariantName = currentData.abVariant.posthogVariantName
              }

              if (currentData.abVariant?.posthogFeatureFlagKey) {
                newVariant.posthogFeatureFlagKey = currentData.abVariant.posthogFeatureFlagKey
              }

              // Replace the entire abVariant object with our new clean one
              currentData.abVariant = newVariant

              console.log(`[A/B Plugin] Final variant fields:`, Object.keys(newVariant))
            } else {
              console.log(
                `[A/B Plugin] A/B testing already enabled for ${collectionSlug}, preserving existing variant content`,
              )
            }

            // PostHog Feature Flag Management
            await handlePostHogFeatureFlag(currentData, originalDoc, collectionSlug, req)
          } else if (wasABTestingEnabled && !isABTestingEnabled) {
            // A/B testing is being disabled
            req.payload.logger.info(`[A/B Plugin] A/B testing disabled for ${collectionSlug}.`)
            currentData.abVariant = {} // Clear variant data
            req.payload.logger.info(
              `[A/B Plugin] Clearing variant data for ${collectionSlug} as A/B testing is disabled.`,
            )
            // PostHog: Deactivate Feature Flag
            // if (currentData.posthogFeatureFlagKey) {
            //   await handlePostHogFeatureFlagDeactivation(currentData, req)
            // }
          }

          return currentData
        } catch (error) {
          req.payload.logger.error(
            `[A/B Plugin] Error in copyToVariantHook for ${collectionSlug}:`,
            error,
          )
          return currentData // Return current data on error to prevent save failure
        }
      }

      // Helper function to handle PostHog feature flag creation/update
      async function handlePostHogFeatureFlag(
        currentData: Record<string, unknown>,
        originalDoc: any,
        collectionSlug: string,
        req: any,
      ): Promise<void> {
        try {
          let featureFlagKey = currentData.posthogFeatureFlagKey as string | undefined
          let featureFlagName = currentData.posthogFeatureFlagName as string | undefined
          let variantName = (currentData.posthogVariantName as string) || 'variant'
          // Generate feature flag key if not provided (It is not necessary since this is done by the endpoint)
          // if (!featureFlagKey) {
          //   const docId = originalDoc?._id || originalDoc?.id || currentData.id || Date.now()
          //   featureFlagKey = `posthog_ab_${collectionSlug}_${docId}`
          //   currentData.posthogFeatureFlagKey = featureFlagKey
          //   req.payload.logger.info(
          //     `[A/B Plugin] Generated PostHog feature flag key: ${featureFlagKey}`,
          //   )
          // }

          // Prepare the payload for the PostHog endpoint
          const postHogPayload = {
            key: featureFlagKey,
            name: featureFlagName,
            // (originalDoc?.title as string) ||
            // (currentData.title as string) ||
            // `A/B Test: ${collectionSlug}`,
            variantName: variantName,
            docId: originalDoc?._id || originalDoc?.id || currentData.id,
          }

          req.payload.logger.info(
            `[A/B Plugin] Calling PostHog endpoint to create/update feature flag: ${featureFlagKey}`,
          )
          req.payload.logger.info(
            `[A/B Plugin] Full endpoint URL: ${req.payload.config.serverURL}/posthog/feature-flags`,
          )
          req.payload.logger.info(
            `[A/B Plugin] Request payload:`,
            JSON.stringify(postHogPayload, null, 2),
          )

          // endpoints are registered directly on the config, they'll be available at /posthog/...
          // FIXED: That didnt work so I added the correct endpoint path with /api prefix
          const response = await fetch(
            `${req.payload.config.serverURL}/api/posthog/feature-flags`,
            {
              method: 'POST',
              headers: {
                'Content-Type': 'application/json',
                Authorization: `Bearer ${process.env.INTERNAL_API_TOKEN}`,
              },
              body: JSON.stringify(postHogPayload),
            },
          )
          req.payload.logger.info(`[A/B Plugin] Server URL: ${req.payload.config.serverURL}`)
          req.payload.logger.info(
            `[A/B Plugin] Full endpoint URL: ${req.payload.config.serverURL}/posthog/feature-flags`,
          )
          req.payload.logger.info(`[A/B Plugin] Request payload:`, postHogPayload)
          req.payload.logger.info(`[A/B Plugin] Response status: ${response.status}`)
          const responseText = await response.text()
          req.payload.logger.info(`[A/B Plugin] Response text: ${responseText}`)

          if (!response.ok) {
            let errorData
            try {
              errorData = JSON.parse(responseText)
            } catch (e) {
              errorData = { error: responseText }
            }
            throw new Error(`PostHog API error: ${response.status} - ${JSON.stringify(errorData)}`)
          }

          // Parse the response text as JSON since we already read it
          let result
          try {
            result = JSON.parse(responseText)
          } catch (e) {
            result = { action: 'processed' } // Fallback if response is not JSON
          }

          req.payload.logger.info(
            `[A/B Plugin] PostHog feature flag ${featureFlagKey} ${result.action || 'managed'} successfully`,
          )
        } catch (error) {
          req.payload.logger.error(
            '[A/B Plugin] Detailed error managing PostHog feature flag:',
            error instanceof Error
              ? {
                  message: error.message,
                  stack: error.stack,
                }
              : error,
          )
          throw error // Re-throw to prevent document save if this is critical
        }
      }

      // Helper function to handle PostHog feature flag deactivation
      // async function handlePostHogFeatureFlagDeactivation(
      //   currentData: Record<string, unknown>,
      //   req: any,
      // ): Promise<void> {
      //   try {
      //     const featureFlagKey = currentData.posthogFeatureFlagKey as string

      //     req.payload.logger.info(
      //       `[A/B Plugin] Calling PostHog endpoint to deactivate feature flag: ${featureFlagKey}`,
      //     )

      //     // FIXED: Use the correct endpoint path without /api prefix
      //     const response = await fetch(
      //       `${req.payload.config.serverURL}/posthog/feature-flags/deactivate`,
      //       {
      //         method: 'POST',
      //         headers: {
      //           'Content-Type': 'application/json',
      //         },
      //         body: JSON.stringify({
      //           featureFlagKey: featureFlagKey,
      //         }),
      //       },
      //     )

      //     if (!response.ok) {
      //       const errorData = await response.json().catch(() => ({ error: 'Unknown error' }))
      //       req.payload.logger.error(
      //         `[A/B Plugin] PostHog deactivation endpoint responded with error ${response.status}:`,
      //         errorData,
      //       )
      //       // Don't throw here - deactivation failure shouldn't prevent document save
      //     } else {
      //       req.payload.logger.info(
      //         `[A/B Plugin] PostHog feature flag ${featureFlagKey} deactivated successfully`,
      //       )
      //     }
      //   } catch (error) {
      //     req.payload.logger.error(
      //       '[A/B Plugin] Error deactivating PostHog feature flag:',
      //       error instanceof Error ? error.message : error,
      //     )
      //     // Don't throw here - deactivation failure shouldn't prevent document save
      //   }
      // }

      // Add the hook to this specific collection
      collection.hooks.beforeChange.push(copyToVariantHook)
    })

    return config
  }

// For backward compatibility
export default abTestingPlugin

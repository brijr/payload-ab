import type { PayloadRequest } from 'payload'

import type { PostHogConfig } from '../types/index.js'

type SecureHandler = (req: PayloadRequest, ...args: any[]) => Promise<Response>

export function withAuth(handler: SecureHandler) {
  return async (req: PayloadRequest, ...args: any[]) => {
    const INTERNAL_TOKEN = process.env.INTERNAL_API_TOKEN

    if (!INTERNAL_TOKEN) {
      console.error('❌ INTERNAL_API_TOKEN is not set in environment')
      return new Response(
        JSON.stringify({ error: 'Internal API token not configured on server' }),
        {
          headers: { 'Content-Type': 'application/json' },
          status: 500,
        },
      )
    }

    // Try to get Authorization header from Fetch or Express-like headers
    let authHeader: string | undefined
    if (typeof req.headers?.get === 'function') {
      authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization') ?? undefined
    } else if (req.headers && typeof req.headers === 'object') {
      authHeader = (req.headers as any)['authorization'] || (req.headers as any)['Authorization']
    }

    if (authHeader !== `Bearer ${INTERNAL_TOKEN}`) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        headers: { 'Content-Type': 'application/json' },
        status: 401,
      })
    }

    return handler(req, ...args)
  }
}

export const createPostHogEndpoints = (posthogConfig?: PostHogConfig) => {
  const posthogApiKey = posthogConfig?.apiKey || process.env.POSTHOG_PERSONAL_API_KEY || ''
  const posthogApiHost = posthogConfig?.host || process.env.POSTHOG_HOST || 'https://us.posthog.com'
  const posthogProjectId = posthogConfig?.projectId || process.env.POSTHOG_PROJECT_ID || ''
  type PostHogPropertyFilter = {
    key: string
    operator: string
    type: string
    value: any
  }
  // Helper function to parse request body consistently
  const parseRequestBody = async (request: {
    body: BodyInit | null | undefined
    clone: () => any
    json: () => any
    text: () => any
  }) => {
    try {
      // For Payload/Next.js requests, try multiple approaches

      // Method 1: Direct JSON parsing (most common)
      if (request.json && typeof request.json === 'function') {
        return await request.json()
      }

      // Method 2: If body is already parsed
      if (
        request.body &&
        typeof request.body === 'object' &&
        !(request.body instanceof ReadableStream)
      ) {
        return request.body
      }

      // Method 3: Convert ReadableStream to text then parse
      if (request.body instanceof ReadableStream) {
        const response = new Response(request.body)
        return await response.json()
      }

      // Method 4: Try text() method
      if (request.text && typeof request.text === 'function') {
        const text = await request.text()
        return JSON.parse(text)
      }

      // Method 5: Clone the request and try again
      if (request.clone) {
        const cloned = request.clone()
        return await cloned.json()
      }

      throw new Error('Unable to parse request body - no valid parsing method found')
    } catch (error) {
      console.error('Error parsing request body:', error)
      console.error('Request methods available:', Object.getOwnPropertyNames(request))
      throw new Error(
        `Invalid JSON in request body: ${error instanceof Error ? error.message : String(error)}`,
      )
    }
  }

  // Helper function to validate PostHog configuration
  const validatePostHogConfig = () => {
    if (!posthogApiKey || !posthogProjectId) {
      throw new Error('PostHog API key or Project ID not configured')
    }
  }

  // Helper function to create PostHog API headers
  const createPostHogHeaders = () => ({
    Authorization: `Bearer ${posthogApiKey}`,
    'Content-Type': 'application/json',
  })

  // Return the array of endpoints
  return [
    // Fetch all feature flags
    {
      handler: withAuth(async (req) => {
        try {
          validatePostHogConfig()

          const response = await fetch(
            `${posthogApiHost}/api/projects/${posthogProjectId}/feature_flags/`,
            {
              headers: createPostHogHeaders(),
              method: 'GET',
            },
          )

          if (!response.ok) {
            const errorText = await response.text()
            console.error(`PostHog API error ${response.status}: ${errorText}`)
            return new Response(
              JSON.stringify({
                details: errorText,
                error: 'Failed to fetch flags from PostHog',
              }),
              {
                headers: { 'Content-Type': 'application/json' },
                status: response.status,
              },
            )
          }

          const data = await response.json()
          return new Response(JSON.stringify(data), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          })
        } catch (error) {
          console.error('Error in /posthog/flags GET:', error)
          return new Response(
            JSON.stringify({
              error: error instanceof Error ? error.message : 'Internal server error',
            }),
            {
              headers: { 'Content-Type': 'application/json' },
              status: 500,
            },
          )
        }
      }),
      method: 'get',
      path: '/posthog/flags',
    },

    // Create or update a feature flag
    {
      handler: withAuth(async (req) => {
        try {
          validatePostHogConfig()

          // Ensure parseRequestBody always returns an object, even if req.json is undefined
          const body = (await parseRequestBody(req as any)) || {}

          const key = body?.key
          const name = body?.name
          const variantName = body?.variantName
          const docId = body?.docId
          const urlFilter = body?.urlFilter //
          //console.log('Extracted values:', { key, name, variantName, docId })

          // Validate required parameters - Fixed logic
          if (!key && !docId) {
            //console.log('Validation failed - missing required parameters')
            return new Response(
              JSON.stringify({
                error: 'Missing feature flag key or document details for A/B flag management',
                received: { docId, key },
              }),
              {
                headers: { 'Content-Type': 'application/json' },
                status: 400,
              },
            )
          }

          // Generate feature flag key if not provided
          let featureFlagKey = key
          if (!featureFlagKey) {
            const uniqueSuffix = Date.now() // or use a UUID
            featureFlagKey = `posthog_ab_${docId}_${uniqueSuffix}`
          }

          const flagName = name || `A/B Test: ${docId}`
          // const variantKey = variantName || 'variant'
          // Start with a basic filters object

          const filters: {
            groups: {
              properties: PostHogPropertyFilter[]
              rollout_percentage: null | number
            }[]
            multivariate: {
              variants: { key: string; name: string; rollout_percentage: number }[]
            }
          } = {
            groups: [
              {
                properties: [],
                rollout_percentage: null,
              },
            ],

            multivariate: {
              variants: [
                {
                  name: 'Control',
                  key: 'control',
                  rollout_percentage: 50,
                },
                {
                  name: 'Variant',
                  key: 'variant',
                  rollout_percentage: 50,
                },
              ],
            },
          }

          // --- NEW: Add URL filter if present
          if (urlFilter) {
            filters.groups[0].properties.push({
              type: 'person',
              key: '$current_url',
              operator: 'regex',
              value: urlFilter,
            })
          }

          const featureFlagConfig = {
            name: flagName,
            active: true,
            ensure_persistence: true,
            filters,
            key: featureFlagKey,
          }
          // Create feature flag configuration
          // const featureFlagConfig = {
          //   name: flagName,
          //   active: true,
          //   ensure_persistence: true,
          //   filters: {
          //     groups: [
          //       {
          //         properties: [],
          //         rollout_percentage: null,
          //       },
          //     ],
          //     multivariate: {
          //       variants: [
          //         {
          //           name: 'Control',
          //           key: 'control',
          //           rollout_percentage: 50,
          //         },
          //         {
          //           name: variantKey.charAt(0).toUpperCase() + variantKey.slice(1),
          //           key: variantKey,
          //           rollout_percentage: 50,
          //         },
          //       ],
          //     },
          //   },
          //   key: featureFlagKey,
          // }

          // Check if flag already exists
          const existingFlagResponse = await fetch(
            `${posthogApiHost}/api/projects/${posthogProjectId}/feature_flags/?key=${featureFlagKey}`,
            {
              headers: createPostHogHeaders(),
              method: 'GET',
            },
          )

          let existingFlag = null
          if (existingFlagResponse.ok) {
            const existingFlags = await existingFlagResponse.json()
            existingFlag = existingFlags.results?.find(
              (f: { key: any }) => f.key === featureFlagKey,
            )
          }

          let apiResponse
          let responseStatus = 200

          if (existingFlag) {
            // Update existing flag
            //console.log(`Updating existing feature flag: ${featureFlagKey}`)

            const updateResponse = await fetch(
              `${posthogApiHost}/api/projects/${posthogProjectId}/feature_flags/${existingFlag.id}/`,
              {
                body: JSON.stringify({
                  name: featureFlagConfig.name,
                  active: true,
                  filters: featureFlagConfig.filters,
                }),
                headers: createPostHogHeaders(),
                method: 'PATCH',
              },
            )

            if (!updateResponse.ok) {
              const errorText = await updateResponse.text()
              throw new Error(
                `Failed to update feature flag: ${updateResponse.status} - ${errorText}`,
              )
            }

            apiResponse = await updateResponse.json()
            //console.log(`Successfully updated PostHog feature flag: ${featureFlagKey}`)
          } else {
            // Create new flag
            //console.log(`Creating new feature flag: ${featureFlagKey}`)

            const createResponse = await fetch(
              `${posthogApiHost}/api/projects/${posthogProjectId}/feature_flags/`,
              {
                body: JSON.stringify(featureFlagConfig),
                headers: createPostHogHeaders(),
                method: 'POST',
              },
            )

            if (!createResponse.ok) {
              const errorText = await createResponse.text()
              throw new Error(
                `Failed to create feature flag: ${createResponse.status} - ${errorText}`,
              )
            }

            apiResponse = await createResponse.json()
            responseStatus = 201
            //console.log(`Successfully created PostHog feature flag: ${featureFlagKey}`)
          }

          return new Response(
            JSON.stringify({
              action: existingFlag ? 'updated' : 'created',
              featureFlag: apiResponse,
              key: featureFlagKey,
              message: 'Feature flag processed successfully',
            }),
            {
              headers: { 'Content-Type': 'application/json' },
              status: responseStatus,
            },
          )
        } catch (error) {
          console.error('Error in /posthog/feature-flags POST:', error)
          return new Response(
            JSON.stringify({
              error: error instanceof Error ? error.message : 'Internal server error',
            }),
            {
              headers: { 'Content-Type': 'application/json' },
              status: 500,
            },
          )
        }
      }),
      method: 'post',
      path: '/posthog/feature-flags',
    },

    // Deactivate a feature flag
    {
      handler: withAuth(async (req) => {
        try {
          validatePostHogConfig()

          const body = await parseRequestBody(req as any)
          const { featureFlagKey } = body

          if (!featureFlagKey) {
            return new Response(
              JSON.stringify({
                error: 'Missing feature flag key for deactivation',
              }),
              {
                headers: { 'Content-Type': 'application/json' },
                status: 400,
              },
            )
          }

          // Get the existing flag to get its ID
          const getResponse = await fetch(
            `${posthogApiHost}/api/projects/${posthogProjectId}/feature_flags/?key=${featureFlagKey}`,
            {
              headers: createPostHogHeaders(),
              method: 'GET',
            },
          )

          if (!getResponse.ok) {
            const errorText = await getResponse.text()
            console.error(
              `Failed to fetch flag for deactivation: ${getResponse.status} - ${errorText}`,
            )
            return new Response(
              JSON.stringify({
                details: errorText,
                error: `Failed to find flag ${featureFlagKey} for deactivation`,
              }),
              {
                headers: { 'Content-Type': 'application/json' },
                status: getResponse.status,
              },
            )
          }

          const existingFlags = await getResponse.json()
          const existingFlag = existingFlags.results?.[0]

          if (!existingFlag?.id) {
            return new Response(
              JSON.stringify({
                message: `Feature flag ${featureFlagKey} not found`,
              }),
              {
                headers: { 'Content-Type': 'application/json' },
                status: 200, // Still 200 if not found, but not an error
              },
            )
          }

          // Deactivate the flag
          const deactivateResponse = await fetch(
            `${posthogApiHost}/api/projects/${posthogProjectId}/feature_flags/${existingFlag.id}/`,
            {
              body: JSON.stringify({ active: false }),
              headers: createPostHogHeaders(),
              method: 'PATCH',
            },
          )

          if (!deactivateResponse.ok) {
            const errorText = await deactivateResponse.text()
            throw new Error(
              `Failed to deactivate feature flag: ${deactivateResponse.status} - ${errorText}`,
            )
          }

          const apiResponse = await deactivateResponse.json()
          // console.log(`Successfully deactivated PostHog feature flag: ${featureFlagKey}`)

          return new Response(
            JSON.stringify({
              featureFlag: apiResponse,
              key: featureFlagKey,
              message: 'Feature flag deactivated successfully',
            }),
            {
              headers: { 'Content-Type': 'application/json' },
              status: 200,
            },
          )
        } catch (error) {
          console.error('Error in /posthog/feature-flags/deactivate POST:', error)
          return new Response(
            JSON.stringify({
              error: error instanceof Error ? error.message : 'Internal server errorW',
            }),
            {
              headers: { 'Content-Type': 'application/json' },
              status: 500,
            },
          )
        }
      }),
      method: 'post',
      path: '/posthog/feature-flags/deactivate',
    },
    // NEW: Endpoint to create a PostHog experiment
    {
      handler: withAuth(async (req) => {
        try {
          validatePostHogConfig()

          const body = (await parseRequestBody(req as any)) || {}
          const { name, feature_flag_key, ...optionalParams } = body

          // Validate required parameters
          if (!name || !feature_flag_key) {
            return new Response(
              JSON.stringify({
                error: 'Missing required parameters: name and feature_flag_key',
              }),
              {
                headers: { 'Content-Type': 'application/json' },
                status: 400,
              },
            )
          }

          // Prepare the payload for the PostHog API
          const payload = {
            name,
            feature_flag_key,
            ...optionalParams, // Spread any other provided parameters
          }

          const response = await fetch(
            `${posthogApiHost}/api/projects/${posthogProjectId}/experiments/`,
            {
              body: JSON.stringify(payload),
              headers: createPostHogHeaders(),
              method: 'POST',
            },
          )

          if (!response.ok) {
            const errorText = await response.text()
            console.error(`PostHog API error ${response.status}: ${errorText}`)
            return new Response(
              JSON.stringify({
                details: errorText,
                error: 'Failed to create experiment in PostHog',
              }),
              {
                headers: { 'Content-Type': 'application/json' },
                status: response.status,
              },
            )
          }

          const data = await response.json()
          return new Response(JSON.stringify(data), {
            headers: { 'Content-Type': 'application/json' },
            status: 201,
          })
        } catch (error) {
          console.error('Error in /posthog/experiments POST:', error)
          return new Response(
            JSON.stringify({
              error: error instanceof Error ? error.message : 'Internal server error',
            }),
            {
              headers: { 'Content-Type': 'application/json' },
              status: 500,
            },
          )
        }
      }),
      method: 'post',
      path: '/posthog/experiments',
    },
    // Fetch all experiments
    {
      handler: withAuth(async (req) => {
        try {
          validatePostHogConfig()

          const response = await fetch(
            `${posthogApiHost}/api/projects/${posthogProjectId}/experiments/`,
            {
              headers: createPostHogHeaders(),
              method: 'GET',
            },
          )

          if (!response.ok) {
            const errorText = await response.text()
            console.error(`PostHog API error ${response.status}: ${errorText}`)
            return new Response(
              JSON.stringify({
                details: errorText,
                error: 'Failed to fetch experiments from PostHog',
              }),
              {
                headers: { 'Content-Type': 'application/json' },
                status: response.status,
              },
            )
          }

          const data = await response.json()
          return new Response(JSON.stringify(data), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          })
        } catch (error) {
          console.error('Error in /posthog/experiments GET:', error)
          return new Response(
            JSON.stringify({
              error: error instanceof Error ? error.message : 'Internal server error',
            }),
            {
              headers: { 'Content-Type': 'application/json' },
              status: 500,
            },
          )
        }
      }),
      method: 'get',
      path: '/posthog/experiments',
    },
  ]
}

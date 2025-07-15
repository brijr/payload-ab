import { PostHogConfig } from '../types/index.js'
import type { PayloadRequest } from 'payload'

type SecureHandler = (req: PayloadRequest, ...args: any[]) => Promise<Response>

export function withAuth(handler: SecureHandler) {
  return async (req: PayloadRequest, ...args: any[]) => {
    const INTERNAL_TOKEN = process.env.INTERNAL_API_TOKEN

    if (!INTERNAL_TOKEN) {
      console.error('❌ INTERNAL_API_TOKEN is not set in environment')
      return new Response(
        JSON.stringify({ error: 'Internal API token not configured on server' }),
        {
          status: 500,
          headers: { 'Content-Type': 'application/json' },
        },
      )
    }

    // Try to get Authorization header from Fetch or Express-like headers
    let authHeader: string | undefined
    if (typeof req.headers?.get === 'function') {
      authHeader = req.headers.get('authorization') ?? req.headers.get('Authorization') ?? undefined
    } else if (req.headers && typeof req.headers === 'object') {
    }

    if (authHeader !== `Bearer ${INTERNAL_TOKEN}`) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      })
    }

    return handler(req, ...args)
  }
}

export const createPostHogEndpoints = (posthogConfig?: PostHogConfig) => {
  const posthogApiKey = posthogConfig?.apiKey || process.env.POSTHOG_PERSONAL_API_KEY || ''
  const posthogApiHost = posthogConfig?.host || process.env.POSTHOG_HOST || 'https://us.posthog.com'
  const posthogProjectId = posthogConfig?.projectId || process.env.POSTHOG_PROJECT_ID || ''

  // Helper function to parse request body consistently
  const parseRequestBody = async (request: {
    json: () => any
    body: BodyInit | null | undefined
    text: () => any
    clone: () => any
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
      path: '/posthog/flags',
      method: 'get',
      handler: withAuth(async (req) => {
        try {
          validatePostHogConfig()

          const response = await fetch(
            `${posthogApiHost}/api/projects/${posthogProjectId}/feature_flags/`,
            {
              method: 'GET',
              headers: createPostHogHeaders(),
            },
          )

          if (!response.ok) {
            const errorText = await response.text()
            console.error(`PostHog API error ${response.status}: ${errorText}`)
            return new Response(
              JSON.stringify({
                error: 'Failed to fetch flags from PostHog',
                details: errorText,
              }),
              {
                status: response.status,
                headers: { 'Content-Type': 'application/json' },
              },
            )
          }

          const data = await response.json()
          return new Response(JSON.stringify(data), {
            status: 200,
            headers: { 'Content-Type': 'application/json' },
          })
        } catch (error) {
          console.error('Error in /posthog/flags GET:', error)
          return new Response(
            JSON.stringify({
              error: error instanceof Error ? error.message : 'Internal server error',
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }
      }),
    },

    // Create or update a feature flag
    {
      path: '/posthog/feature-flags',
      method: 'post',
      handler: withAuth(async (req) => {

        try {
          validatePostHogConfig()

          // Ensure parseRequestBody always returns an object, even if req.json is undefined
          const body = (await parseRequestBody(req as any)) || {}

          const key = body?.key
          const name = body?.name
          const variantName = body?.variantName
          const docId = body?.docId
          //console.log('Extracted values:', { key, name, variantName, docId })

          // Validate required parameters - Fixed logic
          if (!key && !docId) {
            //console.log('Validation failed - missing required parameters')
            return new Response(
              JSON.stringify({
                error: 'Missing feature flag key or document details for A/B flag management',
                received: { key, docId },
              }),
              {
                status: 400,
                headers: { 'Content-Type': 'application/json' },
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
          const variantKey = variantName || 'variant'

          // Create feature flag configuration
          const featureFlagConfig = {
            key: featureFlagKey,
            name: flagName,
            active: true,
            filters: {
              groups: [
                {
                  properties: [],
                  rollout_percentage: null,
                },
              ],
              multivariate: {
                variants: [
                  {
                    key: 'control',
                    name: 'Control',
                    rollout_percentage: 50,
                  },
                  {
                    key: variantKey,
                    name: variantKey.charAt(0).toUpperCase() + variantKey.slice(1),
                    rollout_percentage: 50,
                  },
                ],
              },
            },
            ensure_persistence: true,
          }

          // Check if flag already exists
          const existingFlagResponse = await fetch(
            `${posthogApiHost}/api/projects/${posthogProjectId}/feature_flags/?key=${featureFlagKey}`,
            {
              method: 'GET',
              headers: createPostHogHeaders(),
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
                method: 'PATCH',
                headers: createPostHogHeaders(),
                body: JSON.stringify({
                  name: featureFlagConfig.name,
                  filters: featureFlagConfig.filters,
                  active: true,
                }),
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
                method: 'POST',
                headers: createPostHogHeaders(),
                body: JSON.stringify(featureFlagConfig),
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
              message: 'Feature flag processed successfully',
              featureFlag: apiResponse,
              action: existingFlag ? 'updated' : 'created',
              key: featureFlagKey,
            }),
            {
              status: responseStatus,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        } catch (error) {
          console.error('Error in /posthog/feature-flags POST:', error)
          return new Response(
            JSON.stringify({
              error: error instanceof Error ? error.message : 'Internal server error',
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }
      }),
    },

    // Deactivate a feature flag
    {
      path: '/posthog/feature-flags/deactivate',
      method: 'post',
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
                status: 400,
                headers: { 'Content-Type': 'application/json' },
              },
            )
          }

          // Get the existing flag to get its ID
          const getResponse = await fetch(
            `${posthogApiHost}/api/projects/${posthogProjectId}/feature_flags/?key=${featureFlagKey}`,
            {
              method: 'GET',
              headers: createPostHogHeaders(),
            },
          )

          if (!getResponse.ok) {
            const errorText = await getResponse.text()
            console.error(
              `Failed to fetch flag for deactivation: ${getResponse.status} - ${errorText}`,
            )
            return new Response(
              JSON.stringify({
                error: `Failed to find flag ${featureFlagKey} for deactivation`,
                details: errorText,
              }),
              {
                status: getResponse.status,
                headers: { 'Content-Type': 'application/json' },
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
                status: 200, // Still 200 if not found, but not an error
                headers: { 'Content-Type': 'application/json' },
              },
            )
          }

          // Deactivate the flag
          const deactivateResponse = await fetch(
            `${posthogApiHost}/api/projects/${posthogProjectId}/feature_flags/${existingFlag.id}/`,
            {
              method: 'PATCH',
              headers: createPostHogHeaders(),
              body: JSON.stringify({ active: false }),
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
              message: 'Feature flag deactivated successfully',
              featureFlag: apiResponse,
              key: featureFlagKey,
            }),
            {
              status: 200,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        } catch (error) {
          console.error('Error in /posthog/feature-flags/deactivate POST:', error)
          return new Response(
            JSON.stringify({
              error: error instanceof Error ? error.message : 'Internal server error',
            }),
            {
              status: 500,
              headers: { 'Content-Type': 'application/json' },
            },
          )
        }
      }),
    },
  ]
}

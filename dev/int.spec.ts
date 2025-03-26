/* eslint-disable no-console */
/**
 * Integration tests for the A/B testing plugin
 */

import type { Payload } from 'payload'

import dotenv from 'dotenv'
import { MongoMemoryReplSet } from 'mongodb-memory-server'
import path from 'path'
import { getPayload } from 'payload'
import { fileURLToPath } from 'url'

import { NextRESTClient } from './helpers/NextRESTClient.js'

const dirname = path.dirname(fileURLToPath(import.meta.url))

let payload: Payload
let restClient: NextRESTClient
let memoryDB: MongoMemoryReplSet | undefined

describe('A/B Testing Plugin', () => {
  beforeAll(async () => {
    process.env.DISABLE_PAYLOAD_HMR = 'true'
    process.env.PAYLOAD_DROP_DATABASE = 'true'

    dotenv.config({
      path: path.resolve(dirname, './.env'),
    })

    if (!process.env.DATABASE_URI) {
      console.log('Starting memory database')
      memoryDB = await MongoMemoryReplSet.create({
        replSet: {
          count: 3,
          dbName: 'payloadmemory',
        },
      })
      console.log('Memory database started')

      process.env.DATABASE_URI = `${memoryDB.getUri()}&retryWrites=true`
    }

    const { default: config } = await import('./payload.config.js')

    payload = await getPayload({ config })
    restClient = new NextRESTClient(payload.config)
  })

  afterAll(async () => {
    if (payload.db.destroy) {
      await payload.db.destroy()
    }

    if (memoryDB) {
      await memoryDB.stop()
    }
  })

  it('can create post with A/B testable fields', async () => {
    // Create a post with A/B test variants for the title field
    const post = await payload.create({
      collection: 'posts',
      data: {
        title: {
          default: 'Default Title',
          'variant-a': 'Variant A Title',
          'variant-b': 'Variant B Title',
        },
        content: {
          default: [{ children: [{ text: 'Default content' }] }],
          'variant-a': [{ children: [{ text: 'Variant A content' }] }],
        },
      },
    })

    // Verify A/B test structure is preserved
    expect(post.title).toEqual({
      default: 'Default Title',
      'variant-a': 'Variant A Title',
      'variant-b': 'Variant B Title',
    })

    // Verify partial variants work (variant-b not specified for content)
    expect(post.content.default).toBeDefined()
    expect(post.content['variant-a']).toBeDefined()
    expect(post.content['variant-b']).toBeUndefined()
  })

  it('correctly serves variants based on abVariant parameter', async () => {
    // Create a test post with multiple variants
    const testPost = await payload.create({
      collection: 'posts',
      data: {
        title: {
          default: 'Default Title',
          'variant-a': 'Variant A Title',
          'variant-b': 'Variant B Title',
        },
        summary: {
          default: 'Default summary',
          'variant-a': 'Variant A summary',
        },
      },
    })

    // Test fetching with default variant
    const defaultResponse = await payload.findByID({
      collection: 'posts',
      id: testPost.id,
      // No abVariant means default
    })

    // Test fetching with variant-a
    const variantAResponse = await payload.findByID({
      collection: 'posts',
      id: testPost.id,
      req: {
        // Mock the abVariant value that would be set by middleware
        abVariant: 'variant-a',
      } as any,
    })

    // Test fetching with variant-b
    const variantBResponse = await payload.findByID({
      collection: 'posts',
      id: testPost.id,
      req: {
        abVariant: 'variant-b',
      } as any,
    })

    // Expect the correct values for each variant
    expect(defaultResponse.title).toBe('Default Title')
    expect(defaultResponse.summary).toBe('Default summary')
    
    expect(variantAResponse.title).toBe('Variant A Title')
    expect(variantAResponse.summary).toBe('Variant A summary')
    
    expect(variantBResponse.title).toBe('Variant B Title')
    // Variant B doesn't have a summary, should fall back to default
    expect(variantBResponse.summary).toBe('Default summary')
  })

  it('handles the track endpoint correctly', async () => {
    // Test the tracking endpoint
    const response = await restClient.POST('/api/ab-testing/track', {
      body: JSON.stringify({
        variant: 'variant-a',
        event: 'test_conversion',
        properties: {
          page: '/test-page',
        },
      }),
    })

    expect(response.status).toBe(200)
    const data = await response.json()
    expect(data).toMatchObject({
      success: true,
    })
  })
})
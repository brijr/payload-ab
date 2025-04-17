/* eslint-disable no-console */
/**
 * Here are your integration tests for the plugin.
 * They don't require running your Next.js so they are fast
 * Yet they still can test the Local API and custom endpoints using NextRESTClient helper.
 */

import type { Payload } from 'payload'

import { MongoMemoryReplSet } from 'mongodb-memory-server'
import path from 'path'
import { getPayload } from 'payload'
import { fileURLToPath } from 'url'

import { NextRESTClient } from './helpers/NextRESTClient.js'

const dirname = path.dirname(fileURLToPath(import.meta.url))

let payload: Payload
let restClient: NextRESTClient
let memoryDB: MongoMemoryReplSet | undefined

describe('Plugin tests', () => {
  beforeAll(async () => {
    process.env.DISABLE_PAYLOAD_HMR = 'true'
    // We rely on a fresh in-memory replica set; dropping database isn't needed
    // process.env.PAYLOAD_DROP_DATABASE = 'true'


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

  it('should query added by plugin custom endpoint', async () => {
    const response = await restClient.GET('/my-plugin-endpoint')
    expect(response.status).toBe(200)

    const data = await response.json()
    expect(data).toMatchObject({
      message: 'Hello from custom endpoint',
    })
  })

  it('can create post with a custom text field added by plugin', async () => {
    const post = await payload.create({
      collection: 'posts',
      data: {
        addedByPlugin: 'added by plugin',
      },
    })

    expect(post.addedByPlugin).toBe('added by plugin')
  })

  it('plugin creates and seeds plugin-collection', async () => {
    expect(payload.collections['plugin-collection']).toBeDefined()

    const { docs } = await payload.find({ collection: 'plugin-collection' })

    expect(docs).toHaveLength(1)
  })
  
  it('copies control fields into abVariant when enabling A/B testing', async () => {
    // Create a new post with some fields
    const createData = {
      title: 'Test Title',
      content: [
        { type: 'p', children: [{ text: 'Test content' }] },
      ],
      excerpt: 'Test excerpt',
      author: 'Tester',
      publishedDate: '2023-01-01',
    }
    const post = await payload.create({
      collection: 'posts',
      data: createData,
    })
    // Initially, A/B testing should be disabled
    expect(post.enableABTesting).toBe(false)
    expect(post.abVariant).toBeUndefined()

    // Enable A/B testing on the post
    const updated = await payload.update({
      collection: 'posts',
      id: post.id,
      data: { enableABTesting: true },
    })
    expect(updated.enableABTesting).toBe(true)
    // The abVariant group should now exist
    expect(updated.abVariant).toBeDefined()
    // Verify each control field was copied into abVariant
    const variant = updated.abVariant as Record<string, any>
    expect(variant.title).toBe(createData.title)
    expect(variant.excerpt).toBe(createData.excerpt)
    expect(variant.author).toBe(createData.author)
    expect(variant.publishedDate).toBe(createData.publishedDate)
    // Deep compare content arrays
    expect(variant.content).toEqual(createData.content)
  })
})

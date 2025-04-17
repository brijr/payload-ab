import type { Payload } from 'payload'

import { devUser } from './helpers/credentials.js'

export const seed = async (payload: Payload) => {
  const { totalDocs } = await payload.count({
    collection: 'users',
    where: {
      email: {
        equals: devUser.email,
      },
    },
  })

  if (!totalDocs) {
    try {
      await payload.create({
        collection: 'users',
        data: devUser,
      })
    } catch (err) {
      // Ignore write conflicts or duplicate errors during seeding
      console.warn('[Seed] could not create user, continuing:', err)
    }
  }
}

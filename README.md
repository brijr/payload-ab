# Payload CMS A/B Testing Plugin

A plugin for Payload CMS 3.x that adds A/B testing capabilities to your collections, designed to work with PostHog for analytics tracking.

## Features

- Add A/B testing variant fields to specific collections
- Selectively include or exclude fields in your variants
- Optional variants - if no variant is provided, the default content is used
- Designed to work with PostHog for analytics tracking
- TypeScript support with full type definitions

## Installation

```bash
# Using npm
npm install payload-ab

# Using pnpm
pnpm add payload-ab

# Using yarn
yarn add payload-ab
```

## Usage

### 1. Add the plugin to your Payload config

#### Basic usage with array of collections

```typescript
import { buildConfig } from 'payload'
import { abTestingPlugin } from 'payload-ab'

export default buildConfig({
  collections: [
    // Your collections
  ],
  plugins: [
    abTestingPlugin({
      collections: ['pages', 'products'], // Only these collections will have A/B testing fields
    }),
  ],
})
```

#### Advanced usage with field selection

```typescript
import { buildConfig } from 'payload'
import { abTestingPlugin } from 'payload-ab'

export default buildConfig({
  collections: [
    // Your collections
  ],
  plugins: [
    abTestingPlugin({
      collections: {
        // For posts, only include title and content in the A/B variant
        posts: {
          fields: ['title', 'content'],
        },
        // For pages, include all fields except metaDescription
        pages: {
          excludeFields: ['id', 'createdAt', 'updatedAt', 'metaDescription'],
        },
        // Disable A/B testing for a specific collection
        products: {
          enabled: false,
        },
      },
    }),
  ],
})
```

### 2. Create content with variants

Once installed, you'll see an "A/B Variant" field group in your specified collections. This group contains all the fields you've configured for A/B testing.

You can leave this empty for any document where you don't want to run an A/B test.

### 3. Implement frontend logic with Next.js middleware

To serve different variants to your users, implement middleware in your Next.js app:

```typescript
// middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // Determine if user should see a variant (random assignment, cookie-based, etc.)
  const shouldSeeVariant = Math.random() > 0.5 // 50% of users see variant
  
  // Set a cookie to maintain consistent experience
  const response = NextResponse.next()
  
  if (shouldSeeVariant) {
    response.cookies.set('abVariant', 'variant')
  } else {
    response.cookies.set('abVariant', 'default')
  }
  
  return response
}

export const config = {
  matcher: ['/pages/:path*', '/products/:path*'],
}
```

### 4. Integrate with PostHog for analytics

```typescript
// In your page component
import posthog from 'posthog-js'
import { useEffect } from 'react'

export default function Page({ page }) {
  // Check if this page has a variant
  const hasVariant = Boolean(page.abVariant)
  const variantType = hasVariant ? 'variant' : 'default'
  
  useEffect(() => {
    // Initialize PostHog if not already done
    if (!posthog.has_opted_in_capturing()) {
      posthog.init('YOUR_PROJECT_API_KEY', { api_host: 'https://us.i.posthog.com' })
    }
    
    // Track which variant was viewed
    posthog.capture('Variant Viewed', { 
      variant: variantType,
      pageId: page.id,
      pageSlug: page.slug
    })
  }, [page.id, variantType])
  
  // Render the appropriate content
  return (
    <div>
      {hasVariant ? (
        // Render variant content
        <div>
          <h1>{page.abVariant.title}</h1>
          <div>{page.abVariant.content}</div>
        </div>
      ) : (
        // Render default content
        <div>
          <h1>{page.title}</h1>
          <div>{page.content}</div>
        </div>
      )}
    </div>
  )
}
```

## Options

The plugin accepts the following options:

| Option | Type | Description | Default |
|--------|------|-------------|---------|
| `collections` | `string[]` or `Record<string, ABCollectionConfig>` | Array of collection slugs or object with detailed configuration | Required |
| `disabled` | `boolean` | Disable the plugin without removing it | `false` |

### Collection Configuration

When using the object format for collections, each collection can have the following options:

| Option | Type | Description | Default |
|--------|------|-------------|---------|
| `enabled` | `boolean` | Enable or disable A/B testing for this collection | `true` |
| `fields` | `string[]` | Fields to include in the A/B variant | All fields except system fields |
| `excludeFields` | `string[]` | Fields to exclude from the A/B variant (only used when `fields` is not specified) | `['id', 'createdAt', 'updatedAt']` |

## Development

To develop this plugin locally:

1. Clone the repository
2. Install dependencies with `pnpm install`
3. Start the development server with `pnpm dev`

## License

MIT

# Payload CMS A/B Testing Plugin

A powerful plugin for Payload CMS 3.x that adds A/B testing capabilities to your collections, designed to work seamlessly with PostHog for analytics tracking.

![Payload CMS A/B Testing Plugin](https://raw.githubusercontent.com/brijr/payload-ab/main/assets/payload-ab-banner.png)

## Features

- 🧪 Add A/B testing variant fields to specific collections
- 🔍 Selectively include or exclude fields in your variants
- 🔄 Optional variants - if no variant is provided, the default content is used
- 📊 Designed to work with PostHog for analytics tracking
- 📝 TypeScript support with full type definitions
- 🎨 Clean UI with collapsible field groups in the admin panel

## Installation

```bash
# Using npm
npm install payload-ab

# Using pnpm
pnpm add payload-ab

# Using yarn
yarn add payload-ab
```

## Important Note for Existing Projects

If you're adding this plugin to a project with existing data, you may encounter database migration errors like:

```
error: column "ab_variant_content" of relation "your_collection" contains null values
```

This happens because the database tries to add non-nullable fields to existing records. To resolve this:

1. **Back up your database** before running migrations
2. Use a migration tool like Payload's `migrate:create` to create a migration that adds nullable fields
3. Or manually add default values to existing records before applying the schema changes

For PostgreSQL users, you can also modify the migration to include `DEFAULT NULL` for the new columns.

## Detailed Setup Guide

### 1. Add the plugin to your Payload config

#### Basic usage with array of collections

The simplest way to use the plugin is to provide an array of collection slugs:

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

This will add A/B testing capabilities to the specified collections, excluding only the system fields (`id`, `createdAt`, `updatedAt`) from the variant.

#### Advanced usage with field selection

For more control, you can specify exactly which fields to include or exclude for each collection:

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

### 2. Understanding the Plugin's Effect on Your Collections

Once installed, the plugin modifies your specified collections by adding a collapsible "A/B Testing Variant" field group. Inside this group, you'll find a "Variant Content" field that contains copies of all the fields you've configured for A/B testing.

Here's what happens behind the scenes:

1. The plugin analyzes your collection fields
2. It filters these fields based on your configuration (include/exclude)
3. It creates a collapsible group with these fields in a nested structure
4. The fields maintain their original validation, UI components, and hooks

### 3. Creating Content with Variants

When creating or editing content in the Payload admin panel:

1. Create your primary content as normal
2. Expand the "A/B Testing Variant" section at the bottom of the form
3. Fill in the variant fields with the alternative content you want to test
4. Leave the variant empty if you don't want to run an A/B test for this document

**Important:** You don't need to fill in all fields in the variant. Only the fields you provide will override the default content when serving the variant.

### 4. Implementing Frontend Logic

#### Next.js App Router Example

Here's a complete example of how to implement A/B testing in a Next.js app with App Router:

```typescript
// middleware.ts
import { NextResponse } from 'next/server'
import type { NextRequest } from 'next/server'

export function middleware(request: NextRequest) {
  // Check if user already has a variant assigned
  const existingVariant = request.cookies.get('abVariant')?.value
  
  if (existingVariant) {
    // Keep the existing variant for consistency
    return NextResponse.next()
  }
  
  // Assign a variant to new users (50/50 split)
  const shouldSeeVariant = Math.random() > 0.5
  const response = NextResponse.next()
  
  // Set a cookie to maintain consistent experience
  response.cookies.set('abVariant', shouldSeeVariant ? 'variant' : 'default', {
    maxAge: 60 * 60 * 24 * 30, // 30 days
    path: '/',
  })
  
  return response
}

export const config = {
  matcher: ['/pages/:path*', '/products/:path*'],
}
```

```typescript
// app/[slug]/page.tsx
import { cookies } from 'next/headers'
import { payload } from '@/lib/payload' // Your Payload instance
import { notFound } from 'next/navigation'
import { PostHogPageView } from '@/components/analytics/PostHogPageView'

export default async function Page({ params }: { params: { slug: string } }) {
  // Get the page data
  const page = await payload.find({
    collection: 'pages',
    where: {
      slug: {
        equals: params.slug,
      },
    },
  }).then(res => res.docs[0])
  
  if (!page) {
    return notFound()
  }
  
  // Check if this page has a variant
  const hasVariant = Boolean(page.abVariant && Object.keys(page.abVariant).length > 0)
  
  // Get the user's assigned variant from cookies
  const cookieStore = cookies()
  const userVariant = cookieStore.get('abVariant')?.value || 'default'
  
  // Determine if we should show the variant
  const showVariant = hasVariant && userVariant === 'variant'
  
  // Merge the content - start with default and override with variant if needed
  const content = showVariant 
    ? { ...page, ...page.abVariant } 
    : page
  
  return (
    <div>
      {/* Analytics tracking component */}
      <PostHogPageView 
        pageId={page.id}
        variant={showVariant ? 'variant' : 'default'}
      />
      
      {/* Render the content */}
      <h1>{content.title}</h1>
      <div dangerouslySetInnerHTML={{ __html: content.content }} />
    </div>
  )
}
```

```typescript
// components/analytics/PostHogPageView.tsx
'use client'

import { useEffect } from 'react'
import posthog from 'posthog-js'

export function PostHogPageView({ 
  pageId, 
  variant 
}: { 
  pageId: string
  variant: 'default' | 'variant'
}) {
  useEffect(() => {
    // Initialize PostHog if not already done
    if (typeof window !== 'undefined' && !posthog.__loaded) {
      posthog.init('YOUR_PROJECT_API_KEY', { 
        api_host: 'https://us.i.posthog.com',
        capture_pageview: false // We'll handle pageviews manually
      })
    }
    
    // Track which variant was viewed
    posthog.capture('page_view', { 
      variant,
      pageId,
      $current_url: window.location.href
    })
  }, [pageId, variant])
  
  return null
}
```

#### Next.js Pages Router Example

If you're using the Pages Router:

```typescript
// pages/[slug].js
import { useEffect } from 'react'
import { getCookie } from 'cookies-next'
import posthog from 'posthog-js'
import payload from '../payload' // Your Payload client

export default function Page({ page, variant }) {
  // Merge the content - start with default and override with variant
  const content = variant === 'variant' && page.abVariant
    ? { ...page, ...page.abVariant }
    : page
  
  useEffect(() => {
    // Initialize PostHog
    if (typeof window !== 'undefined' && !posthog.__loaded) {
      posthog.init('YOUR_PROJECT_API_KEY', { 
        api_host: 'https://us.i.posthog.com' 
      })
    }
    
    // Track which variant was viewed
    posthog.capture('page_view', { 
      variant,
      pageId: page.id,
      $current_url: window.location.href
    })
  }, [page.id, variant])
  
  return (
    <div>
      <h1>{content.title}</h1>
      <div dangerouslySetInnerHTML={{ __html: content.content }} />
    </div>
  )
}

export async function getServerSideProps({ params, req, res }) {
  // Get the page data
  const pageData = await payload.find({
    collection: 'pages',
    where: {
      slug: {
        equals: params.slug,
      },
    },
  }).then(res => res.docs[0])
  
  if (!pageData) {
    return { notFound: true }
  }
  
  // Check if this page has a variant
  const hasVariant = Boolean(pageData.abVariant && Object.keys(pageData.abVariant).length > 0)
  
  // Get or set the user's variant
  let variant = getCookie('abVariant', { req, res })
  
  if (!variant) {
    // Assign a variant to new users (50/50 split)
    variant = Math.random() > 0.5 ? 'variant' : 'default'
    setCookie('abVariant', variant, { 
      req, 
      res, 
      maxAge: 60 * 60 * 24 * 30, // 30 days
      path: '/',
    })
  }
  
  // Only use variant if the page has one and user is assigned to variant group
  const useVariant = hasVariant && variant === 'variant'
  
  return {
    props: {
      page: pageData,
      variant: useVariant ? 'variant' : 'default',
    },
  }
}
```

### 5. Analyzing Results with PostHog

To analyze your A/B test results:

1. In PostHog, go to the "Experiments" section
2. Create a new experiment with:
   - Feature flag: None (we're handling this ourselves)
   - Goal metric: Choose an event like "Conversion" or "Purchase"
   - Experiment variants: "default" and "variant"

3. Filter your experiment to only include events where:
   - The event property "variant" equals "default" or "variant"
   - The event property "pageId" equals your specific page ID

This will give you a clear comparison of how each variant is performing.

## Advanced Configuration Options

### Plugin Options

| Option | Type | Description | Default |
|--------|------|-------------|---------|
| `collections` | `string[]` or `Record<string, ABCollectionConfig>` | Array of collection slugs or object with detailed configuration | Required |
| `disabled` | `boolean` | Disable the plugin without removing it | `false` |

### Collection Configuration (ABCollectionConfig)

When using the object format for collections, each collection can have the following options:

| Option | Type | Description | Default |
|--------|------|-------------|---------|
| `enabled` | `boolean` | Enable or disable A/B testing for this collection | `true` |
| `fields` | `string[]` | Fields to include in the A/B variant | All fields except system fields |
| `excludeFields` | `string[]` | Fields to exclude from the A/B variant (only used when `fields` is not specified) | `['id', 'createdAt', 'updatedAt']` |

## Best Practices

1. **Start Small**: Begin by testing one or two key fields rather than the entire document
2. **Be Consistent**: Once a user is assigned to a variant, keep them in that variant
3. **Track Meaningful Metrics**: Focus on conversion metrics that matter to your business
4. **Statistical Significance**: Run tests long enough to achieve statistical significance
5. **Document Your Tests**: Keep a record of what you're testing and why

## Troubleshooting

### Common Issues

**Issue**: The A/B variant fields are not appearing in my collection.
**Solution**: Ensure you've correctly specified the collection slug in the plugin configuration.

**Issue**: Some fields are missing from the A/B variant.
**Solution**: Check your `fields` or `excludeFields` configuration. System fields are excluded by default.

**Issue**: Changes to the A/B variant are not reflecting on the frontend.
**Solution**: Ensure you're correctly merging the variant data with the default data in your frontend code.

## Development

To develop this plugin locally:

1. Clone the repository
```bash
git clone https://github.com/brijr/payload-ab.git
cd payload-ab
```

2. Install dependencies
```bash
pnpm install
```

3. Start the development server
```bash
pnpm dev
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

MIT

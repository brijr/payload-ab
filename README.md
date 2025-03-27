# Payload CMS A/B Testing Plugin

A powerful plugin for Payload CMS 3.x that adds A/B testing capabilities to your collections, designed to work seamlessly with PostHog for analytics tracking.

## Features

- 🧪 Add A/B testing variant fields to specific collections
- 🔍 Selectively include or exclude fields in your variants
- 🔄 Optional variants - if no variant is provided, the default content is used
- 👆 User-initiated variants - create variants only when explicitly enabled for individual items
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
import { buildConfig } from 'payload/config'
import { abTestingPlugin } from 'payload-ab'

export default buildConfig({
  plugins: [
    abTestingPlugin({
      collections: ['pages', 'posts'],
    }),
  ],
  // rest of your config
})
```

#### Advanced usage with configuration object

For more control, you can provide a configuration object:

```typescript
import { buildConfig } from 'payload/config'
import { abTestingPlugin } from 'payload-ab'

export default buildConfig({
  plugins: [
    abTestingPlugin({
      collections: {
        pages: {
          enabled: true,
          // Only include these fields in the variant
          fields: ['title', 'content', 'slug'],
        },
        posts: {
          enabled: true,
          // Exclude these fields from the variant
          excludeFields: ['id', 'createdAt', 'updatedAt', 'author'],
        },
      },
    }),
  ],
  // rest of your config
})
```

### 2. How the A/B Testing UI Works

The plugin adds two main components to your collection admin UI:

1. **Enable A/B Testing Checkbox**: A checkbox field that allows content editors to decide whether to create an A/B variant for a specific item.

2. **A/B Testing Variant Group**: A collapsible field group that appears only when the checkbox is checked, containing all the fields you've configured for A/B testing.

This approach gives content editors full control over which items have A/B variants, making the testing process more intentional and focused.

### 3. Using A/B variants in your frontend with Next.js 15+ App Router

Here's an example of how to use the A/B variants in a Next.js 15+ application with PostHog:

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
  // Get the cookie store asynchronously (Next.js 15+ requirement)
  const cookieStore = await cookies()

  // Get the variant from cookies
  const variant = cookieStore.get('abVariant')?.value || 'default'

  // Get the page data with params (now async in Next.js 15+)
  const slug = await params.slug

  // Fetch the page data
  const pageData = await payload.find({
    collection: 'pages',
    where: {
      slug: {
        equals: slug,
      },
    },
  })

  // If no page is found, return 404
  if (!pageData.docs || pageData.docs.length === 0) {
    notFound()
  }

  const page = pageData.docs[0]

  // Check if A/B testing is enabled for this page
  const isABTestingEnabled = page.enableABTesting || false

  // Determine which content to show
  const showVariant = isABTestingEnabled && variant === 'variant' && page.abVariant
  const content = showVariant ? page.abVariant : page

  return (
    <div>
      {/* Track the page view with the variant info */}
      <PostHogPageView
        properties={{
          abTest: isABTestingEnabled ? 'active' : 'inactive',
          variant: showVariant ? 'variant' : 'default',
          pageId: page.id,
        }}
      />

      <h1>{content.title}</h1>
      <div dangerouslySetInnerHTML={{ __html: content.content }} />
    </div>
  )
}
```

### 4. Next.js 15+ Route Handler Example

If you're using route handlers for API endpoints, here's how to implement A/B testing in a Next.js 15+ route handler:

```typescript
// app/api/content/[slug]/route.ts
import { cookies } from 'next/headers'
import { payload } from '@/lib/payload'
import { NextResponse } from 'next/server'

// Route handlers are no longer cached by default in Next.js 15+
// Add this to opt into caching if needed
export const dynamic = 'force-dynamic'

export async function GET(request: Request, { params }: { params: { slug: string } }) {
  try {
    // Get the cookie store asynchronously
    const cookieStore = await cookies()

    // Get the variant from cookies
    const variant = cookieStore.get('abVariant')?.value || 'default'

    // Get the slug parameter asynchronously
    const slug = await params.slug

    // Fetch the content
    const contentData = await payload.find({
      collection: 'pages',
      where: {
        slug: {
          equals: slug,
        },
      },
    })

    if (!contentData.docs || contentData.docs.length === 0) {
      return NextResponse.json({ error: 'Not found' }, { status: 404 })
    }

    const content = contentData.docs[0]

    // Check if A/B testing is enabled for this content
    const isABTestingEnabled = content.enableABTesting || false

    // Determine which content to return
    const showVariant = isABTestingEnabled && variant === 'variant' && content.abVariant
    const responseData = showVariant ? content.abVariant : content

    // Return the appropriate content
    return NextResponse.json({
      data: responseData,
      meta: {
        abTest: isABTestingEnabled ? 'active' : 'inactive',
        variant: showVariant ? 'variant' : 'default',
      },
    })
  } catch (error) {
    console.error('Error fetching content:', error)
    return NextResponse.json({ error: 'Internal Server Error' }, { status: 500 })
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

| Option        | Type                                               | Description                                                     | Default  |
| ------------- | -------------------------------------------------- | --------------------------------------------------------------- | -------- |
| `collections` | `string[]` or `Record<string, ABCollectionConfig>` | Array of collection slugs or object with detailed configuration | Required |
| `disabled`    | `boolean`                                          | Disable the plugin without removing it                          | `false`  |

### Collection Configuration (ABCollectionConfig)

When using the object format for collections, each collection can have the following options:

| Option          | Type       | Description                                                                       | Default                            |
| --------------- | ---------- | --------------------------------------------------------------------------------- | ---------------------------------- |
| `enabled`       | `boolean`  | Enable or disable A/B testing for this collection                                 | `true`                             |
| `fields`        | `string[]` | Fields to include in the A/B variant                                              | All fields except system fields    |
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

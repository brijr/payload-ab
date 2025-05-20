# Payload CMS A/B Testing Plugin

A powerful plugin for Payload CMS 3.x that adds A/B testing capabilities to your collections, designed to work seamlessly with PostHog for analytics tracking.

## Features

- 🧪 Add A/B testing variant fields to specific collections
- 🔍 Selectively include or exclude fields in your variants
- 🔄 Optional variants - if no variant is provided, the default content is used
- 👆 User-initiated variants - create variants only when explicitly enabled for individual items
- 📊 Designed to work seamlessly with PostHog for analytics tracking
- 📝 TypeScript support with full type definitions
- 🎨 Clean UI with dedicated A/B testing tab in the admin panel
- 🔁 Automatically pre-fills new variant fields with existing content when A/B testing is first enabled on a document

## Installation

```bash
# Using npm
npm install payload-ab
# Using pnpm
pnpm add payload-ab
# Using yarn
yarn add payload-ab
```

## PostHog Integration

This plugin integrates with PostHog to provide analytics and feature flag functionality:

1. **Feature Flags**: Each A/B test uses a PostHog feature flag to determine which variant to show
2. **Analytics Events**: The plugin automatically tracks which variant is shown to users
3. **Experiment Results**: View experiment results in PostHog's experimentation dashboard

### Setting up PostHog

1. Go to your PostHog dashboard
2. Navigate to "Feature Flags"
3. Create a new feature flag:
   - Name: `ab-test-{your-collection}-{your-document-id}`
   - Key: Use the auto-generated key from your Payload document or create a custom one
   - Rollout percentage: 50% (for a 50/50 split)
   - Variants: Add two variants named "control" and "variant"

For more information on setting up experiments in PostHog, see the [PostHog documentation](https://posthog.com/docs/experiments/installation).

## Quick Start

### 1. Add the plugin to your Payload config

```typescript
import { buildConfig } from 'payload/config'
import { abTestingPlugin } from 'payload-ab'

export default buildConfig({
  // ... your config
  plugins: [
    abTestingPlugin({
      collections: ['posts', 'pages'], // Collections to enable A/B testing for
      // Optional PostHog configuration
      posthog: {
        apiKey: process.env.NEXT_PUBLIC_POSTHOG_KEY,
        host: 'https://app.posthog.com', // Optional, defaults to app.posthog.com
      },
    }),
  ],
})
```

### 2. Using A/B Testing in your frontend

#### Server-side (Next.js App Router)

First, set up PostHog initialization in a client component:

```tsx
// components/PostHogInit.tsx
'use client'

import posthog from 'posthog-js'
import { PostHogProvider as PHProvider } from 'posthog-js/react'

const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY!
const posthogHost = process.env.NEXT_PUBLIC_POSTHOG_HOST || 'https://us.i.posthog.com'

if (typeof window !== 'undefined' && !posthog.__loaded) {
  posthog.init(posthogKey, {
    api_host: posthogHost,
    loaded: (ph) => {
      console.log('✅ PostHog initialized')
    },
  })
}

export function PostHogProvider({ children }: { children: React.ReactNode }) {
  return <PHProvider client={posthog}>{children}</PHProvider>
}
```

Add it to your layout:

```tsx
// app/layout.tsx
import PostHogInit from '@/components/PostHogInit'

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <PostHogInit />
        {children}
      </body>
    </html>
  )
}
```

Then use the server-side variant function in your page:

```tsx
import { getServerSideABVariant } from 'payload-ab/server'
import { cookies } from 'next/headers'
import { RichText } from '@payloadcms/richtext-lexical/react'

// Define proper types for your document with A/B testing fields
type DocumentWithAB = YourDocumentType & {
  enableABTesting?: boolean
  abVariant?: Partial<YourDocumentType>
  posthogFeatureFlagKey?: string
  [key: string]: unknown // Add index signature to satisfy Record<string, unknown> constraint
}

export default async function Page({ params }) {
  // Fetch your document from Payload
  const document = (await fetchDocument(params.id)) as DocumentWithAB

  // Get the cookie store
  const cookieStore = await cookies() // await the cookieStore

  // Get the appropriate variant based on cookies
  const content = await getServerSideABVariant<DocumentWithAB, DocumentWithAB>(
    document,
    cookieStore,
  )

  return (
    <div>
      <h1>{content.title}</h1>
      <RichText data={content.content} />
    </div>
  )
}
```

For development and testing, you can force a specific variant:

```tsx
// For development/testing only
if (process.env.NODE_ENV === 'development' && document.enableABTesting && document.abVariant) {
  // Force the variant to be shown
  content = {
    ...document,
    ...document.abVariant,
  }
}
```

#### Client-side (React)

```tsx
import { getABTestVariant } from 'payload-ab/client'
import posthog from 'posthog-js'

// Initialize PostHog
posthog.init(process.env.NEXT_PUBLIC_POSTHOG_KEY, {
  api_host: 'https://app.posthog.com',
})

const MyComponent = ({ document }) => {
  // Get the appropriate variant based on PostHog feature flag
  const content = getABTestVariant(document, posthog)

  return (
    <div>
      <h1>{content.title}</h1>
      <div>{content.content}</div>
    </div>
  )
}
```

## Creating A/B Test Variants

1. In the Payload admin, navigate to any collection with A/B testing enabled
2. Go to the "A/B Testing" tab
3. Toggle "Enable A/B Testing" to start creating your variant
4. Fill in your variant content (all fields are optional)
5. Optionally set a PostHog Feature Flag Key (or one will be auto-generated)
6. Save the document

## Advanced Configuration

### Field Selection

You can control which fields are included in the A/B variant:

```typescript
import { buildConfig } from 'payload/config'
import { abTestingPlugin } from 'payload-ab'

export default buildConfig({
  // ... your config
  plugins: [
    abTestingPlugin({
      // Simple configuration with collection slugs
      collections: ['simple-collection'],
      
      // OR advanced configuration with field selection
      collections: {
        'posts': {
          // Only include these specific fields in the variant
          fields: ['title', 'content', 'summary', 'image'],
        },
        'pages': {
          // Exclude specific fields from the variant
          excludeFields: ['id', 'createdAt', 'updatedAt', 'author'],
        },
        'products': {
          // Disable A/B testing for this collection
          enabled: false,
        }
      },
      
      // Optional PostHog configuration
      posthog: {
        apiKey: process.env.NEXT_PUBLIC_POSTHOG_KEY,
        host: 'https://app.posthog.com',
      },
    }),
  ],
})
```

When A/B testing is enabled for a document, the plugin will automatically copy the content from the original fields to the variant fields. This ensures you start with identical content that you can then modify as needed.

### Field Copying Behavior

When you enable A/B testing on a document:

1. The plugin creates a variant object with the same structure as your original content
2. Only fields explicitly included in your configuration are copied to the variant
3. System fields like `id`, `createdAt`, and `updatedAt` are never copied
4. If you modify a field in the variant, that change persists even if you update the original field

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

Example of advanced configuration:

```typescript
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
  },
})
```

## Server-Side A/B Testing Features

The server-side A/B testing functionality includes:

- Automatic variant selection based on a consistent hashing algorithm
- Support for PostHog cookies when available
- Fallback to random test IDs when PostHog cookies aren't present (great for development)
- 50/50 traffic split between original and variant content
- Customizable feature flag keys

## Client-Side Tracking

The plugin provides a client-side component for tracking A/B test variants with PostHog.

### TrackAB Component

The `TrackAB` component allows you to track when a user is exposed to a specific variant of your A/B test. This is useful for tracking conversions and other metrics in PostHog.

```tsx
import { TrackAB } from 'payload-ab/client'

export default function MyPage() {
  return (
    <>
      {/* Track that the user saw variant "red-button" for flag "homepage-cta" */}
      <TrackAB 
        flagKey="homepage-cta" 
        variant="red-button" 
      />
      
      {/* Your page content */}
      <h1>Welcome to my page</h1>
    </>
  )
}
```

#### Props

- `flagKey` (required): The PostHog feature flag key to track
- `variant` (required): The variant name the user is seeing
- `distinctId` (optional): A custom distinct ID to use for tracking. If not provided, PostHog will use its default ID

### Setting Up PostHog in Your App

To use the `TrackAB` component, you need to set up PostHog in your Next.js app:

```tsx
// app/providers.tsx
'use client'

import { PropsWithChildren } from 'react'
import posthog from 'posthog-js'
import { PostHogProvider } from 'posthog-js/react'

export function Providers({ children }: PropsWithChildren) {
  // Only initialize on the client side
  if (typeof window !== 'undefined') {
    const posthogKey = process.env.NEXT_PUBLIC_POSTHOG_KEY
    
    if (posthogKey) {
      posthog.init(posthogKey, {
        api_host: 'https://app.posthog.com',
        capture_pageview: false,
      })
    }
  }

  return <PostHogProvider client={posthog}>{children}</PostHogProvider>
}
```

Then wrap your app with the provider:

```tsx
// app/layout.tsx
import { Providers } from './providers'

export default function RootLayout({ children }) {
  return (
    <html lang="en">
      <body>
        <Providers>{children}</Providers>
      </body>
    </html>
  )
}
```

### Installation

First, install the PostHog JavaScript SDK and React integration in your Next.js project:

```bash
npm install posthog-js
# or
yarn add posthog-js
# or
pnpm add posthog-js
```

And set your PostHog API key in your environment variables:

```
NEXT_PUBLIC_POSTHOG_KEY=your_posthog_api_key
```

### How It Works

1. The `TrackAB` component uses the PostHog React hook to access the PostHog client
2. It evaluates the feature flag and captures the `$feature_flag_called` event with the variant information
3. This ensures accurate tracking of feature flag exposures in your PostHog analytics

This approach ensures that your A/B test variants are properly tracked in PostHog, allowing you to analyze the performance of different variants.

## Best Practices

1. **Start Small**: Begin by testing one or two key fields rather than the entire document
2. **Monitor Results**: Regularly check your PostHog dashboard to see which variant performs better
3. **Iterate**: Use the insights gained to refine your content strategy

## Troubleshooting

### Common Issues

**Issue**: The A/B variant fields are not appearing in my collection.  
**Solution**: Ensure you've correctly specified the collection slug in the plugin configuration.

**Issue**: Some fields are missing from the A/B variant.  
**Solution**: Check your `fields` or `excludeFields` configuration. System fields are excluded by default.

**Issue**: Changes to the A/B variant are not reflecting on the frontend.  
**Solution**: Ensure you're correctly merging the variant data with the default data in your frontend code.

**Issue**: Getting error `PostHog was initialized without a token` in Next.js App Router.  
**Solution**: Make sure you're initializing PostHog in a client component with a valid API key and that the environment variable is properly set.

**Issue**: Error about `cookies()` should be awaited in Next.js App Router.  
**Solution**: When using the `cookies()` function in Next.js, make sure to properly await it when passing to functions:

```tsx
const cookieStore = await cookies()
const content = await getServerSideABVariant(document, cookieStore)
```

**Issue**: A/B testing variant not showing in server components.  
**Solution**: The server-side variant selection relies on the PostHog cookie (`ph_distinct_id`). Make sure:

1. PostHog is properly initialized on the client side
2. The user has visited the site before so the cookie is set
3. For testing, you can force a variant as shown in the examples above

**Issue**: TypeScript error: `Type 'YourType' does not satisfy the constraint 'Record<string, unknown>'. Index signature for type 'string' is missing in type 'YourType'`.  
**Solution**: Add an index signature to your document type:

```tsx
// Define a type that includes the A/B testing fields
type DocumentWithAB = YourDocumentType & {
  enableABTesting?: boolean
  abVariant?: Partial<YourDocumentType>
  posthogFeatureFlagKey?: string
  [key: string]: unknown // Add this index signature
}
```

## Testing Your A/B Tests

### Development Testing

1. Create a test document in Payload with A/B testing enabled
2. Set up your variants in the admin panel
3. Use PostHog's feature flag override in development:

```typescript
// In your development environment
posthog.featureFlags.override({
  'ab-test-posts-123': 'variant', // Replace with your feature flag key
})
```

### Browser Testing

1. Open your site in two different browsers or incognito windows (not just different tabs)
2. You should see different variants in each window
3. Use PostHog's debug mode to verify the feature flag is working:

```typescript
posthog.debug(true)
```

### Troubleshooting A/B Test Variants

If you're not seeing different variants during testing:

1. **Check PostHog initialization**: Make sure PostHog is properly initialized on the client side.

2. **Verify cookies**: Add debug logging to check if the PostHog cookie is being set:

   ```typescript
   const cookieStore = cookies()
   const phCookie = cookieStore.get('ph_distinct_id')
   console.log('PostHog Cookie:', phCookie?.value)
   ```

3. **Test in private/incognito windows**: Regular browser refreshes may not change the variant. Use different browser sessions.

4. **Force variants for testing**: For development, you can force variants:

   ```typescript
   // Force a specific variant
   if (process.env.NODE_ENV === 'development') {
     content = {
       ...document,
       ...document.abVariant,
     }
   } else {
     content = await getServerSideABVariant(document, await cookieStore)
   }
   ```

5. **Random assignment for testing**: Simulate different users getting different variants:

   ```typescript
   if (process.env.NODE_ENV === 'development') {
     const randomValue = Math.random()
     if (randomValue > 0.5) {
       content = { ...document, ...document.abVariant }
     } else {
       content = document
     }
   }
   ```

6. **Check PostHog dashboard**: Verify in the PostHog dashboard that your feature flag is:
   - Properly configured with the correct key
   - Enabled for your project
   - Set to distribute traffic between variants (e.g., 50/50 split)

### Debugging Tips

```typescript
// Check which variant is active
const variant = posthog.getFeatureFlag('ab-test-posts-123')
console.log('Current variant:', variant)

// Force a specific variant (development only)
posthog.featureFlags.override({
  'ab-test-posts-123': 'control',
})

// Check if feature flag is enabled
const isEnabled = posthog.isFeatureEnabled('ab-test-posts-123')
console.log('Feature flag enabled:', isEnabled)
```

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

Created by [Bridger Tower](https://bridger.to).

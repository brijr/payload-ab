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

1. Open your site in two different browsers or incognito windows
2. You should see different variants in each window
3. Use PostHog's debug mode to verify the feature flag is working:

```typescript
posthog.debug(true)
```

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
        apiKey: process.env.POSTHOG_API_KEY,
        host: 'https://app.posthog.com', // Optional, defaults to app.posthog.com
      },
    }),
  ],
})
```

### 2. Using A/B Testing in your frontend

#### Client-side (React)

```tsx
import { getABTestVariant } from 'payload-ab/client'
import posthog from 'posthog-js'

// Initialize PostHog
posthog.init('your-project-api-key', {
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

#### Server-side (Next.js App Router)

```tsx
import { getServerSideABVariant } from 'payload-ab/rsc'
import { cookies } from 'next/headers'

export default async function Page({ params }) {
  // Fetch your document from Payload
  const document = await fetchDocument(params.id)

  // Get the appropriate variant based on cookies
  const content = await getServerSideABVariant(document, cookies())

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

Created by [Bridger Tower](https://bridger.to).

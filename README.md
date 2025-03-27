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
        host: 'https://app.posthog.com' // Optional, defaults to app.posthog.com
      }
    }),
  ],
})
```

### 2. Advanced Configuration

For more granular control, you can specify which fields to include or exclude:

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

### 3. Using A/B Testing with PostHog

#### Client-side (React)

```tsx
import { getABTestVariant } from 'payload-ab/client'
import posthog from 'posthog-js'

// Initialize PostHog
posthog.init('your-project-api-key', {
  api_host: 'https://app.posthog.com'
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
3. Toggle "Enable A/B Testing"
4. Optionally set a PostHog Feature Flag Key (or one will be auto-generated)
5. Create your variant content
6. Save the document

## PostHog Integration

This plugin integrates with PostHog to provide analytics and feature flag functionality:

1. **Feature Flags**: Each A/B test uses a PostHog feature flag to determine which variant to show
2. **Analytics Events**: The plugin automatically tracks which variant is shown to users
3. **Experiment Results**: View experiment results in PostHog's experimentation dashboard

For more information on setting up experiments in PostHog, see the [PostHog documentation](https://posthog.com/docs/experiments/installation).

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

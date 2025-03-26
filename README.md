# PayloadCMS A/B Testing Plugin

A plugin for PayloadCMS that enables A/B testing functionality for your content. This plugin allows content editors to create multiple variants of content and dynamically serves different variants to users.

## Features

- Mark fields as A/B testable (similar to localization)
- Configure multiple variants with optional weights
- Middleware for variant assignment and tracking
- Admin UI for managing content variants
- Analytics integration with PostHog or custom tracking

## Installation

```bash
npm install ab-testing-plugin
# or
yarn add ab-testing-plugin
# or
pnpm add ab-testing-plugin
```

## Usage

Add the plugin to your Payload config:

```typescript
import { buildConfig } from 'payload/config';
import { abTestingPlugin } from 'ab-testing-plugin';

export default buildConfig({
  // ... your config
  plugins: [
    abTestingPlugin({
      collections: ['posts', 'pages'],
      variants: [
        { code: 'variant-a', label: 'Variant A', weight: 0.5 },
        { code: 'variant-b', label: 'Variant B', weight: 0.5 },
      ],
      defaultVariant: 'default',
      fallback: true,
      analytics: {
        // Optional: PostHog API key for tracking
        postHogApiKey: process.env.POSTHOG_API_KEY,
        // Or use a custom tracking function
        trackEvent: ({ variant, userId, properties }) => {
          // Custom tracking implementation
          console.log(`Variant ${variant} served to ${userId}`, properties);
        },
      },
    }),
  ],
});
```

## How It Works

### Field-level A/B Testing

When you enable A/B testing for a collection, all compatible fields in that collection are automatically made "A/B testable". This allows content editors to provide different values for each variant.

In the admin UI, editors will see a variant selector for each A/B testable field, allowing them to switch between variants and provide different content for each.

### Variant Selection

The plugin includes middleware that automatically assigns variants to users:

1. When a user visits your site for the first time, they are randomly assigned a variant based on configured weights
2. A cookie is set to ensure the user sees the same variant on subsequent visits
3. The variant is attached to the request object for use in your application
4. If analytics is configured, an event is triggered to track which variant was served

### Tracking Conversions

You can track conversions by calling the `/api/ab-testing/track` endpoint:

```javascript
// Client-side tracking example
fetch('/api/ab-testing/track', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({
    variant: 'variant-a', // The current variant
    event: 'signup_completed', // The conversion event
    properties: {
      // Any additional properties
      page: '/signup',
    },
  }),
});
```

## Configuration Options

| Option | Type | Description |
|--------|------|-------------|
| `enabled` | `boolean` | Enable or disable the plugin |
| `collections` | `string[]` | List of collection slugs to enable A/B testing for |
| `variants` | `Array` | List of variant configurations |
| `defaultVariant` | `string` | Default variant code |
| `fallback` | `boolean` | Whether to fallback to default variant when content is not available |
| `analytics` | `Object` | Analytics configuration |

## License

MIT
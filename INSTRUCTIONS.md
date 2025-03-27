Below is a step-by-step guide to build a plugin that only adds A/B testing fields to specific collections:

---

### Step 1. Scaffold Your Plugin

1. **Create a New Plugin:**  
   Use the Payload plugin template to quickly scaffold a plugin.
   ```bash
   npx create-payload-app@latest --template plugin
   ```
   This sets up a basic plugin structure with example files.  
   citeturn1search14

---

### Step 2. Define Your Plugin Function

1. **Create a Plugin File:**  
   Inside your plugin folder (for example, `plugins/abTestingPlugin.ts`), create a file that exports a function. This function receives an options object and the incoming Payload configuration.
2. **Accept Plugin Options:**  
   Define an options parameter that includes a `collections` property (an array of collection slugs).
3. **Modify the Config for Targeted Collections:**  
   Iterate over `incomingConfig.collections` and, for each collection whose slug is in the provided list, inject your A/B testing fields.

   Here’s a sample implementation:

   ```js
   // plugins/abTestingPlugin.ts
   import { Config, Plugin } from 'payload';

   interface ABTestingPluginOptions {
     collections: string[]; // target collection slugs
   }

   export const abTestingPlugin: Plugin = (options: ABTestingPluginOptions) => {
     return (incomingConfig: Config): Config => {
       // Map over the collections in the config
       const modifiedCollections = incomingConfig.collections.map((collection) => {
         // Only modify collections that match our options
         if (options.collections.includes(collection.slug)) {
           return {
             ...collection,
             fields: [
               ...collection.fields,
               {
                 name: 'abVariant',
                 type: 'group',
                 label: 'A/B Variant',
                 required: false, // optional; if missing, default page will be used
                 fields: [
                   {
                     name: 'content',
                     type: 'richText',
                     label: 'Variant Content',
                   },
                   // Add other fields as needed for your variant...
                 ],
               },
             ],
           };
         }
         return collection;
       });

       return {
         ...incomingConfig,
         collections: modifiedCollections,
       };
     };
   };
   ```

---

### Step 3. Integrate the Plugin in Your Payload Config

1. **Import Your Plugin:**  
   In your main `payload.config.ts`, import your newly created plugin.
2. **Pass the Target Collections:**  
   Add the plugin to the `plugins` array and provide an options object that lists the collection slugs where you want A/B testing enabled.

   ```js
   // payload.config.ts
   import { buildConfig } from 'payload'
   import { abTestingPlugin } from './plugins/abTestingPlugin'

   export default buildConfig({
     collections: [
       // Your collections e.g. pages, products, etc.
     ],
     plugins: [
       abTestingPlugin({
         collections: ['pages', 'products'], // Only these collections will have the abVariant field
       }),
     ],
   })
   ```

---

### Step 4. Test and Verify

1. **Run Your Application:**  
   Start your local development server (e.g., `pnpm dev` or `npm run dev`).
2. **Check the Admin Panel:**  
   Open the admin panel for the targeted collections (e.g., `/admin/collections/pages`). Verify that the new "A/B Variant" group appears with its fields.
3. **Test the Functionality:**  
   Create or update documents to test whether the variant is optional. When no variant is set, your middleware (to be implemented separately) should default to the primary content.

---

### Step 5. (Optional) Integrate PostHog for Analytics

1. **Set Up PostHog:**  
   Install PostHog’s SDK and add the snippet to your front end or admin panel as needed.
2. **Capture Events:**  
   In your Next.js middleware or within your page components, fire PostHog events when users are served a variant. For example:

   ```js
   import posthog from 'posthog-js'

   // Initialize PostHog if not already done
   if (!posthog.has_opted_in_capturing()) {
     posthog.init('YOUR_PROJECT_API_KEY', { api_host: 'https://us.i.posthog.com' })
   }

   // Capture an event when variant is shown:
   posthog.capture('Variant Viewed', { variant: 'abVariant' })
   ```

   citeturn1search3

---

### Summary

1. **Scaffold your plugin** using the official template.
2. **Create a plugin function** that accepts an options object (including target collection slugs) and modifies the incoming config to inject an optional A/B variant field group.
3. **Integrate the plugin** in your main `payload.config.ts` and pass the list of collections.
4. **Test the changes** in your admin panel and on your front end.
5. **Optionally integrate PostHog** to capture variant-related events.

Does this step-by-step guide cover what you need? Feel free to ask if you want further details or additional examples on any step!

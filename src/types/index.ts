import type { AfterErrorHook, CollectionConfig, Config, Field, PayloadRequest } from 'payload'

export type FieldWithRequired = {
  required?: boolean
  type: string
} & Field

// Define hook argument types
export interface BeforeChangeHookArgs {
  collection?: {
    slug: string
  }
  data: {
    [key: string]: unknown
    abVariant?: Record<string, unknown>
    enableABTesting?: boolean
  }
  originalDoc?: {
    [key: string]: unknown
    enableABTesting?: boolean
  }
  req: PayloadRequest
}

// Define the hook type
export type BeforeChangeHook = (
  args: BeforeChangeHookArgs,
) => Promise<Record<string, unknown> | void> // Allow void for async operations

// Define hooks type
export interface Hooks {
  afterError?: AfterErrorHook[]
  beforeChange?: BeforeChangeHook[]
}

// Define config type with hooks
export interface ConfigWithHooks extends Omit<Config, 'hooks'> {
  collections?: CollectionConfig[]
  hooks?: Hooks
}

export interface ABTestingPluginOptions {
  /**
   * Configuration for collections that should have A/B testing fields
   * Can be either an array of collection slugs or an object with more detailed configuration
   */
  collections: Record<string, ABCollectionConfig> | string[]
  /**
   * Enable or disable the plugin
   * @default false
   */
  disabled?: boolean
  /**
   * PostHog configuration options
   */
  posthog?: PostHogConfig
}

/**
 * PostHog configuration options
 */
export interface PostHogConfig {
  /**
   * PostHog project API key
   */
  apiKey?: string
  /**
   * PostHog feature flag key to use for this experiment
   * If not provided, one will be generated based on the collection slug
   */
  featureFlagKey?: string
  /**
   * PostHog host URL
   * @default 'https://app.posthog.com'
   */
  host?: string

  projectId?: string
}

export interface ABCollectionConfig {
  /**
   * Enable or disable A/B testing for this collection
   * @default true
   */
  enabled?: boolean
  /**
   * Fields to exclude from the A/B variant
   * Only used when fields is not specified
   * @default ['id', 'createdAt', 'updatedAt']
   */
  excludeFields?: string[]
  /**
   * Fields to include in the A/B variant
   * If not specified, all fields will be included except system fields
   */
  fields?: string[]
}

export type ABTestVariant = {
  /**
   * Unique code for the variant
   */
  code: string;
  /**
   * Display name for the variant
   */
  label: string;
  /**
   * Optional weight for random assignment (0 to 1)
   */
  weight?: number;
};

export type ABTestingField = {
  /**
   * Whether the field supports A/B testing
   */
  abTestable?: boolean;
};

// Object with variant values
export type ABTestFieldValue<T> = {
  [key: string]: T;
};

import type { Field } from 'payload';
import type { ABTestVariant } from '../types';

/**
 * Recursive function to traverse fields and make them abTestable
 */
export const injectAbTestableIntoFields = (fields: Field[], variants: ABTestVariant[]): Field[] => {
  return fields.map(field => {
    // Skip if the field type doesn't support A/B testing
    if (
      field.type === 'relationship' ||
      field.type === 'upload' ||
      field.type === 'blocks' ||
      field.type === 'tabs'
    ) {
      return field;
    }

    // Handle fields with subfields (array, group, etc.)
    if (field.type === 'array' && field.fields) {
      return {
        ...field,
        fields: injectAbTestableIntoFields(field.fields, variants),
      };
    }

    if (field.type === 'group' && field.fields) {
      return {
        ...field,
        fields: injectAbTestableIntoFields(field.fields, variants),
      };
    }

    if (field.type === 'collapsible' && field.fields) {
      return {
        ...field,
        fields: injectAbTestableIntoFields(field.fields, variants),
      };
    }

    // For standard fields, make them abTestable
    return {
      ...field,
      abTestable: true,
      hooks: {
        ...field.hooks,
        beforeChange: [
          ...(field.hooks?.beforeChange || []),
          ({ value, req }) => {
            const variant = req.abVariant || 'default';
            
            // If the value is already in A/B test format, keep it that way
            if (value && typeof value === 'object' && variants.some(v => v.code in value)) {
              return value;
            }
            
            // Convert to A/B test format if it's not already
            return {
              default: value,
            };
          },
        ],
        afterRead: [
          ...(field.hooks?.afterRead || []),
          ({ value, req }) => {
            if (!value || typeof value !== 'object') return value;
            
            // Get the current variant from request or use default
            const variant = req.abVariant || 'default';
            
            // Return the value for the current variant, or fallback to default
            return value[variant] !== undefined ? value[variant] : value.default;
          },
        ],
      },
      admin: {
        ...field.admin,
        components: {
          ...field.admin?.components,
          Field: 'ab-testing-plugin/client#ABTestField',
        },
      },
    };
  });
};

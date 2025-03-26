import type { Request, Response, NextFunction } from 'express';
import type { AbTestingPluginConfig } from '../index';

/**
 * Middleware for A/B testing variant assignment and tracking
 */
export const abTestingMiddleware = (options: AbTestingPluginConfig) => {
  return (req: Request, res: Response, next: NextFunction) => {
    // Skip middleware for admin routes
    if (req.url.startsWith('/admin')) {
      return next();
    }

    // Check if the user already has an assigned variant from cookies
    let variant = req.cookies?.abVariant;

    // If no variant is assigned, assign a new one
    if (!variant) {
      variant = assignVariant(options);
      
      // Set cookie for future requests
      res.cookie('abVariant', variant, {
        maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
        httpOnly: true,
        secure: process.env.NODE_ENV === 'production',
      });
    }

    // Attach the variant to the request object for later use
    req.abVariant = variant;

    // Track the variant served if analytics is configured
    if (options.analytics?.trackEvent) {
      const userId = req.user?.id || 'anonymous';
      options.analytics.trackEvent({
        variant,
        userId,
        properties: {
          event: 'Variant Served',
          path: req.path,
        },
      });
    }

    next();
  };
};

/**
 * Assign a variant based on weights or random selection
 */
function assignVariant(options: AbTestingPluginConfig): string {
  // If no variants, return default
  if (!options.variants || options.variants.length === 0) {
    return options.defaultVariant || 'default';
  }

  // Check if any variants have weights
  const hasWeights = options.variants.some(variant => typeof variant.weight === 'number');

  if (hasWeights) {
    // Weighted random selection
    const totalWeight = options.variants.reduce(
      (sum, variant) => sum + (variant.weight || 0),
      0
    );
    
    let random = Math.random() * totalWeight;
    
    for (const variant of options.variants) {
      random -= (variant.weight || 0);
      if (random <= 0) {
        return variant.code;
      }
    }
    
    // Fallback to default if weights don't add up correctly
    return options.defaultVariant || 'default';
  } else {
    // Simple random selection (equal probability)
    const randomIndex = Math.floor(Math.random() * options.variants.length);
    return options.variants[randomIndex].code;
  }
}

// Add typings to Express Request
declare global {
  namespace Express {
    interface Request {
      abVariant?: string;
    }
  }
}

import { lazy } from 'react';

// Export the BeforeDashboardClient component
export { BeforeDashboardClient } from '../components/BeforeDashboardClient.js';

// Export components for A/B testing UI
export const ABTestField = lazy(() => import('../components/ABTestField.js'));
export const BeforeFieldComponent = lazy(() => import('../components/BeforeFieldComponent.js'));
export const VariantSwitcher = lazy(() => import('../components/VariantSwitcher.js'));
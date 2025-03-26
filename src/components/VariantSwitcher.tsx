import React, { useEffect, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useConfig } from 'payload/components/utilities';
import styles from './ABTesting.module.css';

/**
 * Component for switching between A/B test variants in the admin UI
 */
const VariantSwitcher: React.FC = () => {
  const { t } = useTranslation();
  const config = useConfig();
  const abTestingConfig = config.globals?.abTesting;
  const variants = abTestingConfig?.variants || [];
  
  // Get variant from localStorage or default
  const [activeVariant, setActiveVariant] = useState<string>(() => {
    if (typeof window !== 'undefined') {
      return localStorage.getItem('abTestingVariant') || 'default';
    }
    return 'default';
  });

  // Update localStorage when variant changes
  useEffect(() => {
    if (typeof window !== 'undefined') {
      localStorage.setItem('abTestingVariant', activeVariant);
    }
  }, [activeVariant]);

  // If plugin is disabled, don't render anything
  if (!abTestingConfig?.enabled) {
    return null;
  }

  return (
    <div className={styles.variantSwitcher}>
      <div className={styles.variantSwitcherLabel}>{t('A/B Variant')}:</div>
      <select value={activeVariant} onChange={(e) => setActiveVariant(e.target.value)}>
        <option value="default">{t('Default')}</option>
        {variants.map((variant) => (
          <option key={variant.code} value={variant.code}>
            {variant.label}
          </option>
        ))}
      </select>
    </div>
  );
};

export default VariantSwitcher;

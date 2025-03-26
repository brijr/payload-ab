import React, { useEffect, useState } from 'react';
import { useField } from 'payload/components/forms';
import { useTranslation } from 'react-i18next';
import { useConfig } from 'payload/components/utilities';
import styles from './ABTesting.module.css';

/**
 * Custom field component for A/B testable fields
 * Similar to how localization fields are handled in PayloadCMS
 */
const ABTestField: React.FC<any> = (props) => {
  const { path, field, DefaultField } = props;
  const { value, setValue } = useField({ path });
  const { t } = useTranslation();
  const config = useConfig();
  const abTestingConfig = config.globals?.abTesting;
  const variants = abTestingConfig?.variants || [];
  const [activeVariant, setActiveVariant] = useState<string>('default');

  // If field is not abTestable, render the default field
  if (!field.abTestable) {
    return <DefaultField {...props} />;
  }

  // Ensure value is in proper format for A/B testing
  useEffect(() => {
    if (!value || typeof value !== 'object') {
      setValue({
        default: value,
      });
    } else if (!('default' in value)) {
      setValue({
        ...value,
        default: '',
      });
    }
  }, []);

  // Handle variant change
  const handleVariantChange = (e) => {
    setActiveVariant(e.target.value);
  };

  // Handle field value change for the active variant
  const handleFieldChange = (newValue) => {
    setValue({
      ...value,
      [activeVariant]: newValue,
    });
  };

  // Get value for current variant
  const variantValue = value && typeof value === 'object' ? value[activeVariant] : '';

  return (
    <div className={styles.abTestField}>
      <div className={styles.abTestFieldHeader}>
        <label>{field.label}</label>
        <select value={activeVariant} onChange={handleVariantChange}>
          <option value="default">{t('Default')}</option>
          {variants.map((variant) => (
            <option key={variant.code} value={variant.code}>
              {variant.label}
            </option>
          ))}
        </select>
      </div>
      <div className={styles.abTestFieldContent}>
        <DefaultField
          {...props}
          path={`${path}.${activeVariant}`}
          value={variantValue}
          onChange={handleFieldChange}
        />
      </div>
    </div>
  );
};

export default ABTestField;

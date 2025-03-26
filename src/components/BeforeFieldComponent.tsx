import React from 'react';
import { useConfig } from 'payload/components/utilities';
import styles from './ABTesting.module.css';

/**
 * Component that renders before fields to indicate A/B testing status
 */
const BeforeFieldComponent: React.FC<any> = (props) => {
  const { field } = props;
  const config = useConfig();
  const abTestingConfig = config.globals?.abTesting;
  
  // Only show indicator for A/B testable fields
  if (!field.abTestable || !abTestingConfig?.enabled) {
    return null;
  }

  return (
    <div className={styles.abTestableIndicator}>
      <span title="This field supports A/B testing">A/B</span>
    </div>
  );
};

export default BeforeFieldComponent;

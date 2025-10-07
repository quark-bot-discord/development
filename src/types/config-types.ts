/**
 * @fileoverview Configuration management type definitions.
 * 
 * This module provides type definitions for configuration loading,
 * validation, and management operations.
 * 
 * @module ConfigTypes
 * @since 1.0.0
 */

/**
 * Configuration value types.
 */
export type ConfigValue = unknown;

/**
 * Configuration data structure.
 */
export type ConfigData = Record<string, ConfigValue>;

/**
 * Validation rule for configuration schema.
 */
export interface ValidationRule {
  /** Whether the field is required */
  required?: boolean;
  /** Expected type of the value */
  type?: "string" | "number" | "boolean" | "object";
  /** Default value if not provided */
  default?: ConfigValue;
  /** Custom validation function */
  validate?: (value: ConfigValue) => boolean;
}

/**
 * Configuration schema definition.
 */
export type ConfigSchema = Record<string, ValidationRule>;

/**
 * Configuration fallback values.
 */
export type ConfigFallbacks = Record<string, ConfigValue>;

/**
 * Configuration source types supported by the loader.
 */
export type ConfigSourceType =
  | "file"
  | "env"
  | "k8s-secret"
  | "k8s-configmap"
  | "remote"
  | "memory";

/**
 * Configuration loading options.
 */
export interface ConfigLoadOptions {
  /** Environment name (dev, staging, prod) */
  environment: string;
  /** Whether to include sensitive data */
  includeSensitive: boolean;
  /** Configuration sources to use */
  sources: ConfigSourceType[];
  /** Validation schema to apply */
  schema?: ConfigSchema;
  /** Whether to watch for changes */
  watch: boolean;
  /** Fallback values */
  fallbacks?: ConfigFallbacks;
}

/**
 * Loaded configuration with metadata.
 */
export interface LoadedConfig {
  /** Configuration data */
  data: ConfigData;
  /** Source information */
  sources: Array<{
    type: ConfigSourceType;
    path: string;
    lastModified: Date;
  }>;
  /** Environment this config is for */
  environment: string;
  /** Whether config contains sensitive data */
  hasSensitiveData: boolean;
  /** Validation status */
  isValid: boolean;
  /** Validation errors if any */
  validationErrors: string[];
  /** Load timestamp */
  loadedAt: Date;
}

/**
 * Configuration watcher callback function.
 */
export type ConfigWatchCallback = (
  config: LoadedConfig,
  changes: ConfigChange[],
) => void;

/**
 * Configuration change information.
 */
export interface ConfigChange {
  /** Type of change */
  type: "added" | "modified" | "removed";
  /** Configuration key that changed */
  key: string;
  /** Old value (for modifications and removals) */
  oldValue?: ConfigValue;
  /** New value (for additions and modifications) */
  newValue?: ConfigValue;
  /** Source that changed */
  source: string;
}

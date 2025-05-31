/**
 * @fiimport { stringify as yamlStringify } from 'yaml';
import type { KubernetesManifest } from './manifest-types.ts';
import { Logger } from '../../development/logger.ts';verview Utility functions for Kubernetes manifest generation and processing.
 * 
 * This module provides common utility functions used across different manifest
 * generators including validation, formatting, preprocessing, and YAML rendering.
 * 
 * @module ManifestUtils
 * @since 1.0.0
 */

import { stringify as yamlStringify } from 'yaml';
import type { KubernetesManifest } from './manifest-types.ts';
import { Logger } from '../../development/logger.ts';

/**
 * Utility functions for manifest generation and processing.
 * 
 * This class provides static methods for common operations needed when
 * generating Kubernetes manifests, including validation, formatting,
 * and YAML serialization.
 * 
 * @class ManifestUtils
 * @since 1.0.0
 */
export class ManifestUtils {

  /**
   * Validates and normalizes a storage size value.
   * 
   * Ensures that storage size values are properly formatted for Kubernetes
   * and provides a default value if none is specified or if the value is invalid.
   * 
   * @param {string | undefined} size - The storage size to validate (e.g., '10Gi', '500Mi')
   * @returns {string} A valid storage size string
   * 
   * @example
   * ```typescript
   * const size1 = ManifestUtils.validateStorageSize('10Gi'); // Returns '10Gi'
   * const size2 = ManifestUtils.validateStorageSize(''); // Returns '1Gi'
   * const size3 = ManifestUtils.validateStorageSize(undefined); // Returns '1Gi'
   * ```
   * 
   * @since 1.0.0
   */
  static validateStorageSize(size: string | undefined): string {
    if (!size || typeof size !== 'string' || size.trim() === '') {
      Logger.info('No storage size specified, using default: 1Gi');
      return '1Gi';
    }
    
    const trimmedSize = size.trim();
    
    // Validate format: number followed by unit (Ki, Mi, Gi, Ti, Pi, Ei)
    const sizeRegex = /^\d+(\.\d+)?(Ki|Mi|Gi|Ti|Pi|Ei|k|M|G|T|P|E)?$/;
    if (!sizeRegex.test(trimmedSize)) {
      Logger.warn(`Invalid storage size format: ${size}, using default: 1Gi`);
      return '1Gi';
    }
    
    return trimmedSize;
  }

  /**
   * Validates that a namespace name follows Kubernetes naming conventions.
   * 
   * Kubernetes namespace names must:
   * - Be lowercase
   * - Contain only alphanumeric characters and hyphens
   * - Start and end with alphanumeric characters
   * - Be 63 characters or less
   * 
   * @param {string} namespace - The namespace name to validate
   * @returns {boolean} True if the namespace name is valid, false otherwise
   * 
   * @example
   * ```typescript
   * const valid1 = ManifestUtils.validateNamespace('my-app'); // Returns true
   * const valid2 = ManifestUtils.validateNamespace('My-App'); // Returns false (uppercase)
   * const valid3 = ManifestUtils.validateNamespace('-invalid'); // Returns false (starts with hyphen)
   * ```
   * 
   * @since 1.0.0
   */
  static validateNamespace(namespace: string): boolean {
    if (!namespace || typeof namespace !== 'string') {
      return false;
    }
    
    // Kubernetes namespace naming rules
    const namespaceRegex = /^[a-z0-9]([-a-z0-9]*[a-z0-9])?$/;
    return namespaceRegex.test(namespace) && namespace.length <= 63;
  }

  /**
   * Validates that a resource name follows Kubernetes naming conventions.
   * 
   * Kubernetes resource names must:
   * - Be lowercase
   * - Contain only alphanumeric characters, hyphens, and dots
   * - Start and end with alphanumeric characters
   * - Be 253 characters or less
   * 
   * @param {string} name - The resource name to validate
   * @returns {boolean} True if the resource name is valid, false otherwise
   * 
   * @example
   * ```typescript
   * const valid1 = ManifestUtils.validateResourceName('my-service'); // Returns true
   * const valid2 = ManifestUtils.validateResourceName('my.service'); // Returns true
   * const valid3 = ManifestUtils.validateResourceName('My-Service'); // Returns false (uppercase)
   * ```
   * 
   * @since 1.0.0
   */
  static validateResourceName(name: string): boolean {
    if (!name || typeof name !== 'string') {
      return false;
    }
    
    // Kubernetes resource naming rules
    const nameRegex = /^[a-z0-9]([-a-z0-9.]*[a-z0-9])?$/;
    return nameRegex.test(name) && name.length <= 253;
  }

  /**
   * Preprocesses a manifest object to ensure proper YAML serialization.
   * 
   * This method ensures that all values that need to be strings in YAML
   * (such as environment variables and ConfigMap data) are properly converted
   * to string format to avoid YAML parsing issues.
   * 
   * @param {KubernetesManifest} manifest - The manifest object to preprocess
   * @returns {KubernetesManifest} The preprocessed manifest object
   * 
   * @example
   * ```typescript
   * const manifest = {
   *   apiVersion: 'v1',
   *   kind: 'ConfigMap',
   *   metadata: { name: 'my-config' },
   *   data: { PORT: 3000, DEBUG: true }
   * };
   * const processed = ManifestUtils.preprocessManifestForYaml(manifest);
   * // processed.data will have { PORT: '3000', DEBUG: 'true' }
   * ```
   * 
   * @since 1.0.0
   */
  static preprocessManifestForYaml(manifest: KubernetesManifest): KubernetesManifest {
    const processed = { ...manifest };

    // Process ConfigMap data
    if (processed.kind === 'ConfigMap' && processed.data) {
      const stringData: Record<string, string> = {};
      for (const [key, value] of Object.entries(processed.data as Record<string, unknown>)) {
        stringData[key] = String(value);
      }
      processed.data = stringData;
    }

    // Process Secret stringData
    if (processed.kind === 'Secret' && processed.stringData) {
      const stringData: Record<string, string> = {};
      for (const [key, value] of Object.entries(processed.stringData as Record<string, unknown>)) {
        stringData[key] = String(value);
      }
      processed.stringData = stringData;
    }

    // Process environment variables in Deployment containers
    if (processed.kind === 'Deployment' && processed.spec) {
      this.processEnvironmentVariables(processed.spec as Record<string, unknown>);
    }

    return processed;
  }

  /**
   * Processes environment variables in deployment specifications.
   * 
   * Ensures that all environment variable values are properly converted to strings
   * to avoid YAML parsing issues where numbers or booleans might be incorrectly
   * interpreted.
   * 
   * @private
   * @param {Record<string, unknown>} spec - The deployment specification object
   * @since 1.0.0
   */
  private static processEnvironmentVariables(spec: Record<string, unknown>): void {
    const template = spec.template as { spec?: { containers?: unknown[] } };
    if (template?.spec?.containers) {
      for (const container of template.spec.containers) {
        const containerObj = container as { env?: Array<{ name: string; value?: unknown }> };
        if (containerObj.env) {
          for (const envVar of containerObj.env) {
            if (envVar.value !== undefined) {
              envVar.value = String(envVar.value);
            }
          }
        }
      }
    }
  }

  /**
   * Renders a Kubernetes manifest object as YAML string.
   * 
   * Converts a manifest object to YAML format suitable for kubectl application.
   * The output includes proper formatting and string conversion for all values
   * that need to be quoted in YAML.
   * 
   * @param {KubernetesManifest} manifest - The manifest object to render
   * @returns {string} The YAML representation of the manifest
   * 
   * @example
   * ```typescript
   * const manifest = {
   *   apiVersion: 'v1',
   *   kind: 'Service',
   *   metadata: { name: 'my-service' },
   *   spec: { ports: [{ port: 80, targetPort: 8080 }] }
   * };
   * const yaml = ManifestUtils.renderManifest(manifest);
   * // Returns properly formatted YAML string
   * ```
   * 
   * @since 1.0.0
   */
  static renderManifest(manifest: KubernetesManifest): string {
    try {
      // Preprocess the manifest to ensure proper string formatting
      const processedManifest = this.preprocessManifestForYaml(manifest);
      
      // Generate YAML with proper formatting
      return yamlStringify(processedManifest, {
        indent: 2,
        lineWidth: 120
      });
    } catch (error) {
      Logger.error(`Failed to render manifest for ${manifest.kind}/${manifest.metadata.name}: ${error}`);
      throw new Error(`YAML rendering failed: ${error}`);
    }
  }

  /**
   * Merges labels from multiple sources with conflict resolution.
   * 
   * Combines label objects with later sources taking precedence over earlier ones.
   * This is useful when merging default labels with user-provided labels.
   * 
   * @param {...Record<string, string>[]} labelSources - Label objects to merge
   * @returns {Record<string, string>} The merged labels object
   * 
   * @example
   * ```typescript
   * const defaultLabels = { app: 'my-app', version: 'v1.0.0' };
   * const userLabels = { environment: 'production', version: 'v1.1.0' };
   * const merged = ManifestUtils.mergeLabels(defaultLabels, userLabels);
   * // Returns { app: 'my-app', version: 'v1.1.0', environment: 'production' }
   * ```
   * 
   * @since 1.0.0
   */
  static mergeLabels(...labelSources: Record<string, string>[]): Record<string, string> {
    const merged: Record<string, string> = {};
    
    for (const labels of labelSources) {
      if (labels && typeof labels === 'object') {
        Object.assign(merged, labels);
      }
    }
    
    return merged;
  }

  /**
   * Generates a unique name for a resource based on service name and resource type.
   * 
   * Creates consistent naming patterns for generated resources to avoid conflicts
   * and improve resource organization.
   * 
   * @param {string} serviceName - The base service name
   * @param {string} resourceType - The type of resource (e.g., 'secret', 'config', 'pv')
   * @param {string} [suffix] - Optional suffix for uniqueness
   * @returns {string} A unique resource name
   * 
   * @example
   * ```typescript
   * const name1 = ManifestUtils.generateResourceName('my-app', 'secret'); // Returns 'my-app-secret'
   * const name2 = ManifestUtils.generateResourceName('my-app', 'pv', 'data'); // Returns 'my-app-data-pv'
   * ```
   * 
   * @since 1.0.0
   */
  static generateResourceName(serviceName: string, resourceType: string, suffix?: string): string {
    const parts = [serviceName];
    
    if (suffix) {
      parts.push(suffix);
    }
    
    parts.push(resourceType);
    
    return parts.join('-').toLowerCase();
  }

  /**
   * Validates that required fields are present in a manifest object.
   * 
   * Performs basic validation to ensure that a manifest has all required
   * fields before attempting to render it as YAML.
   * 
   * @param {KubernetesManifest} manifest - The manifest to validate
   * @throws {Error} If required fields are missing or invalid
   * 
   * @example
   * ```typescript
   * const manifest = {
   *   apiVersion: 'v1',
   *   kind: 'Service',
   *   metadata: { name: 'my-service' }
   * };
   * ManifestUtils.validateManifest(manifest); // Passes validation
   * ```
   * 
   * @since 1.0.0
   */
  static validateManifest(manifest: KubernetesManifest): void {
    if (!manifest.apiVersion) {
      throw new Error('Manifest missing required field: apiVersion');
    }
    
    if (!manifest.kind) {
      throw new Error('Manifest missing required field: kind');
    }
    
    if (!manifest.metadata?.name) {
      throw new Error('Manifest missing required field: metadata.name');
    }
    
    if (!this.validateResourceName(manifest.metadata.name)) {
      throw new Error(`Invalid resource name: ${manifest.metadata.name}`);
    }
    
    if (manifest.metadata.namespace && !this.validateNamespace(manifest.metadata.namespace)) {
      throw new Error(`Invalid namespace name: ${manifest.metadata.namespace}`);
    }
  }
}

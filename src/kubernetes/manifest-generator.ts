/**
 * @fileoverview Main ManifestGenerator class that orchestrates Kubernetes manifest generation
 * using specialized infrastructure and application manifest generators.
 * 
 * This class serves as the primary interface for generating Kubernetes manifests
 * for both infrastructure services (databases, caches) and application services.
 * It delegates to specialized generators while providing utility methods for
 * manifest processing and deployment.
 * 
 * @since 1.0.0
 * @module ManifestGenerator
 */

import type { ServiceDefinition, InfraServiceConfig } from '../services/service-types.ts';
import { Logger } from '../development/logger.ts';
import { InfrastructureManifests } from './manifests/infrastructure-manifests.ts';
import { ApplicationManifests } from './manifests/application-manifests.ts';
import { ManifestUtils } from './manifests/manifest-utils.ts';
import type { KubernetesManifest } from './manifests/manifest-types.ts';

type ServiceType = "core-services" | "app-services" | "other-services";

/**
 * Main Kubernetes manifest generator that orchestrates specialized generators
 * for infrastructure and application services.
 * 
 * This class provides a unified interface for generating, validating, and applying
 * Kubernetes manifests while delegating to specialized generators for different
 * service types.
 * 
 * @example
 * ```typescript
 * const generator = new ManifestGenerator();
 * 
 * // Generate infrastructure service manifests
 * const infraManifests = generator.generateInfraServiceManifests(mysqlConfig);
 * 
 * // Generate application service manifests
 * const appManifests = generator.generateAppServiceManifests(webServiceConfig, 'default');
 * 
 * // Convert to YAML and apply
 * const yaml = generator.manifestsToYaml([...infraManifests, ...appManifests]);
 * await generator.applyManifests([...infraManifests, ...appManifests]);
 * ```
 * 
 * @since 1.0.0
 */
export class ManifestGenerator {
  private readonly infraGenerator: InfrastructureManifests;
  private readonly appGenerator: ApplicationManifests;

  /**
   * Creates a new ManifestGenerator with specialized generators and utilities.
   * 
   * @since 1.0.0
   */
  constructor() {
    this.infraGenerator = new InfrastructureManifests();
    this.appGenerator = new ApplicationManifests();
  }

  /**
   * Generate Kubernetes manifests for an infrastructure service.
   * 
   * Delegates to the specialized InfrastructureManifests generator to create
   * manifests optimized for infrastructure services with proper storage,
   * secrets, and deployment configurations.
   * 
   * @param {InfraServiceConfig} config - The infrastructure service configuration
   * @returns {KubernetesManifest[]} Array of Kubernetes manifest objects
   * 
   * @example
   * ```typescript
   * const generator = new ManifestGenerator();
   * const mysqlConfig = {
   *   name: 'mysql',
   *   namespace: 'database',
   *   image: 'mysql:8.0',
   *   ports: [{ name: 'mysql', port: 3306 }]
   * };
   * const manifests = generator.generateInfraServiceManifests(mysqlConfig);
   * ```
   * 
   * @since 1.0.0
   */
  generateInfraServiceManifests(config: InfraServiceConfig): KubernetesManifest[] {
    Logger.info(`Generating infrastructure manifests for service: ${config.name}`);
    return this.infraGenerator.generateInfraServiceManifests(config);
  }

  /**
   * Generate Kubernetes manifests for an application service.
   * 
   * Delegates to the specialized ApplicationManifests generator to create
   * manifests optimized for application services with scaling, health checks,
   * and ingress support.
   * 
   * @param {ServiceDefinition} config - The application service configuration
   * @param {string} namespace - The Kubernetes namespace for the service
   * @returns {KubernetesManifest[]} Array of Kubernetes manifest objects
   * 
   * @example
   * ```typescript
   * const generator = new ManifestGenerator();
   * const webConfig = {
   *   name: 'web-app',
   *   type: 'container',
   *   image: 'my-app:latest',
   *   ports: [{ name: 'http', port: 8080 }]
   * };
   * const manifests = generator.generateAppServiceManifests(webConfig, 'default');
   * ```
   * 
   * @since 1.0.0
   */
  generateAppServiceManifests(config: ServiceDefinition, _namespace: string): KubernetesManifest[] {
    Logger.info(`Generating application manifests for service: ${config.name}`);
    // Use 'app-services' as the default service type for application services
    return this.appGenerator.generateServiceManifests(config, 'app-services');
  }

  /**
   * Convert an array of Kubernetes manifests to YAML format.
   * 
   * Processes manifests through the ManifestUtils to ensure proper YAML
   * formatting and joins them with YAML document separators.
   * 
   * @param {KubernetesManifest[]} manifests - Array of Kubernetes manifest objects
   * @returns {string} YAML string with multiple documents separated by '---'
   * 
   * @example
   * ```typescript
   * const manifests = [deploymentManifest, serviceManifest];
   * const yaml = generator.manifestsToYaml(manifests);
   * console.log(yaml); // Multi-document YAML string
   * ```
   * 
   * @since 1.0.0
   */
  manifestsToYaml(manifests: KubernetesManifest[]): string {
    Logger.info(`Converting ${manifests.length} manifests to YAML`);
    return manifests.map(manifest => ManifestUtils.renderManifest(manifest)).join('\n---\n');
  }

  /**
   * Apply Kubernetes manifests to the cluster using kubectl.
   * 
   * Validates each manifest before applying and uses kubectl to deploy
   * the resources to the configured Kubernetes cluster.
   * 
   * @param {KubernetesManifest[]} manifests - Array of Kubernetes manifest objects to apply
   * @returns {Promise<void>} Promise that resolves when all manifests are applied
   * 
   * @example
   * ```typescript
   * const manifests = generator.generateAppServiceManifests(config, 'default');
   * await generator.applyManifests(manifests);
   * ```
   * 
   * @since 1.0.0
   */
  async applyManifests(manifests: KubernetesManifest[]): Promise<void> {
    Logger.info(`Applying ${manifests.length} manifests to cluster`);
    
    // Validate all manifests before applying
    for (const manifest of manifests) {
      try {
        ManifestUtils.validateManifest(manifest);
      } catch (err) {
        Logger.error(`Manifest validation failed: ${err instanceof Error ? err.message : String(err)}`);
        throw err;
      }
    }

    // Convert to YAML and apply using kubectl
    const yaml = this.manifestsToYaml(manifests);
    const process = new Deno.Command('kubectl', {
      args: ['apply', '-f', '-'],
      stdin: 'piped',
      stdout: 'piped',
      stderr: 'piped'
    });

    const proc = process.spawn();
    const writer = proc.stdin.getWriter();
    await writer.write(new TextEncoder().encode(yaml));
    await writer.close();

    const { code, stdout, stderr } = await proc.output();
    
    if (code !== 0) {
      const errorMessage = new TextDecoder().decode(stderr);
      Logger.error(`kubectl apply failed: ${errorMessage}`);
      throw new Error(`kubectl apply failed: ${errorMessage}`);
    }

    const output = new TextDecoder().decode(stdout);
    Logger.info(`kubectl apply successful: ${output}`);
  }

  /**
   * Generate manifests for multiple services of mixed types.
   * 
   * Processes an array of service configurations and generates appropriate
   * manifests based on service type, returning a flattened array of all
   * generated manifests.
   * 
   * @param {Array<ServiceDefinition | InfraServiceConfig>} services - Array of service configurations
   * @param {string} defaultNamespace - Default namespace for services without explicit namespace
   * @returns {KubernetesManifest[]} Flattened array of all generated manifests
   * 
   * @example
   * ```typescript
   * const services = [mysqlConfig, webAppConfig, cacheConfig];
   * const manifests = generator.generateManifestsForServices(services, 'default');
   * ```
   * 
   * @since 1.0.0
   */
  generateManifestsForServices(
    services: Array<ServiceDefinition | InfraServiceConfig>, 
    defaultNamespace: string = 'default'
  ): KubernetesManifest[] {
    const allManifests: KubernetesManifest[] = [];

    for (const service of services) {
      try {
        if ('type' in service) {
          // It's a ServiceDefinition (application service)
          const manifests = this.generateAppServiceManifests(service as ServiceDefinition, defaultNamespace);
          allManifests.push(...manifests);
        } else {
          // It's an InfraServiceConfig (infrastructure service)
          const manifests = this.generateInfraServiceManifests(service as InfraServiceConfig);
          allManifests.push(...manifests);
        }
      } catch (err) {
        Logger.error(`Failed to generate manifests for service ${service.name}: ${err instanceof Error ? err.message : String(err)}`);
        throw err;
      }
    }

    Logger.info(`Generated ${allManifests.length} total manifests for ${services.length} services`);
    return allManifests;
  }

  /**
   * Validate a single Kubernetes manifest.
   * 
   * Uses ManifestUtils to perform comprehensive validation of manifest
   * structure and required fields.
   * 
   * @param {KubernetesManifest} manifest - The manifest to validate
   * @returns {boolean} True if valid, throws error if invalid
   * 
   * @example
   * ```typescript
   * const isValid = generator.validateManifest(deploymentManifest);
   * ```
   * 
   * @since 1.0.0
   */
  validateManifest(manifest: KubernetesManifest): boolean {
    ManifestUtils.validateManifest(manifest);
    return true;
  }

  /**
   * Generate a preview of manifests without applying them.
   * 
   * Useful for reviewing what would be deployed before actually applying
   * the manifests to the cluster.
   * 
   * @param {Array<ServiceDefinition | InfraServiceConfig>} services - Services to preview
   * @param {string} namespace - Namespace for the preview
   * @returns {string} YAML representation of all manifests
   * 
   * @example
   * ```typescript
   * const preview = generator.previewManifests([webApp, database], 'staging');
   * console.log(preview); // Shows what would be deployed
   * ```
   * 
   * @since 1.0.0
   */
  previewManifests(
    services: Array<ServiceDefinition | InfraServiceConfig>, 
    namespace: string = 'default'
  ): string {
    Logger.info(`Generating manifest preview for ${services.length} services`);
    const manifests = this.generateManifestsForServices(services, namespace);
    return this.manifestsToYaml(manifests);
  }
}

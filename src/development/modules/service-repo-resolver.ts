/**
 * @fileoverview Service repository resolver for dynamic repository mapping.
 * 
 * This module provides dynamic resolution of service names to their corresponding
 * GitHub repositories by reading from the q4 service configurations, eliminating
 * the need for static configuration mappings and data duplication.
 * 
 * @example
 * ```typescript
 * import { ServiceRepoResolver } from './service-repo-resolver.ts';
 * 
 * const resolver = new ServiceRepoResolver();
 * const repoUrl = await resolver.getRepositoryUrl('frontend');
 * console.log(repoUrl); // https://github.com/quark-bot-discord/quark-frontend.git
 * ```
 * 
 * @author veryCrunchy
 * @since 1.0.0
 */

import { Logger } from "../logger.ts";
import { getApplicationServices } from "../../services/service-loader.ts";
import { SERVICE_GROUPS } from "../../../q4/const/constants.ts";
import type { ServiceDefinition } from "../../services/service-types.ts";

/**
 * Resolves service names to their corresponding GitHub repository information.
 * 
 * The ServiceRepoResolver provides dynamic repository resolution by:
 * - Reading repository information from q4 service configurations
 * - Supporting both explicit repository URLs and repository names
 * - Integrating with the service loading system
 * - Providing consistent repository path resolution
 * 
 * @example
 * ```typescript
 * const resolver = new ServiceRepoResolver();
 * 
 * // Get repository URL for a service
 * const url = await resolver.getRepositoryUrl('frontend');
 * 
 * // Check if service has a repository
 * const hasRepo = await resolver.hasRepository('api-gateway');
 * 
 * // Get all services with repositories
 * const services = await resolver.getServicesWithRepositories();
 * ```
 */
export class ServiceRepoResolver {
  /** Cache for loaded service configurations */
  private serviceCache: Record<string, ServiceDefinition> | null = null;
  
  /** Cache for resolved repository mappings */
  private readonly repoCache = new Map<string, string>();

  /**
   * Creates a new ServiceRepoResolver instance.
   * 
   * @example
   * ```typescript
   * const resolver = new ServiceRepoResolver();
   * ```
   */
  constructor() {
    // No dependencies needed as we use the service loader directly
  }

  /**
   * Gets the GitHub repository URL for a service.
   * 
   * Resolves the repository URL from the service configuration. Supports:
   * - Full GitHub URLs (returned as-is)
   * - Repository names (converted to full GitHub URLs)
   * - Services without repository configuration (throws error)
   * 
   * @param service - The service name to resolve
   * @returns The complete GitHub repository URL
   * 
   * @example
   * ```typescript
   * const url = await resolver.getRepositoryUrl('frontend');
   * console.log(url); // https://github.com/quark-bot-discord/quark-frontend.git
   * ```
   * 
   * @throws {Error} When the service has no repository configuration
   */
  async getRepositoryUrl(service: string): Promise<string> {
    // Check cache first
    const cacheKey = `${service}:url`;
    if (this.repoCache.has(cacheKey)) {
      return this.repoCache.get(cacheKey)!;
    }

    const serviceConfig = await this.getServiceConfig(service);
    if (!serviceConfig?.repository) {
      throw new Error(`No repository configuration found for service: ${service}`);
    }

    let repoUrl: string;
    
    // If repository is a full URL, use it as-is
    if (serviceConfig.repository.startsWith('http')) {
      repoUrl = serviceConfig.repository;
    } else {
      // If it's just a repository name, construct the full GitHub URL
      repoUrl = `https://github.com/quark-bot-discord/${serviceConfig.repository}.git`;
    }

    // Cache the result
    this.repoCache.set(cacheKey, repoUrl);
    return repoUrl;
  }

  /**
   * Gets the repository name for a service.
   * 
   * @param service - The service name to resolve
   * @returns The repository name (without the GitHub URL)
   * 
   * @example
   * ```typescript
   * const repoName = await resolver.getRepositoryName('frontend');
   * console.log(repoName); // quark-frontend
   * ```
   * 
   * @throws {Error} When the service has no repository configuration
   */
  async getRepositoryName(service: string): Promise<string> {
    const serviceConfig = await this.getServiceConfig(service);
    if (!serviceConfig?.repository) {
      throw new Error(`No repository configuration found for service: ${service}`);
    }

    // If repository is a full URL, extract the repository name
    if (serviceConfig.repository.startsWith('http')) {
      const match = serviceConfig.repository.match(/github\.com\/[^\/]+\/([^\/\.]+)/);
      if (match) {
        return match[1];
      }
      throw new Error(`Unable to extract repository name from URL: ${serviceConfig.repository}`);
    }

    // If it's just a repository name, return it as-is
    return serviceConfig.repository;
  }

  /**
   * Checks if a service has a repository configuration.
   * 
   * @param service - The service name to check
   * @returns True if the service has a repository
   * 
   * @example
   * ```typescript
   * const hasRepo = await resolver.hasRepository('frontend');
   * if (hasRepo) {
   *   console.log('Frontend service has a repository');
   * }
   * ```
   */
  async hasRepository(service: string): Promise<boolean> {
    try {
      // Infrastructure services typically don't have repositories
      if (SERVICE_GROUPS.core.services.includes(service)) {
        return false;
      }

      // Kubernetes resources don't have repositories
      if (this.isKubernetesResource(service)) {
        return false;
      }

      // Check if service has repository configuration
      const serviceConfig = await this.getServiceConfig(service);
      return !!(serviceConfig?.repository);
    } catch (error) {
      Logger.debug(`Failed to check repository for ${service}: ${error instanceof Error ? error.message : String(error)}`);
      return false;
    }
  }

  /**
   * Gets all services that have repository configurations.
   * 
   * @returns An array of service names that have repositories
   * 
   * @example
   * ```typescript
   * const services = await resolver.getServicesWithRepositories();
   * console.log('Services with repos:', services);
   * ```
   */
  async getServicesWithRepositories(): Promise<string[]> {
    const allServices = await this.loadServices();
    const servicesWithRepos: string[] = [];

    for (const [serviceName, serviceConfig] of Object.entries(allServices)) {
      if (serviceConfig.repository && !this.isKubernetesResource(serviceName)) {
        servicesWithRepos.push(serviceName);
      }
    }

    return servicesWithRepos;
  }

  /**
   * Gets the local repository path for a service.
   * 
   * @param service - The service name
   * @returns The local filesystem path where the repository is or will be cloned
   * 
   * @example
   * ```typescript
   * const path = resolver.getRepositoryPath('frontend');
   * console.log('Frontend path:', path); // /workspace/repos/frontend
   * ```
   */
  getRepositoryPath(service: string): string {
    return `/workspace/repos/${service}`;
  }

  /**
   * Filters services to only include those with repositories.
   * 
   * @param services - Array of service names to filter
   * @returns Array of services that have repositories
   * 
   * @example
   * ```typescript
   * const allServices = ['frontend', 'api', 'redis', 'configmap:app-config'];
   * const repoServices = await resolver.filterServicesWithRepositories(allServices);
   * console.log(repoServices); // ['frontend', 'api']
   * ```
   */
  async filterServicesWithRepositories(services: string[]): Promise<string[]> {
    const filtered: string[] = [];
    
    for (const service of services) {
      if (await this.hasRepository(service)) {
        filtered.push(service);
      }
    }
    
    return filtered;
  }

  /**
   * Clears the internal repository cache.
   * 
   * @example
   * ```typescript
   * resolver.clearCache();
   * ```
   */
  clearCache(): void {
    this.repoCache.clear();
    this.serviceCache = null; // Clear service cache too
  }

  /**
   * Loads all service configurations.
   * 
   * @returns A record of service configurations
   * @private
   */
  private async loadServices(): Promise<Record<string, ServiceDefinition>> {
    if (!this.serviceCache) {
      this.serviceCache = await getApplicationServices();
    }
    return this.serviceCache;
  }

  /**
   * Gets service configuration from the loaded services.
   * 
   * @param service - The service name
   * @returns The service configuration or null if not found
   * @private
   */
  private async getServiceConfig(service: string): Promise<ServiceDefinition | null> {
    try {
      const services = await this.loadServices();
      return services[service] || null;
    } catch (error) {
      Logger.debug(`Service configuration not found for ${service}: ${error instanceof Error ? error.message : String(error)}`);
      return null;
    }
  }

  /**
   * Checks if a service name represents a Kubernetes resource.
   * 
   * @param service - The service name to check
   * @returns True if the service is a Kubernetes resource
   * @private
   */
  private isKubernetesResource(service: string): boolean {
    return service.startsWith('configmap:') || 
           service.startsWith('secret:') || 
           service.startsWith('pvc:') ||
           service.startsWith('deployment:') ||
           service.startsWith('service:');
  }
}

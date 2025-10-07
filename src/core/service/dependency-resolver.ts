/**
 * @fileoverview Service dependency resolution for Kubernetes services.
 * 
 * This module provides functionality for analyzing and resolving dependencies
 * between services in a Kubernetes cluster. It can detect dependencies from
 * service configurations, environment variables, and service references.
 * 
 * @since 1.0.0
 * @module ServiceDependencyResolver
 */

import { Logger } from '../../development/logger.ts';
import { getInfrastructureServices } from '../../services/infra-service-loader.ts';
import { getApplicationServices } from '../../services/service-loader.ts';
import type { ServiceDefinition } from '../../services/service-types.ts';

/**
 * Resolves and manages dependencies between services.
 * 
 * This class analyzes service configurations to identify dependencies
 * and builds a dependency graph that can be used for deployment ordering,
 * health checking, and service management.
 * 
 * @example
 * ```typescript
 * const resolver = new ServiceDependencyResolver();
 * 
 * // Get dependencies for a specific service
 * const deps = await resolver.resolveDependencies('web-app');
 * console.log('Dependencies:', deps); // ['mysql', 'redis', 'nats']
 * 
 * // Check if service has dependencies
 * const hasDeps = resolver.hasDependencies('web-app');
 * 
 * // Get all services that depend on a specific service
 * const dependents = resolver.getDependents('mysql');
 * ```
 * 
 * @since 1.0.0
 */
export class ServiceDependencyResolver {
  private dependencyGraph: Map<string, Set<string>> = new Map();
  private reverseDependencyGraph: Map<string, Set<string>> = new Map();

  /**
   * Creates a new ServiceDependencyResolver.
   * 
   * @since 1.0.0
   */
  constructor() {}

  /**
   * Resolves dependencies for a specific service.
   * 
   * Analyzes the service configuration to identify all dependencies
   * including infrastructure services, storage requirements, and
   * other application services.
   * 
   * @param serviceName - Name of the service to analyze
   * @returns Promise resolving to array of dependency service names
   * 
   * @example
   * ```typescript
   * const dependencies = await resolver.resolveDependencies('api-service');
   * // Returns: ['mysql', 'redis', 'nats']
   * ```
   * 
   * @since 1.0.0
   */
  async resolveDependencies(serviceName: string): Promise<string[]> {
    // Check cache first
    if (this.dependencyGraph.has(serviceName)) {
      return Array.from(this.dependencyGraph.get(serviceName)!);
    }

    const dependencies = new Set<string>();

    try {
      // Load infrastructure and application services
      const [infraServices, appServices] = await Promise.all([
        getInfrastructureServices(),
        getApplicationServices()
      ]);

      // Check if it's an infrastructure service
      const infraConfig = infraServices[serviceName];
      if (infraConfig) {
        // Infrastructure services typically don't have dependencies on other services
        // but they might depend on storage volumes
        if (infraConfig.volumes) {
          for (const volume of infraConfig.volumes) {
            dependencies.add(`pvc:${volume.name}`);
          }
        }
        Logger.info(`Resolved ${dependencies.size} storage dependencies for infrastructure service: ${serviceName}`);
      } else {
        // Check if it's an application service
        const appConfig = appServices[serviceName];
        if (appConfig) {
          this.extractDependenciesFromConfig(appConfig, dependencies);
          Logger.info(`Resolved ${dependencies.size} dependencies for application service: ${serviceName}`);
        } else {
          Logger.warn(`No service definition found for ${serviceName}, unable to resolve dependencies`);
        }
      }
    } catch (err) {
      Logger.error(`Failed to resolve dependencies for ${serviceName}: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Cache the results
    this.dependencyGraph.set(serviceName, dependencies);
    this.updateReverseDependencyGraph(serviceName, dependencies);
    
    return Array.from(dependencies);
  }

  /**
   * Extracts dependencies from service configuration.
   * 
   * Analyzes environment variables and configuration to identify
   * service dependencies based on naming patterns and host references.
   * 
   * @private
   * @param config - Service configuration object
   * @param dependencies - Set to add discovered dependencies to
   * @since 1.0.0
   */
  private extractDependenciesFromConfig(config: ServiceDefinition, dependencies: Set<string>): void {
    // Extract dependencies from environment variables
    for (const [key, value] of Object.entries(config.env || {})) {
      const stringValue = String(value);
      
      // Look for service references in environment variables
      if (stringValue.includes('.core-services')) {
        // Extract service name from host references like "redis.core-services"
        const hostMatch = stringValue.match(/([a-z-]+)\\.core-services/);
        if (hostMatch) {
          dependencies.add(hostMatch[1]);
        }
      }
      
      // Look for infrastructure service host references
      this.extractInfrastructureDependencies(key, stringValue, dependencies);
    }
  }

  /**
   * Extracts infrastructure service dependencies from environment variables.
   * 
   * @private
   * @param key - Environment variable key
   * @param value - Environment variable value
   * @param dependencies - Set to add discovered dependencies to
   * @since 1.0.0
   */
  private extractInfrastructureDependencies(key: string, value: string, dependencies: Set<string>): void {
    const serviceHostPatterns = [
      { pattern: /REDIS_HOST.*redis/i, service: 'redis' },
      { pattern: /MYSQL_HOST.*mysql/i, service: 'mysql' },
      { pattern: /DATABASE_HOST.*mysql/i, service: 'mysql' },
      { pattern: /NATS.*HOST.*nats/i, service: 'nats' },
      { pattern: /ELASTIC.*HOST.*elastic/i, service: 'elastic-search' },
      { pattern: /AEROSPIKE.*HOST.*aerospike/i, service: 'aerospike' }
    ];
    
    for (const { pattern, service } of serviceHostPatterns) {
      if (pattern.test(key) || pattern.test(value)) {
        if (value.includes(service) || key.toLowerCase().includes(service.replace('-', ''))) {
          dependencies.add(service);
        }
      }
    }
  }

  /**
   * Updates the reverse dependency graph for efficient lookups.
   * 
   * @private
   * @param serviceName - Name of the service
   * @param dependencies - Set of dependencies for the service
   * @since 1.0.0
   */
  private updateReverseDependencyGraph(serviceName: string, dependencies: Set<string>): void {
    for (const dependency of dependencies) {
      if (!this.reverseDependencyGraph.has(dependency)) {
        this.reverseDependencyGraph.set(dependency, new Set());
      }
      this.reverseDependencyGraph.get(dependency)!.add(serviceName);
    }
  }

  /**
   * Gets all services that depend on the specified service.
   * 
   * @param serviceName - Name of the service to find dependents for
   * @returns Array of service names that depend on the specified service
   * 
   * @example
   * ```typescript
   * const dependents = resolver.getDependents('mysql');
   * // Returns: ['api-service', 'web-app', 'data-processor']
   * ```
   * 
   * @since 1.0.0
   */
  getDependents(serviceName: string): string[] {
    const dependents = this.reverseDependencyGraph.get(serviceName);
    return dependents ? Array.from(dependents) : [];
  }

  /**
   * Checks if a service has any dependencies.
   * 
   * @param serviceName - Name of the service to check
   * @returns True if the service has dependencies, false otherwise
   * 
   * @since 1.0.0
   */
  hasDependencies(serviceName: string): boolean {
    const dependencies = this.dependencyGraph.get(serviceName);
    return dependencies ? dependencies.size > 0 : false;
  }

  /**
   * Gets the complete dependency graph.
   * 
   * @returns Map of service names to their dependencies
   * 
   * @since 1.0.0
   */
  getDependencyGraph(): Map<string, Set<string>> {
    return new Map(this.dependencyGraph);
  }

  /**
   * Clears the dependency cache for a specific service or all services.
   * 
   * @param serviceName - Optional service name to clear cache for. If not provided, clears all cache
   * 
   * @since 1.0.0
   */
  clearCache(serviceName?: string): void {
    if (serviceName) {
      this.dependencyGraph.delete(serviceName);
      // Remove from reverse dependencies
      for (const [dep, dependents] of this.reverseDependencyGraph.entries()) {
        dependents.delete(serviceName);
        if (dependents.size === 0) {
          this.reverseDependencyGraph.delete(dep);
        }
      }
    } else {
      this.dependencyGraph.clear();
      this.reverseDependencyGraph.clear();
    }
  }
}

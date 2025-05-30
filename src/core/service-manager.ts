/**
 * @fileoverview Enhanced Service Manager with modular architecture.
 * 
 * The ServiceManager provides centralized service management capabilities including
 * configuration loading, dependency resolution, health checking, and service type detection.
 * This enhanced version leverages specialized service modules for improved organization
 * and maint  async isServiceHealthy(service: string): Promise<boolean> {
    try {
      const healthStatus = await this.healthChecker.checkServiceHealth(service, 'default');
      return healthStatus.status === 'healthy';
    } catch (err) {
      Logger.error(`Health check failed for ${service}: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }y.
 * 
 * @since 1.0.0
 * @module ServiceManager
 */

import { parseAllDocuments } from "yaml";
import { Logger } from "../development/logger.ts";
import type { KubernetesConfig } from "../types/types.ts";
import { SERVICE_GROUPS } from "../../q4/const/constants.ts";
import { getInfrastructureServices } from "../services/infra-service-loader.ts";
import { getApplicationServices } from "../services/service-loader.ts";
import {
  ServiceDependencyResolver,
  HealthChecker,
  ServiceTypeDetector,
  ConfigLoader
} from "./service/index.ts";

/**
 * Service type classification for Kubernetes deployment organization.
 */
type ServiceType = "core-services" | "app-services" | "other-services";

/**
 * Enhanced ServiceManager with modular service management architecture.
 * 
 * This singleton class provides centralized service management capabilities
 * by orchestrating specialized service modules for dependency resolution,
 * health checking, type detection, and configuration loading.
 * 
 * @example
 * ```typescript
 * const serviceManager = ServiceManager.getInstance();
 * 
 * // Load and validate service configurations
 * const configs = await serviceManager.loadK8sConfig('./k8s/service.yaml');
 * 
 * // Check service health with detailed monitoring
 * const isHealthy = await serviceManager.isServiceHealthy('my-service');
 * 
 * // Get service dependencies for deployment ordering
 * const deps = await serviceManager.getServiceDependencies('my-service');
 * ```
 * 
 * @since 1.0.0
 */
export class ServiceManager {
  private static instance: ServiceManager;
  private manifestCache: Map<string, KubernetesConfig[]> = new Map();
  private static readonly SERVICE_DIRS = ["core-services", "app-services", "other-services"];

  /** Dependency resolver for service relationship management */
  private dependencyResolver: ServiceDependencyResolver;
  
  /** Health checker for service monitoring */
  private healthChecker: HealthChecker;
  
  /** Type detector for automatic service classification */
  private typeDetector: ServiceTypeDetector;
  
  /** Configuration loader for multi-source config management */
  private configLoader: ConfigLoader;

  // Map to track service dependencies
  private dependencyGraph: Map<string, Set<string>> = new Map();
  // Map to track service paths to names
  private servicePathToName: Map<string, string> = new Map();

  /**
   * Private constructor to enforce singleton pattern.
   * Initializes all service management modules.
   */
  private constructor() {
    this.dependencyResolver = new ServiceDependencyResolver();
    this.healthChecker = new HealthChecker();
    this.typeDetector = new ServiceTypeDetector();
    this.configLoader = new ConfigLoader();
  }

  /**
   * Gets the singleton instance of ServiceManager.
   * 
   * @returns The ServiceManager singleton instance
   */
  static getInstance(): ServiceManager {
    if (!ServiceManager.instance) {
      ServiceManager.instance = new ServiceManager();
    }
    return ServiceManager.instance;
  }

  /**
   * Validates if a parsed object is a valid Kubernetes resource.
   * 
   * @param config - The parsed configuration object to validate
   * @returns true if the config has required Kubernetes fields
   * 
   * @since 1.0.0
   */
  private isValidKubernetesResource(config: unknown): config is KubernetesConfig {
    const candidate = config as Record<string, unknown>;
    return candidate !== null &&
           typeof candidate === 'object' &&
           typeof candidate.apiVersion === 'string' &&
           typeof candidate.kind === 'string' &&
           candidate.metadata !== null &&
           typeof candidate.metadata === 'object' &&
           typeof (candidate.metadata as Record<string, unknown>).name === 'string';
  }

  /**
   * Extracts service name from file path.
   * 
   * @param servicePath - The file path to extract service name from
   * @returns The extracted service name or null
   * 
   * @since 1.0.0
   */
  private extractServiceNameFromPath(servicePath: string): string | null {
    const fileName = servicePath.split('/').pop();
    if (!fileName) return null;
    
    // Remove common file extensions
    return fileName.replace(/\.(yaml|yml|json)$/i, '');
  }

  /**
   * Loads and validates Kubernetes configuration from a YAML file.
   * 
   * This method reads YAML files containing Kubernetes manifests, parses them,
   * validates their structure, and caches the results for improved performance.
   * It supports multi-document YAML files and provides detailed error reporting.
   * 
   * @param servicePath - Absolute path to the Kubernetes YAML manifest file
   * @returns Promise resolving to array of validated Kubernetes configurations
   * @throws Error when no valid manifests are found or file cannot be read
   * 
   * @example
   * ```typescript
   * const configs = await serviceManager.loadK8sConfig('/k8s/deployment.yaml');
   * console.log(`Loaded ${configs.length} Kubernetes resources`);
   * ```
   * 
   * @since 1.0.0
   */
  async loadK8sConfig(servicePath: string): Promise<KubernetesConfig[]> {
    // Check cache first for performance optimization
    if (this.manifestCache.has(servicePath)) {
      return this.manifestCache.get(servicePath)!;
    }

    try {
      const content = await Deno.readTextFile(servicePath);
      const docs = parseAllDocuments(content);
      
      // Convert all documents to JSON and validate
      const configs: KubernetesConfig[] = [];
      for (const doc of docs) {
        if (doc && !doc.errors.length) {
          const config = doc.toJSON() as KubernetesConfig;
          
          // Validate basic Kubernetes resource structure
          if (this.isValidKubernetesResource(config)) {
            configs.push(config);
          } else {
            Logger.warn(`Skipping invalid Kubernetes manifest in ${servicePath}: missing required fields`);
          }
        } else if (doc && doc.errors.length > 0) {
          Logger.warn(`YAML parsing errors in ${servicePath}: ${doc.errors.map(e => e.message).join(', ')}`);
        }
      }

      if (configs.length === 0) {
        throw new Error(`No valid Kubernetes manifests found in: ${servicePath}`);
      }

      // Cache all valid configs for future use
      this.manifestCache.set(servicePath, configs);
      
      // Store the service name mapping for dependency tracking
      const serviceName = this.extractServiceNameFromPath(servicePath);
      if (serviceName) {
        this.servicePathToName.set(servicePath, serviceName);
      }
      
      return configs;
    } catch (err) {
      const errorMessage = `Failed to load K8s config from ${servicePath}: ${err instanceof Error ? err.message : String(err)}`;
      Logger.error(errorMessage);
      throw new Error(errorMessage);
    }
  }

  /**
   * Determines the service type classification for a given service.
   * 
   * Uses the ServiceTypeDetector to analyze service characteristics
   * and classify it into the appropriate deployment category.
   * 
   * @param service - The service name to classify
   * @returns The service type classification
   * 
   * @since 1.0.0
   */
  getServiceType(service: string): ServiceType {
    // Check predefined service groups first
    for (const [type, group] of Object.entries(SERVICE_GROUPS)) {
      if (group.services.includes(service)) {
        switch (type) {
          case "core": return "core-services";
          case "apps": 
          case "web": 
          case "tools": return "app-services";
          default: return "other-services";
        }
      }
    }
    
    // If not in predefined groups, use type detector for automatic classification
    // This would require the service path or definition, so default to other-services for now
    return "other-services";
  }

  /**
   * Gets service dependencies using the dependency resolver.
   * 
   * This method leverages the ServiceDependencyResolver to analyze service
   * configurations and determine dependency relationships for proper deployment ordering.
   * 
   * @param serviceName - The name of the service to analyze
   * @returns Promise resolving to array of service dependency names
   * 
   * @example
   * ```typescript
   * const deps = await serviceManager.getServiceDependencies('my-app');
   * console.log(`Dependencies: ${deps.join(', ')}`);
   * ```
   * 
   * @since 1.0.0
   */
  async getServiceDependencies(serviceName: string): Promise<string[]> {
    try {
      return await this.dependencyResolver.resolveDependencies(serviceName);
    } catch (err) {
      Logger.error(`Failed to resolve dependencies for ${serviceName}: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }

  /**
   * Checks if a service is healthy using the health checker.
   * 
   * This method leverages the ServiceHealthChecker to perform comprehensive
   * health assessments including pod status, endpoint availability, and custom health checks.
   * 
   * @param service - The service name to check
   * @returns Promise resolving to true if service is healthy
   * 
   * @example
   * ```typescript
   * const isHealthy = await serviceManager.isServiceHealthy('my-service');
   * if (isHealthy) {
   *   console.log('Service is running and healthy');
   * }
   * ```
   * 
   * @since 1.0.0
   */
  async isServiceHealthy(service: string): Promise<boolean> {
    try {
      const healthStatus = await this.healthChecker.checkServiceHealth(service, 'default');
      return healthStatus.status === 'healthy';
    } catch (err) {
      Logger.error(`Health check failed for ${service}: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  /**
   * Clears the manifest cache for a specific service or all services.
   * 
   * This method is useful for development scenarios where manifest files
   * are being modified and cached results need to be invalidated.
   * 
   * @param servicePath - Optional specific service path to clear, clears all if not provided
   * 
   * @example
   * ```typescript
   * // Clear specific service cache
   * serviceManager.clearManifestCache('/k8s/my-service.yaml');
   * 
   * // Clear all cached manifests
   * serviceManager.clearManifestCache();
   * ```
   * 
   * @since 1.0.0
   */
  clearManifestCache(servicePath?: string): void {
    if (servicePath) {
      this.manifestCache.delete(servicePath);
      const serviceName = this.servicePathToName.get(servicePath);
      if (serviceName) {
        this.dependencyGraph.delete(serviceName);
        this.servicePathToName.delete(servicePath);
      }
      Logger.info(`Cleared manifest cache for: ${servicePath}`);
    } else {
      this.manifestCache.clear();
      this.dependencyGraph.clear();
      this.servicePathToName.clear();
      Logger.info("Cleared all manifest caches");
    }
  }

  /**
   * Gets the type detector instance for external use.
   * 
   * @returns The ServiceTypeDetector instance
   * @since 1.0.0
   */
  getTypeDetector(): ServiceTypeDetector {
    return this.typeDetector;
  }

  /**
   * Gets the config loader instance for external use.
   * 
   * @returns The ConfigLoader instance
   * @since 1.0.0
   */
  getConfigLoader(): ConfigLoader {
    return this.configLoader;
  }

  /**
   * Gets the dependency resolver instance for external use.
   * 
   * @returns The ServiceDependencyResolver instance
   * @since 1.0.0
   */
  getDependencyResolver(): ServiceDependencyResolver {
    return this.dependencyResolver;
  }

  /**
   * Gets the health checker instance for external use.
   * 
   * @returns The HealthChecker instance
   * @since 1.0.0
   */
  getHealthChecker(): HealthChecker {
    return this.healthChecker;
  }
}

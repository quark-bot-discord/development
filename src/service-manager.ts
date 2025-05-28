import { parseAllDocuments } from "yaml";
import { Logger } from "./logger.ts";
import type { KubernetesConfig } from "./types.ts";
type ServiceType = "core-services" | "app-services" | "other-services";
import { SERVICE_GROUPS } from "../q4/const/constants.ts";
import { getInfrastructureServices } from "./infra-service-loader.ts";
import { getApplicationServices } from "./service-loader.ts";

export class ServiceManager {
  private static instance: ServiceManager;
  private manifestCache: Map<string, KubernetesConfig[]> = new Map();
  private static readonly SERVICE_DIRS = ["core-services", "app-services", "other-services"];

  // Map to track service dependencies
  private dependencyGraph: Map<string, Set<string>> = new Map();
  // Map to track service paths to names
  private servicePathToName: Map<string, string> = new Map();

  private constructor() {}

  static getInstance(): ServiceManager {
    if (!ServiceManager.instance) {
      ServiceManager.instance = new ServiceManager();
    }
    return ServiceManager.instance;
  }

  async loadK8sConfig(servicePath: string): Promise<KubernetesConfig[]> {
    // Check cache first
    if (this.manifestCache.has(servicePath)) {
      return this.manifestCache.get(servicePath)!;
    }

    try {
      const content = await Deno.readTextFile(servicePath);
      const docs = parseAllDocuments(content);
      
      // Convert all documents to JSON and validate
      const configs: KubernetesConfig[] = [];
      for (const doc of docs) {
        if (doc) {
          const config = doc.toJSON() as KubernetesConfig;
          // Validate basic structure
          if (config.apiVersion && config.kind && config.metadata?.name) {
            configs.push(config);
          } else {
            Logger.info(`Skipping invalid Kubernetes manifest in ${servicePath}`);
          }
        }
      }

      if (configs.length === 0) {
        throw new Error(`No valid Kubernetes manifests found in: ${servicePath}`);
      }

      // Cache all valid configs
      this.manifestCache.set(servicePath, configs);
      
      // Store the service name mapping if we can determine it
      const serviceName = servicePath.split('/').pop()?.replace('.yaml', '');
      if (serviceName) {
        this.servicePathToName.set(servicePath, serviceName);
      }
      
      return configs;
    } catch (err) {
      Logger.error(`Failed to load K8s config from ${servicePath}: ${err instanceof Error ? err.message : String(err)}`);
      return [];
    }
  }

  getServiceType(service: string): ServiceType {
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
    return "other-services";
  }

  /**
   * Get service dependencies from service definitions
   */
  async getServiceDependenciesFromDefinitions(serviceName: string): Promise<string[]> {
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
      } else {
        // Check if it's an application service
        const appConfig = appServices[serviceName];
        if (appConfig) {
          // Extract dependencies from environment variables
          for (const [key, value] of Object.entries(appConfig.env || {})) {
            const stringValue = String(value);
            
            // Look for service references in environment variables
            if (stringValue.includes('.core-services')) {
              // Extract service name from host references like "redis.core-services"
              const hostMatch = stringValue.match(/([a-z-]+)\.core-services/);
              if (hostMatch) {
                dependencies.add(hostMatch[1]);
              }
            }
            
            // Look for other service host references
            const serviceHostPatterns = [
              /REDIS_HOST.*redis/i,
              /MYSQL_HOST.*mysql/i,
              /DATABASE_HOST.*mysql/i,
              /NATS.*HOST.*nats/i,
              /ELASTIC.*HOST.*elastic/i,
              /AEROSPIKE.*HOST.*aerospike/i
            ];
            
            for (const pattern of serviceHostPatterns) {
              if (pattern.test(key) || pattern.test(stringValue)) {
                if (stringValue.includes('redis')) dependencies.add('redis');
                if (stringValue.includes('mysql')) dependencies.add('mysql');
                if (stringValue.includes('nats')) dependencies.add('nats');
                if (stringValue.includes('elastic')) dependencies.add('elastic-search');
                if (stringValue.includes('aerospike')) dependencies.add('aerospike');
              }
            }
          }
        } else {
          Logger.warn(`No service definition found for ${serviceName}, unable to resolve dependencies`);
        }
      }
    } catch (err) {
      Logger.error(`Failed to get dependencies for ${serviceName}: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Cache the results
    this.dependencyGraph.set(serviceName, dependencies);
    return Array.from(dependencies);
  }

  clearManifestCache(servicePath?: string): void {
    if (servicePath) {
      this.manifestCache.delete(servicePath);
      const serviceName = this.servicePathToName.get(servicePath);
      if (serviceName) {
        this.dependencyGraph.delete(serviceName);
        this.servicePathToName.delete(servicePath);
      }
    } else {
      this.manifestCache.clear();
      this.dependencyGraph.clear();
      this.servicePathToName.clear();
    }
  }

  isServiceHealthy(_service: string): Promise<boolean> {
    // TODO: Implement health check logic using kubectl
    return Promise.resolve(true);
  }
}

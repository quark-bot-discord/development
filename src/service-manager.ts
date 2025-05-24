// filepath: /home/crunchy/dev/quark/development/src/service-manager.ts
import { parseAllDocuments } from "yaml";
import { Logger } from "./logger.ts";
import type { KubernetesConfig } from "./types.ts";
type ServiceType = "core-services" | "app-services" | "other-services";
import { join } from "@std/path";
import { exists } from "@std/fs";
import { SERVICE_GROUPS } from "../q4/constants.ts";

export class ServiceManager {
  private static instance: ServiceManager;
  private manifestCache: Map<string, KubernetesConfig[]> = new Map();
  private static readonly K8S_ROOT = "quark-k8s";
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
          case "apps": return "app-services";
          default: return "other-services";
        }
      }
    }
    return "other-services";
  }

  async findServiceManifest(service: string): Promise<string | null> {
    // First check in the expected directory based on service type
    const primaryDir = this.getServiceType(service);
    const primaryPath = join(ServiceManager.K8S_ROOT, primaryDir, `${service}.yaml`);
    
    try {
      if (await exists(primaryPath)) {
        return primaryPath;
      }
    } catch {
      // Ignore error and continue searching
    }

    // If not found in primary location, check all directories
    for (const dir of ServiceManager.SERVICE_DIRS) {
      if (dir === primaryDir) continue; // Already checked
      
      const manifestPath = join(ServiceManager.K8S_ROOT, dir, `${service}.yaml`);
      try {
        if (await exists(manifestPath)) {
          Logger.info(`Service ${service} found in unexpected directory: ${dir}`);
          return manifestPath;
        }
      } catch {
        continue;
      }
    }
    
    return null;
  }

  async getServiceDependencies(serviceName: string): Promise<string[]> {
    // Check cache first
    if (this.dependencyGraph.has(serviceName)) {
      return Array.from(this.dependencyGraph.get(serviceName)!);
    }

    const dependencies = new Set<string>();
    const processedConfigs = new Set<string>();
    
    // Helper function to process a service's dependencies
    const processService = async (service: string): Promise<void> => {
      if (processedConfigs.has(service)) return;
      processedConfigs.add(service);

      const manifestPath = await this.findServiceManifest(service);
      if (!manifestPath) {
        Logger.error(`No manifest found for service: ${service}`);
        return;
      }

      const configs = await this.loadK8sConfig(manifestPath);
      if (configs.length === 0) return;

      // Process each config in the manifest
      for (const config of configs) {
        // Extract dependencies from container environments
        for (const container of config.spec?.template?.spec?.containers || []) {
          for (const env of container.env || []) {
            const envName = env.name.toUpperCase();
            const envValue = env.value || '';

            // Check for direct service dependencies
            if (envName.includes('REDIS_') || envValue.includes('redis')) dependencies.add('redis');
            if (envName.includes('MYSQL_') || envName.includes('DB_') || envValue.includes('mysql')) dependencies.add('mysql');
            if (envName.includes('NATS_') || envValue.includes('nats')) dependencies.add('nats');
            if (envName.includes('ELASTICSEARCH_') || envName.includes('ES_') || envValue.includes('elastic-search')) dependencies.add('elastic-search');
            if (envName.includes('AEROSPIKE_') || envValue.includes('aerospike')) dependencies.add('aerospike');
            
            // Check for inter-service dependencies
            if (envValue.includes('gateway')) {
              Object.values(SERVICE_GROUPS).forEach(group => {
                group.services
                  .filter(s => s.includes('gateway'))
                  .forEach(s => dependencies.add(s));
              });
            }

            // Check valueFrom references
            if (env.valueFrom) {
              if (env.valueFrom.configMapKeyRef?.name) {
                dependencies.add(`configmap:${env.valueFrom.configMapKeyRef.name}`);
              }
              if (env.valueFrom.secretKeyRef?.name) {
                dependencies.add(`secret:${env.valueFrom.secretKeyRef.name}`);
              }
            }
          }

          // Check for volume dependencies
          for (const volume of config.spec?.template?.spec?.volumes || []) {
            if (volume.configMap?.name) {
              dependencies.add(`configmap:${volume.configMap.name}`);
            }
            if (volume.secret?.secretName) {
              dependencies.add(`secret:${volume.secret.secretName}`);
            }
            if (volume.persistentVolumeClaim?.claimName) {
              dependencies.add(`pvc:${volume.persistentVolumeClaim.claimName}`);
            }
          }
        }
      }
    };

    // Process the main service
    await processService(serviceName);

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

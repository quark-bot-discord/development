/**
 * @fileoverview Service deployment orchestration and management.
 * 
 * This module provides high-level orchestration for deploying services to Kubernetes clusters.
 * It coordinates between service discovery, manifest generation, and cluster operations to
 * provide a complete deployment workflow.
 * 
 * @module ServiceDeployment
 * @since 1.0.0
 */

import { ClusterOperations } from "./cluster-operations.ts";
import { KubernetesOperations } from "./kubernetes-operations.ts";
import { ManifestGenerator } from "../../kubernetes/manifest-generator.ts";
import { ServiceManager } from "../service-manager.ts";
import { Logger } from "../../development/logger.ts";
import { getInfrastructureServices } from "../../services/infra-service-loader.ts";
import { getApplicationServices } from "../../services/service-loader.ts";
import type { InfraServiceConfig, ServiceDefinition } from "../../services/service-types.ts";

/**
 * High-level service deployment orchestrator.
 * 
 * This class provides comprehensive service deployment capabilities by coordinating
 * multiple lower-level operations including service discovery, dependency resolution,
 * manifest generation, and cluster deployment.
 * 
 * @class ServiceDeployment
 * @since 1.0.0
 */
export class ServiceDeployment {
  private clusterOps: ClusterOperations;
  private k8sOps: KubernetesOperations;
  private manifestGenerator: ManifestGenerator;
  private serviceManager: ServiceManager;

  /**
   * Creates a new ServiceDeployment instance.
   * 
   * Initializes all required dependencies for service deployment operations.
   * 
   * @constructor
   * @since 1.0.0
   */
  constructor() {
    this.clusterOps = new ClusterOperations();
    this.k8sOps = new KubernetesOperations();
    this.manifestGenerator = new ManifestGenerator();
    this.serviceManager = ServiceManager.getInstance();
  }

  /**
   * Deploys infrastructure services to the cluster.
   * 
   * This method handles the complete deployment workflow for infrastructure services:
   * 1. Loads service configurations from the q4/ directory
   * 2. Generates Kubernetes manifests for each service
   * 3. Creates required namespaces
   * 4. Applies manifests in dependency order
   * 
   * Infrastructure services typically include databases, message queues, caches,
   * and other foundational services that applications depend on.
   * 
   * @returns {Promise<boolean>} True if all infrastructure services were deployed successfully, false otherwise
   * 
   * @example
   * ```typescript
   * const deployment = new ServiceDeployment();
   * const success = await deployment.deployInfrastructureServices();
   * if (success) {
   *   console.log("Infrastructure is ready for applications");
   * }
   * ```
   * 
   * @since 1.0.0
   */
  async deployInfrastructureServices(): Promise<boolean> {
    try {
      Logger.info("Deploying infrastructure services...");
      
      const infraServices = await getInfrastructureServices();
      const infraServicesList = Object.values(infraServices);
      if (infraServicesList.length === 0) {
        Logger.info("No infrastructure services found");
        return true;
      }

      // Group services by namespace for efficient deployment
      const namespaceGroups = new Map<string, InfraServiceConfig[]>();
      for (const service of infraServicesList) {
        const namespace = service.namespace || 'default';
        if (!namespaceGroups.has(namespace)) {
          namespaceGroups.set(namespace, []);
        }
        namespaceGroups.get(namespace)!.push(service);
      }

      // Deploy services by namespace
      for (const [namespace, services] of namespaceGroups) {
        // Create namespace if needed
        if (namespace !== 'default') {
          const namespaceCreated = this.k8sOps.createNamespace(namespace);
          if (!namespaceCreated) {
            Logger.error(`Failed to create namespace ${namespace}`);
            return false;
          }
        }

        // Deploy each service in the namespace
        for (const service of services) {
          const success = await this.deployInfrastructureService(service);
          if (!success) {
            Logger.error(`Failed to deploy infrastructure service: ${service.name}`);
            return false;
          }
        }
      }

      Logger.info("All infrastructure services deployed successfully");
      return true;
    } catch (err) {
      Logger.error(`Failed to deploy infrastructure services: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  /**
   * Deploys application services to the cluster.
   * 
   * This method handles the deployment of application services, which typically
   * depend on infrastructure services. The deployment process includes:
   * 1. Loading application service definitions
   * 2. Resolving dependencies and deployment order
   * 3. Generating and applying Kubernetes manifests
   * 4. Validating successful deployment
   * 
   * @returns {Promise<boolean>} True if all application services were deployed successfully, false otherwise
   * 
   * @example
   * ```typescript
   * const deployment = new ServiceDeployment();
   * await deployment.deployInfrastructureServices();
   * const success = await deployment.deployApplicationServices();
   * if (success) {
   *   console.log("All services are running");
   * }
   * ```
   * 
   * @since 1.0.0
   */
  async deployApplicationServices(): Promise<boolean> {
    try {
      Logger.info("Deploying application services...");
      
      const appServices = await getApplicationServices();
      const appServicesList = Object.values(appServices);
      if (appServicesList.length === 0) {
        Logger.info("No application services found");
        return true;
      }

      // Deploy services in dependency order
      const deploymentOrder = await this.resolveDeploymentOrder(appServicesList.map((s: ServiceDefinition) => s.name));
      
      for (const serviceName of deploymentOrder) {
        const service = appServicesList.find((s: ServiceDefinition) => s.name === serviceName);
        if (!service) {
          Logger.warn(`Service ${serviceName} not found in application services`);
          continue;
        }

        const success = await this.deployApplicationService(service);
        if (!success) {
          Logger.error(`Failed to deploy application service: ${serviceName}`);
          return false;
        }
      }

      Logger.info("All application services deployed successfully");
      return true;
    } catch (err) {
      Logger.error(`Failed to deploy application services: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  /**
   * Deploys services based on a development profile.
   * 
   * Development profiles define specific sets of services that should be deployed
   * together for different development scenarios (e.g., frontend-only, full-stack, testing).
   * 
   * @param {string[]} services - Array of service names to deploy
   * @returns {Promise<boolean>} True if all services in the profile were deployed successfully, false otherwise
   * 
   * @example
   * ```typescript
   * const deployment = new ServiceDeployment();
   * const frontendServices = ["web-app", "api-gateway", "auth-service"];
   * const success = await deployment.deployByProfile(frontendServices);
   * ```
   * 
   * @since 1.0.0
   */
  async deployByProfile(services: string[]): Promise<boolean> {
    try {
      Logger.info(`Deploying services by profile: ${services.join(", ")}`);
      
      // Resolve deployment order considering dependencies
      const deploymentOrder = await this.resolveDeploymentOrder(services);
      
      // Load all available services
      const [infraServices, appServices] = await Promise.all([
        getInfrastructureServices(),
        getApplicationServices()
      ]);

      const infraServicesList = Object.values(infraServices);
      const appServicesList = Object.values(appServices);

      // Deploy each service in order
      for (const serviceName of deploymentOrder) {
        // Check if it's an infrastructure service
        const infraService = infraServicesList.find((s: InfraServiceConfig) => s.name === serviceName);
        if (infraService) {
          const success = await this.deployInfrastructureService(infraService);
          if (!success) {
            Logger.error(`Failed to deploy infrastructure service: ${serviceName}`);
            return false;
          }
          continue;
        }

        // Check if it's an application service
        const appService = appServicesList.find((s: ServiceDefinition) => s.name === serviceName);
        if (appService) {
          const success = await this.deployApplicationService(appService);
          if (!success) {
            Logger.error(`Failed to deploy application service: ${serviceName}`);
            return false;
          }
          continue;
        }

        Logger.warn(`Service ${serviceName} not found in available services`);
      }

      Logger.info(`Profile deployment completed successfully`);
      return true;
    } catch (err) {
      Logger.error(`Failed to deploy by profile: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  /**
   * Deploys a single infrastructure service.
   * 
   * @private
   * @param {InfraServiceConfig} service - The infrastructure service configuration
   * @returns {Promise<boolean>} True if the service was deployed successfully, false otherwise
   * @since 1.0.0
   */
  private async deployInfrastructureService(service: InfraServiceConfig): Promise<boolean> {
    try {
      Logger.info(`Deploying infrastructure service: ${service.name}`);
      
      // Generate manifests
      const manifests = this.manifestGenerator.generateInfraServiceManifests(service);
      
      // Write manifests to temporary files and apply them
      for (let i = 0; i < manifests.length; i++) {
        const manifest = manifests[i];
        const tempPath = `/tmp/${service.name}-${manifest.kind.toLowerCase()}-${i}.yaml`;
        const yamlContent = this.manifestGenerator.manifestsToYaml([manifest]);
        await Deno.writeTextFile(tempPath, yamlContent);
        
        const applied = this.k8sOps.applyManifest(tempPath, service.namespace);
        if (!applied) {
          Logger.error(`Failed to apply manifest for ${service.name}`);
          return false;
        }
      }
      
      Logger.info(`Successfully deployed infrastructure service: ${service.name}`);
      return true;
    } catch (err) {
      Logger.error(`Error deploying infrastructure service ${service.name}: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  /**
   * Deploys a single application service.
   * 
   * @private
   * @param {ServiceDefinition} service - The application service configuration
   * @returns {Promise<boolean>} True if the service was deployed successfully, false otherwise
   * @since 1.0.0
   */
  private async deployApplicationService(service: ServiceDefinition): Promise<boolean> {
    try {
      Logger.info(`Deploying application service: ${service.name}`);
      
      // Generate manifests
      const manifests = this.manifestGenerator.generateAppServiceManifests(service, service.namespace || 'default');
      
      // Create namespace if specified
      if (service.namespace && service.namespace !== 'default') {
        const namespaceCreated = this.k8sOps.createNamespace(service.namespace);
        if (!namespaceCreated) {
          Logger.error(`Failed to create namespace ${service.namespace}`);
          return false;
        }
      }
      
      // Write manifests to temporary files and apply them
      for (let i = 0; i < manifests.length; i++) {
        const manifest = manifests[i];
        const tempPath = `/tmp/${service.name}-${manifest.kind.toLowerCase()}-${i}.yaml`;
        const yamlContent = this.manifestGenerator.manifestsToYaml([manifest]);
        
        await Deno.writeTextFile(tempPath, yamlContent);
        
        const applied = this.k8sOps.applyManifest(tempPath, service.namespace);
        if (!applied) {
          Logger.error(`Failed to apply manifest for ${service.name}`);
          return false;
        }
      }
      
      Logger.info(`Successfully deployed application service: ${service.name}`);
      return true;
    } catch (err) {
      Logger.error(`Error deploying application service ${service.name}: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  /**
   * Resolves the deployment order for services based on their dependencies.
   * 
   * @private
   * @param {string[]} services - Array of service names to order
   * @returns {Promise<string[]>} Array of service names in deployment order
   * @since 1.0.0
   */
  private async resolveDeploymentOrder(services: string[]): Promise<string[]> {
    try {
      // Use the ServiceManager to resolve dependencies
      const ordered: string[] = [];
      const visited = new Set<string>();
      const visiting = new Set<string>();

      const visit = async (serviceName: string): Promise<void> => {
        if (visiting.has(serviceName)) {
          throw new Error(`Circular dependency detected involving ${serviceName}`);
        }
        if (visited.has(serviceName)) {
          return;
        }

        visiting.add(serviceName);
        
        const dependencies = await this.serviceManager.getServiceDependenciesFromDefinitions(serviceName);
        for (const dep of dependencies) {
          if (services.includes(dep)) {
            await visit(dep);
          }
        }
        
        visiting.delete(serviceName);
        visited.add(serviceName);
        ordered.push(serviceName);
      };

      for (const service of services) {
        await visit(service);
      }

      return ordered;
    } catch (err) {
      Logger.warn(`Failed to resolve deployment order, using original order: ${err instanceof Error ? err.message : String(err)}`);
      return services;
    }
  }
}

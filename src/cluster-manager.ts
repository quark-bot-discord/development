import { execSync } from "node:child_process";
import { Logger } from "./logger.ts";
import type { K3dCluster } from "./types.ts";
import { SERVICE_GROUPS } from "../q4/const/constants.ts";
import { getInfrastructureServices } from "./infra-service-loader.ts";
import { getApplicationServices } from "./service-loader.ts";
import { ManifestGenerator } from "./manifest-generator.ts";
import { ServiceManager } from "./service-manager.ts";

export class ClusterManager {
  private static instance: ClusterManager;
  private currentCluster: K3dCluster | null = null;
  private static readonly SERVICE_DIRS = ["core-services", "app-services", "other-services"];
  private manifestGenerator: ManifestGenerator;
  private serviceManager: ServiceManager;

  private constructor() {
    this.manifestGenerator = new ManifestGenerator();
    this.serviceManager = ServiceManager.getInstance();
  }

  static getInstance(): ClusterManager {
    if (!ClusterManager.instance) {
      ClusterManager.instance = new ClusterManager();
    }
    return ClusterManager.instance;
  }

  async createLocalCluster(name: string): Promise<boolean> {
    try {
      const clusterExists = await this.checkClusterExists(name);
      if (clusterExists) {
        Logger.info(`Cluster ${name} already exists, checking if it's running...`);
        const isRunning = await this.checkClusterRunning(name);
        if (isRunning) {
          Logger.info(`Cluster ${name} is already running`);
          return true;
        }
        Logger.info(`Starting existing cluster ${name}...`);
        execSync(`k3d cluster start ${name}`, { stdio: "inherit" });
      } else {
        Logger.info(`Creating new cluster ${name}...`);
        execSync(
          `k3d cluster create ${name} --wait --timeout 120s`,
          { stdio: "inherit" }
        );
      }

      // Wait for the cluster to be ready
      return await this.waitForCluster(name);
    } catch (err) {
      Logger.error(
        `Failed to create local cluster: ${err instanceof Error ? err.message : String(err)}`
      );
      return false;
    }
  }

  async deleteLocalCluster(name: string): Promise<boolean> {
    try {
      const clusterExists = await this.checkClusterExists(name);
      if (!clusterExists) {
        Logger.info(`Cluster ${name} does not exist`);
        return true;
      }

      Logger.info(`Deleting cluster ${name}...`);
      execSync(`k3d cluster delete ${name}`, { stdio: "inherit" });
      return true;
    } catch (err) {
      Logger.error(
        `Failed to delete local cluster: ${err instanceof Error ? err.message : String(err)}`
      );
      return false;
    }
  }

  createNamespace(namespace: string): boolean {
    try {
      execSync(
        `kubectl create namespace ${namespace} --dry-run=client -o yaml | kubectl apply -f -`,
        { stdio: "inherit" }
      );
      return true;
    } catch (err) {
      Logger.error(
        `Failed to create namespace ${namespace}: ${err instanceof Error ? err.message : String(err)}`
      );
      return false;
    }
  }

  applyManifest(filePath: string, namespace?: string): boolean {
    try {
      let command = `kubectl apply -f "${filePath}"`;
      if (namespace) {
        command += ` -n ${namespace}`;
      }
      execSync(command, { stdio: "inherit" });
      return true;
    } catch (err) {
      Logger.error(
        `Failed to apply manifest ${filePath}: ${err instanceof Error ? err.message : String(err)}`
      );
      return false;
    }
  }

  async applyConfigurations(services: string[]): Promise<void> {
    // First apply namespace configs
    Logger.info("Creating namespaces...");
    for (const ns of ClusterManager.SERVICE_DIRS) {
      if (!this.createNamespace(ns)) {
        throw new Error(`Failed to create namespace ${ns}`);
      }
    }

    // Load infrastructure services and apply core services first
    Logger.info("Loading infrastructure service configurations...");
    const infraServices = await getInfrastructureServices();
    
    Logger.info("Applying core infrastructure services...");
    const coreServices = SERVICE_GROUPS.core.services;

    for (const serviceName of coreServices) {
      const infraConfig = infraServices[serviceName];
      if (infraConfig) {
        try {
          Logger.info(`Generating manifests for infrastructure service: ${serviceName}`);
          const manifests = this.manifestGenerator.generateInfraServiceManifests(infraConfig);
          
          if (await this.manifestGenerator.applyManifests(manifests)) {
            Logger.success(`Applied infrastructure service: ${serviceName}`);
          } else {
            Logger.error(`Failed to apply infrastructure service: ${serviceName}`);
            // Continue with other services instead of failing completely
            continue;
          }
        } catch (err) {
          Logger.error(`Failed to generate/apply manifests for ${serviceName}: ${err instanceof Error ? err.message : String(err)}`);
          continue;
        }
      } else {
        Logger.warn(`No service definition found for infrastructure service: ${serviceName}`);
      }
    }

    // Apply selected application services using service definitions where possible
    Logger.info("Applying application service configurations...");
    const appServices = await getApplicationServices();
    
    for (const service of services) {
      let applied = false;
      
      // First, try to use service definition if available
      const appConfig = appServices[service];
      if (appConfig) {
        try {
          Logger.info(`Generating configuration manifests for application service: ${service}`);
          const serviceType = this.serviceManager.getServiceType(service);
          const manifests = this.manifestGenerator.generateAppServiceManifests(appConfig, serviceType);
          
          if (manifests.length > 0 && await this.manifestGenerator.applyManifests(manifests)) {
            Logger.success(`Applied application service configuration: ${service}`);
            applied = true;
          }
        } catch (err) {
          Logger.error(`Failed to apply service definition for ${service}: ${err instanceof Error ? err.message : String(err)}`);
          // Fall back to existing manifests
        }
      }

      if (!applied) {
        Logger.warn(`No service definition found for application service: ${service}`);
      }
    }
  }

  private checkClusterExists(name: string): boolean {
    try {
      execSync(`k3d cluster list ${name}`, { stdio: "pipe" });
      return true;
    } catch {
      return false;
    }
  }

  private checkClusterRunning(name: string): boolean {
    try {
      const output = execSync(`k3d cluster list -o json`, { encoding: "utf8" });
      const clusters = JSON.parse(output) as K3dCluster[];
      const cluster = clusters.find((c) => c.name === name);
      return cluster?.serversRunning === cluster?.servers?.length;
    } catch {
      return false;
    }
  }

  private async waitForCluster(name: string, timeout = 120): Promise<boolean> {
    Logger.info(`Waiting for cluster ${name} to be ready...`);
    const start = Date.now();
    while (Date.now() - start < timeout * 1000) {
      try {
        execSync("kubectl get nodes", { stdio: "pipe" });
        Logger.info("Cluster is ready!");
        return true;
      } catch {
        await new Promise((resolve) => setTimeout(resolve, 2000));
      }
    }
    Logger.error(`Timeout waiting for cluster ${name} to be ready`);
    return false;
  }

  useRemoteCluster(context: string): boolean {
    try {
      if (!this.validateKubeconfig(context)) {
        throw new Error(`Invalid kubeconfig context: ${context}`);
      }
      Logger.info(`Using remote cluster context: ${context}`);
      execSync(`kubectl config use-context ${context}`, { stdio: "inherit" });
      return true;
    } catch (err) {
      Logger.error(
        `Failed to use remote cluster: ${err instanceof Error ? err.message : String(err)}`
      );
      return false;
    }
  }

  private validateKubeconfig(context: string): boolean {
    try {
      execSync(`kubectl config get-context ${context}`, { stdio: "pipe" });
      return true;
    } catch {
      return false;
    }
  }

  async cleanupCluster(name: string): Promise<boolean> {
    try {
      Logger.info(`Cleaning up cluster ${name}...`);

      // Check if the cluster exists
      if (!(await this.checkClusterExists(name))) {
        Logger.info(`Cluster ${name} does not exist, nothing to clean up`);
        return true;
      }

      // Stop the cluster if it's running
      const isRunning = await this.checkClusterRunning(name);
      if (isRunning) {
        Logger.info(`Stopping cluster ${name}...`);
        execSync(`k3d cluster stop ${name}`, { stdio: "inherit" });
      }

      // Delete the cluster
      Logger.info(`Deleting cluster ${name}...`);
      execSync(`k3d cluster delete ${name}`, { stdio: "inherit" });

      // Clean up kubeconfig
      Logger.info("Cleaning up kubeconfig...");
      try {
        execSync(`kubectl config unset current-context`, { stdio: "pipe" });
        execSync(`kubectl config delete-context k3d-${name}`, { stdio: "pipe" });
        execSync(`kubectl config delete-cluster k3d-${name}`, { stdio: "pipe" });
      } catch {
        // Ignore errors during kubeconfig cleanup
      }

      return true;
    } catch (err) {
      Logger.error(
        `Failed to clean up cluster ${name}: ${err instanceof Error ? err.message : String(err)}`
      );
      return false;
    }
  }
}

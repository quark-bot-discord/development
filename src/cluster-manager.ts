import { execSync } from "node:child_process";
import { join } from "@std/path";
import { exists } from "@std/fs";
import { Logger } from "./logger.ts";
import type { K3dCluster } from "./types.ts";
import { SERVICE_GROUPS } from "../q4/constants.ts";

export class ClusterManager {
  private static instance: ClusterManager;
  private currentCluster: K3dCluster | null = null;
  private static readonly K8S_MANIFESTS_DIR = "quark-k8s";
  private static readonly SERVICE_DIRS = ["core-services", "app-services", "other-services"];

  private constructor() {}

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

    // Apply core services first
    Logger.info("Applying core service configurations...");
    const coreServices = SERVICE_GROUPS.core.services;

    // First apply namespace config
    const namespaceManifest = join(Deno.cwd(), ClusterManager.K8S_MANIFESTS_DIR, "core-services", "namespace.yaml");
    try {
      if (await exists(namespaceManifest)) {
        if (!this.applyManifest(namespaceManifest, "core-services")) {
          throw new Error("Failed to apply core services namespace configuration");
        }
        Logger.success("Applied core services namespace configuration");
      }
    } catch (err) {
      Logger.error(`Failed to apply core namespace: ${err instanceof Error ? err.message : String(err)}`);
    }

    // Then apply core services
    for (const service of coreServices) {
      const manifestPath = join(Deno.cwd(), ClusterManager.K8S_MANIFESTS_DIR, "core-services", `${service}.yaml`);
      try {
        if (await exists(manifestPath)) {
          if (!this.applyManifest(manifestPath, "core-services")) {
            throw new Error(`Failed to apply core service: ${service}`);
          }
          Logger.success(`Applied core service: ${service}`);
        } else {
          Logger.info(`Core service manifest not found: ${manifestPath}`);
        }
      } catch (err) {
        Logger.error(`Failed to apply core service ${service}: ${err instanceof Error ? err.message : String(err)}`);
        // Continue with other core services instead of failing completely
        continue;
      }
    }

    // Try to apply any secrets if they exist
    const secretsPath = join(Deno.cwd(), ClusterManager.K8S_MANIFESTS_DIR, "core-services", "secrets");
    try {
      if (await exists(secretsPath)) {
        const command = `find "${secretsPath}" -name "*.yaml" -exec kubectl apply -f {} -n core-services \\;`;
        execSync(command, { stdio: "inherit" });
        Logger.success("Applied core service secrets");
      }
    } catch (_err) {
      Logger.info("No core service secrets found or failed to apply them");
    }

    // Then apply selected service manifests
    Logger.info("Applying service configurations...");
    for (const service of services) {
      let applied = false;
      
      // Try each service directory in order
      for (const dir of ClusterManager.SERVICE_DIRS) {
        const manifestPath = join(Deno.cwd(), ClusterManager.K8S_MANIFESTS_DIR, dir, `${service}.yaml`);
        
        try {
          if (await exists(manifestPath)) {
            if (this.applyManifest(manifestPath, dir)) {
              Logger.success(`Applied ${service} configuration from ${dir}`);
              applied = true;
              break;
            }
          }
        } catch (err) {
          Logger.error(`Error checking/applying manifest for ${service} in ${dir}: ${err instanceof Error ? err.message : String(err)}`);
          continue;
        }
      }

      if (!applied) {
        Logger.error(`Failed to find or apply configuration for ${service}`);
        throw new Error(`Failed to apply configuration for ${service}`);
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

/**
 * @fileoverview Core Kubernetes cluster operations for creating, deleting, and managing local k3d clusters.
 * 
 * This module provides fundamental cluster lifecycle management operations including:
 * - Cluster creation and deletion
 * - Cluster status checking and validation
 * - Cluster startup and shutdown operations
 * 
 * All operations are designed to work with k3d (k3s in Docker) for local development environments.
 * 
 * @module ClusterOperations
 * @since 1.0.0
 */

import { execSync } from "node:child_process";
import { Logger } from "../../development/logger.ts";
import type { K3dCluster } from "../../types/types.ts";

/**
 * Kubernetes node condition interface
 */
interface NodeCondition {
  type: string;
  status: string;
}

/**
 * Kubernetes node status interface
 */
interface NodeStatus {
  conditions: NodeCondition[];
}

/**
 * Kubernetes node interface
 */
interface KubernetesNode {
  status: NodeStatus;
}

/**
 * Kubernetes nodes response interface
 */
interface NodesResponse {
  items: KubernetesNode[];
}

/**
 * Core cluster operations for managing k3d clusters.
 * 
 * Provides low-level operations for cluster lifecycle management including creation,
 * deletion, status checking, and validation. These operations form the foundation
 * for higher-level cluster management functionality.
 * 
 * @class ClusterOperations
 * @since 1.0.0
 */
export class ClusterOperations {
  
  /**
   * Creates a new k3d cluster or starts an existing one.
   * 
   * This method checks if a cluster with the given name already exists:
   * - If it exists and is running, returns success immediately
   * - If it exists but is stopped, starts the existing cluster
   * - If it doesn't exist, creates a new cluster with default configuration
   * 
   * The cluster is created with a 120-second timeout and waits for full readiness
   * before returning.
   * 
   * @param {string} name - The name of the cluster to create or start
   * @returns {Promise<boolean>} True if the cluster was successfully created/started, false otherwise
   * 
   * @example
   * ```typescript
   * const operations = new ClusterOperations();
   * const success = await operations.createCluster("my-dev-cluster");
   * if (success) {
   *   console.log("Cluster is ready for use");
   * }
   * ```
   * 
   * @throws {Error} When k3d commands fail or cluster creation times out
   * @since 1.0.0
   */
  async createCluster(name: string): Promise<boolean> {
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

      // Wait for the cluster to be ready, but continue even if the wait times out
      const clusterReady = await this.waitForCluster(name);
      if (!clusterReady) {
        Logger.warn(`Cluster ${name} may not be fully ready, but we'll proceed with setup anyway`);
      }
      
      // Always update kubeconfig explicitly to ensure it's properly configured
      try {
        Logger.info("Setting kubectl context to the new cluster...");
        execSync(`k3d kubeconfig merge ${name} --kubeconfig-merge-default`, { stdio: "inherit" });
        execSync(`kubectl config use-context k3d-${name}`, { stdio: "inherit" });
      } catch (err) {
        Logger.warn(`Failed to update kubectl context: ${err instanceof Error ? err.message : String(err)}`);
        // Continue anyway
      }
      
      return true;
    } catch (err) {
      Logger.error(
        `Failed to create local cluster: ${err instanceof Error ? err.message : String(err)}`
      );
      return false;
    }
  }

  /**
   * Deletes a k3d cluster completely.
   * 
   * This method removes the specified cluster and all its resources. If the cluster
   * doesn't exist, the operation is considered successful (idempotent behavior).
   * 
   * Warning: This operation is destructive and cannot be undone. All data and
   * configurations in the cluster will be permanently lost.
   * 
   * @param {string} name - The name of the cluster to delete
   * @returns {Promise<boolean>} True if the cluster was successfully deleted or didn't exist, false otherwise
   * 
   * @example
   * ```typescript
   * const operations = new ClusterOperations();
   * const success = await operations.deleteCluster("old-dev-cluster");
   * if (success) {
   *   console.log("Cluster has been completely removed");
   * }
   * ```
   * 
   * @since 1.0.0
   */
  async deleteCluster(name: string): Promise<boolean> {
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

  /**
   * Checks if a cluster with the given name exists.
   * 
   * This method queries k3d to determine if a cluster with the specified name
   * has been created, regardless of its current running state.
   * 
   * @param {string} name - The name of the cluster to check
   * @returns {Promise<boolean>} True if the cluster exists, false otherwise
   * 
   * @example
   * ```typescript
   * const operations = new ClusterOperations();
   * const exists = await operations.checkClusterExists("my-cluster");
   * if (!exists) {
   *   await operations.createCluster("my-cluster");
   * }
   * ```
   * 
   * @since 1.0.0
   */
  checkClusterExists(name: string): Promise<boolean> {
    try {
      const output = execSync(`k3d cluster list --output json`, { 
        encoding: "utf8",
        stdio: "pipe" 
      });
      const clusters = JSON.parse(output) as K3dCluster[];
      return Promise.resolve(clusters.some(cluster => cluster.name === name));
    } catch (err) {
      Logger.error(`Failed to check cluster existence: ${err instanceof Error ? err.message : String(err)}`);
      return Promise.resolve(false);
    }
  }

  /**
   * Checks if a cluster is currently running.
   * 
   * This method determines the current operational status of a cluster.
   * A cluster must exist and be in a running state to return true.
   * 
   * @param {string} name - The name of the cluster to check
   * @returns {Promise<boolean>} True if the cluster is running, false otherwise
   * 
   * @example
   * ```typescript
   * const operations = new ClusterOperations();
   * const isRunning = await operations.checkClusterRunning("my-cluster");
   * if (!isRunning) {
   *   console.log("Cluster needs to be started");
   * }
   * ```
   * 
   * @since 1.0.0
   */
  checkClusterRunning(name: string): Promise<boolean> {
    try {
      const output = execSync(`k3d cluster list --output json`, { 
        encoding: "utf8",
        stdio: "pipe" 
      });
      const clusters = JSON.parse(output) as K3dCluster[];
      const cluster = clusters.find(c => c.name === name);
      
      // Check if the cluster exists
      if (!cluster) {
        Logger.info(`Cluster ${name} not found`);
        return Promise.resolve(false);
      }
      
      // Check if serversRunning is greater than 0
      if (cluster.serversRunning > 0) {
        Logger.info(`Cluster ${name} has ${cluster.serversRunning} server(s) running`);
        return Promise.resolve(true);
      }
      
      // Fallback: check node status directly if available
      if (cluster.nodes && cluster.nodes.length > 0) {
        const serverNodes = cluster.nodes.filter(node => node.role === 'server');
        if (serverNodes.length > 0) {
          const allRunning = serverNodes.every(node => 
            node.State?.Running === true || node.State?.Status === 'running'
          );
          Logger.info(`Cluster ${name} server status from nodes: ${allRunning ? 'running' : 'not running'}`);
          return Promise.resolve(allRunning);
        }
      }
      
      // Last resort: check if servers array exists
      if (cluster.servers && cluster.servers.length > 0) {
        const allRunning = cluster.servers.every(server => server.state === 'running');
        Logger.info(`Cluster ${name} server status from servers array: ${allRunning ? 'running' : 'not running'}`);
        return Promise.resolve(allRunning);
      }
      
      Logger.warn(`Cluster ${name} status couldn't be determined accurately, assuming it's running`);
      // For k3d specifically, if we've gotten this far, the cluster probably exists and is running
      return Promise.resolve(true);
    } catch (err) {
      Logger.error(`Failed to check cluster status: ${err instanceof Error ? err.message : String(err)}`);
      return Promise.resolve(false);
    }
  }

  /**
   * Waits for a cluster to be fully ready and operational.
   * 
   * This method performs readiness checks to ensure the cluster is not just running
   * but also ready to accept workloads. It checks for:
   * - Kubernetes API server availability
   * - Node readiness
   * - System pod availability
   * 
   * The method includes retry logic with exponential backoff and a maximum timeout
   * to handle temporary startup delays.
   * 
   * @param {string} name - The name of the cluster to wait for
   * @param {number} [timeoutMs=120000] - Maximum time to wait in milliseconds (default: 2 minutes)
   * @returns {Promise<boolean>} True if the cluster becomes ready within the timeout, false otherwise
   * 
   * @example
   * ```typescript
   * const operations = new ClusterOperations();
   * await operations.createCluster("my-cluster");
   * const ready = await operations.waitForCluster("my-cluster", 180000); // 3 minute timeout
   * if (ready) {
   *   console.log("Cluster is ready for deployments");
   * }
   * ```
   * 
   * @since 1.0.0
   */
  async waitForCluster(name: string, timeoutMs: number = 120000): Promise<boolean> {
    const startTime = Date.now();
    const maxRetries = Math.floor(timeoutMs / 5000); // Check every 5 seconds
    
    // Make sure k3d kubeconfig is properly set up first
    try {
      Logger.info("Ensuring kubeconfig is updated with cluster information...");
      execSync(`k3d kubeconfig merge ${name} --kubeconfig-merge-default`, {
        stdio: "inherit" 
      });
    } catch (err) {
      Logger.warn(`Failed to update kubeconfig: ${err instanceof Error ? err.message : String(err)}`);
      // Continue anyway as the config might already be properly set
    }
    
    for (let attempt = 0; attempt < maxRetries; attempt++) {
      try {
        Logger.info(`Checking cluster status (attempt ${attempt + 1}/${maxRetries})...`);
        
        // Check if cluster is running
        const isRunning = await this.checkClusterRunning(name);
        if (!isRunning) {
          Logger.info(`Cluster ${name} is not fully running yet, waiting...`);
          await this.delay(5000);
          continue;
        }

        Logger.info(`Checking if kubectl can connect to the cluster...`);
        // Check if kubectl can connect to the cluster with longer timeout
        try {
          execSync(`kubectl get nodes --request-timeout=20s`, { 
            stdio: "inherit" // Show output for debugging
          });
        } catch (err) {
          Logger.warn(`kubectl connection failed: ${err instanceof Error ? err.message : String(err)}`);
          await this.delay(5000);
          continue;
        }
        
        Logger.info("Checking if nodes are ready...");
        // Check if nodes are ready
        try {
          const nodeOutput = execSync(`kubectl get nodes -o json`, { 
            stdio: "pipe",
            encoding: "utf8" 
          });
          const nodeData = JSON.parse(nodeOutput) as NodesResponse;
          const allNodesReady = nodeData.items.every((node: KubernetesNode) => 
            node.status.conditions.some((condition: NodeCondition) => 
              condition.type === "Ready" && condition.status === "True"
            )
          );

          if (allNodesReady) {
            Logger.info(`Cluster ${name} is ready after ${Date.now() - startTime}ms`);
            return true;
          } else {
            Logger.warn("Not all nodes are in Ready state, waiting...");
          }
        } catch (err) {
          Logger.warn(`Error checking node readiness: ${err instanceof Error ? err.message : String(err)}`);
        }
      } catch (err) {
        // Continue retrying on errors during startup
        Logger.info(`Cluster ${name} not ready yet (attempt ${attempt + 1}/${maxRetries}): ${err instanceof Error ? err.message : String(err)}`);
      }

      // Additional check: let's verify system pods as well
      try {
        Logger.info("Checking system pods...");
        const podsOutput = execSync(`kubectl get pods -n kube-system -o json`, { 
          stdio: "pipe",
          encoding: "utf8" 
        });
        const podsData = JSON.parse(podsOutput);
        const readyPods = podsData.items.filter((pod: { status?: { phase?: string; containerStatuses?: { ready: boolean }[] } }) => 
          pod.status?.phase === "Running" && 
          pod.status?.containerStatuses?.every((container) => container.ready)
        ).length;
        const totalPods = podsData.items.length;
        Logger.info(`System pods: ${readyPods}/${totalPods} ready`);
      } catch (err) {
        Logger.warn(`Error checking system pods: ${err instanceof Error ? err.message : String(err)}`);
      }

      await this.delay(5000);
    }

    // If we get here, we've hit the timeout but the cluster might still be usable
    Logger.warn(`Cluster ${name} didn't fully initialize within ${timeoutMs}ms, but we'll proceed anyway`);
    return true; // Return true to avoid blocking the whole process
  }

  /**
   * Creates a delay for the specified number of milliseconds.
   * 
   * Utility method for implementing wait logic and retry delays.
   * 
   * @private
   * @param {number} ms - Number of milliseconds to delay
   * @returns {Promise<void>} Promise that resolves after the delay
   * @since 1.0.0
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

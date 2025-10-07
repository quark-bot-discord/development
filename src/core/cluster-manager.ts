/**
 * @fileoverview High-level cluster management orchestrator for Kubernetes development environments.
 * 
 * This module provides the main entry point for cluster management operations, coordinating
 * between lower-level operations to provide a unified interface for cluster lifecycle
 * management and service deployment.
 * 
 * @module ClusterManager
 * @since 1.0.0
 */

import { Logger } from "../development/logger.ts";
import type { K3dCluster } from "../types/types.ts";
import { ClusterOperations } from "./cluster/cluster-operations.ts";
import { KubernetesOperations } from "./cluster/kubernetes-operations.ts";
import { ServiceDeployment } from "./cluster/service-deployment.ts";
import { ServiceManager } from "./service-manager.ts";
import { execSync } from "node:child_process";

/**
 * High-level cluster management orchestrator.
 * 
 * This class provides a unified interface for managing Kubernetes clusters and deploying
 * services. It coordinates between cluster operations, Kubernetes operations, and service
 * deployment to provide a complete cluster management solution.
 * 
 * The ClusterManager follows the singleton pattern to ensure consistent state management
 * across the application.
 * 
 * @class ClusterManager
 * @since 1.0.0
 * 
 * @example
 * ```typescript
 * const clusterManager = ClusterManager.getInstance();
 * 
 * // Create and setup a development cluster
 * const success = await clusterManager.createLocalCluster("my-dev-cluster");
 * if (success) {
 *   await clusterManager.deployInfrastructureServices();
 *   await clusterManager.deployApplicationServices();
 * }
 * ```
 */
export class ClusterManager {
  /** Singleton instance */
  private static instance: ClusterManager;
  
  /** Current active cluster information */
  private currentCluster: K3dCluster | null = null;
  
  /** Cluster operations handler */
  private clusterOps: ClusterOperations;
  
  /** Kubernetes operations handler */
  private k8sOps: KubernetesOperations;
  
  /** Service deployment orchestrator */
  private serviceDeployment: ServiceDeployment;

  /**
   * Private constructor for singleton pattern.
   * 
   * Initializes all required operation handlers and deployment orchestrators.
   * 
   * @private
   * @since 1.0.0
   */
  private constructor() {
    this.clusterOps = new ClusterOperations();
    this.k8sOps = new KubernetesOperations();
    this.serviceDeployment = new ServiceDeployment();
  }

  /**
   * Gets the singleton instance of ClusterManager.
   * 
   * @returns {ClusterManager} The singleton ClusterManager instance
   * @since 1.0.0
   */
  static getInstance(): ClusterManager {
    if (!ClusterManager.instance) {
      ClusterManager.instance = new ClusterManager();
    }
    return ClusterManager.instance;
  }

  /**
   * Gets the ServiceManager instance used by this ClusterManager.
   * 
   * @returns {ServiceManager} The ServiceManager singleton instance
   * @since 1.0.0
   */
  get serviceManager(): ServiceManager {
    return ServiceManager.getInstance();
  }

  /**
   * Creates or starts a local k3d cluster.
   * 
   * This is a high-level method that delegates to the cluster operations handler
   * for the actual cluster creation and validation logic.
   * 
   * @param {string} name - The name of the cluster to create
   * @returns {Promise<boolean>} True if the cluster was successfully created/started, false otherwise
   * 
   * @example
   * ```typescript
   * const clusterManager = ClusterManager.getInstance();
   * const success = await clusterManager.createLocalCluster("my-dev-cluster");
   * ```
   * 
   * @since 1.0.0
   */
  async createLocalCluster(name: string): Promise<boolean> {
    const success = await this.clusterOps.createCluster(name);
    if (success) {
      this.currentCluster = { 
        name, 
        serversRunning: 1, 
        token: '',
        servers: [{ name: `${name}-server-0`, role: 'server', state: 'running' }]
      };
    }
    return success;
  }

  /**
   * Deletes a local k3d cluster.
   * 
   * This is a high-level method that delegates to the cluster operations handler
   * for the actual cluster deletion logic.
   * 
   * @param {string} name - The name of the cluster to delete
   * @returns {Promise<boolean>} True if the cluster was successfully deleted, false otherwise
   * 
   * @example
   * ```typescript
   * const clusterManager = ClusterManager.getInstance();
   * const success = await clusterManager.deleteLocalCluster("old-cluster");
   * ```
   * 
   * @since 1.0.0
   */
  async deleteLocalCluster(name: string): Promise<boolean> {
    const success = await this.clusterOps.deleteCluster(name);
    if (success && this.currentCluster?.name === name) {
      this.currentCluster = null;
    }
    return success;
  }

  /**
   * Creates a Kubernetes namespace.
   * 
   * Delegates to the Kubernetes operations handler for namespace creation.
   * 
   * @param {string} namespace - The name of the namespace to create
   * @returns {boolean} True if the namespace was created successfully, false otherwise
   * 
   * @since 1.0.0
   */
  createNamespace(namespace: string): boolean {
    return this.k8sOps.createNamespace(namespace);
  }

  /**
   * Applies a Kubernetes manifest file.
   * 
   * Delegates to the Kubernetes operations handler for manifest application.
   * 
   * @param {string} filePath - Path to the manifest file
   * @param {string} [namespace] - Optional namespace to apply the manifest in
   * @returns {boolean} True if the manifest was applied successfully, false otherwise
   * 
   * @since 1.0.0
   */
  applyManifest(filePath: string, namespace?: string): boolean {
    return this.k8sOps.applyManifest(filePath, namespace);
  }

  /**
   * Deploys infrastructure services to the cluster.
   * 
   * Delegates to the service deployment orchestrator for infrastructure service deployment.
   * 
   * @returns {Promise<boolean>} True if all infrastructure services were deployed successfully, false otherwise
   * 
   * @since 1.0.0
   */
  async deployInfrastructureServices(): Promise<boolean> {
    return await this.serviceDeployment.deployInfrastructureServices();
  }

  /**
   * Deploys application services to the cluster.
   * 
   * Delegates to the service deployment orchestrator for application service deployment.
   * 
   * @returns {Promise<boolean>} True if all application services were deployed successfully, false otherwise
   * 
   * @since 1.0.0
   */
  async deployApplicationServices(): Promise<boolean> {
    return await this.serviceDeployment.deployApplicationServices();
  }

  /**
   * Deploys services based on a development profile.
   * 
   * Delegates to the service deployment orchestrator for profile-based deployment.
   * 
   * @param {string[]} services - Array of service names to deploy
   * @returns {Promise<boolean>} True if all services were deployed successfully, false otherwise
   * 
   * @since 1.0.0
   */
  async deployByProfile(services: string[]): Promise<boolean> {
    return await this.serviceDeployment.deployByProfile(services);
  }

  /**
   * Applies service configurations to the cluster.
   * 
   * This method deploys the specified services to the current cluster by delegating
   * to the appropriate deployment methods based on service types.
   * 
   * @param {string[]} services - Array of service names to configure and deploy
   * @returns {Promise<boolean>} True if all configurations were applied successfully, false otherwise
   * 
   * @example
   * ```typescript
   * const clusterManager = ClusterManager.getInstance();
   * const success = await clusterManager.applyConfigurations(['redis', 'mysql', 'bot']);
   * ```
   * 
   * @since 1.0.0
   */
  async applyConfigurations(services: string[]): Promise<boolean> {
    try {
      Logger.info(`Applying configurations for ${services.length} services...`);
      
      // Deploy infrastructure services first
      const infraSuccess = await this.deployInfrastructureServices();
      if (!infraSuccess) {
        Logger.error("Failed to deploy infrastructure services");
        return false;
      }

      // Then deploy the specified services
      const deploySuccess = await this.deployByProfile(services);
      if (!deploySuccess) {
        Logger.error("Failed to deploy application services");
        return false;
      }

      Logger.success("All service configurations applied successfully");
      return true;
    } catch (err) {
      Logger.error(
        `Failed to apply configurations: ${err instanceof Error ? err.message : String(err)}`
      );
      return false;
    }
  }

  /**
   * Configures kubectl to use a remote cluster context.
   * 
   * This method validates the provided context and switches kubectl to use it
   * for subsequent operations.
   * 
   * @param {string} context - The kubectl context name for the remote cluster
   * @returns {boolean} True if the context was successfully switched, false otherwise
   * 
   * @example
   * ```typescript
   * const clusterManager = ClusterManager.getInstance();
   * const success = clusterManager.useRemoteCluster("production-cluster");
   * ```
   * 
   * @since 1.0.0
   */
  useRemoteCluster(context: string): boolean {
    try {
      if (!this.validateKubeconfig(context)) {
        throw new Error(`Invalid kubeconfig context: ${context}`);
      }
      Logger.info(`Using remote cluster context: ${context}`);
      execSync(`kubectl config use-context ${context}`, { stdio: "inherit" });
      this.currentCluster = null; // Clear local cluster reference
      return true;
    } catch (err) {
      Logger.error(
        `Failed to use remote cluster: ${err instanceof Error ? err.message : String(err)}`
      );
      return false;
    }
  }

  /**
   * Validates that a kubectl context exists and is accessible.
   * 
   * @private
   * @param {string} context - The context name to validate
   * @returns {boolean} True if the context is valid, false otherwise
   * @since 1.0.0
   */
  private validateKubeconfig(context: string): boolean {
    try {
      execSync(`kubectl config get-context ${context}`, { stdio: "pipe" });
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Performs a complete cleanup of a k3d cluster.
   * 
   * This method stops and deletes the cluster, and cleans up related kubectl
   * configuration entries. It's more thorough than just deleting the cluster.
   * 
   * @param {string} name - The name of the cluster to clean up
   * @returns {Promise<boolean>} True if cleanup was successful, false otherwise
   * 
   * @example
   * ```typescript
   * const clusterManager = ClusterManager.getInstance();
   * const success = await clusterManager.cleanupCluster("old-dev-cluster");
   * ```
   * 
   * @since 1.0.0
   */
  async cleanupCluster(name: string): Promise<boolean> {
    try {
      Logger.info(`Cleaning up cluster ${name}...`);

      // Check if the cluster exists
      const clusterExists = await this.clusterOps.checkClusterExists(name);
      if (!clusterExists) {
        Logger.info(`Cluster ${name} does not exist, nothing to clean up`);
        return true;
      }

      // Stop the cluster if it's running
      const isRunning = await this.clusterOps.checkClusterRunning(name);
      if (isRunning) {
        Logger.info(`Stopping cluster ${name}...`);
        execSync(`k3d cluster stop ${name}`, { stdio: "inherit" });
      }

      // Delete the cluster
      const deleted = await this.clusterOps.deleteCluster(name);
      if (!deleted) {
        return false;
      }

      // Clean up kubeconfig
      Logger.info("Cleaning up kubeconfig...");
      try {
        execSync(`kubectl config unset current-context`, { stdio: "pipe" });
        execSync(`kubectl config delete-context k3d-${name}`, { stdio: "pipe" });
        execSync(`kubectl config delete-cluster k3d-${name}`, { stdio: "pipe" });
      } catch {
        // Ignore errors during kubeconfig cleanup
      }

      // Clear current cluster reference if this was the active cluster
      if (this.currentCluster?.name === name) {
        this.currentCluster = null;
      }

      return true;
    } catch (err) {
      Logger.error(
        `Failed to clean up cluster ${name}: ${err instanceof Error ? err.message : String(err)}`
      );
      return false;
    }
  }

  /**
   * Gets information about the currently active cluster.
   * 
   * @returns {K3dCluster | null} Current cluster information or null if no cluster is active
   * @since 1.0.0
   */
  getCurrentCluster(): K3dCluster | null {
    return this.currentCluster;
  }
}

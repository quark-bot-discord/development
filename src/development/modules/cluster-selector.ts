/**
 * @fileoverview Handles cluster selection and setup operations for development environments.
 * 
 * This module provides functionality for selecting between local (k3d) and remote Kubernetes clusters,
 * setting up the selected cluster type, and applying service configurations. It abstracts the
 * complexity of cluster management and provides a unified interface for development workflow.
 * 
 * @example
 * ```typescript
 * import { ClusterSelector } from './cluster-selector.ts';
 * 
 * const clusterSelector = new ClusterSelector();
 * const services = ['frontend', 'api', 'database'];
 * await clusterSelector.setupCluster(services);
 * ```
 * 
 * @author veryCrunchy
 * @since 1.0.0
 */

import inquirer from "inquirer";
import { Logger } from "../logger.ts";
import { ClusterManager } from "../../core/cluster-manager.ts";
import type { ClusterConfig } from "../../types/types.ts";

/**
 * Manages cluster selection and setup for development environments.
 * 
 * The ClusterSelector handles the interactive selection between local k3d clusters
 * and remote Kubernetes clusters, provides setup functionality, and manages
 * cluster configuration application.
 * 
 * @example
 * ```typescript
 * const selector = new ClusterSelector();
 * 
 * // Interactive cluster setup with service deployment
 * const services = ['api', 'frontend', 'database'];
 * await selector.setupCluster(services);
 * 
 * // Manual cluster selection
 * const config = await selector.selectClusterType();
 * console.log(`Selected cluster: ${config.type}`);
 * ```
 */
export class ClusterSelector {
  /** The cluster manager instance for performing cluster operations */
  private readonly clusterManager: ClusterManager;

  /**
   * Creates a new ClusterSelector instance.
   * 
   * @example
   * ```typescript
   * const selector = new ClusterSelector();
   * ```
   */
  constructor() {
    this.clusterManager = ClusterManager.getInstance();
  }

  /**
   * Interactively selects the cluster type and configuration.
   * 
   * Presents the user with options to choose between a local k3d cluster
   * or a remote Kubernetes cluster. For remote clusters, prompts for the
   * cluster context name.
   * 
   * @returns A promise that resolves to the selected cluster configuration
   * 
   * @example
   * ```typescript
   * const config = await selector.selectClusterType();
   * 
   * if (config.type === 'local') {
   *   console.log(`Using local cluster: ${config.name}`);
   * } else {
   *   console.log(`Using remote cluster with context: ${config.context}`);
   * }
   * ```
   * 
   * @throws {Error} When user input validation fails
   */
  async selectClusterType(): Promise<ClusterConfig> {
    const { clusterType } = await inquirer.prompt([
      {
        type: "list",
        name: "clusterType",
        message: "Select cluster type:",
        choices: [
          { name: "Local (k3d)", value: "local" },
          { name: "Remote", value: "remote" },
        ],
      },
    ]);

    if (clusterType === "local") {
      return {
        type: "local",
        name: "quark-dev",
      };
    }

    const { context } = await inquirer.prompt([
      {
        type: "input",
        name: "context",
        message: "Enter remote cluster context:",
        validate: (input) => input.length > 0,
      },
    ]);

    return {
      type: "remote",
      name: "remote-cluster",
      context,
    };
  }

  /**
   * Sets up the selected cluster and applies service configurations.
   * 
   * This method handles the complete cluster setup workflow:
   * 1. Interactive cluster type selection
   * 2. Creation or configuration of the selected cluster
   * 3. Application of service configurations to the cluster
   * 
   * @param services - Array of service names to deploy to the cluster
   * 
   * @returns A promise that resolves when cluster setup is complete
   * 
   * @example
   * ```typescript
   * const services = [
   *   'frontend',
   *   'api-gateway',
   *   'user-service',
   *   'auth-service'
   * ];
   * 
   * try {
   *   await selector.setupCluster(services);
   *   console.log('Cluster setup completed successfully');
   * } catch (error) {
   *   console.error('Cluster setup failed:', error.message);
   * }
   * ```
   * 
   * @throws {Error} When cluster creation or configuration fails
   * @throws {Error} When service configuration application fails
   */
  async setupCluster(services: string[]): Promise<void> {
    Logger.step(1, 3, "Setting up kubernetes cluster...");

    const clusterConfig = await this.selectClusterType();

    if (clusterConfig.type === "local") {
      if (!await this.clusterManager.createLocalCluster(clusterConfig.name)) {
        throw new Error("Failed to create local cluster");
      }
    } else {
      if (!await this.clusterManager.useRemoteCluster(clusterConfig.context!)) {
        throw new Error("Failed to configure remote cluster");
      }
    }

    Logger.step(2, 3, "Applying service configurations...");
    try {
      await this.clusterManager.applyConfigurations(services);
      Logger.success("Service configurations applied successfully");
    } catch (error) {
      Logger.error(
        `Failed to apply service configurations: ${error instanceof Error ? error.message : String(error)}`,
      );
      throw error;
    }

    Logger.step(3, 3, "Cluster setup complete");
  }

  /**
   * Gets the current cluster manager instance.
   * 
   * Provides access to the underlying cluster manager for advanced operations
   * not covered by this selector's methods.
   * 
   * @returns The cluster manager instance
   * 
   * @example
   * ```typescript
   * const manager = selector.getClusterManager();
   * const clusters = await manager.listClusters();
   * ```
   */
  getClusterManager(): ClusterManager {
    return this.clusterManager;
  }
}

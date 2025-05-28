/**
 * @fileoverview Kubernetes namespace and manifest management operations.
 * 
 * This module provides operations for managing Kubernetes resources including:
 * - Namespace creation and management
 * - Manifest application and validation
 * - Resource deployment operations
 * 
 * All operations use kubectl CLI and are designed to work with any Kubernetes cluster
 * that kubectl can access.
 * 
 * @module KubernetesOperations
 * @since 1.0.0
 */

import { execSync } from "node:child_process";
import { Logger } from "../../development/logger.ts";

/**
 * Kubernetes resource management operations.
 * 
 * Provides operations for managing Kubernetes namespaces and applying manifests.
 * These operations handle the low-level kubectl interactions needed for deploying
 * and managing resources in a Kubernetes cluster.
 * 
 * @class KubernetesOperations
 * @since 1.0.0
 */
export class KubernetesOperations {

  /**
   * Creates a Kubernetes namespace if it doesn't already exist.
   * 
   * This method uses kubectl's dry-run feature to generate a namespace manifest
   * and then applies it, ensuring idempotent behavior. If the namespace already
   * exists, the operation succeeds without making changes.
   * 
   * @param {string} namespace - The name of the namespace to create
   * @returns {boolean} True if the namespace was created successfully or already exists, false otherwise
   * 
   * @example
   * ```typescript
   * const k8sOps = new KubernetesOperations();
   * const success = k8sOps.createNamespace("my-app");
   * if (success) {
   *   console.log("Namespace is ready for deployments");
   * }
   * ```
   * 
   * @throws {Error} When kubectl commands fail or namespace creation is not permitted
   * @since 1.0.0
   */
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

  /**
   * Applies a Kubernetes manifest file to the cluster.
   * 
   * This method uses kubectl apply to deploy resources defined in a YAML manifest file.
   * The operation supports both namespaced and cluster-scoped resources.
   * 
   * @param {string} filePath - Absolute path to the manifest file to apply
   * @param {string} [namespace] - Optional namespace to apply the manifest in
   * @returns {boolean} True if the manifest was applied successfully, false otherwise
   * 
   * @example
   * ```typescript
   * const k8sOps = new KubernetesOperations();
   * 
   * // Apply to default namespace
   * const success1 = k8sOps.applyManifest("/path/to/deployment.yaml");
   * 
   * // Apply to specific namespace
   * const success2 = k8sOps.applyManifest("/path/to/service.yaml", "my-app");
   * ```
   * 
   * @throws {Error} When kubectl apply fails or the manifest file is invalid
   * @since 1.0.0
   */
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

  /**
   * Deletes resources defined in a Kubernetes manifest file.
   * 
   * This method uses kubectl delete to remove resources that were previously
   * applied from a manifest file. It's the inverse operation of applyManifest.
   * 
   * @param {string} filePath - Absolute path to the manifest file containing resources to delete
   * @param {string} [namespace] - Optional namespace to delete resources from
   * @returns {boolean} True if the resources were deleted successfully, false otherwise
   * 
   * @example
   * ```typescript
   * const k8sOps = new KubernetesOperations();
   * const success = k8sOps.deleteManifest("/path/to/deployment.yaml", "my-app");
   * if (success) {
   *   console.log("Resources have been removed");
   * }
   * ```
   * 
   * @since 1.0.0
   */
  deleteManifest(filePath: string, namespace?: string): boolean {
    try {
      let command = `kubectl delete -f "${filePath}"`;
      if (namespace) {
        command += ` -n ${namespace}`;
      }
      execSync(command, { stdio: "inherit" });
      return true;
    } catch (err) {
      Logger.error(
        `Failed to delete manifest ${filePath}: ${err instanceof Error ? err.message : String(err)}`
      );
      return false;
    }
  }

  /**
   * Checks if a namespace exists in the cluster.
   * 
   * This method queries the Kubernetes API to determine if a namespace
   * with the given name exists.
   * 
   * @param {string} namespace - The name of the namespace to check
   * @returns {boolean} True if the namespace exists, false otherwise
   * 
   * @example
   * ```typescript
   * const k8sOps = new KubernetesOperations();
   * const exists = k8sOps.namespaceExists("my-app");
   * if (!exists) {
   *   k8sOps.createNamespace("my-app");
   * }
   * ```
   * 
   * @since 1.0.0
   */
  namespaceExists(namespace: string): boolean {
    try {
      execSync(`kubectl get namespace ${namespace}`, { 
        stdio: "pipe",
        encoding: "utf8" 
      });
      return true;
    } catch (_err) {
      return false;
    }
  }

  /**
   * Gets the status of resources in a namespace.
   * 
   * This method retrieves the current status of all resources in a namespace,
   * which is useful for monitoring deployment progress and health.
   * 
   * @param {string} namespace - The namespace to check
   * @returns {string} JSON output of kubectl get all command
   * 
   * @example
   * ```typescript
   * const k8sOps = new KubernetesOperations();
   * const status = k8sOps.getNamespaceStatus("my-app");
   * console.log("Current resources:", status);
   * ```
   * 
   * @throws {Error} When kubectl command fails or namespace doesn't exist
   * @since 1.0.0
   */
  getNamespaceStatus(namespace: string): string {
    try {
      return execSync(`kubectl get all -n ${namespace} -o json`, { 
        encoding: "utf8",
        stdio: "pipe" 
      });
    } catch (err) {
      Logger.error(
        `Failed to get namespace status for ${namespace}: ${err instanceof Error ? err.message : String(err)}`
      );
      throw err;
    }
  }
}

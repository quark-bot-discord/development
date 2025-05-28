/**
 * @fileoverview Kubernetes cluster operations type definitions.
 * 
 * This module provides type definitions for cluster management,
 * node operations, and cluster status monitoring.
 * 
 * @module ClusterTypes
 * @since 1.0.0
 */

/**
 * Kubernetes node condition interface.
 */
export interface NodeCondition {
  type: string;
  status: string;
}

/**
 * Kubernetes node status interface.
 */
export interface NodeStatus {
  conditions: NodeCondition[];
}

/**
 * Kubernetes node interface.
 */
export interface KubernetesNode {
  status: NodeStatus;
}

/**
 * Kubernetes nodes response interface.
 */
export interface NodesResponse {
  items: KubernetesNode[];
}

/**
 * Cluster configuration for development environments.
 */
export interface ClusterConfig {
  /** Type of cluster (local or remote) */
  type: 'local' | 'remote';
  /** Cluster name (for local clusters) */
  name: string;
  /** Kubernetes context (for remote clusters) */
  context?: string;
  /** Additional cluster metadata */
  metadata?: Record<string, unknown>;
}

/**
 * K3d cluster information structure.
 */
export interface K3dCluster {
  name: string;
  serversRunning: number;
  serversCount?: number;
  agentsRunning?: number;
  agentsCount?: number;
  token: string;
  nodes?: Array<{
    name: string;
    role: string;
    State?: {
      Running?: boolean;
      Status?: string;
      Started?: string;
    };
  }>;
  servers?: Array<{
    name: string;
    role: string;
    state: string;
  }>;
}

/**
 * Cluster operation result.
 */
export interface ClusterOperationResult {
  /** Whether the operation was successful */
  success: boolean;
  /** Result message */
  message: string;
  /** Additional operation data */
  data?: unknown;
  /** Error information if operation failed */
  error?: Error;
}

/**
 * @fileoverview Health monitoring and status checking type definitions.
 * 
 * This module provides type definitions for service health monitoring,
 * pod status tracking, and endpoint availability checking.
 * 
 * @module HealthTypes
 * @since 1.0.0
 */

/**
 * Kubernetes pod condition type.
 */
export interface K8sPodCondition {
  type: string;
  status: string;
  reason?: string;
  message?: string;
}

/**
 * Kubernetes container state.
 */
export interface K8sContainerState {
  running?: {
    startedAt: string;
  };
  waiting?: {
    reason: string;
    message?: string;
  };
  terminated?: {
    reason: string;
    exitCode: number;
    finishedAt: string;
  };
}

/**
 * Kubernetes container status from pod status.
 */
export interface K8sContainerStatus {
  name: string;
  ready: boolean;
  restartCount: number;
  state: K8sContainerState;
}

/**
 * Kubernetes pod object structure (partial).
 */
export interface K8sPod {
  metadata?: {
    name?: string;
    creationTimestamp?: string;
  };
  status?: {
    phase?: string;
    conditions?: K8sPodCondition[];
    containerStatuses?: K8sContainerStatus[];
  };
}

/**
 * Kubernetes pods list response.
 */
export interface K8sPodsResponse {
  items: K8sPod[];
}

/**
 * Kubernetes endpoint subset.
 */
export interface K8sEndpointSubset {
  addresses?: Array<{ ip: string }>;
  notReadyAddresses?: Array<{ ip: string }>;
  ports?: Array<{ port: number; name?: string; protocol?: string }>;
}

/**
 * Kubernetes endpoints response.
 */
export interface K8sEndpointsResponse {
  subsets?: K8sEndpointSubset[];
}

/**
 * Configuration for health check operations.
 */
export interface HealthCheckConfig {
  /** Maximum time to wait for service to become healthy (in milliseconds) */
  timeout: number;
  /** Interval between health checks (in milliseconds) */
  interval: number;
  /** Number of consecutive successful checks required */
  requiredSuccesses: number;
  /** Number of consecutive failures before marking as unhealthy */
  allowedFailures: number;
}

/**
 * Health status information for a service.
 */
export interface ServiceHealthStatus {
  /** Service name */
  serviceName: string;
  /** Kubernetes namespace */
  namespace: string;
  /** Overall health status */
  status: 'healthy' | 'unhealthy' | 'pending' | 'unknown';
  /** Pod-level status information */
  pods: PodHealthStatus[];
  /** Service endpoint availability */
  endpoints: EndpointStatus[];
  /** Last check timestamp */
  lastChecked: Date;
  /** Additional status messages */
  messages: string[];
}

/**
 * Health status for individual pods.
 */
export interface PodHealthStatus {
  /** Pod name */
  name: string;
  /** Pod phase (Running, Pending, Failed, etc.) */
  phase: string;
  /** Pod readiness status */
  ready: boolean;
  /** Container statuses */
  containers: ContainerStatus[];
  /** Restart count */
  restarts: number;
  /** Age of the pod */
  age: string;
}

/**
 * Status information for individual containers.
 */
export interface ContainerStatus {
  /** Container name */
  name: string;
  /** Running status */
  ready: boolean;
  /** Restart count */
  restartCount: number;
  /** Current state */
  state: 'running' | 'waiting' | 'terminated';
  /** State reason */
  reason?: string;
}

/**
 * Service endpoint availability status.
 */
export interface EndpointStatus {
  /** Endpoint address */
  address: string;
  /** Port number */
  port: number;
  /** Availability status */
  available: boolean;
  /** Response time in milliseconds */
  responseTime?: number;
}

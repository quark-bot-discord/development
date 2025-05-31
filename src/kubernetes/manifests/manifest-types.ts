/**
 * @fileoverview Kubernetes manifest type definitions and interfaces.
 * 
 * This module provides TypeScript interfaces and type definitions for
 * Kubernetes manifests. It ensures type safety when generating and
 * manipulating Kubernetes resources.
 * 
 * @module ManifestTypes
 * @since 1.0.0
 */

/**
 * Base interface for all Kubernetes manifest objects.
 * 
 * This interface defines the common structure shared by all Kubernetes
 * resources including required fields like apiVersion, kind, and metadata,
 * as well as optional fields that may be present in various resource types.
 * 
 * @interface KubernetesManifest
 * @since 1.0.0
 */
export interface KubernetesManifest {
  /** The API version of the Kubernetes resource */
  apiVersion: string;
  
  /** The kind of Kubernetes resource (e.g., 'Deployment', 'Service', 'Secret') */
  kind: string;
  
  /** Metadata common to all Kubernetes resources */
  metadata: {
    /** The name of the resource */
    name: string;
    
    /** The namespace where the resource will be created (optional for cluster-scoped resources) */
    namespace?: string;
    
    /** Labels to apply to the resource for identification and selection */
    labels?: Record<string, string>;
    
    /** Annotations to apply to the resource for additional metadata */
    annotations?: Record<string, string>;
  };
  
  /** 
   * The specification of the desired state for the resource
   * Optional because some resources (like Secret, ConfigMap) don't use spec
   */
  spec?: Record<string, unknown>;
  
  /** 
   * Allow additional fields that may be present in specific resource types
   * This enables resources like Secret to have 'data'/'stringData' fields
   * and ConfigMap to have 'data' field at the root level
   */
  [key: string]: unknown;
}

/**
 * Port configuration for container and service ports.
 * 
 * @interface PortConfig
 * @since 1.0.0
 */
export interface PortConfig {
  /** The port name for identification */
  name?: string;
  
  /** The port number inside the container */
  containerPort: number;
  
  /** The port number exposed by the service */
  servicePort: number;
  
  /** The protocol used by the port (default: 'TCP') */
  protocol?: 'TCP' | 'UDP' | 'SCTP';
}

/**
 * Volume configuration for persistent storage.
 * 
 * @interface VolumeConfig
 * @since 1.0.0
 */
export interface VolumeConfig {
  /** The name of the volume */
  name: string;
  
  /** The mount path inside the container */
  mountPath: string;
  
  /** The size of the volume (e.g., '10Gi', '500Mi') */
  size?: string;
  
  /** Whether the volume should be mounted as read-only */
  readOnly?: boolean;
  
  /** ConfigMap to mount as a volume */
  configMap?: string;
  
  /** Secret to mount as a volume */
  secret?: string;
}

/**
 * Resource limits and requests for containers.
 * 
 * @interface ResourceConfig
 * @since 1.0.0
 */
export interface ResourceConfig {
  /** Resource requests (guaranteed resources) */
  requests?: {
    /** Memory request (e.g., '256Mi', '1Gi') */
    memory?: string;
    
    /** CPU request (e.g., '100m', '1') */
    cpu?: string;
  };
  
  /** Resource limits (maximum allowed resources) */
  limits?: {
    /** Memory limit (e.g., '512Mi', '2Gi') */
    memory?: string;
    
    /** CPU limit (e.g., '500m', '2') */
    cpu?: string;
  };
}

/**
 * Health check configuration for applications.
 * 
 * @interface HealthCheckConfig
 * @since 1.0.0
 */
export interface HealthCheckConfig {
  /** The HTTP path for health checks */
  path: string;
  
  /** The port for health checks */
  port?: number;
  
  /** Initial delay before starting health checks (seconds) */
  initialDelaySeconds?: number;
  
  /** How often to perform health checks (seconds) */
  periodSeconds?: number;
  
  /** Timeout for health check requests (seconds) */
  timeoutSeconds?: number;
  
  /** Number of failures before marking as unhealthy */
  failureThreshold?: number;
}

/**
 * Ingress configuration for external access.
 * 
 * @interface IngressConfig
 * @since 1.0.0
 */
export interface IngressConfig {
  /** Hostnames to route traffic for */
  hosts: string[];
  
  /** Path to route traffic on (default: '/') */
  path?: string;
  
  /** Annotations to apply to the Ingress resource */
  annotations?: Record<string, string>;
  
  /** TLS configuration for HTTPS */
  tls?: TLSConfig[];
}

/**
 * TLS configuration for Ingress resources.
 * 
 * @interface TLSConfig
 * @since 1.0.0
 */
export interface TLSConfig {
  /** Hostnames covered by the TLS certificate */
  hosts: string[];
  
  /** Name of the Secret containing the TLS certificate */
  secretName: string;
}

/**
 * Environment variable configuration.
 * 
 * @interface EnvConfig
 * @since 1.0.0
 */
export interface EnvConfig {
  /** Environment variable name */
  name: string;
  
  /** Environment variable value */
  value?: string;
  
  /** Reference to a ConfigMap key */
  configMapKeyRef?: {
    /** Name of the ConfigMap */
    name: string;
    
    /** Key within the ConfigMap */
    key: string;
  };
  
  /** Reference to a Secret key */
  secretKeyRef?: {
    /** Name of the Secret */
    name: string;
    
    /** Key within the Secret */
    key: string;
  };
}

/**
 * Kubernetes container specification.
 * 
 * @interface ContainerSpec
 * @since 1.0.0
 */
export interface ContainerSpec {
  /** Container name */
  name: string;
  
  /** Container image */
  image: string;
  
  /** Container ports */
  ports?: Array<{
    containerPort: number;
    protocol?: string;
  }>;
  
  /** Environment variables */
  env?: Array<{
    name: string;
    value?: string;
    valueFrom?: {
      secretKeyRef?: {
        name: string;
        key: string;
      };
      configMapKeyRef?: {
        name: string;
        key: string;
      };
    };
  }>;
  
  /** Environment variables from ConfigMap or Secret */
  envFrom?: Array<{
    configMapRef?: {
      name: string;
    };
    secretRef?: {
      name: string;
    };
  }>;
  
  /** Volume mounts */
  volumeMounts?: Array<{
    name: string;
    mountPath: string;
    readOnly?: boolean;
  }>;
  
  /** Resource requirements */
  resources?: {
    requests?: {
      memory?: string;
      cpu?: string;
    };
    limits?: {
      memory?: string;
      cpu?: string;
    };
  };
  
  /** Liveness probe */
  livenessProbe?: {
    httpGet?: {
      path: string;
      port: number;
    };
    initialDelaySeconds?: number;
    periodSeconds?: number;
    timeoutSeconds?: number;
    failureThreshold?: number;
  };
  
  /** Readiness probe */
  readinessProbe?: {
    httpGet?: {
      path: string;
      port: number;
    };
    initialDelaySeconds?: number;
    periodSeconds?: number;
    timeoutSeconds?: number;
    failureThreshold?: number;
  };
  
  /** Command arguments */
  args?: string[];
}

/**
 * Kubernetes pod specification.
 * 
 * @interface PodSpec
 * @since 1.0.0
 */
export interface PodSpec {
  /** Containers in the pod */
  containers: ContainerSpec[];
  
  /** Volumes in the pod */
  volumes?: Array<{
    name: string;
    persistentVolumeClaim?: {
      claimName: string;
    };
    configMap?: {
      name: string;
    };
    secret?: {
      secretName: string;
    };
    emptyDir?: Record<string, unknown>;
  }>;
  
  /** Image pull secrets */
  imagePullSecrets?: Array<{
    name: string;
  }>;
}

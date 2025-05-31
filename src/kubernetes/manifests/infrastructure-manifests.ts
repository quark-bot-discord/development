/**
 * @fileoverview Infrastructure service manifest generation for Kubernetes.
 * 
 * This module provides specialized manifest generation for infrastructure services
 * such as databases, caches, message queues, and other foundational services.
 * It handles the creation of Secrets, PersistentVolumes, PersistentVolumeClaims,
 * Deployments, and Services specifically tailored for infrastructure needs.
 * 
 * @module InfrastructureManifests
 * @since 1.0.0
 */

import type { InfraServiceConfig } from '../../services/service-types.ts';
import type { KubernetesManifest, ContainerSpec, PodSpec } from './manifest-types.ts';
import { ManifestUtils } from './manifest-utils.ts';
import { Logger } from '../../development/logger.ts';

/**
 * Generator for infrastructure service Kubernetes manifests.
 * 
 * This class specializes in creating manifests for infrastructure services that
 * typically require persistent storage, secrets management, and specific networking
 * configurations. It ensures proper volume mounting, secret injection, and
 * service exposure for infrastructure components.
 * 
 * @class InfrastructureManifests
 * @since 1.0.0
 */
export class InfrastructureManifests {

  /**
   * Generates a complete set of Kubernetes manifests for an infrastructure service.
   * 
   * This method creates all necessary Kubernetes resources for deploying an
   * infrastructure service including:
   * - Secrets for sensitive configuration
   * - PersistentVolumes and PersistentVolumeClaims for data storage
   * - Deployment for the service container
   * - Service for network access
   * - ConfigMap for non-sensitive configuration
   * 
   * @param {InfraServiceConfig} config - The infrastructure service configuration
   * @returns {KubernetesManifest[]} Array of Kubernetes manifest objects
   * 
   * @example
   * ```typescript
   * const generator = new InfrastructureManifests();
   * const redisConfig = {
   *   name: 'redis',
   *   image: 'redis:7-alpine',
   *   namespace: 'infrastructure',
   *   ports: [{ containerPort: 6379, servicePort: 6379 }],
   *   volumes: [{ name: 'data', mountPath: '/data', size: '10Gi' }],
   *   secrets: { REDIS_PASSWORD: 'secret123' }
   * };
   * const manifests = generator.generateInfraServiceManifests(redisConfig);
   * ```
   * 
   * @since 1.0.0
   */
  generateInfraServiceManifests(config: InfraServiceConfig): KubernetesManifest[] {
    const manifests: KubernetesManifest[] = [];
    const labels = { app: config.name, type: 'infrastructure' };

    Logger.info(`Generating infrastructure manifests for service: ${config.name}`);

    // Generate Secret if secrets are defined
    if (config.secrets && Object.keys(config.secrets).length > 0) {
      manifests.push(this.generateSecret(config, labels));
    }

    // Generate ConfigMap for environment variables if defined
    if (config.env && Object.keys(config.env).length > 0) {
      manifests.push(this.generateConfigMap(config, labels));
    }

    // Generate storage resources for each volume
    if (config.volumes) {
      manifests.push(...this.generateStorageResources(config, labels));
    }

    // Generate Deployment
    manifests.push(this.generateDeployment(config, labels));

    // Generate Service
    if (config.ports && config.ports.length > 0) {
      manifests.push(this.generateService(config, labels));
    }

    Logger.info(`Generated ${manifests.length} manifests for infrastructure service: ${config.name}`);
    return manifests;
  }

  /**
   * Generates a Secret manifest for storing sensitive configuration.
   * 
   * Creates a Kubernetes Secret using stringData for base64 encoding automation.
   * The secret includes all sensitive configuration values that should not be
   * stored in plain text.
   * 
   * @private
   * @param {InfraServiceConfig} config - The service configuration
   * @param {Record<string, string>} labels - Labels to apply to the secret
   * @returns {KubernetesManifest} Secret manifest object
   * @since 1.0.0
   */
  private generateSecret(config: InfraServiceConfig, labels: Record<string, string>): KubernetesManifest {
    return {
      apiVersion: 'v1',
      kind: 'Secret',
      metadata: {
        name: `${config.name}-secrets`,
        namespace: config.namespace,
        labels
      },
      stringData: config.secrets,
      type: 'Opaque'
    };
  }

  /**
   * Generates a ConfigMap manifest for environment variables.
   * 
   * Creates a Kubernetes ConfigMap containing environment variables that
   * don't require encryption. All values are converted to strings as
   * required by Kubernetes.
   * 
   * @private
   * @param {InfraServiceConfig} config - The service configuration
   * @param {Record<string, string>} labels - Labels to apply to the ConfigMap
   * @returns {KubernetesManifest} ConfigMap manifest object
   * @since 1.0.0
   */
  private generateConfigMap(config: InfraServiceConfig, labels: Record<string, string>): KubernetesManifest {
    // Ensure all env values are strings
    const stringData: Record<string, string> = {};
    for (const [key, value] of Object.entries(config.env!)) {
      stringData[key] = String(value);
    }

    return {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: {
        name: `${config.name}-config`,
        namespace: config.namespace,
        labels
      },
      data: stringData
    };
  }

  /**
   * Generates PersistentVolume and PersistentVolumeClaim manifests for storage.
   * 
   * Creates storage resources for each volume defined in the service configuration.
   * This includes both the PersistentVolume (cluster-scoped) and PersistentVolumeClaim
   * (namespace-scoped) resources needed for persistent data storage.
   * 
   * @private
   * @param {InfraServiceConfig} config - The service configuration
   * @param {Record<string, string>} labels - Labels to apply to storage resources
   * @returns {KubernetesManifest[]} Array of storage manifest objects
   * @since 1.0.0
   */
  private generateStorageResources(config: InfraServiceConfig, labels: Record<string, string>): KubernetesManifest[] {
    const manifests: KubernetesManifest[] = [];

    for (const volume of config.volumes!) {
      const storageSize = ManifestUtils.validateStorageSize(volume.size);

      // PersistentVolume (cluster-scoped, no namespace)
      manifests.push({
        apiVersion: 'v1',
        kind: 'PersistentVolume',
        metadata: {
          name: `${config.name}-${volume.name}-pv`,
          labels: { ...labels, volume: volume.name }
        },
        spec: {
          capacity: {
            storage: storageSize
          },
          accessModes: ['ReadWriteOnce'],
          persistentVolumeReclaimPolicy: 'Retain',
          storageClassName: 'local-storage',
          hostPath: {
            path: `/mnt/data/${config.name}/${volume.name}`,
            type: 'DirectoryOrCreate'
          }
        }
      });

      // PersistentVolumeClaim (namespace-scoped)
      manifests.push({
        apiVersion: 'v1',
        kind: 'PersistentVolumeClaim',
        metadata: {
          name: `${config.name}-${volume.name}-pvc`,
          namespace: config.namespace,
          labels: { ...labels, volume: volume.name }
        },
        spec: {
          accessModes: ['ReadWriteOnce'],
          storageClassName: 'local-storage',
          resources: {
            requests: {
              storage: storageSize
            }
          },
          selector: {
            matchLabels: {
              app: config.name,
              volume: volume.name
            }
          }
        }
      });
    }

    return manifests;
  }

  /**
   * Generates a Deployment manifest for the infrastructure service.
   * 
   * Creates a Kubernetes Deployment with appropriate container configuration,
   * volume mounts, environment variables, and resource limits tailored for
   * infrastructure services.
   * 
   * @private
   * @param {InfraServiceConfig} config - The service configuration
   * @param {Record<string, string>} labels - Labels to apply to the deployment
   * @returns {KubernetesManifest} Deployment manifest object
   * @since 1.0.0
   */
  private generateDeployment(config: InfraServiceConfig, labels: Record<string, string>): KubernetesManifest {
    const containerSpec: ContainerSpec = {
      name: config.name,
      image: config.image,
      ports: config.ports?.map(port => {
        const portValue = port.targetPort || port.port;
        return {
          containerPort: typeof portValue === 'number' 
            ? portValue 
            : parseInt(String(portValue), 10),
          protocol: 'TCP' as const
        };
      }) || []
    };

    // Add environment variables from secrets and config
    const envVars: Array<{
      name: string;
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
    }> = [];
    
    if (config.secrets) {
      for (const [key] of Object.entries(config.secrets)) {
        envVars.push({
          name: key,
          valueFrom: {
            secretKeyRef: {
              name: `${config.name}-secrets`,
              key: key
            }
          }
        });
      }
    }

    if (config.env) {
      for (const [key] of Object.entries(config.env)) {
        envVars.push({
          name: key,
          valueFrom: {
            configMapKeyRef: {
              name: `${config.name}-config`,
              key: key
            }
          }
        });
      }
    }

    if (envVars.length > 0) {
      containerSpec.env = envVars;
    }

    // Add volume mounts
    if (config.volumes && config.volumes.length > 0) {
      containerSpec.volumeMounts = config.volumes.map(volume => ({
        name: `${volume.name}-storage`,
        mountPath: volume.mountPath
      }));
    }

    // Add resource limits for infrastructure services
    // Default resource limits for infrastructure services
    containerSpec.resources = {
      requests: {
        memory: '256Mi',
        cpu: '100m'
      },
      limits: {
        memory: '1Gi',
        cpu: '500m'
      }
    };

    const podSpec: PodSpec = {
      containers: [containerSpec]
    };

    // Add volumes to pod spec
    if (config.volumes && config.volumes.length > 0) {
      podSpec.volumes = config.volumes.map(volume => ({
        name: `${volume.name}-storage`,
        persistentVolumeClaim: {
          claimName: `${config.name}-${volume.name}-pvc`
        }
      }));
    }

    return {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: config.name,
        namespace: config.namespace,
        labels
      },
      spec: {
        replicas: 1, // Infrastructure services typically run single instance
        selector: {
          matchLabels: labels
        },
        template: {
          metadata: {
            labels
          },
          spec: podSpec
        },
        strategy: {
          type: 'Recreate' // Ensure only one instance for stateful services
        }
      }
    };
  }

  /**
   * Generates a Service manifest for network access to the infrastructure service.
   * 
   * Creates a Kubernetes Service that exposes the infrastructure service's ports
   * for access by other services within the cluster. Uses ClusterIP type for
   * internal cluster communication.
   * 
   * @private
   * @param {InfraServiceConfig} config - The service configuration
   * @param {Record<string, string>} labels - Labels to apply to the service
   * @returns {KubernetesManifest} Service manifest object
   * @since 1.0.0
   */
  private generateService(config: InfraServiceConfig, labels: Record<string, string>): KubernetesManifest {
    return {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: {
        name: config.name,
        namespace: config.namespace,
        labels
      },
      spec: {
        type: 'ClusterIP', // Infrastructure services are typically internal
        selector: labels,
        ports: config.ports!.map(port => ({
          name: port.name || `port-${port.port}`,
          port: port.port,
          targetPort: port.targetPort || port.port,
          protocol: 'TCP'
        }))
      }
    };
  }
}

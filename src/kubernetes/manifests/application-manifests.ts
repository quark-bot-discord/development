/**
 * @fileoverview Application service manifest generation for Kubernetes.
 * 
 * This module provides specialized manifest generation for applic      ports: config.ports?.map(port => ({
        containerPort: port.targetPort || port.port,
        protocol: 'TCP'
      })) || [],n services
 * such as web applications, APIs, microservices, and user-facing applications.
 * It handles the creation of Deployments, Services, Ingress resources, and
 * ConfigMaps optimized for application workloads.
 * 
 * @module ApplicationManifests
 * @since 1.0.0
 */

import type { ServiceDefinition } from '../../services/service-types.ts';
import type { KubernetesManifest, ContainerSpec, PodSpec } from './manifest-types.ts';
import { Logger } from '../../development/logger.ts';

/**
 * Supported service types for application manifest generation.
 * 
 * @typedef {'core-services' | 'app-services' | 'other-services'} ServiceType
 */
type ServiceType = "core-services" | "app-services" | "other-services";

/**
 * Generator for application service Kubernetes manifests.
 * 
 * This class specializes in creating manifests for application services that
 * typically require horizontal scaling, load balancing, and external access.
 * It focuses on stateless services that can be easily replicated and updated.
 * 
 * @class ApplicationManifests
 * @since 1.0.0
 */
export class ApplicationManifests {

  /**
   * Generates a complete set of Kubernetes manifests for an application service.
   * 
   * This method creates all necessary Kubernetes resources for deploying an
   * application service including:
   * - ConfigMap for application configuration
   * - Deployment with horizontal scaling capabilities
   * - Service for load balancing and discovery
   * - Ingress for external access (if configured)
   * 
   * @param {ServiceDefinition} config - The application service configuration
   * @param {ServiceType} serviceType - The type of service being deployed
   * @returns {KubernetesManifest[]} Array of Kubernetes manifest objects
   * 
   * @example
   * ```typescript
   * const generator = new ApplicationManifests();
   * const webAppConfig = {
   *   name: 'web-app',
   *   image: 'myorg/web-app:v1.0.0',
   *   namespace: 'applications',
   *   replicas: 3,
   *   ports: [{ containerPort: 3000, servicePort: 80 }],
   *   env: { NODE_ENV: 'production', API_URL: 'https://api.example.com' }
   * };
   * const manifests = generator.generateServiceManifests(webAppConfig, 'app-services');
   * ```
   * 
   * @since 1.0.0
   */
  generateServiceManifests(config: ServiceDefinition, serviceType: ServiceType): KubernetesManifest[] {
    const manifests: KubernetesManifest[] = [];
    const labels = { 
      app: config.name, 
      type: 'application',
      tier: this.getServiceTier(serviceType)
    };

    Logger.info(`Generating application manifests for service: ${config.name} (${serviceType})`);

    // Generate ConfigMap if environment variables are defined
    if (config.env && Object.keys(config.env).length > 0) {
      manifests.push(this.generateConfigMap(config, labels));
    }

    // Generate Deployment
    manifests.push(this.generateDeployment(config, labels, serviceType));

    // Generate Service if ports are defined
    if (config.ports && config.ports.length > 0) {
      manifests.push(this.generateService(config, labels));
    }

    // Note: Ingress generation removed as it's not part of ServiceDefinition interface

    Logger.info(`Generated ${manifests.length} manifests for application service: ${config.name}`);
    return manifests;
  }

  /**
   * Generates a ConfigMap manifest for application configuration.
   * 
   * Creates a Kubernetes ConfigMap containing environment variables and
   * configuration values needed by the application. All values are converted
   * to strings as required by Kubernetes.
   * 
   * @private
   * @param {ServiceDefinition} config - The service configuration
   * @param {Record<string, string>} labels - Labels to apply to the ConfigMap
   * @returns {KubernetesManifest} ConfigMap manifest object
   * @since 1.0.0
   */
  private generateConfigMap(config: ServiceDefinition, labels: Record<string, string>): KubernetesManifest {
    // Ensure all environment values are strings for proper YAML output
    const stringData: Record<string, string> = {};
    for (const [key, value] of Object.entries(config.env!)) {
      stringData[key] = String(value);
    }

    return {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: {
        name: `${config.name}-config`,
        namespace: config.namespace || 'default',
        labels
      },
      data: stringData
    };
  }

  /**
   * Generates a Deployment manifest for the application service.
   * 
   * Creates a Kubernetes Deployment optimized for application workloads with:
   * - Horizontal scaling support
   * - Rolling update strategy
   * - Health checks and readiness probes
   * - Resource management
   * 
   * @private
   * @param {ServiceDefinition} config - The service configuration
   * @param {Record<string, string>} labels - Labels to apply to the deployment
   * @param {ServiceType} serviceType - The type of service being deployed
   * @returns {KubernetesManifest} Deployment manifest object
   * @since 1.0.0
   */
  private generateDeployment(config: ServiceDefinition, labels: Record<string, string>, serviceType: ServiceType): KubernetesManifest {
    const containerSpec: ContainerSpec = {
      name: config.name,
      image: config.image || '',
      ports: config.ports?.map(port => ({
        containerPort: port.containerPort || 8080,
        protocol: port.protocol || 'TCP'
      })) || []
    };

    // Add environment variables from ConfigMap
    if (config.env && Object.keys(config.env).length > 0) {
      containerSpec.envFrom = [{
        configMapRef: {
          name: `${config.name}-config`
        }
      }];
    }

    // Add health checks for application services
    if (config.healthCheck) {
      if (config.healthCheck.path) {
        const probe = {
          httpGet: {
            path: config.healthCheck.path,
            port: config.healthCheck.port || config.ports?.[0]?.containerPort || 8080
          },
          initialDelaySeconds: 30,
          periodSeconds: 10,
          timeoutSeconds: 5,
          failureThreshold: 3
        };
        containerSpec.livenessProbe = probe;
        containerSpec.readinessProbe = { ...probe, initialDelaySeconds: 10 };
      }
    }

    // Add resource limits based on service type
    containerSpec.resources = this.getResourceLimits(serviceType, config.resources);

    // Add volume mounts if specified
    if (config.volumes && config.volumes.length > 0) {
      containerSpec.volumeMounts = config.volumes.map(volume => ({
        name: volume.name,
        mountPath: volume.mountPath,
        readOnly: volume.readOnly || false
      }));
    }

    const podSpec: PodSpec = {
      containers: [containerSpec]
    };

    // Add volumes to pod spec
    if (config.volumes && config.volumes.length > 0) {
      podSpec.volumes = config.volumes.map(volume => {
        if (volume.configMap) {
          return {
            name: volume.name,
            configMap: {
              name: volume.configMap
            }
          };
        } else if (volume.secret) {
          return {
            name: volume.name,
            secret: {
              secretName: volume.secret
            }
          };
        } else {
          return {
            name: volume.name,
            emptyDir: {}
          };
        }
      });
    }

    const replicas = config.replicas || this.getDefaultReplicas(serviceType);

    return {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: config.name,
        namespace: config.namespace || 'default',
        labels
      },
      spec: {
        replicas,
        selector: {
          matchLabels: { app: config.name }
        },
        template: {
          metadata: {
            labels: { ...labels, app: config.name }
          },
          spec: podSpec
        },
        strategy: {
          type: 'RollingUpdate',
          rollingUpdate: {
            maxUnavailable: 1,
            maxSurge: 1
          }
        }
      }
    };
  }

  /**
   * Generates a Service manifest for load balancing and service discovery.
   * 
   * Creates a Kubernetes Service that provides stable network access to the
   * application pods with load balancing across replicas.
   * 
   * @private
   * @param {ServiceDefinition} config - The service configuration
   * @param {Record<string, string>} labels - Labels to apply to the service
   * @returns {KubernetesManifest} Service manifest object
   * @since 1.0.0
   */
  private generateService(config: ServiceDefinition, labels: Record<string, string>): KubernetesManifest {
    const serviceType = config.serviceType || 'ClusterIP';
    
    return {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: {
        name: config.name,
        namespace: config.namespace || 'default',
        labels
      },
      spec: {
        type: serviceType,
        selector: { app: config.name },
        ports: config.ports!.map(port => ({
          name: port.name || `port-${port.servicePort}`,
          port: port.servicePort,
          targetPort: port.containerPort,
          protocol: port.protocol || 'TCP'
        }))
      }
    };
  }

  /**
   * Generates an Ingress manifest for external HTTP/HTTPS access.
   * 
   * Creates a Kubernetes Ingress resource that provides external access to
   * the application service through HTTP/HTTPS with optional TLS termination.
   * 
   * @private
   * @param {ServiceDefinition} config - The service configuration
   * @param {Record<string, string>} labels - Labels to apply to the ingress
   * @returns {KubernetesManifest} Ingress manifest object
   * @since 1.0.0
   */
  private generateIngress(config: ServiceDefinition, labels: Record<string, string>): KubernetesManifest {
    const ingress: KubernetesManifest = {
      apiVersion: 'networking.k8s.io/v1',
      kind: 'Ingress',
      metadata: {
        name: config.name,
        namespace: config.namespace || 'default',
        labels,
        annotations: config.ingress!.annotations || {}
      },
      spec: {
        rules: config.ingress!.hosts.map(host => ({
          host,
          http: {
            paths: [{
              path: config.ingress!.path || '/',
              pathType: 'Prefix',
              backend: {
                service: {
                  name: config.name,
                  port: {
                    number: config.ports![0].servicePort
                  }
                }
              }
            }]
          }
        }))
      }
    };

    // Add TLS configuration if specified
    if (config.ingress!.tls) {
      ingress.spec!.tls = config.ingress!.tls.map(tls => ({
        hosts: tls.hosts,
        secretName: tls.secretName
      }));
    }

    return ingress;
  }

  /**
   * Determines the service tier based on service type.
   * 
   * @private
   * @param {ServiceType} serviceType - The type of service
   * @returns {string} The service tier label
   * @since 1.0.0
   */
  private getServiceTier(serviceType: ServiceType): string {
    switch (serviceType) {
      case 'core-services': return 'core';
      case 'app-services': return 'application';
      case 'other-services': return 'utility';
      default: return 'unknown';
    }
  }

  /**
   * Gets appropriate resource limits based on service type.
   * 
   * @private
   * @param {ServiceType} serviceType - The type of service
   * @param {any} [customResources] - Custom resource configuration
   * @returns {any} Resource limits configuration
   * @since 1.0.0
   */
  private getResourceLimits(serviceType: ServiceType, customResources?: ServiceDefinition["resources"]):  ServiceDefinition["resources"] {
    if (customResources) {
      return customResources;
    }

    switch (serviceType) {
      case 'core-services':
        return {
          requests: { memory: '512Mi', cpu: '200m' },
          limits: { memory: '2Gi', cpu: '1000m' }
        };
      case 'app-services':
        return {
          requests: { memory: '256Mi', cpu: '100m' },
          limits: { memory: '1Gi', cpu: '500m' }
        };
      default:
        return {
          requests: { memory: '128Mi', cpu: '50m' },
          limits: { memory: '512Mi', cpu: '250m' }
        };
    }
  }

  /**
   * Gets default replica count based on service type.
   * 
   * @private
   * @param {ServiceType} serviceType - The type of service
   * @returns {number} Default number of replicas
   * @since 1.0.0
   */
  private getDefaultReplicas(serviceType: ServiceType): number {
    switch (serviceType) {
      case 'core-services': return 2; // High availability for core services
      case 'app-services': return 1;  // Single instance for applications
      case 'other-services': return 1; // Single instance for utilities
      default: return 1;
    }
  }
}

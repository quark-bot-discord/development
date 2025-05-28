import type { ServiceDefinition, InfraServiceConfig } from './service-types.ts';
import { Logger } from './logger.ts';
import { stringify as yamlStringify } from 'yaml';

export interface KubernetesManifest {
  apiVersion: string;
  kind: string;
  metadata: {
    name: string;
    namespace?: string; // Make namespace optional for cluster-scoped resources
    labels?: Record<string, string>;
  };
  spec?: Record<string, unknown>; // Make spec optional for non-spec resources (e.g., Secret)
  [key: string]: unknown; // Allow extra fields for Secret, ConfigMap, etc.
}

export class ManifestGenerator {
  
  /**
   * Generate Kubernetes manifests for an infrastructure service
   */
  generateInfraServiceManifests(config: InfraServiceConfig): KubernetesManifest[] {
    const manifests: KubernetesManifest[] = [];
    const labels = { app: config.name };

    // Generate Secret if secrets are defined
    if (config.secrets && Object.keys(config.secrets).length > 0) {
      // Secret should use 'data' or 'stringData' at the root, not under 'spec'
      // See: https://kubernetes.io/docs/concepts/configuration/secret/
      const secret: KubernetesManifest = {
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
      manifests.push(secret);
    }

    // Generate PersistentVolume and PersistentVolumeClaim for each volume
    if (config.volumes) {
      for (const volume of config.volumes) {
        // PersistentVolume
        manifests.push({
          apiVersion: 'v1',
          kind: 'PersistentVolume',
          metadata: {
            name: `${config.name}-${volume.name}-pv`,
            labels
          },
          spec: {
            capacity: {
              storage: (volume.size && typeof volume.size === 'string' && volume.size.trim() !== '') ? volume.size : '1Gi'
            },
            accessModes: ['ReadWriteOnce'],
            persistentVolumeReclaimPolicy: 'Retain',
            hostPath: {
              path: `/mnt/data/${config.name}/${volume.name}`
            }
          }
        });

        // PersistentVolumeClaim
        manifests.push({
          apiVersion: 'v1',
          kind: 'PersistentVolumeClaim',
          metadata: {
            name: volume.name,
            namespace: config.namespace,
            labels
          },
          spec: {
            accessModes: ['ReadWriteOnce'],
            resources: {
              requests: {
                storage: (volume.size && typeof volume.size === 'string' && volume.size.trim() !== '') ? volume.size : '1Gi'
              }
            }
          }
        });
      }
    }

    // Generate Deployment
    const deployment: KubernetesManifest = {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: config.name,
        namespace: config.namespace,
        labels
      },
      spec: {
        replicas: 1,
        selector: {
          matchLabels: labels
        },
        template: {
          metadata: {
            labels
          },
          spec: {
            affinity: {
              nodeAffinity: {
                requiredDuringSchedulingIgnoredDuringExecution: {
                  nodeSelectorTerms: [{
                    matchExpressions: [{
                      key: 'role',
                      operator: 'In',
                      values: ['core']
                    }]
                  }]
                }
              }
            },
            containers: [{
              name: config.name,
              image: config.image,
              ports: config.ports.map(port => ({
                containerPort: port.targetPort || port.port
              })),
              env: config.env ? Object.entries(config.env).map(([name, value]) => ({
                name,
                value: String(value)
              })) : [],
              envFrom: config.secrets ? [{
                secretRef: {
                  name: `${config.name}-secrets`
                }
              }] : undefined,
              volumeMounts: config.volumes?.map(volume => ({
                name: volume.name,
                mountPath: volume.mountPath
              }))
            }],
            volumes: config.volumes?.map(volume => ({
              name: volume.name,
              persistentVolumeClaim: {
                claimName: volume.name
              }
            }))
          }
        }
      }
    };
    manifests.push(deployment);

    // Generate Service - Use ClusterIP for most services, NodePort only when needed
    const needsNodePort = this.shouldExposeNodePort(config);
    const service: KubernetesManifest = {
      apiVersion: 'v1',
      kind: 'Service',
      metadata: {
        name: config.name,
        namespace: config.namespace,
        labels
      },
      spec: {
        selector: labels,
        ports: config.ports.map((port, index) => {
          const basePort = {
            name: port.name,
            port: port.port,
            targetPort: port.targetPort || port.port,
          };
          // Only add nodePort if the service needs external access
          if (needsNodePort) {
            const nodePort = this.calculateNodePort(config.name, port.port, index);
            return { ...basePort, nodePort };
          }
          return basePort;
        }),
        type: needsNodePort ? 'NodePort' : 'ClusterIP'
      }
    };
    manifests.push(service);

    return manifests;
  }

  /**
   * Generate Kubernetes manifests for an application service
   */
  generateAppServiceManifests(config: ServiceDefinition, namespace: string): KubernetesManifest[] {
    const manifests: KubernetesManifest[] = [];
    const labels = { app: config.name };

    // Generate ConfigMap for environment variables
    const configMap: KubernetesManifest = {
      apiVersion: 'v1',
      kind: 'ConfigMap',
      metadata: {
        name: `${config.name}-config`,
        namespace,
        labels
      },
      // ConfigMap should have 'data' at root level, not under 'spec'
      data: Object.fromEntries(
        Object.entries(config.env || {}).map(([key, value]) => [key, String(value)])
      )
    };

    manifests.push(configMap);

    // Generate Deployment for containerized deployment
    const deployment: KubernetesManifest = {
      apiVersion: 'apps/v1',
      kind: 'Deployment',
      metadata: {
        name: config.name,
        namespace,
        labels
      },
      spec: {
        replicas: 1,
        selector: {
          matchLabels: labels
        },
        template: {
          metadata: {
            labels
          },
          spec: {
            containers: [{
              name: config.name,
              image: this.getServiceImage(config),
              ports: this.getServicePorts(config),
              envFrom: [{
                configMapRef: {
                  name: `${config.name}-config`
                }
              }],
              resources: {
                requests: {
                  memory: '128Mi',
                  cpu: '100m'
                },
                limits: {
                  memory: '512Mi',
                  cpu: '500m'
                }
              }
            }]
          }
        }
      }
    };

    manifests.push(deployment);

    // Generate Service if the application exposes ports
    const servicePorts = this.getServicePorts(config);
    if (servicePorts.length > 0) {
      const service: KubernetesManifest = {
        apiVersion: 'v1',
        kind: 'Service',
        metadata: {
          name: config.name,
          namespace,
          labels
        },
        spec: {
          selector: labels,
          ports: servicePorts.map(port => ({
            name: port.name || 'http',
            port: port.containerPort,
            targetPort: port.containerPort,
            protocol: 'TCP'
          })),
          type: 'ClusterIP'
        }
      };

      manifests.push(service);
    }
    
    return manifests;
  }

  /**
   * Convert manifests to YAML string
   */
  manifestsToYaml(manifests: KubernetesManifest[]): string {
    return manifests.map(manifest => {
      // Preprocess the manifest to ensure all values are properly stringified
      const processedManifest = this.preprocessManifestForYaml(manifest);
      // Use the yaml library for proper YAML generation
      return yamlStringify(processedManifest);
    }).join('\n---\n');
  }

  /**
   * Preprocess manifest to ensure all values that need to be strings are converted
   */
  private preprocessManifestForYaml(obj: unknown): unknown {
    if (obj === null || obj === undefined) {
      return obj;
    }
    
    if (Array.isArray(obj)) {
      return obj.map(item => this.preprocessManifestForYaml(item));
    }
    
    if (typeof obj === 'object') {
      const processed: Record<string, unknown> = {};
      
      for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
        // Special handling for ConfigMap data and Secret stringData
        if ((key === 'data' || key === 'stringData') && typeof value === 'object' && value !== null) {
          const stringified: Record<string, string> = {};
          for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
            stringified[k] = String(v);
          }
          processed[key] = stringified;
        }
        // Special handling for environment variable values
        else if (key === 'value' && typeof value !== 'string' && value !== null && value !== undefined) {
          processed[key] = String(value);
        }
        // Recursively process nested objects
        else {
          processed[key] = this.preprocessManifestForYaml(value);
        }
      }
      
      return processed;
    }
    
    return obj;
  }

  /**
   * Apply manifests directly to Kubernetes using kubectl
   */
  async applyManifests(manifests: KubernetesManifest[]): Promise<boolean> {
    try {
      const yaml = this.manifestsToYaml(manifests);
      
      // Write to temporary file and apply
      const tempFile = `/tmp/k8s-manifest-${Date.now()}.yaml`;
      await Deno.writeTextFile(tempFile, yaml);
      
      const process = new Deno.Command('kubectl', {
        args: ['apply', '-f', tempFile],
        stdout: 'inherit',
        stderr: 'inherit'
      });
      
      const result = await process.output();
      
      // Clean up temp file
      try {
        await Deno.remove(tempFile);
      } catch {
        // Ignore cleanup errors
      }
      
      return result.success;
    } catch (err) {
      Logger.error(`Failed to apply manifests: ${err instanceof Error ? err.message : String(err)}`);
      return false;
    }
  }

  /**
   * Generate kubectl port-forward commands for accessing services locally
   * This is often a better alternative to NodePorts for development
   */
  generatePortForwardCommands(manifests: KubernetesManifest[]): string[] {
    const commands: string[] = [];
    
    for (const manifest of manifests) {
      // Use optional chaining to safely access manifest.spec.ports
      if (manifest.kind === 'Service' && manifest.spec?.ports) {
        const serviceName = manifest.metadata.name;
        const namespace = manifest.metadata.namespace;
        const ports = manifest.spec.ports as Array<{name?: string, port: number}>;
        
        for (const port of ports) {
          const localPort = port.port;
          const servicePort = port.port;
          const command = `kubectl port-forward -n ${namespace} service/${serviceName} ${localPort}:${servicePort}`;
          commands.push(`# Access ${serviceName} ${port.name || 'service'} at localhost:${localPort}`);
          commands.push(command);
        }
      }
    }
    
    return commands;
  }

  /**
   * Get Docker image for a service based on its configuration
   */
  private getServiceImage(config: ServiceDefinition): string {
    // For now, use a pattern based on service name
    // In the future, this could be configurable per service
    return `quark-bot/${config.name}:latest`;
  }

  /**
   * Get port configuration for a service
   */
  private getServicePorts(config: ServiceDefinition): Array<{name?: string, containerPort: number}> {
    // Determine ports based on service type and name
    const ports: Array<{name?: string, containerPort: number}> = [];
    
    // Web services typically run on port 3000
    if (config.name.includes('website') || config.name.includes('web')) {
      ports.push({ name: 'http', containerPort: 3000 });
    }
    
    // Gateway services typically run on port 8080
    if (config.name.includes('gateway')) {
      ports.push({ name: 'http', containerPort: 8080 });
    }
    
    // Bot services typically don't expose ports (they're event-driven)
    if (config.name.includes('bot')) {
      return [];
    }
    
    // API services typically run on port 4000
    if (config.name.includes('api') || config.name.includes('service')) {
      ports.push({ name: 'http', containerPort: 4000 });
    }
    
    // Storage and cache services
    if (config.name.includes('storage') || config.name.includes('cache')) {
      ports.push({ name: 'http', containerPort: 3000 });
    }
    
    // Default to port 3000 if no specific pattern matches and it's not a bot
    if (ports.length === 0 && !config.name.includes('bot')) {
      ports.push({ name: 'http', containerPort: 3000 });
    }
    
    return ports;
  }

  /**
   * Determine if a service should expose NodePorts for external access
   * 
   * NodePorts are only needed when you want to access services from outside the cluster.
   * In a development environment:
   * - Infrastructure services like MySQL, Redis might need external access for development tools
   * - Application services typically only need internal communication (ClusterIP)
   * - Most services should use ClusterIP for better security and resource usage
   */
  private shouldExposeNodePort(config: InfraServiceConfig): boolean {
    // Only expose certain services via NodePort in development
    const servicesNeedingExternalAccess = [
      'mysql',           // For database management tools
      'redis',           // For Redis clients
      'elastic-search'   // For Elasticsearch clients/Kibana
    ];
    
    return servicesNeedingExternalAccess.includes(config.name);
  }

  /**
   * Calculate a safe NodePort within the valid range (30000-32767)
   * Uses a hash-based approach to avoid conflicts
   */
  private calculateNodePort(serviceName: string, port: number, portIndex: number): number {
    // Create a simple hash from service name and port info to ensure consistency
    const hash = this.simpleHash(serviceName + port.toString() + portIndex.toString());
    
    // Map to valid NodePort range (30000-32767), leaving some buffer
    const nodePortRange = 32700 - 30100; // ~2600 available ports
    const nodePort = 30100 + (hash % nodePortRange);
    
    return nodePort;
  }

  /**
   * Simple hash function for consistent port assignment
   */
  private simpleHash(str: string): number {
    let hash = 0;
    for (let i = 0; i < str.length; i++) {
      const char = str.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return Math.abs(hash);
  }
}

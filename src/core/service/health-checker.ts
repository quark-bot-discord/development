/**
 * @fileoverview Service health monitoring and status checking for Kubernetes deployments.
 * 
 * This module provides comprehensive health checking capabilities for services
 * deployed in Kubernetes clusters. It monitors pod status, readiness probes,
 * and service availability to ensure proper service deployment and operation.
 * 
 * @module HealthChecker
 * @since 1.0.0
 */

import { Logger } from '../../development/logger.ts';
import type {
  K8sPod,
  K8sPodCondition,
  K8sContainerState,
  K8sContainerStatus as _K8sContainerStatus,
  K8sPodsResponse,
  K8sEndpointsResponse,
  HealthCheckConfig,
  ServiceHealthStatus,
  PodHealthStatus,
  ContainerStatus,
  EndpointStatus,
} from '../../types/health-types.ts';

/**
 * Service health monitoring and status checking utility.
 * 
 * This class provides methods to monitor the health and readiness of services
 * deployed in Kubernetes clusters. It can check pod status, service endpoints,
 * and perform comprehensive health assessments.
 * 
 * @example
 * ```typescript
 * const healthChecker = new HealthChecker();
 * 
 * // Check health of a specific service
 * const status = await healthChecker.checkServiceHealth('my-app', 'default');
 * console.log(`Service status: ${status.status}`);
 * 
 * // Wait for service to become healthy
 * await healthChecker.waitForServiceHealth('my-app', 'default', {
 *   timeout: 300000, // 5 minutes
 *   interval: 5000   // Check every 5 seconds
 * });
 * 
 * // Monitor multiple services
 * const services = ['web-app', 'api-service', 'database'];
 * const results = await healthChecker.checkMultipleServices(services, 'production');
 * ```
 * 
 * @since 1.0.0
 */
export class HealthChecker {
  private readonly defaultConfig: HealthCheckConfig = {
    timeout: 300000,      // 5 minutes
    interval: 5000,       // 5 seconds
    requiredSuccesses: 2, // 2 consecutive successes
    allowedFailures: 3    // 3 consecutive failures
  };

  /**
   * Check the health status of a specific service.
   * 
   * Performs a comprehensive health check including pod status, readiness,
   * and endpoint availability.
   * 
   * @param {string} serviceName - Name of the service to check
   * @param {string} namespace - Kubernetes namespace
   * @returns {Promise<ServiceHealthStatus>} Complete health status information
   * 
   * @example
   * ```typescript
   * const healthChecker = new HealthChecker();
   * const status = await healthChecker.checkServiceHealth('web-app', 'default');
   * 
   * if (status.status === 'healthy') {
   *   console.log('Service is healthy');
   * } else {
   *   console.log('Issues found:', status.messages);
   * }
   * ```
   * 
   * @since 1.0.0
   */
  async checkServiceHealth(serviceName: string, namespace: string): Promise<ServiceHealthStatus> {
    Logger.info(`Checking health for service: ${serviceName} in namespace: ${namespace}`);

    const status: ServiceHealthStatus = {
      serviceName,
      namespace,
      status: 'unknown',
      pods: [],
      endpoints: [],
      lastChecked: new Date(),
      messages: []
    };

    try {
      // Get pod status
      status.pods = await this.getPodStatus(serviceName, namespace);
      
      // Get endpoint status
      status.endpoints = await this.getEndpointStatus(serviceName, namespace);
      
      // Determine overall status
      status.status = this.determineOverallStatus(status.pods, status.endpoints);
      
      // Generate status messages
      status.messages = this.generateStatusMessages(status);

      Logger.info(`Health check completed for ${serviceName}: ${status.status}`);
      return status;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      Logger.error(`Health check failed for ${serviceName}: ${errorMessage}`);
      
      status.status = 'unknown';
      status.messages.push(`Health check failed: ${errorMessage}`);
      return status;
    }
  }

  /**
   * Wait for a service to become healthy within a specified timeout.
   * 
   * Continuously monitors service health until it becomes healthy or
   * the timeout is reached.
   * 
   * @param {string} serviceName - Name of the service to monitor
   * @param {string} namespace - Kubernetes namespace
   * @param {Partial<HealthCheckConfig>} config - Health check configuration
   * @returns {Promise<ServiceHealthStatus>} Final health status
   * 
   * @example
   * ```typescript
   * const healthChecker = new HealthChecker();
   * 
   * try {
   *   const status = await healthChecker.waitForServiceHealth('api-service', 'default', {
   *     timeout: 180000, // 3 minutes
   *     interval: 10000  // Check every 10 seconds
   *   });
   *   console.log('Service is now healthy');
   * } catch (error) {
   *   console.log('Service failed to become healthy within timeout');
   * }
   * ```
   * 
   * @since 1.0.0
   */
  async waitForServiceHealth(
    serviceName: string, 
    namespace: string, 
    config: Partial<HealthCheckConfig> = {}
  ): Promise<ServiceHealthStatus> {
    const effectiveConfig = { ...this.defaultConfig, ...config };
    const startTime = Date.now();
    let consecutiveSuccesses = 0;
    let consecutiveFailures = 0;

    Logger.info(`Waiting for service ${serviceName} to become healthy (timeout: ${effectiveConfig.timeout}ms)`);

    while (Date.now() - startTime < effectiveConfig.timeout) {
      const status = await this.checkServiceHealth(serviceName, namespace);

      if (status.status === 'healthy') {
        consecutiveSuccesses++;
        consecutiveFailures = 0;

        if (consecutiveSuccesses >= effectiveConfig.requiredSuccesses) {
          Logger.info(`Service ${serviceName} is healthy (${consecutiveSuccesses} consecutive successes)`);
          return status;
        }
      } else {
        consecutiveSuccesses = 0;
        consecutiveFailures++;

        if (consecutiveFailures >= effectiveConfig.allowedFailures) {
          Logger.error(`Service ${serviceName} failed health checks (${consecutiveFailures} consecutive failures)`);
          throw new Error(`Service ${serviceName} failed to become healthy: ${status.messages.join(', ')}`);
        }
      }

      // Wait before next check
      await new Promise(resolve => setTimeout(resolve, effectiveConfig.interval));
    }

    throw new Error(`Timeout waiting for service ${serviceName} to become healthy`);
  }

  /**
   * Check health status of multiple services concurrently.
   * 
   * Performs health checks on multiple services in parallel and returns
   * a summary of all results.
   * 
   * @param {string[]} serviceNames - Array of service names to check
   * @param {string} namespace - Kubernetes namespace
   * @returns {Promise<ServiceHealthStatus[]>} Array of health status results
   * 
   * @example
   * ```typescript
   * const healthChecker = new HealthChecker();
   * const services = ['web-app', 'api-service', 'database'];
   * const results = await healthChecker.checkMultipleServices(services, 'production');
   * 
   * const healthyServices = results.filter(r => r.status === 'healthy');
   * console.log(`${healthyServices.length}/${results.length} services are healthy`);
   * ```
   * 
   * @since 1.0.0
   */
  async checkMultipleServices(serviceNames: string[], namespace: string): Promise<ServiceHealthStatus[]> {
    Logger.info(`Checking health for ${serviceNames.length} services in namespace: ${namespace}`);

    const healthChecks = serviceNames.map(serviceName => 
      this.checkServiceHealth(serviceName, namespace)
    );

    const results = await Promise.allSettled(healthChecks);
    
    return results.map((result, index) => {
      if (result.status === 'fulfilled') {
        return result.value;
      } else {
        const serviceName = serviceNames[index];
        const errorMessage = result.reason instanceof Error ? result.reason.message : String(result.reason);
        
        return {
          serviceName,
          namespace,
          status: 'unknown' as const,
          pods: [],
          endpoints: [],
          lastChecked: new Date(),
          messages: [`Health check failed: ${errorMessage}`]
        };
      }
    });
  }

  /**
   * Get detailed pod status for a service.
   * 
   * @private
   * @param {string} serviceName - Service name
   * @param {string} namespace - Kubernetes namespace
   * @returns {Promise<PodHealthStatus[]>} Array of pod status information
   * @since 1.0.0
   */
  private async getPodStatus(serviceName: string, namespace: string): Promise<PodHealthStatus[]> {
    const command = new Deno.Command('kubectl', {
      args: [
        'get', 'pods',
        '-l', `app=${serviceName}`,
        '-n', namespace,
        '-o', 'json'
      ],
      stdout: 'piped',
      stderr: 'piped'
    });

    const { code, stdout, stderr } = await command.output();

    if (code !== 0) {
      const error = new TextDecoder().decode(stderr);
      throw new Error(`Failed to get pod status: ${error}`);
    }

    const output = JSON.parse(new TextDecoder().decode(stdout)) as K8sPodsResponse;
    const pods: PodHealthStatus[] = [];

    for (const pod of output.items || []) {
      const containers: ContainerStatus[] = [];
      
      for (const container of pod.status?.containerStatuses || []) {
        containers.push({
          name: container.name,
          ready: container.ready || false,
          restartCount: container.restartCount || 0,
          state: this.getContainerState(container.state),
          reason: this.getContainerStateReason(container.state)
        });
      }

      pods.push({
        name: pod.metadata?.name || 'unknown',
        phase: pod.status?.phase || 'Unknown',
        ready: this.isPodReady(pod),
        containers,
        restarts: containers.reduce((sum, c) => sum + c.restartCount, 0),
        age: this.calculateAge(pod.metadata?.creationTimestamp!)
      });
    }

    return pods;
  }

  /**
   * Get endpoint availability status for a service.
   * 
   * @private
   * @param {string} serviceName - Service name
   * @param {string} namespace - Kubernetes namespace
   * @returns {Promise<EndpointStatus[]>} Array of endpoint status information
   * @since 1.0.0
   */
  private async getEndpointStatus(serviceName: string, namespace: string): Promise<EndpointStatus[]> {
    const command = new Deno.Command('kubectl', {
      args: [
        'get', 'endpoints',
        serviceName,
        '-n', namespace,
        '-o', 'json'
      ],
      stdout: 'piped',
      stderr: 'piped'
    });

    const { code, stdout } = await command.output();

    if (code !== 0) {
      // Service might not have endpoints yet
      return [];
    }

    const output = JSON.parse(new TextDecoder().decode(stdout)) as K8sEndpointsResponse;
    const endpoints: EndpointStatus[] = [];

    for (const subset of output.subsets || []) {
      for (const address of subset.addresses || []) {
        for (const port of subset.ports || []) {
          endpoints.push({
            address: address.ip,
            port: port.port,
            available: true, // If it's in addresses (not notReadyAddresses), it's available
            responseTime: undefined // Could be enhanced with actual response time testing
          });
        }
      }

      // Also check not ready addresses
      for (const address of subset.notReadyAddresses || []) {
        for (const port of subset.ports || []) {
          endpoints.push({
            address: address.ip,
            port: port.port,
            available: false
          });
        }
      }
    }

    return endpoints;
  }

  /**
   * Determine overall service status based on pods and endpoints.
   * 
   * @private
   * @param {PodHealthStatus[]} pods - Pod status information
   * @param {EndpointStatus[]} endpoints - Endpoint status information
   * @returns {'healthy' | 'unhealthy' | 'pending'} Overall status
   * @since 1.0.0
   */
  private determineOverallStatus(
    pods: PodHealthStatus[], 
    endpoints: EndpointStatus[]
  ): 'healthy' | 'unhealthy' | 'pending' {
    if (pods.length === 0) {
      return 'pending'; // No pods found, might be starting up
    }

    const readyPods = pods.filter(pod => pod.ready && pod.phase === 'Running');
    const availableEndpoints = endpoints.filter(endpoint => endpoint.available);

    // All pods running and ready, and has available endpoints
    if (readyPods.length === pods.length && availableEndpoints.length > 0) {
      return 'healthy';
    }

    // Some pods running or endpoints available
    if (readyPods.length > 0 || availableEndpoints.length > 0) {
      return 'pending';
    }

    // No ready pods or available endpoints
    return 'unhealthy';
  }

  /**
   * Generate descriptive status messages based on health status.
   * 
   * @private
   * @param {ServiceHealthStatus} status - Service health status
   * @returns {string[]} Array of status messages
   * @since 1.0.0
   */
  private generateStatusMessages(status: ServiceHealthStatus): string[] {
    const messages: string[] = [];

    const readyPods = status.pods.filter(pod => pod.ready);
    const runningPods = status.pods.filter(pod => pod.phase === 'Running');
    const availableEndpoints = status.endpoints.filter(ep => ep.available);

    messages.push(`Pods: ${readyPods.length}/${status.pods.length} ready, ${runningPods.length}/${status.pods.length} running`);
    messages.push(`Endpoints: ${availableEndpoints.length}/${status.endpoints.length} available`);

    // Add specific issues
    const failedPods = status.pods.filter(pod => pod.phase === 'Failed');
    if (failedPods.length > 0) {
      messages.push(`Failed pods: ${failedPods.map(p => p.name).join(', ')}`);
    }

    const highRestartPods = status.pods.filter(pod => pod.restarts > 5);
    if (highRestartPods.length > 0) {
      messages.push(`High restart count: ${highRestartPods.map(p => `${p.name}(${p.restarts})`).join(', ')}`);
    }

    return messages;
  }

  /**
   * Check if a pod is ready based on its status.
   * 
   * @private
   * @param {K8sPod} pod - Kubernetes pod object
   * @returns {boolean} True if pod is ready
   * @since 1.0.0
   */
  private isPodReady(pod: K8sPod): boolean {
    const conditions = pod.status?.conditions || [];
    const readyCondition = conditions.find((c: K8sPodCondition) => c.type === 'Ready');
    return readyCondition?.status === 'True';
  }

  /**
   * Get container state from Kubernetes container status.
   * 
   * @private
   * @param {K8sContainerState} state - Container state object
   * @returns {'running' | 'waiting' | 'terminated'} Container state
   * @since 1.0.0
   */
  private getContainerState(state: K8sContainerState): 'running' | 'waiting' | 'terminated' {
    if (state?.running) return 'running';
    if (state?.waiting) return 'waiting';
    if (state?.terminated) return 'terminated';
    return 'waiting';
  }

  /**
   * Get container state reason from Kubernetes container status.
   * 
   * @private
   * @param {K8sContainerState} state - Container state object
   * @returns {string | undefined} State reason
   * @since 1.0.0
   */
  private getContainerStateReason(state: K8sContainerState): string | undefined {
    if (state?.waiting?.reason) return state.waiting.reason;
    if (state?.terminated?.reason) return state.terminated.reason;
    return undefined;
  }

  /**
   * Calculate age of a resource from creation timestamp.
   * 
   * @private
   * @param {string} creationTimestamp - ISO timestamp string
   * @returns {string} Human readable age
   * @since 1.0.0
   */
  private calculateAge(creationTimestamp: string): string {
    if (!creationTimestamp) return 'unknown';
    
    const created = new Date(creationTimestamp);
    const now = new Date();
    const diffMs = now.getTime() - created.getTime();
    
    const days = Math.floor(diffMs / (1000 * 60 * 60 * 24));
    const hours = Math.floor((diffMs % (1000 * 60 * 60 * 24)) / (1000 * 60 * 60));
    const minutes = Math.floor((diffMs % (1000 * 60 * 60)) / (1000 * 60));
    
    if (days > 0) return `${days}d${hours}h`;
    if (hours > 0) return `${hours}h${minutes}m`;
    return `${minutes}m`;
  }
}

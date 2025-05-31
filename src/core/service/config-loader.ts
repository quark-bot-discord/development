/**
 * @fileoverview Service configuration loading and management utilities.
 *
 * This module provides comprehensive configuration loading capabilities for services
 * including environment-specific configs, secret management, validation, and
 * dynamic configuration updates. It supports multiple configuration formats
 * and sources while ensuring type safety and validation.
 *
 * @module ConfigLoader
 * @since 1.0.0
 */

import { Logger } from "../../development/logger.ts";
import type { PortConfig } from "../../kubernetes/manifests/manifest-types.ts";
import type { ServiceDefinition } from "../../services/service-types.ts";
import type {
  ConfigValue,
  ConfigData,
  ConfigSchema,
  ConfigFallbacks,
  ConfigSourceType,
  ConfigLoadOptions,
  LoadedConfig,
  ConfigWatchCallback,
  ConfigChange as _ConfigChange,
} from "../../types/config-types.ts";

/**
 * Service configuration loader that handles multiple configuration sources,
 * environments, and formats with validation and watching capabilities.
 *
 * This class provides a unified interface for loading configuration from
 * various sources including files, environment variables, Kubernetes secrets,
 * and remote endpoints. It supports hot reloading, validation, and secure
 * handling of sensitive configuration data.
 *
 * @example
 * ```typescript
 * const configLoader = new ConfigLoader();
 *
 * // Load configuration for a service
 * const config = await configLoader.loadServiceConfig('web-app', {
 *   environment: 'production',
 *   includeSensitive: true,
 *   sources: ['file', 'env', 'k8s-secret']
 * });
 *
 * // Apply configuration to service definition
 * const enhanced = configLoader.applyConfigToService(serviceDefinition, config);
 *
 * // Watch for configuration changes
 * configLoader.watchConfig('web-app', (newConfig, changes) => {
 *   console.log('Configuration changed:', changes);
 *   // Update running service with new config
 * });
 * ```
 *
 * @since 1.0.0
 */
export class ConfigLoader {
  private readonly configCache = new Map<string, LoadedConfig>();
  private readonly watchers = new Map<string, Set<ConfigWatchCallback>>();
  private readonly watcherAbortControllers = new Map<string, AbortController>();

  /**
   * Type guard to check if a value is a string.
   */
  private isString(value: unknown): value is string {
    return typeof value === "string";
  }

  /**
   * Type guard to check if a value is a number.
   */
  private isNumber(value: unknown): value is number {
    return typeof value === "number";
  }

  /**
   * Convert a config value to string safely.
   */
  private toString(value: ConfigValue): string {
    if (this.isString(value)) return value;
    if (this.isNumber(value)) return value.toString();
    if (typeof value === "boolean") return value.toString();
    return String(value || "");
  }

  /**
   * Load configuration for a specific service.
   *
   * Loads configuration from multiple sources based on the provided options,
   * merges them according to priority, validates the result, and caches it
   * for future use.
   *
   * @param {string} serviceName - Name of the service
   * @param {ConfigLoadOptions} options - Configuration loading options
   * @returns {Promise<LoadedConfig>} Loaded and validated configuration
   *
   * @example
   * ```typescript
   * const loader = new ConfigLoader();
   * const config = await loader.loadServiceConfig('api-service', {
   *   environment: 'staging',
   *   includeSensitive: false,
   *   sources: ['file', 'env'],
   *   watch: true
   * });
   *
   * console.log('Database URL:', config.data.DATABASE_URL);
   * console.log('Config sources:', config.sources.length);
   * ```
   *
   * @since 1.0.0
   */
  async loadServiceConfig(
    serviceName: string,
    options: ConfigLoadOptions,
  ): Promise<LoadedConfig> {
    Logger.info(
      `Loading configuration for service: ${serviceName} (env: ${options.environment})`,
    );

    const cacheKey = `${serviceName}:${options.environment}`;

    // Check cache first
    if (this.configCache.has(cacheKey) && !options.watch) {
      Logger.info(`Returning cached configuration for ${serviceName}`);
      return this.configCache.get(cacheKey)!;
    }

    const config: LoadedConfig = {
      data: {},
      sources: [],
      environment: options.environment,
      hasSensitiveData: false,
      isValid: true,
      validationErrors: [],
      loadedAt: new Date(),
    };

    try {
      // Load from each source in priority order
      for (const sourceType of options.sources) {
        await this.loadFromSource(serviceName, sourceType, options, config);
      }

      // Apply fallbacks
      if (options.fallbacks) {
        this.applyFallbacks(config, options.fallbacks);
      }

      // Validate configuration
      if (options.schema) {
        this.validateConfig(config, options.schema);
      }

      // Cache the result
      this.configCache.set(cacheKey, config);

      // Set up watcher if requested
      if (options.watch) {
        this.setupConfigWatcher(serviceName, options);
      }

      Logger.info(
        `Configuration loaded for ${serviceName}: ${
          Object.keys(config.data).length
        } keys from ${config.sources.length} sources`,
      );
      return config;
    } catch (error) {
      const errorMessage = error instanceof Error
        ? error.message
        : String(error);
      Logger.error(
        `Failed to load configuration for ${serviceName}: ${errorMessage}`,
      );

      config.isValid = false;
      config.validationErrors.push(`Load error: ${errorMessage}`);
      return config;
    }
  }

  /**
   * Apply loaded configuration to a service definition.
   *
   * Takes a service definition and enhances it with configuration data,
   * properly handling environment variables, secrets, and other settings.
   *
   * @param {ServiceDefinition} serviceDefinition - Base service definition
   * @param {LoadedConfig} config - Loaded configuration data
   * @returns {ServiceDefinition} Enhanced service definition
   *
   * @example
   * ```typescript
   * const loader = new ConfigLoader();
   * const config = await loader.loadServiceConfig('web-app', options);
   * const enhanced = loader.applyConfigToService(baseDefinition, config);
   *
   * // Enhanced definition now includes config-driven settings
   * console.log(enhanced.env); // Environment variables from config
   * console.log(enhanced.replicas); // Scaling config from environment
   * ```
   *
   * @since 1.0.0
   */
  applyConfigToService(
    serviceDefinition: ServiceDefinition,
    config: LoadedConfig,
  ): ServiceDefinition {
    Logger.info(`Applying configuration to service: ${serviceDefinition.name}`);

    const enhanced: ServiceDefinition = { ...serviceDefinition };

    // Apply environment variables
    enhanced.env = {
      ...enhanced.env,
      ...this.extractEnvVars(config.data),
    };

    // Apply scaling configuration
    if (config.data.REPLICAS) {
      const replicas = this.toString(config.data.REPLICAS);
      const parsed = parseInt(replicas, 10);
      if (!isNaN(parsed)) {
        enhanced.replicas = parsed;
      }
    }

    // Apply resource limits
    if (config.data.MEMORY_LIMIT || config.data.CPU_LIMIT) {
      enhanced.resources = enhanced.resources || {};
      enhanced.resources.limits = enhanced.resources.limits || {};

      if (config.data.MEMORY_LIMIT) {
        enhanced.resources.limits.memory = this.toString(config.data.MEMORY_LIMIT);
      }
      if (config.data.CPU_LIMIT) {
        enhanced.resources.limits.cpu = this.toString(config.data.CPU_LIMIT);
      }
    }

    // Apply port configuration
    if (config.data.PORT || config.data.PORTS) {
      const portValue = config.data.PORT || config.data.PORTS;
      const ports = this.parsePortConfig(portValue as PortConfig);
      if (ports.length > 0) {
        enhanced.ports = ports;
      }
    }

    // Apply health check configuration
    if (config.data.HEALTH_CHECK_PATH) {
      enhanced.healthCheck = {
        path: this.toString(config.data.HEALTH_CHECK_PATH),
        port: config.data.HEALTH_CHECK_PORT
          ? parseInt(this.toString(config.data.HEALTH_CHECK_PORT), 10)
          : undefined,
      };
    }

    // Apply secrets
    if (config.hasSensitiveData) {
      enhanced.secrets = enhanced.secrets || {};
      enhanced.secrets[`${serviceDefinition.name}-config`] = this
        .extractSecrets(config.data);
    }

    // Add configuration metadata
    enhanced.env = {
      ...enhanced.env,
      CONFIG_ENVIRONMENT: config.environment,
      CONFIG_LOADED_AT: config.loadedAt.toISOString(),
      CONFIG_SOURCES: config.sources.map((s) => s.type).join(","),
    };

    Logger.info(`Configuration applied to ${serviceDefinition.name}`);
    return enhanced;
  }

  /**
   * Watch for configuration changes and call callbacks when changes occur.
   *
   * Sets up file system watchers and polling for remote sources to detect
   * configuration changes and notify registered callbacks.
   *
   * @param {string} serviceName - Name of the service to watch
   * @param {ConfigWatchCallback} callback - Function to call on changes
   *
   * @example
   * ```typescript
   * const loader = new ConfigLoader();
   *
   * loader.watchConfig('api-service', (newConfig, changes) => {
   *   console.log(`Configuration changed for api-service`);
   *   changes.forEach(change => {
   *     console.log(`${change.type}: ${change.key} = ${change.newValue}`);
   *   });
   *
   *   // Restart service or apply changes hot
   *   restartService(newConfig);
   * });
   * ```
   *
   * @since 1.0.0
   */
  watchConfig(serviceName: string, callback: ConfigWatchCallback): void {
    Logger.info(`Setting up configuration watcher for service: ${serviceName}`);

    if (!this.watchers.has(serviceName)) {
      this.watchers.set(serviceName, new Set());
    }

    this.watchers.get(serviceName)!.add(callback);
  }

  /**
   * Stop watching configuration changes for a service.
   *
   * @param {string} serviceName - Name of the service to stop watching
   * @param {ConfigWatchCallback} [callback] - Specific callback to remove (optional)
   *
   * @example
   * ```typescript
   * const loader = new ConfigLoader();
   *
   * // Stop all watchers for a service
   * loader.stopWatching('api-service');
   *
   * // Stop specific callback
   * loader.stopWatching('api-service', specificCallback);
   * ```
   *
   * @since 1.0.0
   */
  stopWatching(serviceName: string, callback?: ConfigWatchCallback): void {
    Logger.info(`Stopping configuration watcher for service: ${serviceName}`);

    if (callback && this.watchers.has(serviceName)) {
      this.watchers.get(serviceName)!.delete(callback);
    } else {
      this.watchers.delete(serviceName);

      // Stop file system watcher
      const abortController = this.watcherAbortControllers.get(serviceName);
      if (abortController) {
        abortController.abort();
        this.watcherAbortControllers.delete(serviceName);
      }
    }
  }

  /**
   * Reload configuration for a service, bypassing cache.
   *
   * @param {string} serviceName - Name of the service
   * @param {ConfigLoadOptions} options - Configuration loading options
   * @returns {Promise<LoadedConfig>} Freshly loaded configuration
   *
   * @example
   * ```typescript
   * const loader = new ConfigLoader();
   *
   * // Force reload configuration
   * const freshConfig = await loader.reloadConfig('web-app', {
   *   environment: 'production',
   *   includeSensitive: true,
   *   sources: ['file', 'k8s-secret']
   * });
   * ```
   *
   * @since 1.0.0
   */
  async reloadConfig(
    serviceName: string,
    options: ConfigLoadOptions,
  ): Promise<LoadedConfig> {
    Logger.info(`Reloading configuration for service: ${serviceName}`);

    const cacheKey = `${serviceName}:${options.environment}`;
    this.configCache.delete(cacheKey);

    return await this.loadServiceConfig(serviceName, { ...options, watch: false });
  }

  /**
   * Get cached configuration if available.
   *
   * @param {string} serviceName - Name of the service
   * @param {string} environment - Environment name
   * @returns {LoadedConfig | undefined} Cached configuration or undefined
   *
   * @since 1.0.0
   */
  getCachedConfig(
    serviceName: string,
    environment: string,
  ): LoadedConfig | undefined {
    const cacheKey = `${serviceName}:${environment}`;
    return this.configCache.get(cacheKey);
  }

  /**
   * Clear configuration cache.
   *
   * @param {string} [serviceName] - Specific service to clear (optional)
   *
   * @example
   * ```typescript
   * const loader = new ConfigLoader();
   *
   * // Clear all cached configs
   * loader.clearCache();
   *
   * // Clear cache for specific service
   * loader.clearCache('web-app');
   * ```
   *
   * @since 1.0.0
   */
  clearCache(serviceName?: string): void {
    if (serviceName) {
      // Clear all environments for specific service
      const keysToDelete = Array.from(this.configCache.keys())
        .filter((key) => key.startsWith(`${serviceName}:`));

      keysToDelete.forEach((key) => this.configCache.delete(key));
      Logger.info(`Cleared configuration cache for service: ${serviceName}`);
    } else {
      this.configCache.clear();
      Logger.info("Cleared all configuration cache");
    }
  }

  /**
   * Load configuration from a specific source.
   *
   * @private
   * @param {string} serviceName - Service name
   * @param {ConfigSourceType} sourceType - Type of source to load from
   * @param {ConfigLoadOptions} options - Loading options
   * @param {LoadedConfig} config - Config object to update
   * @since 1.0.0
   */
  private async loadFromSource(
    serviceName: string,
    sourceType: ConfigSourceType,
    options: ConfigLoadOptions,
    config: LoadedConfig,
  ): Promise<void> {
    Logger.info(`Loading configuration from source: ${sourceType}`);

    switch (sourceType) {
      case "file":
        await this.loadFromFile(serviceName, options, config);
        break;
      case "env":
        this.loadFromEnv(serviceName, options, config);
        break;
      case "k8s-secret":
        await this.loadFromK8sSecret(serviceName, options, config);
        break;
      case "k8s-configmap":
        await this.loadFromK8sConfigMap(serviceName, options, config);
        break;
      case "remote":
        this.loadFromRemote(serviceName, options, config);
        break;
      case "memory":
        this.loadFromMemory(serviceName, options, config);
        break;
      default:
        Logger.warn(`Unknown configuration source type: ${sourceType}`);
    }
  }

  /**
   * Load configuration from files.
   *
   * @private
   * @param {string} serviceName - Service name
   * @param {ConfigLoadOptions} options - Loading options
   * @param {LoadedConfig} config - Config object to update
   * @since 1.0.0
   */
  private async loadFromFile(
    serviceName: string,
    options: ConfigLoadOptions,
    config: LoadedConfig,
  ): Promise<void> {
    const configPaths = [
      `./config/${serviceName}.json`,
      `./config/${serviceName}.${options.environment}.json`,
      `./config/${options.environment}.json`,
      `./.env`,
      `./.env.${options.environment}`,
      `./repos/${serviceName}/.env`,
      `./repos/${serviceName}/.env.${options.environment}`,
    ];

    for (const configPath of configPaths) {
      try {
        const stat = await Deno.stat(configPath);

        if (configPath.endsWith(".json")) {
          const fileContent = await Deno.readTextFile(configPath);
          const jsonData = JSON.parse(fileContent);
          Object.assign(config.data, jsonData);
        } else if (configPath.includes(".env")) {
          const envData = await this.parseEnvFile(configPath);
          Object.assign(config.data, envData);

          if (this.containsSensitiveData(envData)) {
            config.hasSensitiveData = true;
          }
        }

        config.sources.push({
          type: "file",
          path: configPath,
          lastModified: stat.mtime || new Date(),
        });

        Logger.info(`Loaded configuration from file: ${configPath}`);
      } catch {
        // File doesn't exist or can't be read, continue
      }
    }
  }

  /**
   * Load configuration from environment variables.
   *
   * @private
   * @param {string} serviceName - Service name
   * @param {ConfigLoadOptions} _options - Loading options
   * @param {LoadedConfig} config - Config object to update
   * @since 1.0.0
   */
  private loadFromEnv(
    serviceName: string,
    _options: ConfigLoadOptions,
    config: LoadedConfig,
  ): void {
    const envVars: Record<string, string> = {};
    const servicePrefix = serviceName.toUpperCase().replace(/-/g, "_");

    // Load environment variables with service prefix
    for (const [key, value] of Object.entries(Deno.env.toObject())) {
      if (key.startsWith(servicePrefix) || this.isCommonEnvVar(key)) {
        envVars[key] = value;

        if (this.isSensitiveEnvVar(key)) {
          config.hasSensitiveData = true;
        }
      }
    }

    Object.assign(config.data, envVars);

    if (Object.keys(envVars).length > 0) {
      config.sources.push({
        type: "env",
        path: "environment",
        lastModified: new Date(),
      });

      Logger.info(
        `Loaded ${Object.keys(envVars).length} environment variables`,
      );
    }
  }

  /**
   * Load configuration from Kubernetes secrets.
   *
   * @private
   * @param {string} serviceName - Service name
   * @param {ConfigLoadOptions} options - Loading options
   * @param {LoadedConfig} config - Config object to update
   * @since 1.0.0
   */
  private async loadFromK8sSecret(
    serviceName: string,
    options: ConfigLoadOptions,
    config: LoadedConfig,
  ): Promise<void> {
    if (!options.includeSensitive) {
      Logger.info("Skipping K8s secrets (includeSensitive=false)");
      return;
    }

    const secretNames = [
      `${serviceName}-secrets`,
      `${serviceName}-config`,
      `${options.environment}-secrets`,
    ];

    for (const secretName of secretNames) {
      try {
        const command = new Deno.Command("kubectl", {
          args: ["get", "secret", secretName, "-o", "json"],
          stdout: "piped",
          stderr: "piped",
        });

        const { code, stdout } = await command.output();

        if (code === 0) {
          const secret = JSON.parse(new TextDecoder().decode(stdout));
          const secretData: Record<string, string> = {};

          for (const [key, value] of Object.entries(secret.data || {})) {
            secretData[key] = atob(value as string); // Base64 decode
          }

          Object.assign(config.data, secretData);
          config.hasSensitiveData = true;

          config.sources.push({
            type: "k8s-secret",
            path: secretName,
            lastModified: new Date(secret.metadata?.creationTimestamp),
          });

          Logger.info(`Loaded configuration from K8s secret: ${secretName}`);
        }
      } catch (error) {
        Logger.warn(
          `Failed to load K8s secret ${secretName}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  /**
   * Load configuration from Kubernetes ConfigMaps.
   *
   * @private
   * @param {string} serviceName - Service name
   * @param {ConfigLoadOptions} options - Loading options
   * @param {LoadedConfig} config - Config object to update
   * @since 1.0.0
   */
  private async loadFromK8sConfigMap(
    serviceName: string,
    options: ConfigLoadOptions,
    config: LoadedConfig,
  ): Promise<void> {
    const configMapNames = [
      `${serviceName}-config`,
      `${options.environment}-config`,
    ];

    for (const configMapName of configMapNames) {
      try {
        const command = new Deno.Command("kubectl", {
          args: ["get", "configmap", configMapName, "-o", "json"],
          stdout: "piped",
          stderr: "piped",
        });

        const { code, stdout } = await command.output();

        if (code === 0) {
          const configMap = JSON.parse(new TextDecoder().decode(stdout));
          Object.assign(config.data, configMap.data || {});

          config.sources.push({
            type: "k8s-configmap",
            path: configMapName,
            lastModified: new Date(configMap.metadata?.creationTimestamp),
          });

          Logger.info(
            `Loaded configuration from K8s ConfigMap: ${configMapName}`,
          );
        }
      } catch (error) {
        Logger.warn(
          `Failed to load K8s ConfigMap ${configMapName}: ${
            error instanceof Error ? error.message : String(error)
          }`,
        );
      }
    }
  }

  /**
   * Load configuration from remote sources.
   *
   * @private
   * @param {string} _serviceName - Service name
   * @param {ConfigLoadOptions} _options - Loading options
   * @param {LoadedConfig} _config - Config object to update
   * @since 1.0.0
   */
  private loadFromRemote(
    _serviceName: string,
    _options: ConfigLoadOptions,
    _config: LoadedConfig,
  ): void {
    // Implementation for remote config sources (etcd, consul, etc.)
    Logger.info("Remote configuration loading not yet implemented");
  }

  /**
   * Load configuration from memory cache.
   *
   * @private
   * @param {string} _serviceName - Service name
   * @param {ConfigLoadOptions} _options - Loading options
   * @param {LoadedConfig} _config - Config object to update
   * @since 1.0.0
   */
  private loadFromMemory(
    _serviceName: string,
    _options: ConfigLoadOptions,
    _config: LoadedConfig,
  ): void {
    // Implementation for in-memory configuration
    Logger.info("Memory configuration loading not yet implemented");
  }

  /**
   * Parse .env file format.
   *
   * @private
   * @param {string} filePath - Path to .env file
   * @returns {Promise<Record<string, string>>} Parsed environment variables
   * @since 1.0.0
   */
  private async parseEnvFile(
    filePath: string,
  ): Promise<Record<string, string>> {
    const content = await Deno.readTextFile(filePath);
    const envVars: Record<string, string> = {};

    for (const line of content.split("\n")) {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith("#")) {
        const [key, ...valueParts] = trimmed.split("=");
        if (key && valueParts.length > 0) {
          const value = valueParts.join("=").replace(/^["']|["']$/g, ""); // Remove quotes
          envVars[key.trim()] = value;
        }
      }
    }

    return envVars;
  }

  /**
   * Apply fallback values to configuration.
   *
   * @private
   * @param {LoadedConfig} config - Configuration to update
   * @param {ConfigFallbacks} fallbacks - Fallback values
   * @since 1.0.0
   */
  private applyFallbacks(
    config: LoadedConfig,
    fallbacks: ConfigFallbacks,
  ): void {
    for (const [key, value] of Object.entries(fallbacks)) {
      if (!(key in config.data)) {
        config.data[key] = value;
      }
    }
  }

  /**
   * Validate configuration against schema.
   *
   * @private
   * @param {LoadedConfig} config - Configuration to validate
   * @param {ConfigSchema} schema - Validation schema
   * @since 1.0.0
   */
  private validateConfig(
    config: LoadedConfig,
    schema: ConfigSchema,
  ): void {
    // Basic validation - could be enhanced with a proper schema validation library
    for (const [key, rules] of Object.entries(schema)) {
      const value = config.data[key];

      if (
        rules.required &&
        (value === undefined || value === null || value === "")
      ) {
        config.isValid = false;
        config.validationErrors.push(
          `Required configuration key missing: ${key}`,
        );
      }

      if (value !== undefined && rules.type) {
        const actualType = typeof value;
        if (actualType !== rules.type) {
          config.isValid = false;
          config.validationErrors.push(
            `Configuration key ${key} has wrong type: expected ${rules.type}, got ${actualType}`,
          );
        }
      }
    }
  }

  /**
   * Extract environment variables from configuration data.
   *
   * @private
   * @param {ConfigData} data - Configuration data
   * @returns {Record<string, string>} Environment variables
   * @since 1.0.0
   */
  private extractEnvVars(data: ConfigData): Record<string, string> {
    const envVars: Record<string, string> = {};

    for (const [key, value] of Object.entries(data)) {
      if (!this.isSensitiveEnvVar(key)) {
        envVars[key] = this.toString(value);
      }
    }

    return envVars;
  }

  /**
   * Extract secrets from configuration data.
   *
   * @private
   * @param {ConfigData} data - Configuration data
   * @returns {Record<string, string>} Secret data
   * @since 1.0.0
   */
  private extractSecrets(data: ConfigData): Record<string, string> {
    const secrets: Record<string, string> = {};

    for (const [key, value] of Object.entries(data)) {
      if (this.isSensitiveEnvVar(key)) {
        secrets[key] = this.toString(value);
      }
    }

    return secrets;
  }

  /**
   * Parse port configuration from string or object.
   *
   * @private
   * @param {PortConfig} portConfig
   * @returns {Array<{name: string, port: number, targetPort?: number}>} Parsed ports
   * @since 1.0.0
   */
  private parsePortConfig(
    portConfig: PortConfig,
  ): Array<{ name: string; port: number; targetPort?: number }> {
    if (typeof portConfig === "string") {
      const port = parseInt(portConfig, 10);
      return [{ name: "http", port, targetPort: port }];
    }

    if (Array.isArray(portConfig)) {
      return portConfig.map((p, i) => ({
        name: `port-${i}`,
        port: parseInt(p, 10),
        targetPort: parseInt(p, 10),
      }));
    }

    return [];
  }

  /**
   * Check if configuration data contains sensitive information.
   *
   * @private
   * @param {Record<string, unknown>} data - Configuration data
   * @returns {boolean} True if contains sensitive data
   * @since 1.0.0
   */
  private containsSensitiveData(data: Record<string, unknown>): boolean {
    return Object.keys(data).some((key) => this.isSensitiveEnvVar(key));
  }

  /**
   * Check if an environment variable key is sensitive.
   *
   * @private
   * @param {string} key - Environment variable key
   * @returns {boolean} True if sensitive
   * @since 1.0.0
   */
  private isSensitiveEnvVar(key: string): boolean {
    const sensitivePatterns = [
      /password/i,
      /secret/i,
      /key/i,
      /token/i,
      /credential/i,
      /auth/i,
      /api_key/i,
      /private/i,
    ];

    return sensitivePatterns.some((pattern) => pattern.test(key));
  }

  /**
   * Check if an environment variable is commonly used.
   *
   * @private
   * @param {string} key - Environment variable key
   * @returns {boolean} True if common
   * @since 1.0.0
   */
  private isCommonEnvVar(key: string): boolean {
    const commonVars = [
      "NODE_ENV",
      "PORT",
      "HOST",
      "DATABASE_URL",
      "REDIS_URL",
      "LOG_LEVEL",
      "DEBUG",
    ];

    return commonVars.includes(key);
  }

  /**
   * Set up configuration file watcher.
   *
   * @private
   * @param {string} serviceName - Service name
   * @param {ConfigLoadOptions} _options - Loading options
   * @since 1.0.0
   */
  private setupConfigWatcher(
    serviceName: string,
    _options: ConfigLoadOptions,
  ): void {
    // TODO: set up file system watchers for config files
    Logger.info(
      `Configuration watcher setup for ${serviceName} (implementation pending)`,
    );
  }
}

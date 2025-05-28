/**
 * @fileoverview Legacy development environment class with modular architecture.
 * 
 * This class has been refactored to use the new modular architecture while maintaining
 * backward compatibility. New development should use the individual modules directly
 * for better separation of concerns and testability.
 * 
 * @example
 * ```typescript
 * import { DevEnvironment } from './dev-environment.ts';
 * 
 * const devEnv = new DevEnvironment();
 * await devEnv.setup();
 * ```
 * 
 * @deprecated Consider using individual modules from './modules/' for new development
 * @author Development Environment Team
 * @since 1.0.0
 */

import { EnvironmentInitializer } from "./modules/environment-initializer.ts";

/**
 * Legacy development environment management class.
 * 
 * This class provides backward compatibility with existing code while delegating
 * operations to the new modular architecture. For new development, consider using
 * the individual modules directly for better separation of concerns.
 * 
 * @example
 * ```typescript
 * const devEnv = new DevEnvironment();
 * 
 * // Complete environment setup
 * await devEnv.setup();
 * 
 * // Service selection
 * const services = await devEnv.selectServices();
 * 
 * // Cleanup
 * await devEnv.cleanup();
 * ```
 * 
 * @deprecated Use individual modules from './modules/' for new development
 */
export class DevEnvironment {
  /** Environment initializer that orchestrates all operations */
  private readonly environmentInitializer: EnvironmentInitializer;

  /**
   * Creates a new DevEnvironment instance.
   * 
   * @example
   * ```typescript
   * const devEnv = new DevEnvironment();
   * ```
   */
  constructor() {
    this.environmentInitializer = new EnvironmentInitializer();
  }

  /**
   * Performs complete development environment setup.
   * 
   * @returns A promise that resolves when setup is complete
   * 
   * @example
   * ```typescript
   * await devEnv.setup();
   * ```
   * 
   * @throws {Error} When setup fails
   */
  async setup(): Promise<void> {
    return await this.environmentInitializer.setup();
  }

  /**
   * Selects services based on development profiles.
   * 
   * @returns A promise that resolves to an array of selected service names
   * 
   * @example
   * ```typescript
   * const services = await devEnv.selectServices();
   * ```
   */
  async selectServices(): Promise<string[]> {
    return await this.environmentInitializer.getProfileManager().selectServices();
  }

  /**
   * Sets up a Kubernetes cluster for the specified services.
   * 
   * @param services - Array of service names to deploy
   * 
   * @returns A promise that resolves when cluster setup is complete
   * 
   * @example
   * ```typescript
   * const services = ['frontend', 'api'];
   * await devEnv.setupCluster(services);
   * ```
   */
  async setupCluster(services: string[]): Promise<void> {
    return await this.environmentInitializer.getClusterSelector().setupCluster(services);
  }

  /**
   * Sets up repositories for the specified services.
   * 
   * @param services - Array of service names to set up repositories for
   * 
   * @returns A promise that resolves when repository setup is complete
   * 
   * @example
   * ```typescript
   * const services = ['frontend', 'api'];
   * await devEnv.setupRepositories(services);
   * ```
   */
  async setupRepositories(services: string[]): Promise<void> {
    return await this.environmentInitializer.getWorkspaceManager().setupRepositories(services);
  }

  /**
   * Performs complete development environment cleanup.
   * 
   * @returns A promise that resolves when cleanup is complete
   * 
   * @example
   * ```typescript
   * await devEnv.cleanup();
   * ```
   */
  async cleanup(): Promise<void> {
    return await this.environmentInitializer.cleanup();
  }

  /**
   * Updates Git submodules to their latest versions.
   * 
   * @param autoCommit - Whether to automatically commit changes
   * 
   * @returns A promise that resolves when submodule update is complete
   * 
   * @example
   * ```typescript
   * await devEnv.updateSubmodules(true);
   * ```
   */
  async updateSubmodules(autoCommit = true): Promise<void> {
    return await this.environmentInitializer.updateSubmodules(autoCommit);
  }

  /**
   * Gets the environment initializer for advanced operations.
   * 
   * @returns The environment initializer instance
   * 
   * @example
   * ```typescript
   * const initializer = devEnv.getEnvironmentInitializer();
   * const validation = await initializer.validateEnvironment();
   * ```
   */
  getEnvironmentInitializer(): EnvironmentInitializer {
    return this.environmentInitializer;
  }
}

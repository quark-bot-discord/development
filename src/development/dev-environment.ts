/**
 * @fileoverview Main development environment management interface.
 * 
 * This module provides the primary interface for development environment setup and management.
 * It exports both the new modular components and maintains backward compatibility with
 * the legacy DevEnvironment class.
 * 
 * @author Development Environment Team
 * @since 2.0.0
 */

// Export modular components
export {
  ClusterSelector,
  ProfileManager,
  WorkspaceManager,
  EnvironmentInitializer
} from './modules/index.ts';

// Legacy DevEnvironment class for backward compatibility
import { EnvironmentInitializer } from './modules/environment-initializer.ts';

/**
 * Legacy DevEnvironment class for backward compatibility.
 * 
 * @deprecated Use the individual modular components instead:
 * - ClusterSelector for cluster setup
 * - ProfileManager for profile selection
 * - WorkspaceManager for repository management
 * - EnvironmentInitializer for complete environment setup
 * 
 * @since 1.0.0
 */
export class DevEnvironment {
  private environmentInitializer: EnvironmentInitializer;

  constructor() {
    this.environmentInitializer = new EnvironmentInitializer();
  }

  /**
   * @deprecated Use EnvironmentInitializer.setup() instead
   */
  async setup(): Promise<void> {
    return await this.environmentInitializer.setup();
  }

  /**
   * @deprecated Use EnvironmentInitializer.cleanup() instead
   */
  async cleanup(): Promise<void> {
    return await this.environmentInitializer.cleanup();
  }

  /**
   * @deprecated Use WorkspaceManager.updateSubmodules() instead
   */
  async updateSubmodules(autoCommit = true): Promise<void> {
    const { WorkspaceManager } = await import('./modules/index.ts');
    const workspaceManager = new WorkspaceManager();
    return await workspaceManager.updateSubmodules(autoCommit);
  }
}
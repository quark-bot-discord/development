/**
 * @fileoverview Manages development profile selection and service configuration.
 * 
 * This module provides functionality for selecting development profiles and individual services
 * for development environments. It offers predefined profiles for common development scenarios
 * and allows custom service selection for specialized needs.
 * 
 * @example
 * ```typescript
 * import { ProfileManager } from './profile-manager.ts';
 * 
 * const profileManager = new ProfileManager();
 * const services = await profileManager.selectServices();
 * console.log('Selected services:', services);
 * ```
 * 
 * @author Development Environment Team
 * @since 2.0.0
 */

import inquirer from "inquirer";
import { SERVICE_GROUPS, DEVELOPMENT_PROFILES } from "../../../q4/const/constants.ts";

/**
 * Manages development profile selection and service configuration.
 * 
 * The ProfileManager provides an interactive interface for selecting predefined
 * development profiles or creating custom service configurations. It handles
 * the logic for profile-based service selection and custom service group selection.
 * 
 * @example
 * ```typescript
 * const manager = new ProfileManager();
 * 
 * // Interactive service selection
 * const services = await manager.selectServices();
 * 
 * // Get available profiles
 * const profiles = manager.getAvailableProfiles();
 * 
 * // Get services from specific profile
 * const frontendServices = manager.getProfileServices('frontend-only');
 * ```
 */
export class ProfileManager {
  /**
   * Creates a new ProfileManager instance.
   * 
   * @example
   * ```typescript
   * const manager = new ProfileManager();
   * ```
   */
  constructor() {}

  /**
   * Interactively selects services based on development profiles or custom selection.
   * 
   * Presents the user with available development profiles and allows them to either:
   * - Select a predefined profile that includes a curated set of services
   * - Choose custom selection to manually pick service groups
   * 
   * @returns A promise that resolves to an array of selected service names
   * 
   * @example
   * ```typescript
   * // User selects from predefined profiles or custom selection
   * const services = await manager.selectServices();
   * 
   * // Example output for 'frontend-only' profile:
   * // ['frontend', 'api-gateway', 'auth-service']
   * 
   * // Example output for custom selection:
   * // ['frontend', 'backend', 'database', 'cache']
   * ```
   * 
   * @throws {Error} When user interaction fails or invalid selections are made
   */
  async selectServices(): Promise<string[]> {
    const { profile } = await inquirer.prompt([
      {
        type: "list",
        name: "profile",
        message: "Select a development profile:",
        choices: [
          ...Object.entries(DEVELOPMENT_PROFILES).map(([key, profile]) => ({
            name: `${profile.name} - ${profile.description}`,
            value: key,
          })),
          {
            name: "Custom - Select individual services",
            value: "custom",
          },
        ],
      },
    ]);

    if (profile !== "custom") {
      return DEVELOPMENT_PROFILES[profile as keyof typeof DEVELOPMENT_PROFILES]
        .services;
    }

    return await this.selectCustomServices();
  }

  /**
   * Handles custom service selection through service group selection.
   * 
   * Presents the user with available service groups and allows them to select
   * multiple groups. The selected groups are then flattened to return a list
   * of individual services.
   * 
   * @returns A promise that resolves to an array of selected service names
   * 
   * @example
   * ```typescript
   * // User selects core and frontend service groups
   * const services = await manager.selectCustomServices();
   * // Returns: ['api-gateway', 'auth-service', 'frontend', 'web-app']
   * ```
   * 
   * @private
   */
  private async selectCustomServices(): Promise<string[]> {
    const { selectedGroups } = await inquirer.prompt([
      {
        type: "checkbox",
        name: "selectedGroups",
        message: "Select service groups:",
        choices: Object.values(SERVICE_GROUPS).map((group) => ({
          name: group.name,
          value: group.services,
          checked: false,
        })),
      },
    ]);

    return selectedGroups.flat();
  }

  /**
   * Gets the list of available development profiles.
   * 
   * Returns metadata about all available development profiles including
   * their names, descriptions, and associated services.
   * 
   * @returns An object containing all available development profiles
   * 
   * @example
   * ```typescript
   * const profiles = manager.getAvailableProfiles();
   * 
   * Object.entries(profiles).forEach(([key, profile]) => {
   *   console.log(`${key}: ${profile.name} - ${profile.description}`);
   *   console.log(`Services: ${profile.services.join(', ')}`);
   * });
   * ```
   */
  getAvailableProfiles(): typeof DEVELOPMENT_PROFILES {
    return DEVELOPMENT_PROFILES;
  }

  /**
   * Gets the services associated with a specific development profile.
   * 
   * @param profileKey - The key of the development profile
   * @returns An array of service names for the specified profile
   * 
   * @example
   * ```typescript
   * const services = manager.getProfileServices('full-stack');
   * console.log('Full stack services:', services);
   * // Output: ['frontend', 'api-gateway', 'user-service', 'auth-service', 'database']
   * ```
   * 
   * @throws {Error} When the specified profile does not exist
   */
  getProfileServices(profileKey: keyof typeof DEVELOPMENT_PROFILES): string[] {
    const profile = DEVELOPMENT_PROFILES[profileKey];
    if (!profile) {
      throw new Error(`Profile '${profileKey}' does not exist`);
    }
    return profile.services;
  }

  /**
   * Gets information about a specific development profile.
   * 
   * @param profileKey - The key of the development profile
   * @returns The profile object containing name, description, and services
   * 
   * @example
   * ```typescript
   * const profile = manager.getProfileInfo('backend-only');
   * console.log(`Profile: ${profile.name}`);
   * console.log(`Description: ${profile.description}`);
   * console.log(`Services: ${profile.services.join(', ')}`);
   * ```
   * 
   * @throws {Error} When the specified profile does not exist
   */
  getProfileInfo(profileKey: keyof typeof DEVELOPMENT_PROFILES): typeof DEVELOPMENT_PROFILES[keyof typeof DEVELOPMENT_PROFILES] {
    const profile = DEVELOPMENT_PROFILES[profileKey];
    if (!profile) {
      throw new Error(`Profile '${profileKey}' does not exist`);
    }
    return profile;
  }

  /**
   * Gets the list of available service groups.
   * 
   * Returns metadata about all available service groups including
   * their names and associated services.
   * 
   * @returns An object containing all available service groups
   * 
   * @example
   * ```typescript
   * const groups = manager.getServiceGroups();
   * 
   * Object.values(groups).forEach(group => {
   *   console.log(`${group.name}: ${group.services.join(', ')}`);
   * });
   * ```
   */
  getServiceGroups(): typeof SERVICE_GROUPS {
    return SERVICE_GROUPS;
  }

  /**
   * Validates that all services in a list are available in the system.
   * 
   * @param services - Array of service names to validate
   * @returns True if all services are valid, false otherwise
   * 
   * @example
   * ```typescript
   * const services = ['frontend', 'api-gateway', 'unknown-service'];
   * const isValid = manager.validateServices(services);
   * console.log('All services valid:', isValid); // false
   * ```
   */
  validateServices(services: string[]): boolean {
    const allServices = new Set<string>();
    
    // Collect all services from all groups
    Object.values(SERVICE_GROUPS).forEach(group => {
      group.services.forEach(service => allServices.add(service));
    });

    // Check if all provided services exist
    return services.every(service => allServices.has(service));
  }

  /**
   * Gets services that are invalid (not found in any service group).
   * 
   * @param services - Array of service names to check
   * @returns Array of service names that are not valid
   * 
   * @example
   * ```typescript
   * const services = ['frontend', 'api-gateway', 'unknown-service'];
   * const invalid = manager.getInvalidServices(services);
   * console.log('Invalid services:', invalid); // ['unknown-service']
   * ```
   */
  getInvalidServices(services: string[]): string[] {
    const allServices = new Set<string>();
    
    // Collect all services from all groups
    Object.values(SERVICE_GROUPS).forEach(group => {
      group.services.forEach(service => allServices.add(service));
    });

    // Return services that don't exist
    return services.filter(service => !allServices.has(service));
  }
}

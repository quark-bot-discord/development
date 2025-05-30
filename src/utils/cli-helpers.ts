import inquirer from "inquirer";
import { ConfigManager } from "../core/config-manager.ts";
import { SERVICE_GROUPS } from "../../q4/const/constants.ts";

/**
 * Get all available services from all service groups
 */
export function getAllServices(): string[] {
  return Object.values(SERVICE_GROUPS)
    .flatMap((group) => group.services)
    .sort();
}

/**
 * Get local services for autocompletion
 */
export function getLocalServices(): string[] {
  const config = ConfigManager.getInstance();
  return Object.keys(config.getLocalServices());
}

/**
 * Create grouped choices for inquirer with optional filtering
 */
export function createGroupedChoices(filterServices?: (service: string) => boolean) {
  return Object.entries(SERVICE_GROUPS).flatMap(([groupName, group]) => {
    const groupServices = filterServices
      ? group.services.filter(filterServices)
      : group.services;

    return groupServices.length > 0
      ? [
        new inquirer.Separator(`=== ${groupName} ===`),
        ...groupServices.map((service) => ({
          name: service,
          value: service,
          short: service,
        })),
      ]
      : [];
  });
}

/**
 * Get service namespace based on service group
 */
export function getServiceNamespace(service: string): string {
  for (const [type, group] of Object.entries(SERVICE_GROUPS)) {
    if (group.services.includes(service)) {
      switch (type) {
        case "core":
          return "core-services";
        case "apps":
        case "web":
        case "tools":
          return "app-services";
        default:
          return "other-services";
      }
    }
  }
  return "other-services";
}

/**
 * Convert ServiceDefinition command to script string
 */
export function commandToScript(
  command: { type: string; run: string[] },
): string | undefined {
  if (!command || !command.type || !command.run || command.run.length === 0) {
    return undefined;
  }
  return `${command.type} ${command.run.join(" ")}`;
}

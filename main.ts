#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env --allow-run --allow-net

import { parseArgs } from "@std/cli";
import inquirer from "inquirer";
import { DevEnvironment } from "./src/development/dev-environment.ts";
import { ConfigManager } from "./src/core/config-manager.ts";
import { SERVICE_GROUPS } from "./q4/const/constants.ts";
import { Logger } from "./src/development/logger.ts";
import { getApplicationServices } from "./src/services/service-loader.ts";
import { ServiceRunner } from "./src/services/service-runner.ts";

// Helper function to get all available services
function getAllServices(): string[] {
  return Object.values(SERVICE_GROUPS)
    .flatMap((group) => group.services)
    .sort();
}

// Helper function to get local services for autocompletion
function getLocalServices(): string[] {
  const config = ConfigManager.getInstance();
  return Object.keys(config.getLocalServices());
}

// Helper function to create grouped choices for inquirer
function createGroupedChoices(filterServices?: (service: string) => boolean) {
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

// Helper function to get service namespace
function getServiceNamespace(service: string): string {
  for (const [type, group] of Object.entries(SERVICE_GROUPS)) {
    if (group.services.includes(service)) {
      switch (type) {
        case "core": return "core-services";
        case "apps": 
        case "web": 
        case "tools": return "app-services";
        default: return "other-services";
      }
    }
  }
  return "other-services";
}

// Helper function to convert ServiceDefinition command to script
function commandToScript(command: { type: string; run: string[] }): string {
  return `${command.type} ${command.run.join(' ')}`;
}

const devEnv = new DevEnvironment();
const config = ConfigManager.getInstance();

const args = parseArgs(Deno.args, {
  string: ["command"],
  boolean: ["help"],
  alias: {
    h: "help",
  },
});

const command = args._[0] as string;
const serviceArg = args._[1] as string;

if (args.help || !command) {
  Logger.info(`
Usage: quark <command>

Commands:
  setup                 Setup development environment
  add    [service]      Add local services (interactive if no service specified)
  remove [service]      Remove local services (interactive if no service specified)
  start                 Start all configured local services
  cleanup               Clean up development environment
  list-services         List all available services (used for shell completion)
  update-submodules     Update all submodules to their latest versions
  git                   Display Git aliases and usage help
`);
  self.close();
}

// Main command handling
(async () => {
  try {
    switch (command) {
      case "setup": {
        await devEnv.setup();
        break;
      }

      case "add": {
        await config.load();
        const applicationServices = await getApplicationServices();

        if (serviceArg) {
          // Direct service addition mode
          const allServices = getAllServices();
          if (!allServices.includes(serviceArg)) {
            Logger.error(`Invalid service: ${serviceArg}`);
            Logger.error("Available services:");
            Logger.info(allServices.join(", "));
            Deno.exit(1);
          }

          if (SERVICE_GROUPS.core.services.includes(serviceArg)) {
            Logger.error(`Cannot add infrastructure service ${serviceArg} as a local service`);
            Deno.exit(1);
          }

          if (getLocalServices().includes(serviceArg)) {
            Logger.error(`Service ${serviceArg} is already configured as local`);
            Deno.exit(1);
          }

          const repoPath = `/workspace/repos/${serviceArg}`;
          const appConfig = applicationServices[serviceArg];
          if (!appConfig) {
            Logger.error(`No application configuration found for service: ${serviceArg}`);
            Deno.exit(1);
          }
          await config.addLocalService(serviceArg, {
            repoPath,
            script: commandToScript(appConfig.command!),
            env: {},
            namespace: getServiceNamespace(serviceArg)
          });
          Logger.info(`Added local service: ${serviceArg}`);
        } else {
          // Interactive selection mode
          const choices = createGroupedChoices(
            (service) => !getLocalServices().includes(service) && !SERVICE_GROUPS.core.services.includes(service),
          );

          if (choices.length === 0) {
            Logger.error("No services available to add");
            Deno.exit(1);
          }

          const { selectedServices } = await inquirer.prompt(
            {
              type: "checkbox",
              name: "selectedServices",
              message: "Select services to add:",
              choices,
              pageSize: 20,
              loop: false,
              validate: (input) => {
                if (input.length === 0) {
                  return "Please select at least one service";
                }
                return true;
              },
            },
          );

          if (selectedServices && selectedServices.length > 0) {
            for (const service of selectedServices) {
              if (SERVICE_GROUPS.core.services.includes(service)) {
                Logger.warn(`Skipping infrastructure service ${service}`);
                continue;
              }
              
              const repoPath = `/workspace/repos/${service}`;
              const appConfig = applicationServices[service];
              if (!appConfig) {
                Logger.error(`No application configuration found for service: ${service}`);
                continue;
              }
              await config.addLocalService(service, {
                repoPath,
                script: commandToScript(appConfig.command!),
                env: {},
                namespace: getServiceNamespace(service)
              });
              Logger.info(`Added local service: ${service}`);
            }
          }
        }
        break;
      }

      case "remove": {
        await config.load();
        const localServices = getLocalServices();

        if (serviceArg) {
          // Direct service removal mode
          if (!localServices.includes(serviceArg)) {
            Logger.error(`Service ${serviceArg} is not configured as local`);
            if (localServices.length > 0) {
              Logger.error("Currently configured local services:");
              Logger.info(localServices.join(", "));
            }
            Deno.exit(1);
          }

          await config.removeLocalService(serviceArg);
          Logger.info(`Removed local service: ${serviceArg}`);
        } else {
          // Interactive selection mode
          if (localServices.length === 0) {
            Logger.error("No local services configured");
            Deno.exit(1);
          }

          const { selectedServices } = await inquirer.prompt(
            {
              type: "checkbox",
              name: "selectedServices",
              message: "Select services to remove:",
              choices: localServices.map((service) => ({
                name: service,
                value: service,
                short: service,
              })),
              pageSize: 20,
              loop: false,
              validate: (input) => {
                if (input.length === 0) {
                  return "Please select at least one service";
                }
                return true;
              },
            },
          );

          if (selectedServices && selectedServices.length > 0) {
            for (const service of selectedServices) {
              await config.removeLocalService(service);
              Logger.info(`Removed local service: ${service}`);
            }
          }
        }
        break;
      }

      case "start": {
        await config.load();
        const localServices = config.getLocalServices();
        await ServiceRunner.getInstance().startAllServices(localServices);
        break;
      }
      case "list-services": {
        Logger.info(getAllServices().join("\n"));
        break;
      }
      case "cleanup": {
        await devEnv.cleanup();
        break;
      }
      case "update-submodules": {
        const { autoCommit } = await inquirer.prompt([{
          type: 'confirm',
          name: 'autoCommit',
          message: 'Automatically commit and push submodule updates?',
          default: true,
        }]);
        await devEnv.updateSubmodules(autoCommit);
        break;
      }
      case "git": {
        // Read and display the git aliases help file
        try {
          const helpPath = new URL("./.devcontainer/git-aliases-help.txt", import.meta.url).pathname;
          const helpText = await Deno.readTextFile(helpPath);
          Logger.info(helpText);
        } catch (_error) {
          Logger.error("Git help file not found. Make sure to run the git setup script in your dev container.");
        }
        break;
      }

      default:
        Logger.error(`Unknown command: ${command}`);
        Deno.exit(1);
    }
  } catch (error) {
    Logger.error(
      `Error: ${error instanceof Error ? error.message : String(error)}`
    );
    Deno.exit(1);
  }
  self.close();
})();

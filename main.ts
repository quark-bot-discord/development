#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env --allow-run --allow-net

import { parseArgs } from "@std/cli";
import inquirer from "inquirer";
import { ConfigManager } from "./src/core/config-manager.ts";
import { SERVICE_GROUPS } from "./q4/const/constants.ts";
import { Logger } from "./src/development/logger.ts";
import { getApplicationServices } from "./src/services/service-loader.ts";
import { ServiceRunner } from "./src/services/service-runner.ts";
import { EnvironmentInitializer } from "./src/development/modules/environment-initializer.ts";
import { ClusterManager } from "./src/core/cluster-manager.ts";
import {
  getAllServices,
  getLocalServices,
  createGroupedChoices,
  getServiceNamespace,
  commandToScript,
} from "./src/utils/cli-helpers.ts";

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
  env    [service]      Display environment variables for a service
  cleanup               Clean up development environment
  list-services         List all available services (used for shell completion)
  
  Module Commands:
  repos                 Setup repositories for configured services
  cluster               Setup Kubernetes cluster configuration
  configs               Update service configurations and manifests  
  workspace             Create/update VS Code workspace configuration
  submodules            Update all submodules to their latest versions
  
  Utility Commands:
  check                 Validate current environment configuration
  git                   Display Git aliases and usage help
  sign                  Clear GPG key to free it for use in VS Code commits
`);
  Deno.exit(0);
}

// Main command handling
(async () => {
  try {
    switch (command) {
      case "setup": {
        await new EnvironmentInitializer().setup();
        break;
      }

      case "repos": {
        await config.load();
        const localServices = getLocalServices();
        
        const initializer = new EnvironmentInitializer();
        await initializer.getWorkspaceManager().setupRepositories(localServices);
        Logger.success("Repository setup completed!");
        break;
      }

      case "cluster": {
        await config.load();
        const localServices = getLocalServices();

        const initializer = new EnvironmentInitializer();
        await initializer.getClusterSelector().setupCluster(localServices);
        Logger.success("Cluster setup completed!");
        break;
      }

      case "configs": {
        await config.load();
        const localServices = getLocalServices();
        
        const clusterManager = ClusterManager.getInstance();
        await clusterManager.applyConfigurations(localServices);
        Logger.success("Service configurations updated!");
        break;
      }

      case "workspace": {
        await config.load();
        const localServices = getLocalServices();
           
        const initializer = new EnvironmentInitializer();
        await initializer.getWorkspaceManager().createVSCodeWorkspace(localServices);
        Logger.success("VS Code workspace configuration updated!");
        break;
      }

      case "check": {
        const initializer = new EnvironmentInitializer();
        const validation = await initializer.validateEnvironment();
        
        if (validation.isValid) {
          Logger.success("Environment validation passed!");
        } else {
          Logger.error("Environment validation failed:");
          validation.issues.forEach(issue => Logger.error(`  • ${issue}`));
          
          if (validation.recommendations.length > 0) {
            Logger.info("\nRecommendations:");
            validation.recommendations.forEach(rec => Logger.info(`  • ${rec}`));
          }
        }
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
            Logger.error(
              `Cannot add infrastructure service ${serviceArg} as a local service`,
            );
            Deno.exit(1);
          }

          if (getLocalServices().includes(serviceArg)) {
            Logger.error(
              `Service ${serviceArg} is already configured as local`,
            );
            Deno.exit(1);
          }

          const repoPath = `/workspace/repos/${serviceArg}`;
          const appConfig = applicationServices[serviceArg];
          if (!appConfig) {
            Logger.error(
              `No application configuration found for service: ${serviceArg}`,
            );
            Deno.exit(1);
          }
          await config.addLocalService(serviceArg, {
            repoPath,
            script: commandToScript(appConfig.command!),
            env: {},
            namespace: getServiceNamespace(serviceArg),
          });
          Logger.info(`Added local service: ${serviceArg}`);
        } else {
          // Interactive selection mode
          const choices = createGroupedChoices(
            (service) =>
              !getLocalServices().includes(service) &&
              !SERVICE_GROUPS.core.services.includes(service),
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
              loop: true,
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
                Logger.error(
                  `No application configuration found for service: ${service}`,
                );
                continue;
              }
              await config.addLocalService(service, {
                repoPath,
                script: commandToScript(appConfig.command!),
                env: {},
                namespace: getServiceNamespace(service),
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
            Logger.info("No local services configured");
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
              loop: true,
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
      case "env": {
        await config.load();
        const localServices = config.getLocalServices();

        // If a service name was provided as an argument, show just that one
        const serviceName = args._.length > 1 ? String(args._[1]) : null;

        if (serviceName) {
          if (localServices[serviceName]) {
            await ServiceRunner.getInstance().printServiceEnv(
              serviceName,
              localServices[serviceName],
            );
          } else {
            Logger.error(
              `Service '${serviceName}' is not configured locally. Use 'quark add' to add it.`,
            );
          }
        } else {
          // No service specified, allow user to select interactively
          if (Object.keys(localServices).length === 0) {
            Logger.error(
              "No local services configured. Use 'quark add' to add services.",
            );
            Deno.exit(1);
          }

          const { service } = await inquirer.prompt([{
            type: "list",
            name: "service",
            message: "Select a service to show environment variables:",
            choices: Object.keys(localServices).sort(),
          }]);

          await ServiceRunner.getInstance().printServiceEnv(
            service,
            localServices[service],
          );
        }
        break;
      }
      case "list-services": {
        Logger.info(getAllServices().join("\n"));
        break;
      }
      case "cleanup": {
        await new EnvironmentInitializer().cleanup();
        break;
      }
      case "submodules": {
        const { autoCommit } = await inquirer.prompt([{
          type: "confirm",
          name: "autoCommit",
          message: "Automatically commit and push submodule updates?",
          default: true,
        }]);
        await new EnvironmentInitializer().updateSubmodules(autoCommit);
        break;
      }
      case "git": {
        // Read and display the git aliases help file
        try {
          const helpPath =
            new URL("./.devcontainer/git-aliases-help.txt", import.meta.url)
              .pathname;
          const helpText = await Deno.readTextFile(helpPath);
          Logger.info(helpText);
        } catch (_error) {
          Logger.error(
            "Git help file not found. Make sure to run the git setup script in your dev container.",
          );
        }
        break;
      }

      case "sign": {
        Logger.info("Clearing GPG key to free it for use...");

        try {
          // Clear sign the GPG key to free it
          const clearSignCmd = new Deno.Command("gpg", {
            args: ["--clearsign", "--output", "/dev/null", "/dev/null"],
            stdout: "inherit",
            stderr: "inherit",
          });
          await clearSignCmd.output();

          Logger.success("GPG key cleared successfully!");
        } catch (error) {
          Logger.error(
            `Failed to clear GPG key: ${
              error instanceof Error ? error.message : String(error)
            }`,
          );
          Logger.info("Make sure GPG is installed and configured properly.");
          Deno.exit(1);
        }
        break;
      }

      default:
        Logger.error(`Unknown command: ${command}`);
        Deno.exit(1);
    }
  } catch (error) {
    Logger.error(
      `Error: ${error instanceof Error ? error.message : String(error)}`,
    );
    Deno.exit(1);
  }
  self.close();
})();

#!/usr/bin/env -S deno run --allow-read --allow-write --allow-env --allow-run --allow-net

import { parseArgs } from "@std/cli";
import inquirer from "inquirer";
import { DevEnvironment } from "./src/dev-environment.ts";
import { ConfigManager } from "./src/config-manager.ts";
import { SERVICE_GROUPS } from "./src/constants.ts";

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
  console.log(`
Usage: quark <command>

Commands:
  setup                 Setup development environment
  add    [service]      Add local services (interactive if no service specified)
  remove [service]      Remove local services (interactive if no service specified)
  start                 Start all configured local services
`);
  Deno.exit(0);
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

        if (serviceArg) {
          // Direct service addition mode
          if (!getAllServices().includes(serviceArg)) {
            console.error(`Invalid service: ${serviceArg}`);
            console.error("Available services:");
            console.error(getAllServices().join(", "));
            Deno.exit(1);
          }

          await config.addLocalService(serviceArg, {
            repoPath: Deno.cwd(),
            script: "npm start",
            env: {},
          });
          console.log(`Added local service: ${serviceArg}`);
        } else {
          // Interactive selection mode
          const choices = createGroupedChoices(
            (service) => !getLocalServices().includes(service),
          );

          if (choices.length === 0) {
            console.error("No services available to add");
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
              await config.addLocalService(service, {
                repoPath: Deno.cwd(),
                script: "npm start",
                env: {},
              });
              console.log(`Added local service: ${service}`);
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
            console.error(`Service ${serviceArg} is not configured as local`);
            if (localServices.length > 0) {
              console.error("Currently configured local services:");
              console.error(localServices.join(", "));
            }
            Deno.exit(1);
          }

          await config.removeLocalService(serviceArg);
          console.log(`Removed local service: ${serviceArg}`);
        } else {
          // Interactive selection mode
          if (localServices.length === 0) {
            console.error("No local services configured");
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
              console.log(`Removed local service: ${service}`);
            }
          }
        }
        break;
      }

      case "start": {
        await config.load();
        const localServices = config.getLocalServices();

        if (Object.keys(localServices).length === 0) {
          console.error(
            "No local services configured. Use 'quark add' to add services.",
          );
          Deno.exit(1);
        }

        console.log("Starting local services...");
        for (const [service, config] of Object.entries(localServices)) {
          console.log(`\nStarting ${service}...`);
          const process = new Deno.Command("npm", {
            args: ["run", config.script],
            cwd: config.repoPath,
            stdout: "inherit",
            stderr: "inherit",
          });

          try {
            const child = process.spawn();
            console.log(`${service} started with PID ${child.pid}`);
          } catch (error) {
            console.error(
              `Failed to start ${service}:`,
              error instanceof Error ? error.message : String(error),
            );
          }
        }
        break;
      }
      case "cleanup": {
        await devEnv.cleanup();
        break;
      }

      default:
        console.error(`Unknown command: ${command}`);
        Deno.exit(1);
    }
  } catch (error) {
    console.error(
      "Error:",
      error instanceof Error ? error.message : String(error),
    );
    Deno.exit(1);
  }
})();

export class DevEnvironment {
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
}
// filepath: /home/crunchy/dev/quark/development/src/dev-environment.ts
async setupRepositories(services: string[]): Promise<void> {
  const allDeps = new Set<string>();
  
  // Get all dependencies
  for (const service of services) {
    const deps = await this.serviceManager.getServiceDependencies(service);
    deps.forEach(dep => allDeps.add(dep));
  }

  console.log(chalk.blue("Setting up repositories..."));
  for (const service of [...services, ...allDeps]) {
    await this.cloneServiceRepo(service);
  }
}

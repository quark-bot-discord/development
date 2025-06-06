import type { ServiceDefinition } from './service-types.ts';
import { join } from "@std/path";

// Cache for loaded configurations
let configCache: Record<string, ServiceDefinition> | null = null;

// Dynamic loader function that scans the q4 directory for config files
export async function getApplicationServices(): Promise<Record<string, ServiceDefinition>> {
  if (configCache) {
    return configCache;
  }

  const configs: Record<string, ServiceDefinition> = {};
  const q4Dir = join(Deno.cwd(), 'q4');
  
  try {
    // Read all files in the q4 directory
    for await (const dirEntry of Deno.readDir(q4Dir)) {
      // Skip directories and non-TypeScript files
      if (!dirEntry.isFile || !dirEntry.name.endsWith('.ts')) {
        continue;
      }
      
      // Skip config subdirectories and other non-service files
      if (dirEntry.name.startsWith('mod.') || dirEntry.name.startsWith('index.')) {
        continue;
      }
      
      const serviceName = dirEntry.name.replace('.ts', '');
      const configPath = `../q4/${dirEntry.name}`;
      
      try {
        const module = await import(configPath);
        
        // Look for any export that looks like a service config
        // First try the conventional naming pattern (serviceNameConfig)
        const expectedConfigName = serviceName.replace(/-/g, '') + 'Config';
        let configExport = module[expectedConfigName];
        
        // If not found, look for any export ending with 'Config'
        if (!configExport) {
          const configKey = Object.keys(module).find(key => key.endsWith('Config'));
          configExport = configKey ? module[configKey] : null;
        }
        
        // If still not found, look for default export
        if (!configExport && module.default) {
          configExport = module.default;
        }
        
        // Validate that it looks like a ServiceDefinition
        if (configExport && typeof configExport === 'object' && configExport.name && configExport.command) {
          configs[serviceName] = configExport as ServiceDefinition;
        } else {
          console.warn(`Skipping ${dirEntry.name}: No valid ServiceDefinition found`);
        }
        
      } catch (error) {
        console.error(`Failed to load config from ${dirEntry.name}: ${error}`);
      }
    }
  } catch (error) {
    console.error(`Failed to scan q4 directory: ${error}`);
    throw new Error(`Cannot load service configurations: ${error}`);
  }
  
  configCache = configs;
  return configs;
}

// Synchronous version for backward compatibility (loads from cache or throws)
export function getApplicationServicesSync(): Record<string, ServiceDefinition> {
  if (!configCache) {
    throw new Error('Service configurations not loaded. Call getApplicationServices() first.');
  }
  return configCache;
}

// Clear the cache to force reload on next call
export function clearServiceCache(): void {
  configCache = null;
}

// Legacy export for backward compatibility - initialize asynchronously
export const applicationServices: Promise<Record<string, ServiceDefinition>> = getApplicationServices();

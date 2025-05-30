import type { ServiceDefinition } from './service-types.ts';

// Cache for loaded configurations
let configCache: Record<string, ServiceDefinition> | null = null;

// Dynamic loader function that scans the q4 directory for config files
export async function getApplicationServices(): Promise<Record<string, ServiceDefinition>> {
  if (configCache) {
    return configCache;
  }

  const configs: Record<string, ServiceDefinition> = {};
  const q4Dir = '/workspace/q4';
  
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
      const configPath = `/workspace/q4/${dirEntry.name}`;
      
      try {
        const config = (await import(`file://${configPath}`)).default;
               
        // Validate that it looks like a ServiceDefinition
        if (config && typeof config === 'object' && config.name && config.type) {
          configs[serviceName] = config as ServiceDefinition;
        } else {
          console.warn(`Skipping ${dirEntry.name}: Not a valid ServiceDefinition`);
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

// Clear the cache to force reload on next call
export function clearServiceCache(): void {
  configCache = null;
}
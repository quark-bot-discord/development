import type { InfraServiceConfig } from './service-types.ts';

// Cache for loaded infrastructure configurations
let infraConfigCache: Record<string, InfraServiceConfig> | null = null;

// Dynamic loader function that scans the q4/infra directory for config files
export async function getInfrastructureServices(): Promise<Record<string, InfraServiceConfig>> {
  if (infraConfigCache) {
    return infraConfigCache;
  }

  const configs: Record<string, InfraServiceConfig> = {};
  const infraDir = '/workspace/q4/infra';
  
  try {
    // Read all files in the q4/infra directory
    for await (const dirEntry of Deno.readDir(infraDir)) {
      // Skip directories and non-TypeScript files
      if (!dirEntry.isFile || !dirEntry.name.endsWith('.ts')) {
        continue;
      }
      
      // Skip index files
      if (dirEntry.name.startsWith('mod.') || dirEntry.name.startsWith('index.')) {
        continue;
      }
      
      const serviceName = dirEntry.name.replace('.ts', '');
      const configPath = `/workspace/q4/infra/${dirEntry.name}`;
      
      try {
        const module = await import(`file://${configPath}`);
        
        // Look for any export that looks like an infrastructure service config
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
        
        // Validate that it looks like an InfraServiceConfig
        if (configExport && typeof configExport === 'object' && configExport.name && configExport.image) {
          configs[serviceName] = configExport as InfraServiceConfig;
        } else {
          console.warn(`Skipping ${dirEntry.name}: No valid InfraServiceConfig found`);
        }
        
      } catch (error) {
        console.error(`Failed to load infra config from ${dirEntry.name}: ${error}`);
      }
    }
  } catch (error) {
    console.error(`Failed to scan q4/infra directory: ${error}`);
    throw new Error(`Cannot load infrastructure service configurations: ${error}`);
  }
  
  infraConfigCache = configs;
  return configs;
}

// Synchronous version for backward compatibility (loads from cache or throws)
export function getInfrastructureServicesSync(): Record<string, InfraServiceConfig> {
  if (!infraConfigCache) {
    throw new Error('Infrastructure service configurations not loaded. Call getInfrastructureServices() first.');
  }
  return infraConfigCache;
}

// Clear the cache to force reload on next call
export function clearInfraServiceCache(): void {
  infraConfigCache = null;
}

// Legacy export for backward compatibility - initialize asynchronously
export const infrastructureServices: Promise<Record<string, InfraServiceConfig>> = getInfrastructureServices();

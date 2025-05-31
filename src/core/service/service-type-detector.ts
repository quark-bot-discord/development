/**
 * @fileoverview Service type detection and classification for development environments.
 * 
 * This module provides intelligent detection and classification of service types
 * based on various characteristics such as file structure, configuration files,
 * package manifests, and runtime requirements. It helps automatically determine
 * the appropriate deployment strategy and configuration for each service.
 * 
 * @module ServiceTypeDetector
 * @since 1.0.0
 */

import { Logger } from '../../development/logger.ts';
import type { ServiceDefinition } from '../../services/service-types.ts';
import type {
  DetectedServiceType,
  DetectionConfig,
} from '../../types/service-detection-types.ts';

/**
 * Service type detector that analyzes project structure and configuration
 * to automatically determine the appropriate service type and configuration.
 * 
 * This class examines various indicators including:
 * - Package manifests (package.json, Cargo.toml, deno.json)
 * - Source code patterns and file extensions
 * - Configuration files and environment setup
 * - Dependencies and runtime requirements
 * 
 * @example
 * ```typescript
 * const detector = new ServiceTypeDetector();
 * 
 * // Detect service type from directory
 * const detection = await detector.detectFromDirectory('/path/to/service');
 * console.log(`Detected: ${detection.type} (${detection.confidence * 100}% confidence)`);
 * 
 * // Apply detection to service definition
 * const serviceConfig = await detector.enhanceServiceDefinition({
 *   name: 'my-service',
 *   type: 'container' // Will be refined based on detection
 * }, '/path/to/service');
 * 
 * // Batch detect multiple services
 * const services = await detector.detectMultipleServices([
 *   { name: 'web-app', path: '/path/to/web-app' },
 *   { name: 'api', path: '/path/to/api' }
 * ]);
 * ```
 * 
 * @since 1.0.0
 */
export class ServiceTypeDetector {
  private readonly defaultConfig: DetectionConfig = {
    deepScan: true,
    maxDepth: 3,
    includePatterns: ['**/*'],
    excludePatterns: ['node_modules/**', '.git/**', 'dist/**', 'build/**'],
    analyzePackageFiles: true,
    detectPorts: true,
    confidenceThreshold: 0.5
  };

  /**
   * Detect service type from a directory path.
   * 
   * Analyzes the directory structure, configuration files, and source code
   * to determine the most likely service type and configuration.
   * 
   * @param {string} directoryPath - Path to the service directory
   * @param {Partial<DetectionConfig>} config - Detection configuration
   * @returns {Promise<DetectedServiceType>} Detected service type information
   * 
   * @example
   * ```typescript
   * const detector = new ServiceTypeDetector();
   * const detection = await detector.detectFromDirectory('/repos/my-web-app');
   * 
   * if (detection.confidence > 0.8) {
   *   console.log(`High confidence detection: ${detection.type}`);
   *   console.log(`Framework: ${detection.framework}`);
   *   console.log(`Recommended command: ${detection.command?.run.join(' ')}`);
   * }
   * ```
   * 
   * @since 1.0.0
   */
  async detectFromDirectory(
    directoryPath: string, 
    config: Partial<DetectionConfig> = {}
  ): Promise<DetectedServiceType> {
    const effectiveConfig = { ...this.defaultConfig, ...config };
    
    Logger.info(`Detecting service type for directory: ${directoryPath}`);

    try {
      // Check if directory exists
      const dirStat = await Deno.stat(directoryPath);
      if (!dirStat.isDirectory) {
        throw new Error(`Path is not a directory: ${directoryPath}`);
      }

      const detection: DetectedServiceType = {
        type: 'container',
        confidence: 0,
        metadata: {},
        reasons: []
      };

      // Run detection algorithms
      await this.detectFromPackageManifests(directoryPath, detection);
      await this.detectFromSourceCode(directoryPath, detection, effectiveConfig);
      await this.detectFromConfigFiles(directoryPath, detection);
      await this.detectFromDockerfile(directoryPath, detection);

      // Finalize detection
      this.finalizeDetection(detection);

      Logger.info(`Detection complete: ${detection.type} (confidence: ${detection.confidence.toFixed(2)})`);
      return detection;

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      Logger.error(`Service type detection failed: ${errorMessage}`);
      
      return {
        type: 'container',
        confidence: 0,
        metadata: { error: errorMessage },
        reasons: [`Detection failed: ${errorMessage}`]
      };
    }
  }

  /**
   * Enhance an existing service definition with detected information.
   * 
   * Takes a basic service definition and enhances it with automatically
   * detected configuration based on the service's directory structure.
   * 
   * @param {Partial<ServiceDefinition>} serviceDefinition - Base service definition
   * @param {string} directoryPath - Path to the service directory
   * @returns {Promise<ServiceDefinition>} Enhanced service definition
   * 
   * @example
   * ```typescript
   * const detector = new ServiceTypeDetector();
   * const enhanced = await detector.enhanceServiceDefinition({
   *   name: 'api-service',
   *   repository: 'https://github.com/org/api-service'
   * }, '/repos/api-service');
   * 
   * // Enhanced definition now includes detected type, commands, ports, etc.
   * console.log(enhanced.type); // e.g., 'typescript'
   * console.log(enhanced.command); // e.g., { type: 'npm', run: ['start'] }
   * ```
   * 
   * @since 1.0.0
   */
  async enhanceServiceDefinition(
    serviceDefinition: Partial<ServiceDefinition>,
    directoryPath: string
  ): Promise<ServiceDefinition> {
    const detection = await this.detectFromDirectory(directoryPath);
    
    const enhanced: ServiceDefinition = {
      name: serviceDefinition.name || 'unknown-service',
      type: serviceDefinition.type || detection.type,
      ...serviceDefinition
    };

    // Apply detected command if not specified
    if (!enhanced.command && detection.command) {
      enhanced.command = detection.command;
    }

    // Apply detected ports if not specified
    if (!enhanced.ports && detection.ports) {
      enhanced.ports = detection.ports.map(port => ({
        name: port.name,
        port: port.port,
        targetPort: port.port
      }));
    }

    // Add detection metadata
    enhanced.env = {
      ...enhanced.env,
      DETECTED_TYPE: detection.type,
      DETECTION_CONFIDENCE: detection.confidence.toString(),
      DETECTED_FRAMEWORK: detection.framework || 'unknown'
    };

    Logger.info(`Enhanced service definition for ${enhanced.name} with detection results`);
    return enhanced;
  }

  /**
   * Detect service types for multiple services in batch.
   * 
   * Processes multiple service directories concurrently and returns
   * detection results for all services.
   * 
   * @param {Array<{name: string, path: string}>} services - Array of service info
   * @returns {Promise<Array<{name: string, detection: DetectedServiceType}>>} Detection results
   * 
   * @example
   * ```typescript
   * const detector = new ServiceTypeDetector();
   * const services = [
   *   { name: 'web-app', path: '/repos/web-app' },
   *   { name: 'api', path: '/repos/api' },
   *   { name: 'worker', path: '/repos/worker' }
   * ];
   * 
   * const results = await detector.detectMultipleServices(services);
   * results.forEach(result => {
   *   console.log(`${result.name}: ${result.detection.type}`);
   * });
   * ```
   * 
   * @since 1.0.0
   */
  async detectMultipleServices(
    services: Array<{ name: string; path: string }>
  ): Promise<Array<{ name: string; detection: DetectedServiceType }>> {
    Logger.info(`Detecting service types for ${services.length} services`);

    const detectionPromises = services.map(async (service) => {
      try {
        const detection = await this.detectFromDirectory(service.path);
        return { name: service.name, detection };
      } catch (error) {
        const errorMessage = error instanceof Error ? error.message : String(error);
        Logger.error(`Detection failed for ${service.name}: ${errorMessage}`);
        
        return {
          name: service.name,
          detection: {
            type: 'container' as const,
            confidence: 0,
            metadata: { error: errorMessage },
            reasons: [`Detection failed: ${errorMessage}`]
          }
        };
      }
    });

    return await Promise.all(detectionPromises);
  }

  /**
   * Detect service type from package manifests (package.json, Cargo.toml, etc.).
   * 
   * @private
   * @param {string} directoryPath - Directory to scan
   * @param {DetectedServiceType} detection - Detection object to update
   * @since 1.0.0
   */
  private async detectFromPackageManifests(
    directoryPath: string, 
    detection: DetectedServiceType
  ): Promise<void> {
    // Check for package.json (Node.js/TypeScript/JavaScript)
    try {
      const packageJsonPath = `${directoryPath}/package.json`;
      const packageJson = JSON.parse(await Deno.readTextFile(packageJsonPath));
      
      detection.confidence += 0.4;
      detection.reasons.push('Found package.json');
      detection.metadata.packageJson = packageJson;

      // Determine if TypeScript or JavaScript
      const dependencies = { ...packageJson.dependencies, ...packageJson.devDependencies };
      if (dependencies.typescript || dependencies['@types/node']) {
        detection.type = 'typescript';
        detection.confidence += 0.3;
        detection.reasons.push('TypeScript dependencies found');
      } else {
        detection.type = 'javascript';
        detection.confidence += 0.2;
        detection.reasons.push('JavaScript project (no TypeScript)');
      }

      // Detect framework
      if (dependencies.express) {
        detection.framework = 'express';
      } else if (dependencies.fastify) {
        detection.framework = 'fastify';
      } else if (dependencies.next) {
        detection.framework = 'next.js';
      } else if (dependencies.react) {
        detection.framework = 'react';
      } else if (dependencies.vue) {
        detection.framework = 'vue';
      }

      // Determine command type and scripts
      if (packageJson.scripts) {
        const hasStart = 'start' in packageJson.scripts;
        const hasDev = 'dev' in packageJson.scripts;
        const _hasBuild = 'build' in packageJson.scripts;

        if (hasStart) {
          detection.command = {
            type: this.detectPackageManager(directoryPath),
            run: ['start']
          };
        } else if (hasDev) {
          detection.command = {
            type: this.detectPackageManager(directoryPath),
            run: ['run', 'dev']
          };
        }

        detection.metadata.scripts = packageJson.scripts;
      }

      // Detect ports from common patterns
      await this.detectPortsFromPackageJson(packageJsonPath, detection);

    } catch {
      // No package.json found, continue with other detection methods
    }

    // Check for Cargo.toml (Rust)
    try {
      const cargoTomlPath = `${directoryPath}/Cargo.toml`;
      await Deno.stat(cargoTomlPath);
      
      detection.type = 'rust';
      detection.confidence += 0.5;
      detection.reasons.push('Found Cargo.toml');
      detection.command = {
        type: 'cargo',
        run: ['run']
      };

      // Parse Cargo.toml for additional info
      const cargoContent = await Deno.readTextFile(cargoTomlPath);
      detection.metadata.cargoToml = cargoContent;

    } catch {
      // No Cargo.toml found
    }

    // Check for deno.json/deno.jsonc (Deno)
    try {
      let denoConfigPath = `${directoryPath}/deno.json`;
      try {
        await Deno.stat(denoConfigPath);
      } catch {
        denoConfigPath = `${directoryPath}/deno.jsonc`;
        await Deno.stat(denoConfigPath);
      }

      detection.type = 'deno';
      detection.confidence += 0.5;
      detection.reasons.push('Found Deno configuration');
      detection.command = {
        type: 'deno',
        run: ['run', '--allow-all', 'main.ts']
      };

      const denoConfig = JSON.parse(await Deno.readTextFile(denoConfigPath));
      detection.metadata.denoConfig = denoConfig;

      // Check for tasks in deno.json
      if (denoConfig.tasks) {
        const taskNames = Object.keys(denoConfig.tasks);
        if (taskNames.includes('start')) {
          detection.command.run = ['task', 'start'];
        } else if (taskNames.includes('dev')) {
          detection.command.run = ['task', 'dev'];
        }
      }

    } catch {
      // No Deno config found
    }
  }

  /**
   * Detect service type from source code patterns.
   * 
   * @private
   * @param {string} directoryPath - Directory to scan
   * @param {DetectedServiceType} detection - Detection object to update
   * @param {DetectionConfig} config - Detection configuration
   * @since 1.0.0
   */
  private async detectFromSourceCode(
    directoryPath: string, 
    detection: DetectedServiceType,
    config: DetectionConfig
  ): Promise<void> {
    try {
      const files = await this.scanDirectoryFiles(directoryPath, config.maxDepth);
      
      // Count file types
      const fileTypeCounts = {
        typescript: files.filter(f => f.endsWith('.ts')).length,
        javascript: files.filter(f => f.endsWith('.js') || f.endsWith('.mjs')).length,
        rust: files.filter(f => f.endsWith('.rs')).length,
        go: files.filter(f => f.endsWith('.go')).length,
        python: files.filter(f => f.endsWith('.py')).length
      };

      // Find dominant file type
      const dominantType = Object.entries(fileTypeCounts)
        .filter(([_, count]) => count > 0)
        .sort(([_, a], [__, b]) => b - a)[0];

      if (dominantType) {
        const [type, count] = dominantType;
        detection.reasons.push(`Found ${count} ${type} files`);
        
        if (type === 'typescript' && detection.type === 'container') {
          detection.type = 'typescript';
          detection.confidence += 0.2;
        } else if (type === 'javascript' && detection.type === 'container') {
          detection.type = 'javascript';
          detection.confidence += 0.2;
        } else if (type === 'rust' && detection.type === 'container') {
          detection.type = 'rust';
          detection.confidence += 0.2;
        }
      }

      // Look for common entry points
      const entryPoints = ['main.ts', 'main.js', 'index.ts', 'index.js', 'server.ts', 'server.js', 'app.ts', 'app.js'];
      for (const entryPoint of entryPoints) {
        if (files.includes(`${directoryPath}/${entryPoint}`)) {
          detection.reasons.push(`Found entry point: ${entryPoint}`);
          detection.confidence += 0.1;
          break;
        }
      }

    } catch (error) {
      Logger.warn(`Failed to scan source code: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  /**
   * Detect service type from configuration files.
   * 
   * @private
   * @param {string} directoryPath - Directory to scan
   * @param {DetectedServiceType} detection - Detection object to update
   * @since 1.0.0
   */
  private async detectFromConfigFiles(
    directoryPath: string, 
    detection: DetectedServiceType
  ): Promise<void> {
    const configFiles = [
      'tsconfig.json',
      '.eslintrc.json',
      '.eslintrc.js',
      'webpack.config.js',
      'vite.config.ts',
      'next.config.js',
      'nuxt.config.ts'
    ];

    for (const configFile of configFiles) {
      try {
        await Deno.stat(`${directoryPath}/${configFile}`);
        detection.reasons.push(`Found config file: ${configFile}`);
        detection.confidence += 0.1;

        // Specific framework detection
        if (configFile.includes('next')) {
          detection.framework = 'next.js';
        } else if (configFile.includes('nuxt')) {
          detection.framework = 'nuxt';
        } else if (configFile.includes('vite')) {
          detection.framework = 'vite';
        }

      } catch {
        // Config file not found
      }
    }
  }

  /**
   * Detect service type from Dockerfile.
   * 
   * @private
   * @param {string} directoryPath - Directory to scan
   * @param {DetectedServiceType} detection - Detection object to update
   * @since 1.0.0
   */
  private async detectFromDockerfile(
    directoryPath: string, 
    detection: DetectedServiceType
  ): Promise<void> {
    try {
      const dockerfilePath = `${directoryPath}/Dockerfile`;
      const dockerfileContent = await Deno.readTextFile(dockerfilePath);
      
      detection.reasons.push('Found Dockerfile');
      detection.confidence += 0.2;
      detection.metadata.dockerfile = true;

      // Analyze Dockerfile for additional insights
      if (dockerfileContent.includes('FROM node:')) {
        detection.type = detection.type === 'container' ? 'javascript' : detection.type;
        detection.reasons.push('Node.js base image in Dockerfile');
      } else if (dockerfileContent.includes('FROM rust:')) {
        detection.type = 'rust';
        detection.reasons.push('Rust base image in Dockerfile');
      } else if (dockerfileContent.includes('FROM denoland/deno:')) {
        detection.type = 'deno';
        detection.reasons.push('Deno base image in Dockerfile');
      }

      // Extract exposed ports
      const portMatches = dockerfileContent.match(/EXPOSE\s+(\d+)/g);
      if (portMatches) {
        detection.ports = portMatches.map(match => {
          const port = parseInt(match.replace('EXPOSE ', ''));
          return {
            name: `port-${port}`,
            port,
            protocol: 'TCP'
          };
        });
        detection.reasons.push(`Found exposed ports: ${detection.ports.map(p => p.port).join(', ')}`);
      }

    } catch {
      // No Dockerfile found
    }
  }

  /**
   * Detect package manager based on lock files.
   * 
   * @private
   * @param {string} directoryPath - Directory to check
   * @returns {'npm' | 'pnpm'} Detected package manager
   * @since 1.0.0
   */
  private detectPackageManager(directoryPath: string): 'npm' | 'pnpm' {
    try {
      Deno.statSync(`${directoryPath}/pnpm-lock.yaml`);
      return 'pnpm';
    } catch {
      // Default to npm
      return 'npm';
    }
  }

  /**
   * Detect ports from package.json scripts and common patterns.
   * 
   * @private
   * @param {string} packageJsonPath - Path to package.json
   * @param {DetectedServiceType} detection - Detection object to update
   * @since 1.0.0
   */
  private async detectPortsFromPackageJson(
    packageJsonPath: string, 
    detection: DetectedServiceType
  ): Promise<void> {
    try {
      const content = await Deno.readTextFile(packageJsonPath);
      const portMatches = content.match(/PORT[=:]\s*(\d+)/gi) || 
                         content.match(/port[=:]\s*(\d+)/gi) ||
                         content.match(/--port\s+(\d+)/gi);

      if (portMatches) {
        const ports = portMatches.map(match => {
          const port = parseInt(match.replace(/.*[=:\s]/, ''));
          return {
            name: `http`,
            port,
            protocol: 'TCP' as const
          };
        });

        if (ports.length > 0) {
          detection.ports = ports;
          detection.reasons.push(`Detected ports from package.json: ${ports.map(p => p.port).join(', ')}`);
        }
      }
    } catch {
      // Failed to read or parse
    }
  }

  /**
   * Scan directory for files recursively up to max depth.
   * 
   * @private
   * @param {string} directoryPath - Directory to scan
   * @param {number} maxDepth - Maximum depth to scan
   * @returns {Promise<string[]>} Array of file paths
   * @since 1.0.0
   */
  private async scanDirectoryFiles(directoryPath: string, maxDepth: number): Promise<string[]> {
    const files: string[] = [];
    
    const scanRecursive = async (path: string, depth: number) => {
      if (depth > maxDepth) return;

      try {
        for await (const entry of Deno.readDir(path)) {
          const fullPath = `${path}/${entry.name}`;
          
          if (entry.isFile) {
            files.push(fullPath);
          } else if (entry.isDirectory && !entry.name.startsWith('.') && entry.name !== 'node_modules') {
            await scanRecursive(fullPath, depth + 1);
          }
        }
      } catch {
        // Permission denied or other error, skip directory
      }
    };

    await scanRecursive(directoryPath, 0);
    return files;
  }

  /**
   * Finalize detection by normalizing confidence and type.
   * 
   * @private
   * @param {DetectedServiceType} detection - Detection object to finalize
   * @since 1.0.0
   */
  private finalizeDetection(detection: DetectedServiceType): void {
    // Cap confidence at 1.0
    detection.confidence = Math.min(detection.confidence, 1.0);

    // Set minimum confidence for container type
    if (detection.type === 'container' && detection.confidence < 0.3) {
      detection.confidence = 0.3;
      detection.reasons.push('Default container type (low confidence)');
    }

    // Ensure we have a command if type is detected
    if (!detection.command && detection.type !== 'container') {
      switch (detection.type) {
        case 'typescript':
        case 'javascript':
          detection.command = {
            type: 'npm',
            run: ['start']
          };
          break;
        case 'deno':
          detection.command = {
            type: 'deno',
            run: ['run', '--allow-all', 'main.ts']
          };
          break;
        case 'rust':
          detection.command = {
            type: 'cargo',
            run: ['run']
          };
          break;
      }
    }
  }
}

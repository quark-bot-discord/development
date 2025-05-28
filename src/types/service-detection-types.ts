/**
 * @fileoverview Service type detection and classification type definitions.
 * 
 * This module provides type definitions for service type detection,
 * configuration analysis, and automated service classification.
 * 
 * @module ServiceDetectionTypes
 * @since 1.0.0
 */

/**
 * Detected service type information with confidence level.
 */
export interface DetectedServiceType {
  /** Primary service type */
  type: 'typescript' | 'javascript' | 'deno' | 'rust' | 'container' | 'job';
  /** Confidence level (0-1) */
  confidence: number;
  /** Detected runtime/framework */
  framework?: string;
  /** Recommended command configuration */
  command?: {
    type: 'npm' | 'pnpm' | 'cargo' | 'deno';
    run: string[];
  };
  /** Detected port configuration */
  ports?: Array<{
    name: string;
    port: number;
    protocol?: string;
  }>;
  /** Additional metadata */
  metadata: Record<string, unknown>;
  /** Detection reasons */
  reasons: string[];
}

/**
 * Configuration for service type detection.
 */
export interface DetectionConfig {
  /** Whether to scan deeply into subdirectories */
  deepScan: boolean;
  /** Maximum depth for directory scanning */
  maxDepth: number;
  /** File patterns to include in analysis */
  includePatterns: string[];
  /** File patterns to exclude from analysis */
  excludePatterns: string[];
  /** Whether to analyze package manager files */
  analyzePackageFiles: boolean;
  /** Whether to detect port configurations */
  detectPorts: boolean;
  /** Minimum confidence threshold for detection */
  confidenceThreshold: number;
}

import * as vscode from 'vscode';

export interface AnalysisResult {
  fileUri: vscode.Uri;
  language: string;
  summary: string;
  suggestions: Suggestion[];
  relationships: FileRelationship[];
  metrics: CodeMetrics;
  timestamp: Date;
  confidence: number;
}

export interface Suggestion {
  id: string;
  type: SuggestionType;
  title: string;
  description: string;
  confidence: number;
  range: vscode.Range;
  originalCode: string;
  suggestedCode: string;
  category: SuggestionCategory;
  isApplied: boolean;
}

export enum SuggestionType {
  IMPROVEMENT = 'improvement',
  REFACTOR = 'refactor', 
  OPTIMIZATION = 'optimization',
  BUG_FIX = 'bug_fix',
  SECURITY = 'security',
  STYLE = 'style'
}

export enum SuggestionCategory {
  PERFORMANCE = 'performance',
  READABILITY = 'readability',
  MAINTAINABILITY = 'maintainability',
  SECURITY = 'security',
  BEST_PRACTICES = 'best_practices'
}

export interface FileRelationship {
  fromFile: vscode.Uri;
  toFile: vscode.Uri;
  type: RelationshipType;
  strength: number; // 0-1 scale
  description: string;
}

export enum RelationshipType {
  IMPORTS = 'imports',
  INHERITS = 'inherits',
  IMPLEMENTS = 'implements',
  CALLS = 'calls',
  DEPENDS_ON = 'depends_on',
  SIMILAR_TO = 'similar_to'
}

export interface CodeMetrics {
  linesOfCode: number;
  complexity: number;
  maintainabilityIndex: number;
  technicalDebt: number;
  testCoverage?: number;
  duplicateCode?: number;
}

export interface WorkspaceSummary {
  totalFiles: number;
  analysisResults: AnalysisResult[];
  overallMetrics: CodeMetrics;
  relationships: FileRelationship[];
  suggestions: Suggestion[];
  timestamp: Date;
}

export interface HuggingFaceConfig {
  apiKey: string;
  model?: string;
  timeout?: number;
  maxRetries?: number;
}

export interface AnalysisConfig {
  maxFileSize: number;
  timeout: number;
  maxConcurrentFiles: number;
  includeFileTypes: string[];
  excludePatterns: string[];
  confidenceThreshold: number;
}

export interface ContextConfig {
  retentionDays: number;
  maxRelationships: number;
}

export interface CacheConfig {
  enabled: boolean;
  maxSizeMB: number;
}

export interface ExtensionConfig {
  huggingFace: HuggingFaceConfig;
  analysis: AnalysisConfig;
  context: ContextConfig;
  cache: CacheConfig;
  enableTelemetry: boolean;
  localProcessing: boolean;
  theme: 'auto' | 'dark' | 'light';
  enableLogging: boolean;
}

export interface AIResponse {
  summary: string;
  suggestions: Suggestion[];
  confidence: number;
  modelUsed: string;
  usage: {
    tokens: number;
    cost?: number;
  };
}

export interface FileContext {
  uri: vscode.Uri;
  content: string;
  language: string;
  lastModified: Date;
  size: number;
  hash: string;
  relationships: FileRelationship[];
}

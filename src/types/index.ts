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

// Chat Panel Types
export interface ChatMessage {
  id: string;
  type: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  context?: ChatContext;
  metadata?: ChatMessageMetadata;
}

export interface ChatContext {
  activeFile?: vscode.Uri;
  selectedText?: string;
  workspaceFiles?: vscode.Uri[];
  analysisResults?: AnalysisResult[];
  suggestions?: Suggestion[];
}

export interface ChatMessageMetadata {
  tokens?: number;
  model?: string;
  confidence?: number;
  processingTime?: number;
  error?: string;
  suggestions?: Suggestion[];
  fileAnalyzed?: string;
  relatedFiles?: string[];
}

export interface ChatSession {
  id: string;
  messages: ChatMessage[];
  context: ChatContext;
  createdAt: Date;
  updatedAt: Date;
  title?: string;
}

export interface WebviewMessage {
  type: WebviewMessageType;
  payload: any;
  requestId?: string;
}

export interface ExtensionMessage {
  type: ExtensionMessageType;
  payload: any;
  requestId?: string | undefined;
}

export enum WebviewMessageType {
  SEND_MESSAGE = 'sendMessage',
  REQUEST_CONTEXT = 'requestContext',
  APPLY_SUGGESTION = 'applySuggestion',
  ANALYZE_CODE = 'analyzeCode',
  GET_HISTORY = 'getHistory',
  CLEAR_HISTORY = 'clearHistory',
  UPDATE_SETTINGS = 'updateSettings'
}

export enum ExtensionMessageType {
  MESSAGE_RESPONSE = 'messageResponse',
  CONTEXT_UPDATE = 'contextUpdate',
  SUGGESTION_APPLIED = 'suggestionApplied',
  ANALYSIS_COMPLETE = 'analysisComplete',
  HISTORY_UPDATE = 'historyUpdate',
  ERROR = 'error',
  TYPING_START = 'typingStart',
  TYPING_END = 'typingEnd'
}

export interface ChatPanelState {
  isVisible: boolean;
  position?: vscode.ViewColumn | undefined;
  sessionId?: string;
  lastActiveFile?: vscode.Uri;
}

// Enhanced Chat Types for Phase 3
export interface ChatCompletionMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
  name?: string;
  metadata?: Record<string, any>;
}

export interface ChatCompletionRequest {
  messages: ChatCompletionMessage[];
  model?: string;
  temperature?: number;
  max_tokens?: number;
  stream?: boolean;
  context?: ChatContext;
}

export interface ChatCompletionResponse {
  message: ChatCompletionMessage;
  usage: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
  model: string;
  confidence?: number;
  suggestions?: Suggestion[];
}

export interface ConversationHistory {
  sessionId: string;
  messages: ChatMessage[];
  context: ChatContext;
  summary?: string;
  createdAt: Date;
  lastUpdated: Date;
}

export interface ChatCommand {
  name: string;
  description: string;
  handler: string;
  parameters?: ChatCommandParameter[];
}

export interface ChatCommandParameter {
  name: string;
  type: 'string' | 'number' | 'boolean' | 'file' | 'selection';
  description: string;
  required?: boolean;
  default?: any;
}

export interface ChatAnalysisResult {
  analysis: string;
  suggestions: Suggestion[];
  codeBlocks?: CodeBlock[];
  relatedFiles?: vscode.Uri[];
  confidence: number;
}

export interface CodeBlock {
  language: string;
  code: string;
  startLine?: number;
  endLine?: number;
  file?: vscode.Uri;
  explanation?: string;
}

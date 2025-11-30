/**
 * Centralized default configuration values for BuildAI Code Analyzer
 * 
 * This file contains all default values used throughout the application.
 * When updating defaults, only modify this file to ensure consistency.
 */

export const DEFAULT_CONFIG = {
  // Ollama Server Configuration
  OLLAMA: {
    BASE_URL: 'https://gpu1.oginnovation.com:11433/v1',
    MODEL: 'mistral:7b',
    TIMEOUT: 60000, // 60 seconds in milliseconds
    MAX_RETRIES: 2,
    API_KEY: 'ollama', // Default API key for local Ollama instances
    USERNAME: 'bala', // Hardcoded username - replace with actual value
    PASSWORD: 'Isys@969Isys@969', // Hardcoded password - replace with actual value
  },

  // Analysis Configuration
  ANALYSIS: {
    MAX_FILE_SIZE: 2097152, // 2MB in bytes
    TIMEOUT: 60000, // 60 seconds
    TIMEOUT_MULTIPLIER: 1,
    MAX_CONCURRENT_FILES: 5,
    BASE_TIMEOUT: 30000, // 30 seconds base timeout for dynamic calculation
    MAX_TIMEOUT: 120000, // 2 minutes maximum timeout
  },

  // Context Management
  CONTEXT: {
    RETENTION_DAYS: 30,
    MAX_RELATIONSHIPS: 1000,
    MAX_HISTORY_LENGTH: 50,
    MAX_CONTEXT_WINDOW: 20, // Number of messages to include in context
  },

  // AI Configuration
  AI: {
    ENABLE_SUGGESTIONS: true,
    CONFIDENCE_THRESHOLD: 0.7,
  },

  // Cache Configuration
  CACHE: {
    ENABLED: true,
    MAX_SIZE_MB: 100,
  },

  // Privacy Settings
  PRIVACY: {
    ENABLE_TELEMETRY: false,
    LOCAL_PROCESSING: false,
  },

  // UI Configuration
  UI: {
    THEME: 'auto' as 'auto' | 'dark' | 'light',
  },

  // Debug Settings
  DEBUG: {
    ENABLE_LOGGING: false,
  },

  // File Type Patterns
  FILE_PATTERNS: {
    INCLUDE: [
      '*.js',
      '*.ts',
      '*.jsx',
      '*.tsx',
      '*.py',
      '*.java',
      '*.cs',
      '*.cpp',
      '*.c',
      '*.php',
      '*.go',
      '*.rs',
      '*.rb',
      '*.swift',
      '*.kt',
    ],
    EXCLUDE: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.git/**',
      '**/coverage/**',
      '**/*.min.js',
      '**/*.bundle.js',
    ],
  },

  // Retry Configuration
  RETRY: {
    BASE_DELAY: 1000, // 1 second
    CIRCUIT_BREAKER_TIMEOUT: 60000, // 1 minute
  },

  // Model Configuration
  MODELS: {
    AVAILABLE: [
      'qwen3:30b',
      'qwen3:14b',
      'deepseek-r1:70b',
      'gemma3:12b',
      'devstral:24b',
      'mistral:7b',
    ] as const,
    DESCRIPTIONS: {
      'qwen3:30b': 'Qwen3 30B - MoE Thinking model, 19GB, Best for complex reasoning',
      'qwen3:14b': 'Qwen3 14B - Dense Thinking model, 9.3GB, Balanced performance',
      'deepseek-r1:70b': 'DeepSeek-R1 70B - Distilled model, 43GB, Best quality, slower',
      'gemma3:12b': 'Gemma3 12B - Multimodal (text+image), 8.1GB',
      'devstral:24b': 'Devstral 24B - Code-focused, 14GB, Best for development',
      'mistral:7b': 'Mistral 7B - Fast and efficient, 4.1GB, Recommended default',
    },
  },

  // Temperature settings for different operations
  TEMPERATURE: {
    ANALYZE: 0.3,
    SUGGEST: 0.4,
    EXPLAIN: 0.2,
    OPTIMIZE: 0.3,
    DEBUG: 0.2,
    HELP: 0.1,
    CONVERSATIONAL: 0.7,
  },

  // Token limits for different operations
  MAX_TOKENS: {
    ANALYZE: 1500,
    SUGGEST: 1000,
    EXPLAIN: 1200,
    OPTIMIZE: 1000,
    DEBUG: 1200,
    HELP: 800,
    SUMMARY: 500,
    CODE_ANALYSIS: 1200,
  },
} as const;

/**
 * Available Ollama models
 */
export type OllamaModel = (typeof DEFAULT_CONFIG.MODELS.AVAILABLE)[number];

/**
 * Helper function to get model description
 */
export function getModelDescription(model: string): string {
  return DEFAULT_CONFIG.MODELS.DESCRIPTIONS[model as OllamaModel] || 'Unknown model';
}

/**
 * Helper function to validate model availability
 */
export function isModelAvailable(model: string): boolean {
  return DEFAULT_CONFIG.MODELS.AVAILABLE.includes(model as OllamaModel);
}

/**
 * Environment variable names (DEPRECATED - now using hardcoded values in DEFAULT_CONFIG.OLLAMA)
 */
export const ENV_VARS = {
  OLLAMA_USERNAME: 'OLLAMA_USERNAME', // No longer used - credentials are hardcoded
  OLLAMA_PASSWORD: 'OLLAMA_PASSWORD', // No longer used - credentials are hardcoded
  OLLAMA_BASE_URL: 'OLLAMA_BASE_URL',
} as const;

# Bala AI Code Analyzer

An intelligent VSCode extension that leverages AI to analyze multiple files in your workspace, providing comprehensive insights, suggestions, and maintaining context relationships between files.

## Features

🤖 **AI-Powered Analysis** - Uses Ollama models to analyze your code locally
📁 **Multi-File Processing** - Analyze entire workspaces or selected files
🧠 **Context Retention** - Tracks relationships between files and maintains analysis history
✨ **Smart Suggestions** - Get AI-powered code improvement recommendations
📊 **Comprehensive Reports** - Generate detailed workspace summaries
🔒 **Security Focused** - Built with security best practices

## Quick Start

### 1. Install the Extension

Install from the VS Code Marketplace or build from source.

### 2. Setup Ollama

1. Install Ollama from [ollama.ai](https://ollama.ai)
2. Pull a model: `ollama pull llama3.2:3b`
3. Start Ollama server: `ollama serve`
4. The extension will connect to `http://localhost:11434` by default

### 3. Start Analyzing

- **Analyze Workspace**: `Cmd/Ctrl + Alt + Shift + A`
- **Analyze Selected Files**: `Cmd/Ctrl + Alt + A`
- **Open AI Chat**: `Cmd/Ctrl + Alt + C`
- **Generate Summary**: `Cmd/Ctrl + Alt + S`

## Commands

| Command | Description | Shortcut |
|---------|-------------|----------|
| `Bala AI: Analyze Entire Workspace` | Analyzes all supported files in the workspace | `Cmd/Ctrl + Alt + Shift + A` |
| `Bala AI: Analyze Selected Files` | Analyzes selected files | `Cmd/Ctrl + Alt + A` |
| `Bala AI: Open AI Assistant` | Opens the AI chat panel | `Cmd/Ctrl + Alt + C` |
| `Bala AI: Generate Code Summary` | Creates a workspace summary | `Cmd/Ctrl + Alt + S` |
| `Bala AI: Apply AI Suggestions` | Applies AI recommendations to code | - |
| `Bala AI: Clear Analysis Cache` | Clears cached analysis data | - |
| `Bala AI: Export Analysis Report` | Exports analysis results | - |

## Configuration

The extension provides extensive configuration options:

### Ollama Settings

```json
{
  "balaAnalyzer.ollama.baseURL": "http://localhost:11434/v1",
  "balaAnalyzer.ollama.model": "llama3.2:3b",
  "balaAnalyzer.ollama.timeout": 30000,
  "balaAnalyzer.ollama.maxRetries": 3
}
```

### Analysis Settings

```json
{
  "balaAnalyzer.analysis.maxFileSize": 2097152,
  "balaAnalyzer.analysis.timeout": 60000,
  "balaAnalyzer.analysis.maxConcurrentFiles": 5,
  "balaAnalyzer.analysis.includeFileTypes": [
    "*.js", "*.ts", "*.jsx", "*.tsx", "*.py", "*.java", "*.cs"
  ],
  "balaAnalyzer.analysis.excludePatterns": [
    "**/node_modules/**", "**/dist/**", "**/.git/**"
  ]
}
```

### Context & Caching

```json
{
  "balaAnalyzer.context.retentionDays": 30,
  "balaAnalyzer.context.maxRelationships": 1000,
  "balaAnalyzer.cache.enabled": true,
  "balaAnalyzer.cache.maxSizeMB": 100
}
```

## Supported Languages

- JavaScript/TypeScript (`.js`, `.ts`, `.jsx`, `.tsx`)
- Python (`.py`)
- Java (`.java`)
- C# (`.cs`)
- C/C++ (`.c`, `.cpp`)
- PHP (`.php`)
- Go (`.go`)
- Rust (`.rs`)
- Ruby (`.rb`)
- Swift (`.swift`)
- Kotlin (`.kt`)

## Privacy & Security

- **Fully Local Processing**: All AI processing happens locally with Ollama
- **No External API Calls**: Your code never leaves your machine
- **Configurable Telemetry**: Anonymous usage telemetry can be disabled
- **Data Retention**: Configurable context retention periods
- **Complete Privacy**: No internet connection required for AI analysis

## Development

### Prerequisites

- Node.js >= 16.0.0
- npm >= 8.0.0
- VS Code >= 1.74.0

### Setup

```bash
git clone git@github.com:conanedogawa23/bala_vs_plugin.git
cd bala_vs_plugin
npm install
```

### Development Commands

```bash
npm run compile          # Compile TypeScript
npm run watch           # Watch for changes
npm run build           # Production build
npm run test            # Run tests
npm run lint            # Lint code
npm run package         # Create VSIX package
```

### Testing

```bash
npm test                 # Run unit tests
npm run test:coverage    # Run with coverage
npm run test:watch       # Watch mode
```

### Building

```bash
npm run build:prod       # Production build with security checks
npm run package          # Create VSIX package
```

## Architecture

```
src/
├── analyzers/          # Core analysis logic
├── services/           # External service integrations
├── ui/                 # User interface components
├── types/              # TypeScript type definitions
├── utils/              # Utility functions
└── test/               # Test files
```

## Contributing

1. Fork the repository
2. Create a feature branch: `git checkout -b feature/amazing-feature`
3. Commit your changes: `git commit -m 'Add amazing feature'`
4. Push to the branch: `git push origin feature/amazing-feature`
5. Open a Pull Request

### Development Guidelines

- Follow TypeScript strict mode
- Write tests for new features
- Use ESLint and Prettier for code formatting
- Follow security best practices
- Add documentation for new APIs

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## Changelog

### v1.0.0
- Initial release
- Multi-file workspace analysis
- Ollama local AI integration
- Context retention and relationship mapping
- AI-powered suggestions
- Comprehensive reporting

## Support

- 🐛 [Report Issues](https://github.com/conanedogawa23/bala_vs_plugin/issues)
- 💬 [Discussions](https://github.com/conanedogawa23/bala_vs_plugin/discussions)
- 📧 [Contact](mailto:your-email@example.com)

## Acknowledgments

- [Ollama](https://ollama.ai) for local AI model deployment
- [VS Code Extension API](https://code.visualstudio.com/api)
- Open source contributors and testers

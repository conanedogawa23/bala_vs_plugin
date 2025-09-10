import { MultiFileAnalyzer } from '@/analyzers/MultiFileAnalyzer';
import {
  AnalysisResult,
  ChatCommand,
  ChatCompletionMessage,
  ChatContext,
  ChatMessage,
  ChatSession,
  ConversationHistory,
  FileContext
} from '@/types';
import { getFileContentForAnalysis } from '@/utils/fileUtils';
import * as vscode from 'vscode';
import { ContextStore } from './ContextStore';
import { OllamaService } from './OllamaService';

export class ChatService {
  private ollamaService: OllamaService;
  private contextStore: ContextStore;
  private analyzer: MultiFileAnalyzer | undefined;
  private activeSessions: Map<string, ChatSession> = new Map();
  private commands: ChatCommand[] = [];
  private maxHistoryLength: number = 50;
  private maxContextWindow: number = 20; // Number of messages to include in context

  constructor(
    ollamaService: OllamaService, 
    contextStore: ContextStore, 
    analyzer?: MultiFileAnalyzer
  ) {
    this.ollamaService = ollamaService;
    this.contextStore = contextStore;
    this.analyzer = analyzer;
    this.initializeCommands();
  }

  // Session Management
  public createSession(context: ChatContext): ChatSession {
    const session: ChatSession = {
      id: this.generateSessionId(),
      messages: [],
      context,
      createdAt: new Date(),
      updatedAt: new Date(),
      title: this.generateSessionTitle(context)
    };

    this.activeSessions.set(session.id, session);
    return session;
  }

  public getSession(sessionId: string): ChatSession | undefined {
    return this.activeSessions.get(sessionId);
  }

  public async saveSession(session: ChatSession): Promise<void> {
    try {
      session.updatedAt = new Date();
      this.activeSessions.set(session.id, session);
      
      // Persist to storage
      const history: ConversationHistory = {
        sessionId: session.id,
        messages: session.messages,
        context: session.context,
        summary: await this.generateSessionSummary(session),
        createdAt: session.createdAt,
        lastUpdated: session.updatedAt
      };

      await this.contextStore.storeConversationHistory(session.id, history);
    } catch (error) {
      console.error('Failed to save chat session:', error);
    }
  }

  public async loadSession(sessionId: string): Promise<ChatSession | undefined> {
    try {
      const history = await this.contextStore.getConversationHistory(sessionId);
      if (!history) return undefined;

      const session: ChatSession = {
        id: history.sessionId,
        messages: history.messages,
        context: history.context,
        createdAt: history.createdAt,
        updatedAt: history.lastUpdated,
        title: this.generateSessionTitle(history.context)
      };

      this.activeSessions.set(sessionId, session);
      return session;
    } catch (error) {
      console.error('Failed to load chat session:', error);
      return undefined;
    }
  }

  // Message Processing
  public async processMessage(
    sessionId: string, 
    content: string, 
    context: ChatContext
  ): Promise<ChatMessage> {
    let session = this.getSession(sessionId);
    if (!session) {
      session = this.createSession(context);
    }

    // Update session context
    session.context = { ...session.context, ...context };

    // Create user message
    const userMessage: ChatMessage = {
      id: this.generateMessageId(),
      type: 'user',
      content,
      timestamp: new Date(),
      context
    };

    // Add to session
    session.messages.push(userMessage);

    // Process the message
    let assistantMessage: ChatMessage;

    try {
      // Check if it's a command
      if (content.trim().startsWith('/')) {
        assistantMessage = await this.processCommand(content, session);
      } else {
        assistantMessage = await this.processConversationalMessage(content, session);
      }

      // Add assistant response to session
      session.messages.push(assistantMessage);

      // Trim history if too long
      this.trimSessionHistory(session);

      // Save session
      await this.saveSession(session);

      return assistantMessage;
    } catch (error) {
      console.error('Error processing message:', error);
      
      const errorMessage: ChatMessage = {
        id: this.generateMessageId(),
        type: 'assistant',
        content: `I apologize, but I encountered an error: ${error instanceof Error ? error.message : 'Unknown error'}`,
        timestamp: new Date(),
        context,
        metadata: {
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      };

      session.messages.push(errorMessage);
      await this.saveSession(session);
      
      return errorMessage;
    }
  }

  // Command Processing
  private async processCommand(content: string, session: ChatSession): Promise<ChatMessage> {
    const parts = content.trim().split(/\s+/);
    const command = parts[0]?.substring(1) || ''; // Remove the '/'
    const args = parts.slice(1).join(' ');

    switch (command.toLowerCase()) {
      case 'analyze':
        return await this.handleAnalyzeCommand(args, session);
      
      case 'suggest':
        return await this.handleSuggestCommand(args, session);
      
      case 'explain':
        return await this.handleExplainCommand(args, session);
      
      case 'optimize':
        return await this.handleOptimizeCommand(args, session);
      
      case 'debug':
        return await this.handleDebugCommand(args, session);
      
      case 'help':
        return await this.handleHelpCommand();
      
      case 'summary':
        return await this.handleSummaryCommand(session);
      
      case 'context':
        return await this.handleContextCommand(session);
      
      default:
        return {
          id: this.generateMessageId(),
          type: 'assistant',
          content: `Unknown command: /${command}. Type '/help' to see available commands.`,
          timestamp: new Date(),
          context: session.context
        };
    }
  }

  private async processConversationalMessage(content: string, session: ChatSession): Promise<ChatMessage> {
    // Build conversation history for context
    const recentMessages = session.messages.slice(-this.maxContextWindow);
    const chatMessages: ChatCompletionMessage[] = recentMessages.map(msg => ({
      role: msg.type === 'user' ? 'user' : msg.type === 'assistant' ? 'assistant' : 'system',
      content: msg.content
    }));

    // Add current user message
    chatMessages.push({
      role: 'user',
      content
    });

    // 🔍 DETAILED CONVERSATION LOGGING
    console.log('💬 CHAT SERVICE - BUILDING CONVERSATIONAL MESSAGE:');
    console.log('━'.repeat(60));
    console.log(`Session ID: ${session.id}`);
    console.log(`Total session messages: ${session.messages.length}`);
    console.log(`Recent messages included: ${recentMessages.length}`);
    console.log(`Final message count for API: ${chatMessages.length}`);
    console.log(`Current user input: "${content.substring(0, 100)}${content.length > 100 ? '...' : ''}"`);
    console.log(`Max context window: ${this.maxContextWindow}`);
    
    // Show each message in the conversation
    chatMessages.forEach((msg, index) => {
      console.log(`\nConversation Message ${index + 1} (${msg.role}):`);
      console.log(`  Content length: ${msg.content.length} characters`);
      console.log(`  Preview: "${msg.content.substring(0, 150)}${msg.content.length > 150 ? '...' : ''}"`);
    });
    
    const totalConversationSize = chatMessages.reduce((total, msg) => total + msg.content.length, 0);
    console.log(`\nTotal conversation size: ${totalConversationSize} characters`);
    console.log(`Session context keys: ${Object.keys(session.context).join(', ')}`);
    console.log('━'.repeat(60));

    try {
      const analysisResult = await this.ollamaService.conversationalAnalysis(chatMessages, session.context);
      
      return {
        id: this.generateMessageId(),
        type: 'assistant',
        content: analysisResult.analysis,
        timestamp: new Date(),
        context: session.context,
        metadata: {
          confidence: analysisResult.confidence,
          suggestions: analysisResult.suggestions,
          relatedFiles: analysisResult.relatedFiles?.map(uri => uri.toString()) || []
        }
      };
    } catch (error) {
      throw new Error(`Failed to process conversational message: ${error}`);
    }
  }

  // Command Handlers
  private async handleAnalyzeCommand(args: string, session: ChatSession): Promise<ChatMessage> {
    try {
      if (!this.analyzer) {
        throw new Error('Analyzer not available');
      }

      let analysisResult: AnalysisResult | undefined;
      let analysisSource = '';

      // Enhanced priority order: 1. args (file path or code), 2. selected text, 3. active file
      if (args.trim()) {
        // Check if args is a file path (absolute or relative) or code snippet
        const argsTrimmed = args.trim();
        
        // Try to detect if this is a file path
        const isLikelyFilePath = (
          argsTrimmed.includes('/') || 
          argsTrimmed.includes('\\') ||
          argsTrimmed.match(/\.[a-zA-Z0-9]+$/) ||
          argsTrimmed.startsWith('.') ||
          argsTrimmed.length < 200 // Short strings are more likely to be paths
        );
        
        if (isLikelyFilePath) {
          console.log(`🔍 Attempting to analyze file path: ${argsTrimmed}`);
          
          // Try to read as file path
          const fileContent = await getFileContentForAnalysis(argsTrimmed);
          if (fileContent) {
            analysisSource = `file: ${fileContent.uri.fsPath.split('/').pop()}`;
            
            const fileContext: FileContext = {
              uri: fileContent.uri,
              content: fileContent.content,
              language: fileContent.language,
              lastModified: new Date(),
              size: fileContent.content.length,
              hash: this.generateHash(fileContent.content),
              relationships: []
            };
            
            const aiResponse = await this.ollamaService.analyzeCode(fileContext);
            
            // Convert to AnalysisResult format
            analysisResult = {
              fileUri: fileContent.uri,
              language: fileContent.language,
              summary: aiResponse.summary,
              suggestions: aiResponse.suggestions,
              relationships: [],
              metrics: {
                linesOfCode: fileContent.content.split('\n').length,
                complexity: 0,
                maintainabilityIndex: 0,
                technicalDebt: 0
              },
              timestamp: new Date(),
              confidence: aiResponse.confidence
            };

            const contentSource = fileContent.isFromEditor ? '(from editor with unsaved changes)' : '(from file system)';
            return {
              id: this.generateMessageId(),
              type: 'assistant',
              content: `## Analysis of ${analysisSource} ${contentSource}\n\n${this.formatAnalysisResult(analysisResult)}`,
              timestamp: new Date(),
              context: session.context,
              metadata: {
                confidence: analysisResult.confidence,
                fileAnalyzed: analysisResult.fileUri.fsPath,
                isFromEditor: fileContent.isFromEditor
              }
            };
          } else {
            // Path didn't work, treat as code snippet
            console.log(`⚠️ Could not read as file path, treating as code snippet: ${argsTrimmed}`);
          }
        }
        
        // Treat as code snippet (either because it's not a path or path reading failed)
        analysisSource = 'provided code snippet';
        const response = await this.ollamaService.processCommand('analyze', argsTrimmed, session.context);
        return {
          id: this.generateMessageId(),
          type: 'assistant',
          content: response.message.content,
          timestamp: new Date(),
          context: session.context,
          metadata: {
            tokens: response.usage.total_tokens,
            model: response.model,
            confidence: response.confidence || 0.7,
            fileAnalyzed: 'code snippet'
          }
        };
      } else if (session.context.selectedText) {
        // Analyze selected text from editor
        analysisSource = 'selected text';
        const response = await this.ollamaService.processCommand('analyze', session.context.selectedText, session.context);
        return {
          id: this.generateMessageId(),
          type: 'assistant',
          content: `## Analysis of Selected Code\n\n${response.message.content}`,
          timestamp: new Date(),
          context: session.context,
          metadata: {
            tokens: response.usage.total_tokens,
            model: response.model,
            confidence: response.confidence || 0.7,
            fileAnalyzed: 'selected text'
          }
        };
      } else if (session.context.activeFile) {
        // Analyze active file using smart content reading
        console.log(`📂 Analyzing active file: ${session.context.activeFile}`);
        
        const fileContent = await getFileContentForAnalysis(session.context.activeFile);
        if (fileContent) {
          analysisSource = fileContent.uri.fsPath.split('/').pop() || 'active file';
          
          const fileContext: FileContext = {
            uri: fileContent.uri,
            content: fileContent.content,
            language: fileContent.language,
            lastModified: new Date(),
            size: fileContent.content.length,
            hash: this.generateHash(fileContent.content),
            relationships: []
          };
          
          const aiResponse = await this.ollamaService.analyzeCode(fileContext);
          
          // Convert to AnalysisResult format
          analysisResult = {
            fileUri: fileContent.uri,
            language: fileContent.language,
            summary: aiResponse.summary,
            suggestions: aiResponse.suggestions,
            relationships: [],
            metrics: {
              linesOfCode: fileContent.content.split('\n').length,
              complexity: 0,
              maintainabilityIndex: 0,
              technicalDebt: 0
            },
            timestamp: new Date(),
            confidence: aiResponse.confidence
          };

          const contentSource = fileContent.isFromEditor ? '(including unsaved changes)' : '(from file system)';
          return {
            id: this.generateMessageId(),
            type: 'assistant',
            content: `## Analysis of ${analysisSource} ${contentSource}\n\n${this.formatAnalysisResult(analysisResult)}`,
            timestamp: new Date(),
            context: session.context,
            metadata: {
              confidence: analysisResult.confidence,
              fileAnalyzed: analysisResult.fileUri.fsPath,
              isFromEditor: fileContent.isFromEditor
            }
          };
        } else {
          throw new Error(`Could not read active file: ${session.context.activeFile}`);
        }
      } else {
        // No code to analyze - provide helpful guidance
        return {
          id: this.generateMessageId(),
          type: 'assistant',
          content: `## No Code to Analyze

I need some code to analyze! You can:

1. **Select code** in the editor and then use \`/analyze\`
2. **Open a file** in the editor and use \`/analyze\`  
3. **Provide code directly**: \`/analyze your code here\`
4. **Analyze specific file**: \`/analyze /path/to/file.js\`

**Examples:**
- \`/analyze\` (analyzes current file or selection)
- \`/analyze function add(a, b) { return a + b; }\`
- \`/analyze /Users/user/project/app.js\` (absolute path)
- \`/analyze src/components/Button.tsx\` (relative path)
- Select code in editor → \`/analyze\`

💡 **Tip:** I can analyze files from the file system or directly from your editor (including unsaved changes)!`,
          timestamp: new Date(),
          context: session.context,
          metadata: {
            confidence: 1.0,
            fileAnalyzed: 'none - guidance provided'
          }
        };
      }
    } catch (error) {
      throw new Error(`Analysis failed: ${error}`);
    }
  }

  private async handleSuggestCommand(args: string, session: ChatSession): Promise<ChatMessage> {
    try {
      const response = await this.ollamaService.processCommand('suggest', args, session.context);
      
      return {
        id: this.generateMessageId(),
        type: 'assistant',
        content: response.message.content,
        timestamp: new Date(),
        context: session.context,
        metadata: {
          tokens: response.usage.total_tokens,
          model: response.model,
          confidence: response.confidence || 0.7,
          suggestions: response.suggestions || []
        }
      };
    } catch (error) {
      throw new Error(`Failed to generate suggestions: ${error}`);
    }
  }

  private async handleExplainCommand(args: string, session: ChatSession): Promise<ChatMessage> {
    try {
      const codeToExplain = args.trim() || session.context.selectedText || 'current file';
      const response = await this.ollamaService.processCommand('explain', codeToExplain, session.context);
      
      return {
        id: this.generateMessageId(),
        type: 'assistant',
        content: response.message.content,
        timestamp: new Date(),
        context: session.context,
        metadata: {
          tokens: response.usage.total_tokens,
          model: response.model,
          confidence: response.confidence || 0.7
        }
      };
    } catch (error) {
      throw new Error(`Failed to explain code: ${error}`);
    }
  }

  private async handleOptimizeCommand(args: string, session: ChatSession): Promise<ChatMessage> {
    try {
      const response = await this.ollamaService.processCommand('optimize', args, session.context);
      
      return {
        id: this.generateMessageId(),
        type: 'assistant',
        content: response.message.content,
        timestamp: new Date(),
        context: session.context,
        metadata: {
          tokens: response.usage.total_tokens,
          model: response.model,
          confidence: response.confidence || 0.7
        }
      };
    } catch (error) {
      throw new Error(`Failed to optimize code: ${error}`);
    }
  }

  private async handleDebugCommand(args: string, session: ChatSession): Promise<ChatMessage> {
    try {
      const response = await this.ollamaService.processCommand('debug', args, session.context);
      
      return {
        id: this.generateMessageId(),
        type: 'assistant',
        content: response.message.content,
        timestamp: new Date(),
        context: session.context,
        metadata: {
          tokens: response.usage.total_tokens,
          model: response.model,
          confidence: response.confidence || 0.7
        }
      };
    } catch (error) {
      throw new Error(`Failed to debug code: ${error}`);
    }
  }

  private async handleHelpCommand(): Promise<ChatMessage> {
    const helpText = `# Available Commands

**Code Analysis:**
- \`/analyze [code]\` - Analyze code for insights and improvements
- \`/suggest [code]\` - Get specific improvement suggestions
- \`/explain [code]\` - Explain how code works
- \`/optimize [code]\` - Get performance optimization suggestions
- \`/debug [code]\` - Help identify potential bugs

**Session Management:**
- \`/summary\` - Get a summary of the current conversation
- \`/context\` - Show current context information
- \`/help\` - Show this help message

**Tips:**
- Select code in the editor before using commands for context
- Commands work with the currently active file
- You can also just chat naturally for general questions!`;

    return {
      id: this.generateMessageId(),
      type: 'assistant',
      content: helpText,
      timestamp: new Date(),
      context: {}
    };
  }

  private async handleSummaryCommand(session: ChatSession): Promise<ChatMessage> {
    try {
      const chatMessages: ChatCompletionMessage[] = session.messages.map(msg => ({
        role: msg.type === 'user' ? 'user' : msg.type === 'assistant' ? 'assistant' : 'system',
        content: msg.content
      }));

      const summary = await this.ollamaService.generateContextualSummary(chatMessages, session.context);
      
      return {
        id: this.generateMessageId(),
        type: 'assistant',
        content: `## Conversation Summary\n\n${summary}`,
        timestamp: new Date(),
        context: session.context
      };
    } catch (error) {
      throw new Error(`Failed to generate summary: ${error}`);
    }
  }

  private async handleContextCommand(session: ChatSession): Promise<ChatMessage> {
    const context = session.context;
    let contextInfo = '## Current Context\n\n';

    if (context.activeFile) {
      const fileName = context.activeFile.split('/').pop();
      contextInfo += `**Active File:** ${fileName}\n`;
    }

    if (context.selectedText) {
      const lines = context.selectedText.split('\n').length;
      const chars = context.selectedText.length;
      contextInfo += `**Selected Text:** ${lines} lines, ${chars} characters\n`;
    }

    if (context.workspaceFiles && context.workspaceFiles.length > 0) {
      contextInfo += `**Workspace:** ${context.workspaceFiles.length} files\n`;
    }

    if (context.analysisResults && context.analysisResults.length > 0) {
      contextInfo += `**Previous Analysis:** ${context.analysisResults.length} results\n`;
    }

    contextInfo += `\n**Session:** ${session.messages.length} messages since ${session.createdAt.toLocaleString()}`;

    return {
      id: this.generateMessageId(),
      type: 'assistant',
      content: contextInfo,
      timestamp: new Date(),
      context: session.context
    };
  }

  // Utility Methods
  private async buildFileContext(uri: vscode.Uri, context: ChatContext): Promise<FileContext> {
    try {
      const document = await vscode.workspace.openTextDocument(uri);
      const content = context.selectedText || document.getText();
      
      return {
        uri,
        content,
        language: document.languageId,
        lastModified: new Date(),
        size: content.length,
        hash: this.generateHash(content),
        relationships: []
      };
    } catch (error) {
      throw new Error(`Failed to build file context: ${error}`);
    }
  }

  private formatAnalysisResult(result: AnalysisResult): string {
    let output = `## Analysis Results\n\n`;
    output += `**File:** ${result.fileUri.toString().split('/').pop()}\n`;
    output += `**Language:** ${result.language}\n`;
    output += `**Confidence:** ${Math.round(result.confidence * 100)}%\n\n`;
    output += `### Summary\n${result.summary}\n\n`;
    
    if (result.suggestions.length > 0) {
      output += `### Suggestions\n`;
      result.suggestions.forEach((suggestion, index) => {
        output += `${index + 1}. **${suggestion.title}** (${suggestion.category})\n`;
        output += `   ${suggestion.description}\n\n`;
      });
    }

    return output;
  }

  private async generateSessionSummary(session: ChatSession): Promise<string> {
    try {
      const chatMessages: ChatCompletionMessage[] = session.messages.slice(-10).map(msg => ({
        role: msg.type === 'user' ? 'user' : msg.type === 'assistant' ? 'assistant' : 'system',
        content: msg.content
      }));

      return await this.ollamaService.generateContextualSummary(chatMessages, session.context);
    } catch (error) {
      return `Session with ${session.messages.length} messages`;
    }
  }

  private generateSessionTitle(context: ChatContext): string {
    if (context.activeFile) {
      const fileName = context.activeFile.split('/').pop();
      return `Chat about ${fileName}`;
    }
    
    return `Chat Session - ${new Date().toLocaleDateString()}`;
  }

  private trimSessionHistory(session: ChatSession): void {
    if (session.messages.length > this.maxHistoryLength) {
      // Keep the first message (usually contains important context) and recent messages
      const firstMessage = session.messages[0];
      const recentMessages = session.messages.slice(-this.maxHistoryLength + 1);
      if (firstMessage) {
        session.messages = [firstMessage, ...recentMessages];
      } else {
        session.messages = recentMessages;
      }
    }
  }

  private initializeCommands(): void {
    this.commands = [
      {
        name: 'analyze',
        description: 'Analyze code for insights and improvements',
        handler: 'handleAnalyzeCommand',
        parameters: [
          { name: 'code', type: 'string', description: 'Code to analyze (optional if file/selection available)' }
        ]
      },
      {
        name: 'suggest',
        description: 'Get improvement suggestions',
        handler: 'handleSuggestCommand'
      },
      {
        name: 'explain',
        description: 'Explain how code works',
        handler: 'handleExplainCommand'
      },
      {
        name: 'optimize',
        description: 'Get performance optimization suggestions',
        handler: 'handleOptimizeCommand'
      },
      {
        name: 'debug',
        description: 'Help identify potential bugs',
        handler: 'handleDebugCommand'
      },
      {
        name: 'help',
        description: 'Show available commands',
        handler: 'handleHelpCommand'
      }
    ];
  }

  private generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private generateHash(content: string): string {
    let hash = 0;
    for (let i = 0; i < content.length; i++) {
      const char = content.charCodeAt(i);
      hash = ((hash << 5) - hash) + char;
      hash = hash & hash; // Convert to 32-bit integer
    }
    return hash.toString(36);
  }

  // Public API for external integration
  public getAvailableCommands(): ChatCommand[] {
    return [...this.commands];
  }

  public getActiveSessionCount(): number {
    return this.activeSessions.size;
  }

  public async clearSession(sessionId: string): Promise<void> {
    this.activeSessions.delete(sessionId);
    await this.contextStore.clearConversationHistory(sessionId);
  }

  public async getAllSessions(): Promise<ChatSession[]> {
    return Array.from(this.activeSessions.values());
  }
}

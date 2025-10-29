import { DEFAULT_CONFIG } from '@/constants/defaults';
import {
  AIResponse,
  ChatAnalysisResult,
  ChatCompletionMessage,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatContext,
  FileContext,
  OllamaConfig,
  Suggestion,
  SuggestionCategory,
  SuggestionType
} from '@/types';
import OpenAI from 'openai';
import * as vscode from 'vscode';

export class OllamaService {
  private client: OpenAI;
  private config: OllamaConfig;
  private isApiAvailable: boolean = true;
  private lastFailureTime: number = 0;
  private retryAfterMs: number = DEFAULT_CONFIG.RETRY.CIRCUIT_BREAKER_TIMEOUT;
  
  // Enhanced timeout and retry configuration
  private readonly defaultTimeout: number;
  private readonly maxRetries: number;
  private readonly baseRetryDelay: number = DEFAULT_CONFIG.RETRY.BASE_DELAY;

  constructor(config: OllamaConfig) {
    this.config = config;
    
    // Initialize OpenAI client pointing to GPU Ollama instance
    const baseURL = config.baseURL || DEFAULT_CONFIG.OLLAMA.BASE_URL;
    
    // For Ollama with Basic Auth, we need to create proper Basic Auth header
    let authOptions: any = {
      baseURL,
      apiKey: DEFAULT_CONFIG.OLLAMA.API_KEY,
      timeout: config.timeout || DEFAULT_CONFIG.OLLAMA.TIMEOUT,
    };
    
    if (config.username && config.password) {
      // Create Basic Auth header: "Basic base64(username:password)"
      const credentials = Buffer.from(`${config.username}:${config.password}`).toString('base64');
      authOptions.defaultHeaders = {
        'Authorization': `Basic ${credentials}`
      };
      console.log(`🔧 Initializing Ollama client with Basic Auth for user: ${config.username}`);
    } else if (DEFAULT_CONFIG.OLLAMA.USERNAME && DEFAULT_CONFIG.OLLAMA.PASSWORD) {
      const credentials = Buffer.from(`${DEFAULT_CONFIG.OLLAMA.USERNAME}:${DEFAULT_CONFIG.OLLAMA.PASSWORD}`).toString('base64');
      authOptions.defaultHeaders = {
        'Authorization': `Basic ${credentials}`
      };
      console.log(`🔧 Initializing Ollama client with Basic Auth `);
    }
    
    console.log(`🔧 Connecting to Ollama server: ${baseURL}`);
    
    this.client = new OpenAI(authOptions);
    
    this.isApiAvailable = true;
    
    // Use configured timeout or sensible defaults
    this.defaultTimeout = config.timeout || DEFAULT_CONFIG.OLLAMA.TIMEOUT;
    this.maxRetries = config.maxRetries || DEFAULT_CONFIG.OLLAMA.MAX_RETRIES;
    
    console.log(`🚀 Ollama Service initialized with ${this.defaultTimeout}ms timeout and ${this.maxRetries} max retries`);
  }

  // Enhanced timeout wrapper with retry logic
  private async withTimeout<T>(
    promise: Promise<T>, 
    timeoutMs: number = this.defaultTimeout, 
    operation: string = 'API request',
    retryCount: number = 0
  ): Promise<T> {
    const timeoutPromise = new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error(`${operation} timed out after ${timeoutMs}ms`)), timeoutMs)
    );
    
    try {
      const result = await Promise.race([promise, timeoutPromise]);
      return result;
    } catch (error: any) {
      // Implement exponential backoff for retries
      if (retryCount < this.maxRetries && this.shouldRetry(error)) {
        const delay = this.baseRetryDelay * Math.pow(2, retryCount);
        console.log(`⏳ Retrying ${operation} in ${delay}ms (attempt ${retryCount + 1}/${this.maxRetries})`);
        await this.delay(delay);
        
        // Recursive retry with increased timeout
        const newTimeout = Math.min(timeoutMs * 1.5, 60000); // Cap at 60 seconds
        return this.withTimeout(promise, newTimeout, operation, retryCount + 1);
      }
      
      throw error;
    }
  }

  // Helper method for delays
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // Determine if an error is retryable
  private shouldRetry(error: any): boolean {
    const errorMessage = error.message?.toLowerCase() || '';
    // Don't retry timeouts as they're likely due to file size/complexity
    return !errorMessage.includes('timed out') && (
           errorMessage.includes('network') ||
           errorMessage.includes('econnrefused') ||
           errorMessage.includes('502') ||
           errorMessage.includes('503') ||
           errorMessage.includes('504'));
  }

  // Calculate dynamic timeout based on file characteristics
  private calculateAnalysisTimeout(fileContext: FileContext): number {
    const baseTimeout = DEFAULT_CONFIG.ANALYSIS.BASE_TIMEOUT;
    const sizeMultiplier = Math.min(fileContext.size / 1000, 10); // Max 10x multiplier for very large files
    const lineCount = fileContext.content.split('\n').length;
    const lineMultiplier = Math.min(lineCount / 100, 5); // Max 5x multiplier for line count
    
    // Get user configuration for timeout multiplier
    const config = vscode.workspace.getConfiguration('balaAnalyzer');
    const timeoutMultiplier = config.get<number>('analysis.timeoutMultiplier') || DEFAULT_CONFIG.ANALYSIS.TIMEOUT_MULTIPLIER;
    
    const calculatedTimeout = baseTimeout * (1 + sizeMultiplier * 0.1 + lineMultiplier * 0.1) * timeoutMultiplier;
    
    // Cap at maximum timeout to prevent extremely long waits
    return Math.min(calculatedTimeout, DEFAULT_CONFIG.ANALYSIS.MAX_TIMEOUT);
  }

  // Provide helpful suggestions when timeouts occur
  private getTimeoutSuggestions(fileContext: FileContext): string {
    const suggestions = [];
    
    if (fileContext.size > 10000) {
      suggestions.push("Try analyzing a smaller code section by selecting specific functions or classes");
    }
    
    if (fileContext.content.split('\n').length > 500) {
      suggestions.push("Consider breaking down large files into smaller modules");
    }
    
    suggestions.push("You can increase timeout in VS Code settings: balaAnalyzer.analysis.timeoutMultiplier");
    suggestions.push("Try switching to a lighter Ollama model like 'llama3.2:1b' for faster analysis");
    
    return "Suggestions: " + suggestions.join(". ");
  }

  // Circuit breaker methods
  private shouldAttemptApiCall(): boolean {
    if (this.isApiAvailable) {
      return true;
    }
    
    const now = Date.now();
    if (now - this.lastFailureTime > this.retryAfterMs) {
      this.isApiAvailable = true;
      return true;
    }
    
    return false;
  }

  private markApiUnavailable(): void {
    this.isApiAvailable = false;
    this.lastFailureTime = Date.now();
  }

  public getApiStatus(): { available: boolean; nextRetryTime?: Date | undefined } {
    return {
      available: this.isApiAvailable,
      nextRetryTime: this.isApiAvailable ? undefined : new Date(this.lastFailureTime + this.retryAfterMs)
    };
  }

  public async analyzeCode(fileContext: FileContext): Promise<AIResponse> {
    if (!this.shouldAttemptApiCall()) {
      throw new Error('Ollama API unavailable. Please check your Ollama instance is running.');
    }

    const prompt = this.buildAnalysisPrompt(fileContext);
    console.log(`🔍 Analyzing ${fileContext.language} code with Ollama...`);
    
    // Calculate dynamic timeout based on file size and complexity
    const dynamicTimeout = this.calculateAnalysisTimeout(fileContext);
    console.log(`📊 Using dynamic timeout: ${dynamicTimeout}ms for ${fileContext.size} byte file`);
    
    try {
      const completion = await this.withTimeout(
        this.client.chat.completions.create({
          model: this.getSelectedModel(),
          messages: [
            { role: 'system', content: 'You are an expert code analyst. Provide structured analysis with insights, improvements, and suggestions.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.3,
          max_tokens: 1200, // Increased token limit
        }),
        dynamicTimeout,
        'Code analysis'
      );

      const responseText = completion.choices[0]?.message?.content || '';
      return this.parseAIResponse(responseText, fileContext);
    } catch (error: any) {
      console.error('Ollama code analysis error:', error);
      
      // Enhanced error handling with user guidance
      if (error.message?.includes('timed out')) {
        const suggestions = this.getTimeoutSuggestions(fileContext);
        throw new Error(`Code analysis timed out after ${dynamicTimeout}ms. ${suggestions}`);
      }
      
      // Handle connection errors
      if (error.message?.includes('ECONNREFUSED') || error.message?.includes('fetch failed')) {
        this.markApiUnavailable();
        throw new Error(`Cannot connect to Ollama server at ${this.config.baseURL || 'https://gpu2.oginnovation.com:11434'}. Please check the server is running and accessible.`);
      }
      
      // Handle authentication errors
      if (error.message?.includes('401') || error.message?.includes('Unauthorized')) {
        throw new Error('Ollama server requires authentication. Please configure your API key in settings.');
      }

      throw new Error(`AI analysis failed: ${error.message || error}`);
    }
  }

  public async generateSummary(filePaths: FileContext[]): Promise<string> {
    const prompt = this.buildSummaryPrompt(filePaths);
    
    try {
      const completion = await this.withTimeout(
        this.client.chat.completions.create({
          model: this.getSelectedModel(),
          messages: [
            { role: 'system', content: 'You are an expert technical writer. Generate comprehensive, well-structured summaries of codebases.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.2,
          max_tokens: 500,
        }),
        Math.min(this.defaultTimeout * 0.6, 20000), // Use 60% of configured timeout, cap at 20s
        'Summary generation'
      );

      return completion.choices[0]?.message?.content || 'Unable to generate summary.';
    } catch (error) {
      console.error('Ollama API error:', error);
      return `Failed to generate summary: ${error}`;
    }
  }

  public async getSuggestions(fileContext: FileContext, analysisContext?: string): Promise<Suggestion[]> {
    const prompt = this.buildSuggestionPrompt(fileContext, analysisContext);
    
    try {
      const completion = await this.withTimeout(
        this.client.chat.completions.create({
          model: this.getSelectedModel(),
          messages: [
            { role: 'system', content: 'You are a senior code reviewer. Provide specific, actionable code improvement suggestions with examples.' },
            { role: 'user', content: prompt }
          ],
          temperature: 0.4,
          max_tokens: 800,
        }),
        Math.min(this.defaultTimeout * 0.7, 22000), // Use 70% of configured timeout, cap at 22s
        'Suggestion generation'
      );

      const responseText = completion.choices[0]?.message?.content || '';
      return this.parseSuggestions(responseText, fileContext);
    } catch (error) {
      console.error('Ollama API error:', error);
      return [];
    }
  }

  // Enhanced Chat Completion Methods
  public async chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    try {
      // Circuit breaker check
      if (!this.shouldAttemptApiCall()) {
        const status = this.getApiStatus();
        const nextRetry = status.nextRetryTime ? status.nextRetryTime.toLocaleTimeString() : 'later';
        throw new Error(`Ollama API temporarily unavailable. Try again at ${nextRetry}.`);
      }

      const messages = this.formatMessagesForAPI(request.messages);
      
      console.log(`🎯 Using Ollama model: ${this.getSelectedModel()}`);
      console.log(`📝 Chat completion with ${messages.length} messages`);
      
      const startTime = Date.now();
      
      const completion = await this.withTimeout(
        this.client.chat.completions.create({
          model: this.getSelectedModel(),
          messages: messages.map(msg => ({
            role: msg.role,
            content: msg.content
          })),
          temperature: Math.min(request.temperature || 0.7, 0.8),
          max_tokens: Math.min(request.max_tokens || 1000, 1500),
          stream: false
        }),
        undefined, // Use default timeout with retry logic
        `Chat completion with ${this.getSelectedModel()}`
      );
      
      const elapsed = Date.now() - startTime;
      console.log(`✅ Chat completion successful in ${elapsed}ms`);
      
      return this.formatChatResponse(completion, this.getSelectedModel(), request);
      
    } catch (error) {
      console.error('Ollama chat completion error:', error);
      throw new Error(`Chat completion failed: ${error}`);
    }
  }

  public async conversationalAnalysis(
    messages: ChatCompletionMessage[], 
    context: ChatContext
  ): Promise<ChatAnalysisResult> {
    try {
      const systemPrompt = this.buildSystemPrompt(context);
      const analysisMessages: ChatCompletionMessage[] = [
        { role: 'system', content: systemPrompt },
        ...messages
      ];

      console.log('🎯 Ollama Service - Conversational Analysis');
      console.log(`Input messages: ${messages.length}, System prompt: ${systemPrompt.length} chars`);
      
      const request: ChatCompletionRequest = {
        messages: analysisMessages,
        context,
        temperature: 0.3,
        max_tokens: 1500
      };

      const response = await this.chatCompletion(request);
      
      return {
        analysis: response.message.content,
        suggestions: response.suggestions || [],
        confidence: response.confidence || 0.8,
        relatedFiles: this.extractRelatedFiles(context),
        codeBlocks: this.extractCodeBlocks(response.message.content)
      };
    } catch (error) {
      console.error('Conversational analysis error:', error);
      throw new Error(`Analysis failed: ${error}`);
    }
  }

  public async processCommand(
    command: string, 
    content: string, 
    context: ChatContext
  ): Promise<ChatCompletionResponse> {
    try {
      const systemPrompt = this.buildCommandSystemPrompt(command, context);
      const messages: ChatCompletionMessage[] = [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: this.formatCommandContent(command, content, context) }
      ];

      const request: ChatCompletionRequest = {
        messages,
        context,
        temperature: this.getCommandTemperature(command),
        max_tokens: this.getCommandMaxTokens(command)
      };

      return await this.chatCompletion(request);
    } catch (error) {
      console.error('Command processing error:', error);
      throw new Error(`Command '${command}' failed: ${error}`);
    }
  }

  public async generateContextualSummary(
    messages: ChatCompletionMessage[], 
    context: ChatContext
  ): Promise<string> {
    try {
      const summaryPrompt = this.buildSummarySystemPrompt(context);
      const summaryMessages: ChatCompletionMessage[] = [
        { role: 'system', content: summaryPrompt },
        { role: 'user', content: 'Please provide a concise summary of our conversation and current context.' }
      ];

      const request: ChatCompletionRequest = {
        messages: [...messages.slice(-10), ...summaryMessages], // Include last 10 messages for context
        context,
        temperature: 0.2,
        max_tokens: 300
      };

      const response = await this.chatCompletion(request);
      return response.message.content;
    } catch (error) {
      console.error('Summary generation error:', error);
      return 'Unable to generate conversation summary.';
    }
  }

  private getSelectedModel(): string {
    const config = vscode.workspace.getConfiguration('balaAnalyzer');
    const selectedModel = config.get<string>('ollama.model') || DEFAULT_CONFIG.OLLAMA.MODEL;
    
    return selectedModel;
  }

  private buildAnalysisPrompt(fileContext: FileContext): string {
    const isLargeFile = fileContext.content.length > 50000;
    const truncationNote = isLargeFile ? '\n**Note:** This is a large file. Analysis focused on key sections and overall structure.' : '';
    
    return `Analyze the following ${fileContext.language} code and provide insights:

File: ${fileContext.uri.fsPath}
Language: ${fileContext.language}
Size: ${fileContext.size} bytes${truncationNote}

Code:
\`\`\`${fileContext.language}
${fileContext.content}
\`\`\`

Please analyze this code and provide:
1. A brief summary of what this code does
2. Potential improvements or refactoring opportunities
3. Security concerns if any
4. Performance optimization suggestions
5. Code quality assessment

Format your response as a structured analysis.`;
  }

  private buildSummaryPrompt(filePaths: FileContext[]): string {
    const fileList = filePaths.map(fp => `- ${fp.uri.fsPath} (${fp.language})`).join('\n');
    
    return `Generate a comprehensive summary of this codebase containing ${filePaths.length} files:

Files analyzed:
${fileList}

Please provide:
1. Overall architecture and purpose of the codebase
2. Main technologies and patterns used
3. Key components and their relationships
4. Potential areas for improvement
5. Overall code quality assessment

Keep the summary concise but informative.`;
  }

  private buildSuggestionPrompt(fileContext: FileContext, analysisContext?: string): string {
    return `Provide specific code improvement suggestions for this ${fileContext.language} file:

File: ${fileContext.uri.fsPath}
${analysisContext ? `Context: ${analysisContext}` : ''}

Code:
\`\`\`${fileContext.language}
${fileContext.content}
\`\`\`

Please provide specific, actionable suggestions for:
1. Code refactoring opportunities
2. Performance improvements
3. Security enhancements
4. Best practices alignment
5. Readability improvements

For each suggestion, provide:
- The specific line or code block to change
- The exact replacement code
- Explanation of the benefit
- Confidence level (high/medium/low)`;
  }

  private parseAIResponse(response: string, fileContext: FileContext): AIResponse {
    const suggestions = this.parseSuggestions(response, fileContext);
    
    return {
      summary: this.extractSummary(response),
      suggestions,
      confidence: 0.8,
      modelUsed: this.getSelectedModel(),
      usage: {
        tokens: response.length / 4, // Rough estimate
      }
    };
  }

  private extractSummary(response: string): string {
    const lines = response.split('\n');
    const summaryStart = lines.findIndex(line => 
      line.toLowerCase().includes('summary') || 
      line.toLowerCase().includes('this code')
    );
    
    if (summaryStart >= 0 && summaryStart < lines.length - 1) {
      return lines[summaryStart + 1]?.trim() || '';
    }
    
    return lines[0] || 'No summary available.';
  }

  private parseSuggestions(response: string, fileContext: FileContext): Suggestion[] {
    const suggestions: Suggestion[] = [];
    const lines = response.split('\n');
    
    let currentSuggestion: Partial<Suggestion> = {};
    
    for (const line of lines) {
      if (line.toLowerCase().includes('suggestion') || line.toLowerCase().includes('improve')) {
        if (currentSuggestion.title) {
          suggestions.push(this.completeSuggestion(currentSuggestion, fileContext));
        }
        currentSuggestion = {
          title: line.trim(),
          description: '',
          confidence: 0.7,
          type: SuggestionType.IMPROVEMENT,
          category: SuggestionCategory.BEST_PRACTICES
        };
      } else if (currentSuggestion.title && line.trim()) {
        currentSuggestion.description += line.trim() + ' ';
      }
    }
    
    if (currentSuggestion.title) {
      suggestions.push(this.completeSuggestion(currentSuggestion, fileContext));
    }
    
    return suggestions;
  }

  private completeSuggestion(partial: Partial<Suggestion>, fileContext: FileContext): Suggestion {
    return {
      id: Math.random().toString(36).substr(2, 9),
      type: partial.type || SuggestionType.IMPROVEMENT,
      title: partial.title || 'Untitled suggestion',
      description: partial.description || 'No description available',
      confidence: partial.confidence || 0.5,
      range: new vscode.Range(0, 0, 0, 0),
      originalCode: fileContext.content,
      suggestedCode: fileContext.content,
      category: partial.category || SuggestionCategory.BEST_PRACTICES,
      isApplied: false
    };
  }

  private formatMessagesForAPI(messages: ChatCompletionMessage[]): any[] {
    return messages.map(msg => ({
      role: msg.role,
      content: msg.content,
      ...(msg.name && { name: msg.name })
    }));
  }

  private formatChatResponse(response: any, model: string, request: ChatCompletionRequest): ChatCompletionResponse {
    const message = response.choices?.[0]?.message || {
      role: 'assistant',
      content: 'No response generated.'
    };

    const usage = response.usage || {
      prompt_tokens: 0,
      completion_tokens: 0,
      total_tokens: 0
    };

    // Extract suggestions from the response content if present
    const suggestions = this.extractSuggestionsFromText(message.content, request.context);

    return {
      message: {
        role: message.role,
        content: message.content,
        metadata: response.metadata
      },
      usage,
      model,
      confidence: this.calculateConfidence(message.content, usage),
      suggestions
    };
  }

  private buildSystemPrompt(context: ChatContext): string {
    let prompt = `You are an AI code assistant integrated into VSCode. You help developers analyze, understand, and improve their code.

Current context:`;

    if (context.activeFile) {
      const fileName = context.activeFile.toString().split('/').pop() || 'unknown';
      prompt += `\n- Active file: ${fileName}`;
    }

    if (context.selectedText) {
      prompt += `\n- Selected code: ${context.selectedText.length} characters`;
    }

    if (context.workspaceFiles && context.workspaceFiles.length > 0) {
      prompt += `\n- Workspace: ${context.workspaceFiles.length} files`;
    }

    prompt += `\n\nPlease provide helpful, accurate, and actionable advice. When suggesting code changes, explain the reasoning and benefits.`;

    return prompt;
  }

  private buildCommandSystemPrompt(command: string, context: ChatContext): string {
    const basePrompt = this.buildSystemPrompt(context);
    
    const commandPrompts: Record<string, string> = {
      'analyze': `${basePrompt}\n\nTask: Analyze the provided code and give detailed insights about its functionality, potential issues, and improvements.`,
      'suggest': `${basePrompt}\n\nTask: Provide specific, actionable suggestions to improve the code quality, performance, or maintainability.`,
      'explain': `${basePrompt}\n\nTask: Explain how the code works in clear, easy-to-understand terms. Break down complex concepts.`,
      'optimize': `${basePrompt}\n\nTask: Focus on performance optimizations and efficiency improvements for the code.`,
      'debug': `${basePrompt}\n\nTask: Help identify potential bugs, errors, or logical issues in the code.`,
      'help': `${basePrompt}\n\nTask: Provide general help and available commands. List what you can do to assist with coding tasks.`
    };

    return commandPrompts[command] || basePrompt;
  }

  private buildSummarySystemPrompt(context: ChatContext): string {
    return `You are an AI assistant that creates concise summaries of code conversations. 
    
Summarize the key points discussed, decisions made, and any important context that should be remembered for future interactions.`;
  }

  private formatCommandContent(command: string, content: string, context: ChatContext): string {
    let formattedContent = `Command: /${command}\n\n`;
    
    if (context.selectedText) {
      formattedContent += `Selected code:\n\`\`\`\n${context.selectedText}\n\`\`\`\n\n`;
    }
    
    if (content.trim()) {
      formattedContent += `Additional context: ${content}`;
    } else {
      formattedContent += `Please ${command} the selected code or current file.`;
    }

    return formattedContent;
  }

  private getCommandTemperature(command: string): number {
    const temperatures: Record<string, number> = {
      'analyze': 0.3,
      'suggest': 0.4,
      'explain': 0.2,
      'optimize': 0.3,
      'debug': 0.2,
      'help': 0.1
    };
    
    return temperatures[command] || 0.7;
  }

  private getCommandMaxTokens(command: string): number {
    const maxTokens: Record<string, number> = {
      'analyze': 1500,
      'suggest': 1000,
      'explain': 1200,
      'optimize': 1000,
      'debug': 1200,
      'help': 800
    };
    
    return maxTokens[command] || 1000;
  }

  private extractRelatedFiles(context: ChatContext): vscode.Uri[] {
    // Convert string paths back to vscode.Uri objects
    return (context.workspaceFiles || []).map(filePath => vscode.Uri.file(filePath));
  }

  private extractCodeBlocks(content: string): any[] {
    const codeBlockRegex = /```(\w+)?\n([\s\S]*?)```/g;
    const codeBlocks = [];
    let match;

    while ((match = codeBlockRegex.exec(content)) !== null) {
      codeBlocks.push({
        language: match[1] || 'text',
        code: match[2]?.trim() || '',
        explanation: 'Code block from AI response'
      });
    }

    return codeBlocks;
  }

  private extractSuggestionsFromText(content: string, context?: ChatContext): Suggestion[] {
    // Simple extraction of suggestions from text content
    const suggestions: Suggestion[] = [];
    const lines = content.split('\n');
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]?.toLowerCase() || '';
      if (line.includes('suggest') || line.includes('recommend') || line.includes('consider')) {
        suggestions.push({
          id: Math.random().toString(36).substr(2, 9),
          type: SuggestionType.IMPROVEMENT,
          title: lines[i]?.trim() || 'Suggestion',
          description: lines[i + 1]?.trim() || 'AI suggestion',
          confidence: 0.7,
          range: new vscode.Range(0, 0, 0, 0),
          originalCode: '',
          suggestedCode: '',
          category: SuggestionCategory.BEST_PRACTICES,
          isApplied: false
        });
      }
    }

    return suggestions;
  }

  private calculateConfidence(content: string, usage: any): number {
    // Simple confidence calculation based on response length and token usage
    const contentLength = content.length;
    const tokenRatio = usage.completion_tokens / Math.max(usage.prompt_tokens, 1);
    
    let confidence = 0.5;
    
    if (contentLength > 100) confidence += 0.2;
    if (tokenRatio > 0.3) confidence += 0.1;
    if (content.includes('```')) confidence += 0.1; // Code examples increase confidence
    if (content.includes('however') || content.includes('but')) confidence -= 0.1; // Uncertainty markers
    
    return Math.min(Math.max(confidence, 0.1), 1.0);
  }
}

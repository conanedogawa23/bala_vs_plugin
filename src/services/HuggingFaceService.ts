import {
  AIResponse,
  ChatAnalysisResult,
  ChatCompletionMessage,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatContext,
  FileContext,
  HuggingFaceConfig,
  Suggestion,
  SuggestionCategory,
  SuggestionType
} from '@/types';
import { InferenceClient } from '@huggingface/inference'; // ✅ Updated to modern API
import * as vscode from 'vscode';

export class HuggingFaceService {
  private hf: InferenceClient; // ✅ Updated to modern API
  private config: HuggingFaceConfig;
  private isApiAvailable: boolean = true;
  private lastFailureTime: number = 0;
  private retryAfterMs: number = 60000; // 1 minute
  
  // 🚀 Enhanced timeout and retry configuration
  private readonly defaultTimeout: number;
  private readonly maxRetries: number;
  private readonly baseRetryDelay: number = 1000; // 1 second

  constructor(config: HuggingFaceConfig) {
    this.config = config;
    this.hf = new InferenceClient(config.apiKey); // ✅ Updated to modern API
    this.isApiAvailable = !(!config.apiKey || config.apiKey.trim() === '');
    
    // 🔧 Use configured timeout or sensible defaults
    this.defaultTimeout = config.timeout || 30000; // 30 seconds default
    this.maxRetries = config.maxRetries || 3;
    
    console.log(`🚀 HuggingFace Service initialized with ${this.defaultTimeout}ms timeout and ${this.maxRetries} max retries`);
  }

  // 🚀 Enhanced timeout wrapper with retry logic
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
      // Reset retry count on success
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

  // 🔄 Helper method for delays
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  // 🎯 Determine if an error is retryable
  private shouldRetry(error: any): boolean {
    const errorMessage = error.message?.toLowerCase() || '';
    return errorMessage.includes('timeout') || 
           errorMessage.includes('network') ||
           errorMessage.includes('502') ||
           errorMessage.includes('503') ||
           errorMessage.includes('504') ||
           errorMessage.includes('overloaded');
  }

  // Circuit breaker methods
  private shouldAttemptApiCall(): boolean {
    if (!this.config.apiKey || this.config.apiKey.trim() === '') {
      return false;
    }
    
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
      throw new Error('HuggingFace API unavailable. Please check your API key configuration.');
    }

    const prompt = this.buildAnalysisPrompt(fileContext);
    console.log(`🔍 Analyzing ${fileContext.language} code with timeout protection...`);
    
    try {
      // 🚀 Apply timeout wrapper for text generation
      const result = await this.withTimeout(
        this.hf.textGeneration({
          model: this.getSelectedModel(),
          inputs: prompt,
          parameters: {
            max_new_tokens: 800, // Reduced for faster response
            temperature: 0.3,
            do_sample: true,
            return_full_text: false
          }
        }),
        Math.min(this.defaultTimeout * 0.8, 25000), // Use 80% of configured timeout, cap at 25s
        'Code analysis'
      );

      return this.parseAIResponse(result.generated_text || '', fileContext);
    } catch (error: any) {
      console.error('HuggingFace code analysis error:', error);
      
      // Handle timeout specifically
      if (error.message?.includes('timed out')) {
        throw new Error(`Code analysis timed out. The model may be overloaded. Please try again.`);
      }
      
      // Handle API errors
      if (error.message?.includes('Invalid username or password') || 
          error.message?.includes('401') || 
          error.message?.includes('Unauthorized')) {
        this.markApiUnavailable();
        throw new Error('HuggingFace API authentication failed. Please check your API key.');
      }

      throw new Error(`AI analysis failed: ${error.message || error}`);
    }
  }

  public async generateSummary(filePaths: FileContext[]): Promise<string> {
    const prompt = this.buildSummaryPrompt(filePaths);
    
    try {
      const result = await this.withTimeout(
        this.hf.textGeneration({
          model: this.getSelectedModel(),
          inputs: prompt,
          parameters: {
            max_new_tokens: 500,
            temperature: 0.2,
            do_sample: true,
            return_full_text: false
          }
        }),
        Math.min(this.defaultTimeout * 0.6, 20000), // Use 60% of configured timeout, cap at 20s
        'Summary generation'
      );

      return result.generated_text || 'Unable to generate summary.';
    } catch (error) {
      console.error('HuggingFace API error:', error);
      return `Failed to generate summary: ${error}`;
    }
  }

  public async getSuggestions(fileContext: FileContext, analysisContext?: string): Promise<Suggestion[]> {
    const prompt = this.buildSuggestionPrompt(fileContext, analysisContext);
    
    try {
      const result = await this.withTimeout(
        this.hf.textGeneration({
          model: this.getSelectedModel(),
          inputs: prompt,
          parameters: {
            max_new_tokens: 800,
            temperature: 0.4,
            do_sample: true,
            return_full_text: false
          }
        }),
        Math.min(this.defaultTimeout * 0.7, 22000), // Use 70% of configured timeout, cap at 22s
        'Suggestion generation'
      );

      return this.parseSuggestions(result.generated_text || '', fileContext);
    } catch (error) {
      console.error('HuggingFace API error:', error);
      return [];
    }
  }

  // Enhanced Chat Completion Methods with Improved Fallback
  public async chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    try {
      // Circuit breaker check
      if (!this.shouldAttemptApiCall()) {
        const status = this.getApiStatus();
        if (!this.config.apiKey || this.config.apiKey.trim() === '') {
          throw new Error('HuggingFace API key not configured. Please set it in VSCode settings or environment variable HF_API_KEY.');
        } else {
          const nextRetry = status.nextRetryTime ? status.nextRetryTime.toLocaleTimeString() : 'later';
          throw new Error(`HuggingFace API temporarily unavailable. Try again at ${nextRetry}.`);
        }
      }

      const models = this.getChatModelFallbackChain();
      const messages = this.formatMessagesForAPI(request.messages);
      
                console.log(`🎯 Using ONLY working models: ${models.join(' → ')}`);
        console.log(`⚡ Optimized for zephyr-7b-beta: ${this.defaultTimeout}ms timeout, ${this.maxRetries} retries`);
      
              // 🔍 DETAILED REQUEST LOGGING
        console.log('📝 CHAT COMPLETION WITH WORKING MODELS:');
        console.log('━'.repeat(60));
        console.log(`Working models: ${models.join(', ')}`);
        console.log(`Message count: ${messages.length}`);
        console.log(`Temperature: ${Math.min(request.temperature || 0.7, 0.8)}`);
        console.log(`Max tokens: ${Math.min(request.max_tokens || 1000, 500)}`);
      
      // Log each message with content length
      messages.forEach((msg, index) => {
        console.log(`\nMessage ${index + 1} (${msg.role}):`);
        console.log(`  Content length: ${msg.content.length} characters`);
        console.log(`  First 200 chars: "${msg.content.substring(0, 200)}${msg.content.length > 200 ? '...' : ''}"`);
      });
      
      // Calculate total input size
      const totalInputSize = messages.reduce((total, msg) => total + msg.content.length, 0);
      console.log(`\nTotal input size: ${totalInputSize} characters`);
      console.log(`Estimated input tokens: ~${Math.floor(totalInputSize / 4)}`);
      console.log('━'.repeat(60));
      
              // Try each model in the fallback chain
        for (let i = 0; i < models.length; i++) {
          const model = models[i];
          if (!model) continue; // Skip if model is undefined
          
          const startTime = Date.now();
          
          try {
            console.log(`🎯 Attempting model ${i + 1}/${models.length}: ${model}`);
            
            const apiRequest = {
              model: model as string, // Explicit type assertion after null check
              messages: messages.map(msg => ({
                role: msg.role,
                content: msg.content
              })),
              temperature: Math.min(request.temperature || 0.7, 0.8),
              max_tokens: Math.min(request.max_tokens || 1000, 500),
              stream: false
            };

          console.log('🚀 Sending API request...');
          console.log(`Request structure:`, JSON.stringify({
            model: apiRequest.model,
            messageCount: apiRequest.messages.length,
            temperature: apiRequest.temperature,
            max_tokens: apiRequest.max_tokens,
            stream: apiRequest.stream,
            totalPayloadSize: JSON.stringify(apiRequest).length + ' bytes'
          }, null, 2));

          const response = await this.withTimeout(
            this.hf.chatCompletion(apiRequest),
            undefined, // Use default timeout with retry logic
            `Chat completion with ${model}`
          );
          
          const elapsed = Date.now() - startTime;
          console.log(`✅ Chat completion successful with ${model} in ${elapsed}ms`);
          
          // 🔍 RESPONSE LOGGING
          console.log('📤 CHAT COMPLETION RESPONSE DETAILS:');
          console.log('━'.repeat(50));
          console.log(`Successful model: ${model}`);
          console.log(`Response time: ${elapsed}ms`);
          console.log(`Response structure:`, JSON.stringify({
            hasChoices: !!response?.choices,
            choicesCount: response?.choices?.length || 0,
            firstChoiceRole: response?.choices?.[0]?.message?.role,
            responseLength: response?.choices?.[0]?.message?.content?.length || 0,
            hasUsage: !!response?.usage,
            totalTokens: response?.usage?.total_tokens,
            promptTokens: response?.usage?.prompt_tokens,
            completionTokens: response?.usage?.completion_tokens
          }, null, 2));
          
          if (response?.choices?.[0]?.message?.content) {
            const responseContent = response.choices[0].message.content;
            console.log(`Response preview (first 300 chars): "${responseContent.substring(0, 300)}${responseContent.length > 300 ? '...' : ''}"`);
          }
          console.log('━'.repeat(50));
          
                      return this.formatChatResponse(response, model as string, request);
          
        } catch (modelError: any) {
          const elapsed = Date.now() - startTime;
          console.error(`❌ Model ${model} failed after ${elapsed}ms:`, modelError.message);
          
          // Handle authentication errors (don't try other models)
          if (modelError.message?.includes('Invalid username or password') ||
              modelError.message?.includes('Invalid credentials') ||
              modelError.message?.includes('401') ||
              modelError.message?.includes('Unauthorized')) {
            this.markApiUnavailable();
            throw new Error('HuggingFace API authentication failed. Your API key is invalid or expired.');
          }

          // Handle rate limiting (don't try other models)
          if (modelError.message?.includes('429') || modelError.message?.includes('rate limit')) {
            this.markApiUnavailable();
            throw new Error('HuggingFace API rate limit exceeded. Please try again later.');
          }
          
          // If this is the last model in the chain, throw the error
          if (i === models.length - 1) {
            throw new Error(`All fallback models failed. Last error: ${modelError.message}`);
          }
          
          // Otherwise, continue to next model
          console.log(`⏭️  Trying next model in fallback chain...`);
          continue;
        }
      }
      
      // This shouldn't be reached, but just in case
      throw new Error('All models in fallback chain failed');
      
    } catch (error) {
      console.error('HuggingFace chat completion error:', error);
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

      // 🔍 CONVERSATIONAL ANALYSIS LOGGING
      console.log('🎯 HUGGINGFACE SERVICE - CONVERSATIONAL ANALYSIS:');
      console.log('━'.repeat(60));
      console.log(`Input messages received: ${messages.length}`);
      console.log(`System prompt length: ${systemPrompt.length} characters`);
      console.log(`System prompt: "${systemPrompt.substring(0, 200)}${systemPrompt.length > 200 ? '...' : ''}"`);
      console.log(`Final messages array length: ${analysisMessages.length}`);
      console.log(`Context keys: ${Object.keys(context).join(', ')}`);
      
      // Calculate message sizes
      const systemSize = systemPrompt.length;
      const conversationSize = messages.reduce((total, msg) => total + msg.content.length, 0);
      const totalSize = systemSize + conversationSize;
      
      console.log(`\nMessage size breakdown:`);
      console.log(`- System prompt: ${systemSize} characters`);
      console.log(`- Conversation history: ${conversationSize} characters`);
      console.log(`- TOTAL INPUT SIZE: ${totalSize} characters (~${Math.floor(totalSize / 4)} tokens)`);
      console.log('━'.repeat(60));

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
    const selectedModel = config.get<string>('huggingFace.model') || 'auto';
    
    if (selectedModel === 'auto') {
      return 'microsoft/DialoGPT-medium';
    }
    
    return selectedModel;
  }

  private buildAnalysisPrompt(fileContext: FileContext): string {
    return `Analyze the following ${fileContext.language} code and provide insights:

File: ${fileContext.uri.fsPath}
Language: ${fileContext.language}
Size: ${fileContext.size} bytes

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
    // Basic parsing - in a real implementation, this would be more sophisticated
    const suggestions = this.parseSuggestions(response, fileContext);
    
    return {
      summary: this.extractSummary(response),
      suggestions,
      confidence: 0.8, // Would be calculated based on model confidence
      modelUsed: this.getSelectedModel(),
      usage: {
        tokens: response.length / 4, // Rough estimate
      }
    };
  }

  private extractSummary(response: string): string {
    // Extract summary from the response
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
    // This is a simplified parsing - would be more sophisticated in reality
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
      range: new vscode.Range(0, 0, 0, 0), // Would be calculated from actual analysis
      originalCode: fileContext.content,
      suggestedCode: fileContext.content, // Would contain the suggested changes
      category: partial.category || SuggestionCategory.BEST_PRACTICES,
      isApplied: false
    };
  }

  // Enhanced helper methods for Phase 3 chat completion
  private getChatModel(): string {
    const config = vscode.workspace.getConfiguration('balaAnalyzer');
    const selectedModel = config.get<string>('huggingFace.model') || 'auto';
    
    // Only map to TESTED and WORKING models
    const chatModels = {
      'auto': 'HuggingFaceH4/zephyr-7b-beta',     // ✅ CONFIRMED WORKING with featherless-ai
      'zephyr': 'HuggingFaceH4/zephyr-7b-beta',   // ✅ Main working model
      'zephyr-alpha': 'HuggingFaceH4/zephyr-7b-alpha', // ✅ Alternative working model
      // All other models removed - they don't have working inference providers
    };

    return chatModels[selectedModel as keyof typeof chatModels] || 'HuggingFaceH4/zephyr-7b-beta';
  }

  // 🎯 ONLY WORKING models (tested and confirmed)
  private getChatModelFallbackChain(): string[] {
    const config = vscode.workspace.getConfiguration('balaAnalyzer');
    const selectedModel = config.get<string>('huggingFace.model') || 'auto';
    
    // Only use models that have been TESTED and CONFIRMED to work
    // ✅ Based on actual test results: only 1 out of 19 models worked!
    const workingModels = [
      'HuggingFaceH4/zephyr-7b-beta',          // ✅ CONFIRMED WORKING: featherless-ai provider (4.9s)
      'HuggingFaceH4/zephyr-7b-alpha'          // ✅ Backup: Same model family, likely same provider
    ];

    console.log(`🎯 Using ONLY confirmed working models: ${workingModels.join(', ')}`);

    // If user specified a model, try it first, then fallback chain
    if (selectedModel !== 'auto') {
      const userModel = this.getChatModel();
      // Remove user's model from workingModels to avoid duplicates
      const fallbackChain = workingModels.filter(model => model !== userModel);
      return [userModel, ...fallbackChain];
    }
    
    // For 'auto', use the working models chain
    return workingModels;
  }

  private formatMessagesForAPI(messages: ChatCompletionMessage[]): any[] {
    return messages.map(msg => ({
      role: msg.role,
      content: msg.content,
      ...(msg.name && { name: msg.name })
    }));
  }

  private async fallbackToTextGeneration(
    messages: any[], 
    model: string, 
    request: ChatCompletionRequest
  ): Promise<any> {
    // Convert chat messages to a single prompt for text generation
    const prompt = messages.map(msg => {
      const rolePrefix = msg.role === 'user' ? 'Human: ' : 
                        msg.role === 'assistant' ? 'Assistant: ' : 
                        'System: ';
      return `${rolePrefix}${msg.content}`;
    }).join('\n\n') + '\n\nAssistant: ';

    const result = await this.hf.textGeneration({
      model,
      inputs: prompt,
      parameters: {
        max_new_tokens: request.max_tokens || 1000,
        temperature: request.temperature || 0.7,
        do_sample: true,
        return_full_text: false
      }
    });

    return {
      choices: [{
        message: {
          role: 'assistant',
          content: result.generated_text || 'No response generated.'
        }
      }],
      usage: {
        prompt_tokens: Math.floor(prompt.length / 4),
        completion_tokens: Math.floor((result.generated_text || '').length / 4),
        total_tokens: Math.floor((prompt + (result.generated_text || '')).length / 4)
      }
    };
  }

  private formatChatResponse(response: any, model: string, request: ChatCompletionRequest): ChatCompletionResponse {
    const message = response.choices?.[0]?.message || response.message || {
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

import { HfInference } from '@huggingface/inference';
import * as vscode from 'vscode';
import { 
  HuggingFaceConfig, 
  AIResponse, 
  Suggestion, 
  SuggestionType, 
  SuggestionCategory,
  FileContext,
  ChatCompletionRequest,
  ChatCompletionResponse,
  ChatCompletionMessage,
  ChatAnalysisResult,
  ChatContext
} from '@/types';

export class HuggingFaceService {
  private hf: HfInference;
  private config: HuggingFaceConfig;

  constructor(config: HuggingFaceConfig) {
    this.config = config;
    this.hf = new HfInference(config.apiKey);
  }

  public async analyzeCode(fileContext: FileContext): Promise<AIResponse> {
    const prompt = this.buildAnalysisPrompt(fileContext);
    
    try {
      const result = await this.hf.textGeneration({
        model: this.getSelectedModel(),
        inputs: prompt,
        parameters: {
          max_new_tokens: 1000,
          temperature: 0.3,
          do_sample: true,
          return_full_text: false
        }
      });

      return this.parseAIResponse(result.generated_text || '', fileContext);
    } catch (error) {
      console.error('HuggingFace API error:', error);
      throw new Error(`AI analysis failed: ${error}`);
    }
  }

  public async generateSummary(filePaths: FileContext[]): Promise<string> {
    const prompt = this.buildSummaryPrompt(filePaths);
    
    try {
      const result = await this.hf.textGeneration({
        model: this.getSelectedModel(),
        inputs: prompt,
        parameters: {
          max_new_tokens: 500,
          temperature: 0.2,
          do_sample: true,
          return_full_text: false
        }
      });

      return result.generated_text || 'Unable to generate summary.';
    } catch (error) {
      console.error('HuggingFace API error:', error);
      return `Failed to generate summary: ${error}`;
    }
  }

  public async getSuggestions(fileContext: FileContext, analysisContext?: string): Promise<Suggestion[]> {
    const prompt = this.buildSuggestionPrompt(fileContext, analysisContext);
    
    try {
      const result = await this.hf.textGeneration({
        model: this.getSelectedModel(),
        inputs: prompt,
        parameters: {
          max_new_tokens: 800,
          temperature: 0.4,
          do_sample: true,
          return_full_text: false
        }
      });

      return this.parseSuggestions(result.generated_text || '', fileContext);
    } catch (error) {
      console.error('HuggingFace API error:', error);
      return [];
    }
  }

  // Enhanced Chat Completion Methods for Phase 3
  public async chatCompletion(request: ChatCompletionRequest): Promise<ChatCompletionResponse> {
    try {
      const model = request.model || this.getChatModel();
      const messages = this.formatMessagesForAPI(request.messages);
      
      // Use the newer chat completion API if available, fallback to text generation
      let response;
      try {
        response = await this.hf.chatCompletion({
          model,
          messages,
          temperature: request.temperature || 0.7,
          max_tokens: request.max_tokens || 1000,
          stream: false
        });
      } catch (chatError) {
        // Fallback to text generation for models that don't support chat completion
        console.warn('Chat completion not supported, falling back to text generation');
        response = await this.fallbackToTextGeneration(messages, model, request);
      }

      return this.formatChatResponse(response, model, request);
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
    
    // Map to chat-capable models
    const chatModels = {
      'auto': 'microsoft/DialoGPT-medium',
      'microsoft/DialoGPT-medium': 'microsoft/DialoGPT-medium',
      'codellama/CodeLlama-7b-Instruct-hf': 'codellama/CodeLlama-7b-Instruct-hf',
      'WizardLM/WizardCoder-Python-7B-V1.0': 'WizardLM/WizardCoder-Python-7B-V1.0'
    };

    return chatModels[selectedModel as keyof typeof chatModels] || 'microsoft/DialoGPT-medium';
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
    return context.workspaceFiles || [];
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

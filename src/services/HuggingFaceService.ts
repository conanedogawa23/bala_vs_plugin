import { HfInference } from '@huggingface/inference';
import * as vscode from 'vscode';
import { 
  HuggingFaceConfig, 
  AIResponse, 
  Suggestion, 
  SuggestionType, 
  SuggestionCategory,
  FileContext 
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
}

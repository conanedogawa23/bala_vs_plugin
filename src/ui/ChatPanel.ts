import { MultiFileAnalyzer } from '@/analyzers/MultiFileAnalyzer';
import { ChatService } from '@/services/ChatService';
import { ContextStore } from '@/services/ContextStore';
import { OllamaService } from '@/services/OllamaService';
import {
    ChatContext,
    ChatMessage,
    ChatPanelState,
    ChatSession,
    ExtensionMessage,
    ExtensionMessageType,
    WebviewMessage,
    WebviewMessageType
} from '@/types';
import * as vscode from 'vscode';

export class ChatPanel {
  public static currentPanel: ChatPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private readonly _ollamaService: OllamaService;
  private readonly _contextStore: ContextStore;
  private readonly _chatService: ChatService;
  private _disposables: vscode.Disposable[] = [];
  private _currentSession: ChatSession;
  private _panelState: ChatPanelState;

  public static createOrShow(
    extensionUri: vscode.Uri,
    ollamaService: OllamaService,
    contextStore: ContextStore,
    analyzer?: MultiFileAnalyzer
  ) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    // If we already have a panel, show it
    if (ChatPanel.currentPanel) {
      ChatPanel.currentPanel._panel.reveal(column);
      ChatPanel.currentPanel._updateContext();
      return;
    }

    // Otherwise, create a new panel
    const panel = vscode.window.createWebviewPanel(
      'balaAIChat',
      'BuildAI Assistant',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'dist'),
          vscode.Uri.joinPath(extensionUri, 'src', 'ui', 'webview')
        ]
      }
    );

    ChatPanel.currentPanel = new ChatPanel(panel, extensionUri, ollamaService, contextStore, analyzer);
  }

  public static kill() {
    ChatPanel.currentPanel?.dispose();
    ChatPanel.currentPanel = undefined;
  }

  public static revive(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    ollamaService: OllamaService,
    contextStore: ContextStore,
    analyzer?: MultiFileAnalyzer
  ) {
    ChatPanel.currentPanel = new ChatPanel(panel, extensionUri, ollamaService, contextStore, analyzer);
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    ollamaService: OllamaService,
    contextStore: ContextStore,
    analyzer?: MultiFileAnalyzer
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._ollamaService = ollamaService;
    this._contextStore = contextStore;
    this._chatService = new ChatService(ollamaService, contextStore, analyzer);

    // Initialize state
    this._panelState = {
      isVisible: true,
      position: panel.viewColumn || undefined,
      sessionId: this._generateSessionId()
    };

    // Initialize new session
    this._currentSession = {
      id: this._panelState.sessionId!,
      messages: [],
      context: this._getCurrentContext(),
      createdAt: new Date(),
      updatedAt: new Date(),
      title: 'New Chat Session'
    };

    // Set the webview's initial html content
    this._update();

    // Listen for when the panel is disposed
    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    // Handle messages from the webview
    this._panel.webview.onDidReceiveMessage(
      this._handleWebviewMessage.bind(this),
      null,
      this._disposables
    );

    // Update context when active editor changes
    vscode.window.onDidChangeActiveTextEditor(
      () => this._updateContext(),
      null,
      this._disposables
    );

    // Update context when text selection changes
    vscode.window.onDidChangeTextEditorSelection(
      () => this._updateContext(),
      null,
      this._disposables
    );

    // Handle panel state changes
    this._panel.onDidChangeViewState(
      (e) => {
        this._panelState.isVisible = e.webviewPanel.visible;
        this._panelState.position = e.webviewPanel.viewColumn || undefined;
      },
      null,
      this._disposables
    );

    // Load previous session if available
    this._loadPreviousSession();
  }

  public dispose() {
    ChatPanel.currentPanel = undefined;

    // Save current session before disposing
    this._saveSession();

    // Clean up our resources
    this._panel.dispose();

    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) {
        x.dispose();
      }
    }
  }

  private _update() {
    const webview = this._panel.webview;
    this._panel.title = 'BuildAI Assistant';
    this._panel.iconPath = {
      light: vscode.Uri.joinPath(this._extensionUri, 'resources', 'icon-light.svg'),
      dark: vscode.Uri.joinPath(this._extensionUri, 'resources', 'icon-dark.svg')
    };
    this._panel.webview.html = this._getHtmlForWebview(webview);
  }

  private _getHtmlForWebview(webview: vscode.Webview) {
    // Get the local path to main script run in the webview
    const scriptPathOnDisk = vscode.Uri.joinPath(this._extensionUri, 'src', 'ui', 'webview', 'script.js');
    const scriptUri = webview.asWebviewUri(scriptPathOnDisk);

    // Get the local path to css styles
    const stylePathOnDisk = vscode.Uri.joinPath(this._extensionUri, 'src', 'ui', 'webview', 'styles.css');
    const styleUri = webview.asWebviewUri(stylePathOnDisk);

    // Use a nonce to whitelist which scripts can be run
    const nonce = this._getNonce();

    return `<!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="UTF-8">
        <meta http-equiv="Content-Security-Policy" content="default-src 'none'; font-src ${webview.cspSource}; img-src ${webview.cspSource} https:; script-src 'nonce-${nonce}'; style-src ${webview.cspSource} 'unsafe-inline';">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <link href="${styleUri}" rel="stylesheet">
        <title>BuildAI Assistant</title>
      </head>
      <body>
        <div class="chat-container">
          <div class="chat-header">
            <div class="header-title">
              <span class="icon">🤖</span>
              <h1>BuildAI Assistant</h1>
            </div>
            <div class="header-controls">
              <button id="clearChat" class="btn-icon" title="Clear Chat">🗑️</button>
              <button id="settingsBtn" class="btn-icon" title="Settings">⚙️</button>
            </div>
          </div>
          
          <div class="chat-messages" id="chatMessages">
            <div class="welcome-message">
              <div class="message assistant">
                <div class="message-content">
                  <p>👋 Hello! I'm your AI code assistant. I can help you:</p>
                  <ul>
                    <li>Analyze your code and provide insights</li>
                    <li>Suggest improvements and optimizations</li>
                    <li>Answer questions about your codebase</li>
                    <li>Help with debugging and best practices</li>
                  </ul>
                  <p>Try typing a message or use commands like <code>/analyze</code>, <code>/suggest</code>, or <code>/explain</code>!</p>
                </div>
              </div>
            </div>
          </div>
          
          <div class="chat-input-container">
            <div class="input-wrapper">
              <textarea id="chatInput" placeholder="Ask me anything about your code..." rows="1"></textarea>
              <button id="sendButton" class="send-btn" title="Send Message">
                <span class="send-icon">📤</span>
              </button>
            </div>
            <div class="input-status" id="inputStatus"></div>
          </div>
        </div>
        
        <script nonce="${nonce}" src="${scriptUri}"></script>
      </body>
      </html>`;
  }

  private async _handleWebviewMessage(message: WebviewMessage) {
    try {
      switch (message.type) {
        case WebviewMessageType.SEND_MESSAGE:
          await this._handleSendMessage(message.payload, message.requestId);
          break;
          
        case WebviewMessageType.REQUEST_CONTEXT:
          await this._handleRequestContext(message.requestId);
          break;
          
        case WebviewMessageType.ANALYZE_CODE:
          await this._handleAnalyzeCode(message.payload, message.requestId);
          break;
          
        case WebviewMessageType.APPLY_SUGGESTION:
          await this._handleApplySuggestion(message.payload, message.requestId);
          break;
          
        case WebviewMessageType.GET_HISTORY:
          await this._handleGetHistory(message.requestId);
          break;
          
        case WebviewMessageType.CLEAR_HISTORY:
          await this._handleClearHistory(message.requestId);
          break;
          
        case WebviewMessageType.UPDATE_SETTINGS:
          await this._handleUpdateSettings(message.payload, message.requestId);
          break;
          
        default:
          console.warn('Unknown message type:', message.type);
      }
    } catch (error) {
      console.error('Error handling webview message:', error);
      this._sendToWebview({
        type: ExtensionMessageType.ERROR,
        payload: { error: error instanceof Error ? error.message : 'Unknown error' },
        requestId: message.requestId
      });
    }
  }

  private async _handleSendMessage(payload: { content: string }, requestId?: string) {
    const userMessage: ChatMessage = {
      id: this._generateMessageId(),
      type: 'user',
      content: payload.content,
      timestamp: new Date(),
      context: this._getCurrentContext()
    };

    // Add user message to session
    this._currentSession.messages.push(userMessage);
    this._currentSession.updatedAt = new Date();

    // Send typing indicator
    this._sendToWebview({
      type: ExtensionMessageType.TYPING_START,
      payload: {},
      requestId
    });

    try {
      // Process the message with AI
      const aiResponse = await this._processWithAI(payload.content, this._getCurrentContext());
      
      const assistantMessage: ChatMessage = {
        id: this._generateMessageId(),
        type: 'assistant',
        content: aiResponse.summary,
        timestamp: new Date(),
        context: this._getCurrentContext(),
        metadata: {
          tokens: aiResponse.usage.tokens,
          model: aiResponse.modelUsed,
          confidence: aiResponse.confidence
        }
      };

      // Add assistant message to session
      this._currentSession.messages.push(assistantMessage);
      this._currentSession.updatedAt = new Date();

      // Send response to webview
      this._sendToWebview({
        type: ExtensionMessageType.MESSAGE_RESPONSE,
        payload: { 
          userMessage, 
          assistantMessage,
          suggestions: aiResponse.suggestions 
        },
        requestId
      });

    } catch (error) {
      console.error('Error processing AI message:', error);
      
      const errorMessage: ChatMessage = {
        id: this._generateMessageId(),
        type: 'assistant',
        content: 'I apologize, but I encountered an error processing your request. Please try again or check your API configuration.',
        timestamp: new Date(),
        context: this._getCurrentContext(),
        metadata: {
          error: error instanceof Error ? error.message : 'Unknown error'
        }
      };

      this._currentSession.messages.push(errorMessage);
      
      this._sendToWebview({
        type: ExtensionMessageType.ERROR,
        payload: { message: errorMessage },
        requestId
      });
    } finally {
      // Stop typing indicator
      this._sendToWebview({
        type: ExtensionMessageType.TYPING_END,
        payload: {},
        requestId
      });
    }
  }

  private async _handleRequestContext(requestId?: string) {
    const context = this._getCurrentContext();
    this._sendToWebview({
      type: ExtensionMessageType.CONTEXT_UPDATE,
      payload: { context },
      requestId
    });
  }

  private async _handleAnalyzeCode(payload: { fileUri?: string }, requestId?: string) {
    // Implementation for code analysis
    // This would integrate with existing MultiFileAnalyzer
    this._sendToWebview({
      type: ExtensionMessageType.ANALYSIS_COMPLETE,
      payload: { analysis: 'Code analysis feature coming soon' },
      requestId
    });
  }

  private async _handleApplySuggestion(payload: { suggestionId: string }, requestId?: string) {
    // Implementation for applying suggestions
    this._sendToWebview({
      type: ExtensionMessageType.SUGGESTION_APPLIED,
      payload: { success: true, suggestionId: payload.suggestionId },
      requestId
    });
  }

  private async _handleGetHistory(requestId?: string) {
    this._sendToWebview({
      type: ExtensionMessageType.HISTORY_UPDATE,
      payload: { messages: this._currentSession.messages },
      requestId
    });
  }

  private async _handleClearHistory(requestId?: string) {
    this._currentSession.messages = [];
    this._currentSession.updatedAt = new Date();
    this._sendToWebview({
      type: ExtensionMessageType.HISTORY_UPDATE,
      payload: { messages: [] },
      requestId
    });
  }

  private async _handleUpdateSettings(payload: any, requestId?: string) {
    // Handle settings updates
    console.log('Settings update:', payload);
  }

  private _sendToWebview(message: ExtensionMessage) {
    // Ensure requestId is properly typed
    const messageToSend: ExtensionMessage = {
      ...message,
      requestId: message.requestId || undefined
    };
    this._panel.webview.postMessage(messageToSend);
  }

  private async _processWithAI(content: string, context: ChatContext) {
    try {
      // Use the new ChatService for message processing
      const response = await this._chatService.processMessage(
        this._currentSession.id, 
        content, 
        context
      );

      // Convert ChatMessage to the expected format
      return {
        summary: response.content,
        suggestions: [],  // Suggestions are now handled by the ChatService directly
        confidence: response.metadata?.confidence || 0.7,
        modelUsed: response.metadata?.model || 'auto',
        usage: { tokens: response.metadata?.tokens || 100 }
      };
    } catch (error) {
      console.error('ChatService processing failed:', error);
      
      // Fallback for general questions without code context
      return {
        summary: `I encountered an error processing your request: ${error instanceof Error ? error.message : 'Unknown error'}. Please try again or check your API configuration.`,
        suggestions: [],
        confidence: 0.3,
        modelUsed: 'auto',
        usage: { tokens: 50 }
      };
    }
  }

  private _getCurrentContext(): ChatContext {
    const activeEditor = vscode.window.activeTextEditor;
    const context: ChatContext = {};

    if (activeEditor) {
      // Convert Uri to string for webview compatibility
      context.activeFile = activeEditor.document.uri.fsPath;
      
      if (activeEditor.selection && !activeEditor.selection.isEmpty) {
        context.selectedText = activeEditor.document.getText(activeEditor.selection);
      }
    }

    // Add workspace files - also convert Uri objects to strings
    if (vscode.workspace.workspaceFolders) {
      context.workspaceFiles = vscode.workspace.workspaceFolders.map(folder => folder.uri.fsPath);
    }

    return context;
  }

  private _updateContext() {
    const context = this._getCurrentContext();
    this._currentSession.context = context;
    this._sendToWebview({
      type: ExtensionMessageType.CONTEXT_UPDATE,
      payload: { context }
    });
  }

  private async _loadPreviousSession() {
    // Implementation for loading previous chat session
    // This would integrate with ContextStore
  }

  private async _saveSession() {
    // Implementation for saving current chat session
    // This would integrate with ContextStore
  }

  private _generateSessionId(): string {
    return `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private _generateMessageId(): string {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  private _getNonce() {
    let text = '';
    const possible = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    for (let i = 0; i < 32; i++) {
      text += possible.charAt(Math.floor(Math.random() * possible.length));
    }
    return text;
  }
}

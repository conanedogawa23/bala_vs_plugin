// VSCode Webview API
const vscode = acquireVsCodeApi();

// DOM Elements
let chatInput;
let sendButton;
let chatMessages;
let inputStatus;
let clearChatBtn;
let settingsBtn;

// State Management
let isTyping = false;
let chatHistory = [];
let currentRequestId = null;
let isConnected = true;

// Initialize when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
  initializeElements();
  setupEventListeners();
  setupKeyboardShortcuts();
  loadChatHistory();
  requestContext();
  
  // Focus input on load
  chatInput?.focus();
});

// Initialize DOM elements
function initializeElements() {
  chatInput = document.getElementById('chatInput');
  sendButton = document.getElementById('sendButton');
  chatMessages = document.getElementById('chatMessages');
  inputStatus = document.getElementById('inputStatus');
  clearChatBtn = document.getElementById('clearChat');
  settingsBtn = document.getElementById('settingsBtn');

  // Validate required elements
  if (!chatInput || !sendButton || !chatMessages) {
    console.error('Critical DOM elements missing');
    showError('Failed to initialize chat interface');
    return;
  }

  // Set initial state
  updateSendButtonState();
}

// Setup event listeners
function setupEventListeners() {
  // Send button click
  sendButton?.addEventListener('click', handleSendMessage);

  // Input events
  chatInput?.addEventListener('input', handleInputChange);
  chatInput?.addEventListener('keydown', handleInputKeydown);
  chatInput?.addEventListener('paste', handleInputPaste);

  // Header controls
  clearChatBtn?.addEventListener('click', handleClearChat);
  settingsBtn?.addEventListener('click', handleSettingsClick);

  // Window message listener for extension communication
  window.addEventListener('message', handleExtensionMessage);

  // Handle visibility changes
  document.addEventListener('visibilitychange', handleVisibilityChange);

  // Auto-resize textarea
  chatInput?.addEventListener('input', autoResizeTextarea);
}

// Setup keyboard shortcuts
function setupKeyboardShortcuts() {
  document.addEventListener('keydown', (e) => {
    // Cmd/Ctrl + Enter to send message
    if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
      e.preventDefault();
      handleSendMessage();
    }
    
    // Escape to clear input
    if (e.key === 'Escape' && chatInput) {
      chatInput.value = '';
      updateSendButtonState();
      updateInputStatus('');
    }
    
    // Cmd/Ctrl + K to clear chat
    if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
      e.preventDefault();
      handleClearChat();
    }
  });
}

// Handle input changes
function handleInputChange() {
  updateSendButtonState();
  validateInput();
  
  // Show command hints
  const value = chatInput.value.trim();
  if (value.startsWith('/')) {
    showCommandHints(value);
  } else {
    clearInputStatus();
  }
}

// Handle input keydown
function handleInputKeydown(e) {
  // Enter without shift sends message
  if (e.key === 'Enter' && !e.shiftKey) {
    e.preventDefault();
    handleSendMessage();
  }
  
  // Tab for command completion
  if (e.key === 'Tab' && chatInput.value.startsWith('/')) {
    e.preventDefault();
    handleCommandCompletion();
  }
}

// Handle paste events
function handleInputPaste(e) {
  // Handle pasted code blocks
  setTimeout(() => {
    const value = chatInput.value;
    if (value.includes('\n') && value.length > 100) {
      updateInputStatus('💡 Tip: Large code blocks detected. Consider using /analyze command for better results.', 'warning');
    }
  }, 10);
}

// Auto-resize textarea
function autoResizeTextarea() {
  if (!chatInput) return;
  
  chatInput.style.height = 'auto';
  const maxHeight = 120; // Max height in pixels
  const newHeight = Math.min(chatInput.scrollHeight, maxHeight);
  chatInput.style.height = newHeight + 'px';
  
  // Show scroll if content exceeds max height
  chatInput.style.overflowY = chatInput.scrollHeight > maxHeight ? 'auto' : 'hidden';
}

// Update send button state
function updateSendButtonState() {
  if (!sendButton || !chatInput) return;
  
  const hasContent = chatInput.value.trim().length > 0;
  const canSend = hasContent && !isTyping && isConnected;
  
  sendButton.disabled = !canSend;
  sendButton.style.opacity = canSend ? '1' : '0.5';
}

// Validate input
function validateInput() {
  if (!chatInput) return;
  
  const value = chatInput.value.trim();
  const maxLength = 2000;
  
  if (value.length > maxLength) {
    updateInputStatus(`Message too long (${value.length}/${maxLength})`, 'error');
    return false;
  }
  
  return true;
}

// Handle send message
function handleSendMessage() {
  if (!chatInput || !validateInput()) return;
  
  const content = chatInput.value.trim();
  if (!content || isTyping) return;
  
  // Clear input
  chatInput.value = '';
  autoResizeTextarea();
  updateSendButtonState();
  clearInputStatus();
  
  // Generate request ID
  currentRequestId = generateRequestId();
  
  // Add user message to UI immediately
  const userMessage = {
    id: generateMessageId(),
    type: 'user',
    content: content,
    timestamp: new Date()
  };
  
  addMessageToUI(userMessage);
  chatHistory.push(userMessage);
  
  // Show typing indicator
  showTypingIndicator();
  
  // Send to extension
  sendToExtension({
    type: 'sendMessage',
    payload: { content },
    requestId: currentRequestId
  });
  
  // Focus back to input
  setTimeout(() => chatInput?.focus(), 100);
}

// Handle clear chat
function handleClearChat() {
  if (chatHistory.length === 0) return;
  
  if (confirm('Are you sure you want to clear the chat history?')) {
    chatHistory = [];
    clearChatUI();
    sendToExtension({
      type: 'clearHistory',
      payload: {},
      requestId: generateRequestId()
    });
    
    updateInputStatus('Chat history cleared', 'success');
    setTimeout(() => clearInputStatus(), 2000);
  }
}

// Handle settings click
function handleSettingsClick() {
  sendToExtension({
    type: 'updateSettings',
    payload: { action: 'open' },
    requestId: generateRequestId()
  });
}

// Handle extension messages
function handleExtensionMessage(event) {
  const message = event.data;
  
  switch (message.type) {
    case 'messageResponse':
      handleMessageResponse(message.payload, message.requestId);
      break;
      
    case 'contextUpdate':
      handleContextUpdate(message.payload);
      break;
      
    case 'error':
      handleError(message.payload, message.requestId);
      break;
      
    case 'typingStart':
      showTypingIndicator();
      break;
      
    case 'typingEnd':
      hideTypingIndicator();
      break;
      
    case 'historyUpdate':
      handleHistoryUpdate(message.payload);
      break;
      
    case 'analysisComplete':
      handleAnalysisComplete(message.payload);
      break;
      
    case 'suggestionApplied':
      handleSuggestionApplied(message.payload);
      break;
      
    default:
      console.warn('Unknown message type:', message.type);
  }
}

// Handle message response from extension
function handleMessageResponse(payload, requestId) {
  if (requestId !== currentRequestId) return;
  
  hideTypingIndicator();
  
  const { assistantMessage, suggestions } = payload;
  
  if (assistantMessage) {
    addMessageToUI(assistantMessage);
    chatHistory.push(assistantMessage);
    
    // Add suggestions if present
    if (suggestions && suggestions.length > 0) {
      addSuggestionsToUI(suggestions);
    }
  }
  
  // Update status with metadata
  if (assistantMessage?.metadata) {
    const { tokens, model, confidence } = assistantMessage.metadata;
    updateInputStatus(
      `Response generated • ${tokens} tokens • ${model} • ${Math.round(confidence * 100)}% confidence`,
      'success'
    );
    setTimeout(() => clearInputStatus(), 5000);
  }
  
  currentRequestId = null;
}

// Handle context updates
function handleContextUpdate(payload) {
  const { context } = payload;
  
  // Show context information in status
  if (context?.activeFile) {
    const fileName = context.activeFile.split('/').pop();
    updateInputStatus(`📄 Active: ${fileName}`, 'info');
  } else {
    updateInputStatus('💡 Open a file to get contextual assistance', 'info');
  }
}

// Handle errors
function handleError(payload, requestId) {
  if (requestId === currentRequestId) {
    hideTypingIndicator();
    currentRequestId = null;
  }
  
  const errorMessage = payload.error || 'An unexpected error occurred';
  
  // Add error message to chat
  const errorMsg = {
    id: generateMessageId(),
    type: 'system',
    content: `❌ Error: ${errorMessage}`,
    timestamp: new Date()
  };
  
  addMessageToUI(errorMsg);
  updateInputStatus(errorMessage, 'error');
}

// Handle history updates
function handleHistoryUpdate(payload) {
  const { messages } = payload;
  chatHistory = messages || [];
  renderChatHistory();
}

// Handle analysis complete
function handleAnalysisComplete(payload) {
  updateInputStatus('✅ Analysis complete', 'success');
  setTimeout(() => clearInputStatus(), 3000);
}

// Handle suggestion applied
function handleSuggestionApplied(payload) {
  if (payload.success) {
    updateInputStatus('✅ Suggestion applied successfully', 'success');
  } else {
    updateInputStatus('❌ Failed to apply suggestion', 'error');
  }
  setTimeout(() => clearInputStatus(), 3000);
}

// Add message to UI
function addMessageToUI(message) {
  if (!chatMessages) return;
  
  const messageElement = createMessageElement(message);
  chatMessages.appendChild(messageElement);
  scrollToBottom();
}

// Create message element
function createMessageElement(message) {
  const messageDiv = document.createElement('div');
  messageDiv.className = `message ${message.type}`;
  messageDiv.setAttribute('data-message-id', message.id);
  
  const contentDiv = document.createElement('div');
  contentDiv.className = 'message-content';
  
  // Process content (markdown, code blocks, etc.)
  contentDiv.innerHTML = processMessageContent(message.content);
  
  messageDiv.appendChild(contentDiv);
  
  // Add metadata if available
  if (message.metadata || message.timestamp) {
    const metaDiv = document.createElement('div');
    metaDiv.className = 'message-meta';
    
    let metaText = '';
    if (message.timestamp) {
      metaText += formatTimestamp(message.timestamp);
    }
    if (message.metadata?.tokens) {
      metaText += ` • ${message.metadata.tokens} tokens`;
    }
    if (message.metadata?.confidence) {
      metaText += ` • ${Math.round(message.metadata.confidence * 100)}% confidence`;
    }
    
    metaDiv.textContent = metaText;
    messageDiv.appendChild(metaDiv);
  }
  
  return messageDiv;
}

// Process message content (basic markdown support)
function processMessageContent(content) {
  // Escape HTML first
  content = escapeHtml(content);
  
  // Code blocks
  content = content.replace(/```(\w+)?\n([\s\S]*?)```/g, (match, lang, code) => {
    return `<pre><code class="language-${lang || 'text'}">${code.trim()}</code></pre>`;
  });
  
  // Inline code
  content = content.replace(/`([^`]+)`/g, '<code>$1</code>');
  
  // Bold
  content = content.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  
  // Italic
  content = content.replace(/\*(.*?)\*/g, '<em>$1</em>');
  
  // Line breaks
  content = content.replace(/\n/g, '<br>');
  
  return content;
}

// Escape HTML
function escapeHtml(text) {
  const div = document.createElement('div');
  div.textContent = text;
  return div.innerHTML;
}

// Add suggestions to UI
function addSuggestionsToUI(suggestions) {
  if (!suggestions || suggestions.length === 0) return;
  
  const suggestionContainer = document.createElement('div');
  suggestionContainer.className = 'suggestion-pills';
  
  suggestions.forEach(suggestion => {
    const pill = document.createElement('button');
    pill.className = 'suggestion-pill';
    pill.textContent = `💡 ${suggestion.title}`;
    pill.onclick = () => applySuggestion(suggestion);
    suggestionContainer.appendChild(pill);
  });
  
  chatMessages?.appendChild(suggestionContainer);
  scrollToBottom();
}

// Apply suggestion
function applySuggestion(suggestion) {
  sendToExtension({
    type: 'applySuggestion',
    payload: { suggestionId: suggestion.id },
    requestId: generateRequestId()
  });
}

// Show typing indicator
function showTypingIndicator() {
  if (isTyping) return;
  
  isTyping = true;
  updateSendButtonState();
  
  const typingDiv = document.createElement('div');
  typingDiv.className = 'typing-indicator';
  typingDiv.id = 'typingIndicator';
  
  typingDiv.innerHTML = `
    <span>AI is thinking</span>
    <div class="typing-dots">
      <span></span>
      <span></span>
      <span></span>
    </div>
  `;
  
  chatMessages?.appendChild(typingDiv);
  scrollToBottom();
}

// Hide typing indicator
function hideTypingIndicator() {
  isTyping = false;
  updateSendButtonState();
  
  const typingIndicator = document.getElementById('typingIndicator');
  if (typingIndicator) {
    typingIndicator.remove();
  }
}

// Show command hints
function showCommandHints(input) {
  const commands = [
    { cmd: '/analyze', desc: 'Analyze current file or selection' },
    { cmd: '/suggest', desc: 'Get improvement suggestions' },
    { cmd: '/explain', desc: 'Explain code functionality' },
    { cmd: '/help', desc: 'Show available commands' }
  ];
  
  const matching = commands.find(c => c.cmd.startsWith(input));
  if (matching) {
    updateInputStatus(`💡 ${matching.cmd} - ${matching.desc}`, 'info');
  }
}

// Handle command completion
function handleCommandCompletion() {
  const input = chatInput.value;
  const commands = ['/analyze', '/suggest', '/explain', '/help'];
  
  const matching = commands.find(cmd => cmd.startsWith(input));
  if (matching) {
    chatInput.value = matching + ' ';
    autoResizeTextarea();
  }
}

// Update input status
function updateInputStatus(message, type = 'info') {
  if (!inputStatus) return;
  
  inputStatus.textContent = message;
  inputStatus.className = `input-status status-${type}`;
}

// Clear input status
function clearInputStatus() {
  if (!inputStatus) return;
  
  inputStatus.textContent = '';
  inputStatus.className = 'input-status';
}

// Show error message
function showError(message) {
  updateInputStatus(message, 'error');
  
  // Also add to chat if severe
  const errorMsg = {
    id: generateMessageId(),
    type: 'system',
    content: `❌ ${message}`,
    timestamp: new Date()
  };
  
  addMessageToUI(errorMsg);
}

// Clear chat UI
function clearChatUI() {
  if (!chatMessages) return;
  
  // Remove all messages except welcome message
  const messages = chatMessages.querySelectorAll('.message, .suggestion-pills, .typing-indicator');
  messages.forEach(msg => {
    if (!msg.closest('.welcome-message')) {
      msg.remove();
    }
  });
}

// Render chat history
function renderChatHistory() {
  if (!chatMessages) return;
  
  clearChatUI();
  
  chatHistory.forEach(message => {
    addMessageToUI(message);
  });
}

// Scroll to bottom
function scrollToBottom() {
  if (!chatMessages) return;
  
  setTimeout(() => {
    chatMessages.scrollTop = chatMessages.scrollHeight;
  }, 10);
}

// Load chat history
function loadChatHistory() {
  sendToExtension({
    type: 'getHistory',
    payload: {},
    requestId: generateRequestId()
  });
}

// Request context update
function requestContext() {
  sendToExtension({
    type: 'requestContext',
    payload: {},
    requestId: generateRequestId()
  });
}

// Handle visibility changes
function handleVisibilityChange() {
  if (!document.hidden) {
    // Panel became visible, request context update
    requestContext();
    chatInput?.focus();
  }
}

// Send message to extension
function sendToExtension(message) {
  try {
    vscode.postMessage(message);
  } catch (error) {
    console.error('Failed to send message to extension:', error);
    showError('Communication error with extension');
    isConnected = false;
    updateSendButtonState();
  }
}

// Utility functions
function generateRequestId() {
  return `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function generateMessageId() {
  return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
}

function formatTimestamp(timestamp) {
  const date = new Date(timestamp);
  return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

// Error handling
window.addEventListener('error', (event) => {
  console.error('Webview error:', event.error);
  showError('An unexpected error occurred in the chat interface');
});

window.addEventListener('unhandledrejection', (event) => {
  console.error('Unhandled promise rejection:', event.reason);
  showError('An unexpected error occurred');
});

// Export for debugging (development only)
if (typeof window !== 'undefined') {
  window.chatDebug = {
    chatHistory,
    sendToExtension,
    clearChatUI,
    renderChatHistory
  };
}

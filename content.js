/**
 * 44agents Content Script
 * Detects n8n pages and injects the floating chat interface
 */

class N8nPageDetector {
    constructor() {
        this.isN8nPage = false;
        this.n8nInstance = null;
        this.chatInterface = null;
        this.init();
    }

    async init() {
        console.log('44agents: Initializing content script');
        
        // Check if this is an n8n page
        if (this.detectN8nPage()) {
            console.log('44agents: n8n page detected');
            this.isN8nPage = true;
            
            // Wait for page to be fully loaded
            if (document.readyState === 'loading') {
                document.addEventListener('DOMContentLoaded', () => this.injectChatInterface());
            } else {
                this.injectChatInterface();
            }
            
            // Monitor for dynamic content changes
            this.observePageChanges();
        }
    }

    detectN8nPage() {
        // Check URL patterns
        const urlPatterns = [
            /\/n8n\//,
            /n8n\.io/,
            /localhost.*n8n/
        ];
        
        const currentUrl = window.location.href;
        const urlMatch = urlPatterns.some(pattern => pattern.test(currentUrl));
        
        if (urlMatch) return true;

        // Check for n8n-specific elements
        const n8nSelectors = [
            '[data-test-id="canvas"]',
            '.el-main .workflow-canvas',
            '.node-view',
            '.n8n-heading',
            '#app .router-view'
        ];

        return n8nSelectors.some(selector => document.querySelector(selector));
    }

    async injectChatInterface() {
        if (this.chatInterface) return; // Already injected

        try {
            console.log('44agents: Injecting chat interface');
            
            // Create the floating chat container
            const chatContainer = document.createElement('div');
            chatContainer.id = '44agents-chat-container';
            chatContainer.innerHTML = await this.getChatInterfaceHTML();
            
            // Inject styles
            const styleLink = document.createElement('link');
            styleLink.rel = 'stylesheet';
            styleLink.href = chrome.runtime.getURL('content.css');
            document.head.appendChild(styleLink);
            
            // Append to body
            document.body.appendChild(chatContainer);
            
            // Initialize chat interface functionality
            this.initializeChatInterface();
            
            this.chatInterface = chatContainer;
            
            // Notify background script that injection was successful
            chrome.runtime.sendMessage({
                type: 'CONTENT_SCRIPT_LOADED',
                url: window.location.href
            });
            
        } catch (error) {
            console.error('44agents: Failed to inject chat interface:', error);
        }
    }

    async getChatInterfaceHTML() {
        return `
            <div class="agents-chat-widget" id="agents-chat-widget">
                <!-- Toggle Button -->
                <div class="agents-chat-toggle" id="agents-chat-toggle">
                    <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor">
                        <path d="M12 2C6.48 2 2 6.48 2 12c0 1.54.36 3.04.97 4.43L1 23l6.57-1.97C9.04 21.64 10.54 22 12 22c5.52 0 10-4.48 10-10S17.52 2 12 2zm-1 14h2v2h-2v-2zm0-8h2v6h-2V8z"/>
                    </svg>
                </div>
                
                <!-- Chat Panel -->
                <div class="agents-chat-panel" id="agents-chat-panel" style="display: none;">
                    <div class="agents-chat-header">
                        <div class="agents-chat-title">
                            <span class="agents-logo">🤖</span>
                            44agents
                        </div>
                        <div class="agents-chat-controls">
                            <button class="agents-btn-minimize" id="agents-btn-minimize">—</button>
                        </div>
                    </div>
                    
                    <div class="agents-chat-messages" id="agents-chat-messages">
                        <div class="agents-message agents-message-assistant">
                            <div class="agents-message-content">
                                Hi! I'm your AI assistant for n8n workflows. Describe what you want to automate and I'll generate a workflow for you!
                            </div>
                            <div class="agents-message-time">${new Date().toLocaleTimeString()}</div>
                        </div>
                    </div>
                    
                    <div class="agents-chat-input-container">
                        <textarea 
                            class="agents-chat-input" 
                            id="agents-chat-input" 
                            placeholder="Describe your workflow idea..."
                            rows="2"
                        ></textarea>
                        <button class="agents-chat-send" id="agents-chat-send" disabled>
                            <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor">
                                <path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/>
                            </svg>
                        </button>
                    </div>
                    
                    <div class="agents-chat-status" id="agents-chat-status" style="display: none;">
                        <span class="agents-status-text">AI is thinking...</span>
                        <div class="agents-loading-dots">
                            <span></span><span></span><span></span>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }

    initializeChatInterface() {
        const toggle = document.getElementById('agents-chat-toggle');
        const panel = document.getElementById('agents-chat-panel');
        const minimize = document.getElementById('agents-btn-minimize');
        const input = document.getElementById('agents-chat-input');
        const sendBtn = document.getElementById('agents-chat-send');
        const messages = document.getElementById('agents-chat-messages');

        let isOpen = false;

        // Toggle chat panel
        toggle.addEventListener('click', () => {
            isOpen = !isOpen;
            panel.style.display = isOpen ? 'flex' : 'none';
            toggle.classList.toggle('agents-chat-open', isOpen);
            
            if (isOpen) {
                input.focus();
            }
        });

        // Minimize chat
        minimize.addEventListener('click', () => {
            isOpen = false;
            panel.style.display = 'none';
            toggle.classList.remove('agents-chat-open');
        });

        // Input handling
        input.addEventListener('input', () => {
            const hasText = input.value.trim().length > 0;
            sendBtn.disabled = !hasText;
            sendBtn.classList.toggle('agents-send-enabled', hasText);
        });

        // Auto-resize textarea
        input.addEventListener('input', () => {
            input.style.height = 'auto';
            input.style.height = Math.min(input.scrollHeight, 120) + 'px';
        });

        // Send message on Enter (Shift+Enter for new line)
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                this.sendMessage();
            }
        });

        // Send button click
        sendBtn.addEventListener('click', () => this.sendMessage());

        // Store references
        this.elements = {
            toggle, panel, minimize, input, sendBtn, messages
        };
    }

    async sendMessage() {
        const input = this.elements.input;
        const message = input.value.trim();
        
        if (!message) return;

        // Add user message to chat
        this.addMessageToChat('user', message);
        
        // Clear input and reset height
        input.value = '';
        input.style.height = 'auto';
        this.elements.sendBtn.disabled = true;
        this.elements.sendBtn.classList.remove('agents-send-enabled');
        
        // Show loading status
        this.showLoadingStatus(true);
        
        try {
            // Send message to background script for AI processing
            const response = await chrome.runtime.sendMessage({
                type: 'GENERATE_WORKFLOW',
                message: message,
                context: this.getN8nContext()
            });
            
            if (response && response.success) {
                this.addMessageToChat('assistant', response.message, response.workflow);
            } else {
                throw new Error(response?.error || 'Failed to generate workflow');
            }
            
        } catch (error) {
            console.error('44agents: Error sending message:', error);
            this.addMessageToChat('assistant', 'Sorry, I encountered an error while generating your workflow. Please try again or check your API configuration.');
        } finally {
            this.showLoadingStatus(false);
        }
    }

    addMessageToChat(type, content, workflow = null) {
        const messages = this.elements.messages;
        const messageDiv = document.createElement('div');
        messageDiv.className = `agents-message agents-message-${type}`;
        
        let messageHTML = `
            <div class="agents-message-content">${content}</div>
            <div class="agents-message-time">${new Date().toLocaleTimeString()}</div>
        `;
        
        // Add workflow preview if available
        if (workflow && type === 'assistant') {
            messageHTML += `
                <div class="agents-workflow-preview">
                    <div class="agents-workflow-header">
                        <span>Generated Workflow: ${workflow.name}</span>
                        <button class="agents-btn-import" data-workflow='${JSON.stringify(workflow)}'>
                            Import to n8n
                        </button>
                    </div>
                    <div class="agents-workflow-description">${workflow.description}</div>
                    <div class="agents-workflow-nodes">
                        Nodes: ${workflow.nodes ? workflow.nodes.length : 0} | 
                        Generated by ${workflow.metadata?.aiModel || 'AI'}
                    </div>
                </div>
            `;
        }
        
        messageDiv.innerHTML = messageHTML;
        messages.appendChild(messageDiv);
        
        // Add import button functionality
        if (workflow) {
            const importBtn = messageDiv.querySelector('.agents-btn-import');
            importBtn?.addEventListener('click', () => this.importWorkflow(workflow));
        }
        
        // Scroll to bottom
        messages.scrollTop = messages.scrollHeight;
    }

    showLoadingStatus(show) {
        const status = document.getElementById('agents-chat-status');
        status.style.display = show ? 'flex' : 'none';
    }

    getN8nContext() {
        // Extract context about current n8n page/workflow
        const context = {
            url: window.location.href,
            timestamp: Date.now()
        };

        // Try to get current workflow info if available
        try {
            // Look for workflow canvas or other n8n-specific elements
            const canvas = document.querySelector('[data-test-id="canvas"]');
            if (canvas) {
                context.hasCanvas = true;
            }
            
            // Check if we're on a specific workflow page
            const pathMatch = window.location.pathname.match(/\/workflow\/(.+)/);
            if (pathMatch) {
                context.workflowId = pathMatch[1];
            }
            
        } catch (error) {
            console.warn('44agents: Could not extract n8n context:', error);
        }

        return context;
    }

    async importWorkflow(workflow) {
        try {
            console.log('44agents: Importing workflow to n8n:', workflow);
            
            // Send import request to background script
            const response = await chrome.runtime.sendMessage({
                type: 'IMPORT_WORKFLOW',
                workflow: workflow,
                context: this.getN8nContext()
            });
            
            if (response && response.success) {
                this.showImportSuccess();
            } else {
                throw new Error(response?.error || 'Import failed');
            }
            
        } catch (error) {
            console.error('44agents: Workflow import failed:', error);
            this.showImportError(error.message);
        }
    }

    showImportSuccess() {
        // Show success notification
        this.showNotification('Workflow imported successfully!', 'success');
    }

    showImportError(message) {
        // Show error notification
        this.showNotification(`Import failed: ${message}`, 'error');
    }

    showNotification(message, type = 'info') {
        const notification = document.createElement('div');
        notification.className = `agents-notification agents-notification-${type}`;
        notification.textContent = message;
        
        document.body.appendChild(notification);
        
        // Auto-remove after 3 seconds
        setTimeout(() => {
            notification.remove();
        }, 3000);
    }

    observePageChanges() {
        // Monitor for dynamic changes in n8n interface
        const observer = new MutationObserver((mutations) => {
            mutations.forEach((mutation) => {
                if (mutation.type === 'childList' && mutation.addedNodes.length > 0) {
                    // Check if n8n interface has changed and we need to adjust our UI
                    this.adjustChatPosition();
                }
            });
        });

        observer.observe(document.body, {
            childList: true,
            subtree: true
        });
    }

    adjustChatPosition() {
        // Ensure our chat interface doesn't interfere with n8n's UI
        const chatWidget = document.getElementById('agents-chat-widget');
        if (!chatWidget) return;

        // Check for n8n sidebars or panels that might conflict
        const n8nSidebar = document.querySelector('.el-aside, .sidebar, .panel-right');
        if (n8nSidebar) {
            const sidebarRect = n8nSidebar.getBoundingClientRect();
            if (sidebarRect.right > window.innerWidth - 400) {
                chatWidget.style.right = `${window.innerWidth - sidebarRect.left + 20}px`;
            }
        }
    }
}

// Initialize when script loads
let pageDetector;
if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => {
        pageDetector = new N8nPageDetector();
    });
} else {
    pageDetector = new N8nPageDetector();
}

// Listen for messages from popup/background
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'TOGGLE_CHAT' && pageDetector && pageDetector.elements) {
        const toggle = pageDetector.elements.toggle;
        const panel = pageDetector.elements.panel;
        
        if (toggle && panel) {
            toggle.click();
            sendResponse({ success: true });
        } else {
            sendResponse({ success: false, error: 'Chat interface not available' });
        }
    }
});
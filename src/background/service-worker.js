/**
 * 44agents Background Service Worker
 * Manages API calls, authentication, and workflow generation
 */

import { ClaudeService } from '../services/ai/claude-service.js';
import { OpenAIService } from '../services/ai/openai-service.js';
import { GeminiService } from '../services/ai/gemini-service.js';
import { StorageManager } from '../utils/storage-manager.js';
import { ErrorHandler } from '../utils/error-handler.js';

class BackgroundService {
    constructor() {
        this.aiServices = new Map();
        this.storageManager = new StorageManager();
        this.errorHandler = new ErrorHandler();
        this.currentConversationId = null;
        
        this.initializeServices();
        this.setupMessageListeners();
    }

    async initializeServices() {
        try {
            // Load user configuration
            const config = await this.storageManager.getConfig();
            
            // Initialize AI services based on available API keys
            if (config.claudeApiKey) {
                this.aiServices.set('claude', new ClaudeService(config.claudeApiKey));
            }
            
            if (config.openaiApiKey) {
                this.aiServices.set('openai', new OpenAIService(config.openaiApiKey));
            }
            
            if (config.geminiApiKey) {
                this.aiServices.set('gemini', new GeminiService(config.geminiApiKey));
            }
            
            console.log('44agents: Background services initialized');
            
        } catch (error) {
            console.error('44agents: Failed to initialize services:', error);
        }
    }

    setupMessageListeners() {
        chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
            this.handleMessage(message, sender, sendResponse);
            return true; // Indicates we will send a response asynchronously
        });

        chrome.action.onClicked.addListener((tab) => {
            this.handleActionClick(tab);
        });

        chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
            if (changeInfo.status === 'complete' && tab.url) {
                this.handleTabUpdate(tabId, tab);
            }
        });
    }

    async handleMessage(message, sender, sendResponse) {
        try {
            switch (message.type) {
                case 'GENERATE_WORKFLOW':
                    const workflowResponse = await this.generateWorkflow(message.message, message.context);
                    sendResponse({ success: true, ...workflowResponse });
                    break;

                case 'IMPORT_WORKFLOW':
                    const importResponse = await this.importWorkflow(message.workflow, message.context);
                    sendResponse({ success: true, ...importResponse });
                    break;

                case 'GET_CONFIG':
                    const config = await this.storageManager.getConfig();
                    sendResponse({ success: true, config });
                    break;

                case 'SAVE_CONFIG':
                    await this.storageManager.saveConfig(message.config);
                    await this.initializeServices(); // Re-initialize with new config
                    sendResponse({ success: true });
                    break;

                case 'GET_CHAT_HISTORY':
                    const history = await this.storageManager.getChatHistory(message.conversationId);
                    sendResponse({ success: true, history });
                    break;

                case 'SAVE_MESSAGE':
                    await this.storageManager.saveMessage(message.messageData);
                    sendResponse({ success: true });
                    break;

                case 'CONTENT_SCRIPT_LOADED':
                    console.log('44agents: Content script loaded on:', message.url);
                    sendResponse({ success: true });
                    break;

                case 'VALIDATE_API_KEY':
                    const isValid = await this.validateApiKey(message.provider, message.apiKey);
                    sendResponse({ success: true, valid: isValid });
                    break;

                case 'GET_USAGE_METRICS':
                    const metrics = await this.getUsageMetrics(message.provider);
                    sendResponse({ success: true, metrics });
                    break;

                case 'EXPORT_DATA':
                    const exportData = await this.exportAllData();
                    sendResponse({ success: true, data: exportData });
                    break;

                case 'CLEAR_DATA':
                    await this.clearAllData();
                    sendResponse({ success: true });
                    break;

                case 'TOGGLE_CHAT':
                    // Forward to content script
                    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
                        if (tabs[0]) {
                            chrome.tabs.sendMessage(tabs[0].id, { type: 'TOGGLE_CHAT' });
                        }
                    });
                    sendResponse({ success: true });
                    break;

                default:
                    sendResponse({ success: false, error: 'Unknown message type' });
            }
        } catch (error) {
            console.error('44agents: Error handling message:', error);
            sendResponse({ 
                success: false, 
                error: this.errorHandler.formatError(error) 
            });
        }
    }

    async generateWorkflow(description, context) {
        try {
            // Get or create conversation ID
            if (!this.currentConversationId) {
                this.currentConversationId = this.generateConversationId();
            }

            // Get preferred AI service
            const config = await this.storageManager.getConfig();
            const preferredProvider = config.preferredProvider || 'claude';
            
            const aiService = this.aiServices.get(preferredProvider);
            if (!aiService) {
                throw new Error(`AI service '${preferredProvider}' is not configured. Please check your API keys in settings.`);
            }

            // Prepare generation request
            const request = {
                description: description,
                context: await this.enrichContext(context),
                previousMessages: await this.storageManager.getRecentMessages(this.currentConversationId, 10),
                options: config.generationOptions || {}
            };

            // Generate workflow
            const result = await aiService.generateWorkflow(request);

            // Save the conversation
            await this.saveConversation(description, result, preferredProvider);

            // Update usage metrics
            await this.updateUsageMetrics(preferredProvider, result);

            return {
                message: result.explanation,
                workflow: result.workflow,
                confidence: result.confidence,
                provider: preferredProvider,
                cost: result.cost,
                conversationId: this.currentConversationId
            };

        } catch (error) {
            console.error('44agents: Workflow generation failed:', error);
            throw error;
        }
    }

    async enrichContext(context) {
        // Enhance the provided context with additional n8n information
        const enrichedContext = { ...context };

        try {
            // Add available n8n nodes information if we have it
            const n8nData = await this.storageManager.getN8nData();
            if (n8nData) {
                enrichedContext.availableNodes = n8nData.availableNodes;
                enrichedContext.n8nVersion = n8nData.version;
                enrichedContext.userCredentials = n8nData.credentials;
            }

            // Add user preferences
            const config = await this.storageManager.getConfig();
            enrichedContext.userPreferences = {
                preferredNodes: config.preferredNodes || [],
                complexity: config.preferredComplexity || 'medium',
                includeErrorHandling: config.includeErrorHandling !== false
            };

        } catch (error) {
            console.warn('44agents: Could not enrich context:', error);
        }

        return enrichedContext;
    }

    async importWorkflow(workflow, context) {
        try {
            // For now, we'll copy the workflow JSON to clipboard
            // In a future version, we could implement direct n8n API integration
            
            await this.copyWorkflowToClipboard(workflow);
            
            // Save import event
            await this.storageManager.saveImportEvent({
                workflowId: workflow.id,
                workflowName: workflow.name,
                timestamp: Date.now(),
                context: context
            });

            return {
                message: 'Workflow copied to clipboard. You can now paste it into n8n by going to Workflows > Import from Clipboard.',
                method: 'clipboard'
            };

        } catch (error) {
            console.error('44agents: Workflow import failed:', error);
            throw error;
        }
    }

    async copyWorkflowToClipboard(workflow) {
        // Use the offscreen API to copy workflow to clipboard
        await chrome.offscreen.createDocument({
            url: chrome.runtime.getURL('offscreen.html'),
            reasons: ['CLIPBOARD'],
            justification: 'Copy workflow to clipboard for n8n import'
        });

        await chrome.runtime.sendMessage({
            type: 'COPY_TO_CLIPBOARD',
            data: JSON.stringify(workflow, null, 2)
        });

        // Clean up offscreen document
        setTimeout(() => {
            chrome.offscreen.closeDocument();
        }, 1000);
    }

    async saveConversation(userMessage, aiResponse, provider) {
        const timestamp = Date.now();
        
        // Save user message
        await this.storageManager.saveMessage({
            id: this.generateMessageId(),
            conversationId: this.currentConversationId,
            type: 'user',
            content: userMessage,
            timestamp: timestamp
        });

        // Save AI response
        await this.storageManager.saveMessage({
            id: this.generateMessageId(),
            conversationId: this.currentConversationId,
            type: 'assistant',
            content: aiResponse.explanation,
            timestamp: timestamp + 1,
            metadata: {
                workflowGenerated: true,
                workflowId: aiResponse.workflow.id,
                aiModel: provider,
                tokenCount: aiResponse.estimatedTokens,
                cost: aiResponse.cost,
                confidence: aiResponse.confidence
            }
        });
    }

    async updateUsageMetrics(provider, result) {
        const metrics = await this.storageManager.getUsageMetrics() || {
            totalRequests: 0,
            totalTokens: 0,
            totalCost: 0,
            successRate: 100,
            averageResponseTime: 0,
            byProvider: {}
        };

        metrics.totalRequests++;
        metrics.totalTokens += result.estimatedTokens;
        metrics.totalCost += result.cost;

        if (!metrics.byProvider[provider]) {
            metrics.byProvider[provider] = {
                requests: 0,
                tokens: 0,
                cost: 0,
                errors: 0
            };
        }

        metrics.byProvider[provider].requests++;
        metrics.byProvider[provider].tokens += result.estimatedTokens;
        metrics.byProvider[provider].cost += result.cost;

        await this.storageManager.saveUsageMetrics(metrics);
    }

    async validateApiKey(provider, apiKey) {
        try {
            let service;
            
            switch (provider) {
                case 'claude':
                    service = new ClaudeService(apiKey);
                    break;
                case 'openai':
                    service = new OpenAIService(apiKey);
                    break;
                case 'gemini':
                    service = new GeminiService(apiKey);
                    break;
                default:
                    throw new Error('Unknown provider');
            }

            return await service.validateApiKey(apiKey);
        } catch (error) {
            console.error('44agents: API key validation failed:', error);
            return false;
        }
    }

    async getUsageMetrics(provider) {
        const metrics = await this.storageManager.getUsageMetrics();
        
        if (provider && metrics?.byProvider?.[provider]) {
            return metrics.byProvider[provider];
        }
        
        return metrics;
    }

    handleActionClick(tab) {
        // Extension icon clicked - open popup or inject content script if needed
        console.log('44agents: Extension action clicked on tab:', tab.url);
    }

    handleTabUpdate(tabId, tab) {
        // Tab updated - check if it's an n8n page and ensure content script is loaded
        if (tab.url && this.isN8nUrl(tab.url)) {
            chrome.scripting.executeScript({
                target: { tabId: tabId },
                files: ['content.js']
            }).catch(error => {
                console.log('44agents: Content script already loaded or failed to inject:', error);
            });
        }
    }

    isN8nUrl(url) {
        const n8nPatterns = [
            /\/n8n\//,
            /n8n\.io/,
            /localhost.*n8n/
        ];
        
        return n8nPatterns.some(pattern => pattern.test(url));
    }

    generateConversationId() {
        return 'conv_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    generateMessageId() {
        return 'msg_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
    }

    async exportAllData() {
        try {
            return await this.storageManager.exportAllData();
        } catch (error) {
            console.error('44agents: Export data failed:', error);
            throw error;
        }
    }

    async clearAllData() {
        try {
            // Clear storage but preserve API keys
            const config = await this.storageManager.getConfig();
            const apiKeys = {
                claudeApiKey: config.claudeApiKey,
                openaiApiKey: config.openaiApiKey,
                geminiApiKey: config.geminiApiKey
            };

            // Clear all data
            await chrome.storage.local.clear();

            // Restore API keys
            await this.storageManager.saveConfig({
                ...this.storageManager.getDefaultConfig(),
                ...apiKeys
            });

            console.log('44agents: All data cleared successfully');
        } catch (error) {
            console.error('44agents: Clear data failed:', error);
            throw error;
        }
    }
}

// Initialize background service
new BackgroundService();

console.log('44agents: Background service worker loaded');
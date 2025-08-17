/**
 * Storage Manager for 44agents Chrome Extension
 * Updated interface to match background service requirements
 */

export class StorageManager {
    constructor() {
        this.STORAGE_KEYS = {
            CONFIG: 'config',
            MESSAGES: 'messages',
            CONVERSATIONS: 'conversations',
            WORKFLOWS: 'workflows',
            USAGE_METRICS: 'usageMetrics',
            N8N_DATA: 'n8nData',
            IMPORT_EVENTS: 'importEvents'
        };
    }

    // Configuration management
    async getConfig() {
        try {
            const result = await chrome.storage.local.get(this.STORAGE_KEYS.CONFIG);
            return result[this.STORAGE_KEYS.CONFIG] || this.getDefaultConfig();
        } catch (error) {
            console.error('44agents: Error getting config:', error);
            return this.getDefaultConfig();
        }
    }

    async saveConfig(config) {
        try {
            await chrome.storage.local.set({
                [this.STORAGE_KEYS.CONFIG]: config
            });
        } catch (error) {
            console.error('44agents: Error saving config:', error);
            throw error;
        }
    }

    getDefaultConfig() {
        return {
            claudeApiKey: '',
            openaiApiKey: '',
            geminiApiKey: '',
            preferredProvider: 'claude',
            generationOptions: {
                temperature: 0.1,
                maxTokens: 4000,
                includeSuggestions: true,
                optimizeForCost: false
            },
            preferredNodes: [],
            preferredComplexity: 'medium',
            includeErrorHandling: true,
            theme: 'auto',
            autoSave: true,
            conversationRetention: 30,
            enableNotifications: true
        };
    }

    // Message management
    async saveMessage(messageData) {
        try {
            const messages = await this.getMessages() || [];
            messages.push({
                ...messageData,
                savedAt: Date.now()
            });

            // Keep only recent messages (last 1000)
            if (messages.length > 1000) {
                messages.splice(0, messages.length - 1000);
            }

            await chrome.storage.local.set({
                [this.STORAGE_KEYS.MESSAGES]: messages
            });
        } catch (error) {
            console.error('44agents: Error saving message:', error);
            throw error;
        }
    }

    async getMessages() {
        try {
            const result = await chrome.storage.local.get(this.STORAGE_KEYS.MESSAGES);
            return result[this.STORAGE_KEYS.MESSAGES] || [];
        } catch (error) {
            console.error('44agents: Error getting messages:', error);
            return [];
        }
    }

    async getChatHistory(conversationId) {
        try {
            const messages = await this.getMessages();
            return messages.filter(msg => msg.conversationId === conversationId);
        } catch (error) {
            console.error('44agents: Error getting chat history:', error);
            return [];
        }
    }

    async getRecentMessages(conversationId, limit = 10) {
        try {
            const messages = await this.getChatHistory(conversationId);
            return messages.slice(-limit);
        } catch (error) {
            console.error('44agents: Error getting recent messages:', error);
            return [];
        }
    }

    // n8n data management
    async getN8nData() {
        try {
            const result = await chrome.storage.local.get(this.STORAGE_KEYS.N8N_DATA);
            return result[this.STORAGE_KEYS.N8N_DATA];
        } catch (error) {
            console.error('44agents: Error getting n8n data:', error);
            return null;
        }
    }

    async saveN8nData(data) {
        try {
            await chrome.storage.local.set({
                [this.STORAGE_KEYS.N8N_DATA]: {
                    ...data,
                    updatedAt: Date.now()
                }
            });
        } catch (error) {
            console.error('44agents: Error saving n8n data:', error);
            throw error;
        }
    }

    // Usage metrics management
    async getUsageMetrics() {
        try {
            const result = await chrome.storage.local.get(this.STORAGE_KEYS.USAGE_METRICS);
            return result[this.STORAGE_KEYS.USAGE_METRICS];
        } catch (error) {
            console.error('44agents: Error getting usage metrics:', error);
            return null;
        }
    }

    async saveUsageMetrics(metrics) {
        try {
            await chrome.storage.local.set({
                [this.STORAGE_KEYS.USAGE_METRICS]: {
                    ...metrics,
                    updatedAt: Date.now()
                }
            });
        } catch (error) {
            console.error('44agents: Error saving usage metrics:', error);
            throw error;
        }
    }

    // Import events tracking
    async saveImportEvent(eventData) {
        try {
            const events = await this.getImportEvents() || [];
            events.push({
                ...eventData,
                id: this.generateId('import'),
                timestamp: Date.now()
            });

            // Keep only recent events (last 100)
            if (events.length > 100) {
                events.splice(0, events.length - 100);
            }

            await chrome.storage.local.set({
                [this.STORAGE_KEYS.IMPORT_EVENTS]: events
            });
        } catch (error) {
            console.error('44agents: Error saving import event:', error);
            throw error;
        }
    }

    async getImportEvents() {
        try {
            const result = await chrome.storage.local.get(this.STORAGE_KEYS.IMPORT_EVENTS);
            return result[this.STORAGE_KEYS.IMPORT_EVENTS] || [];
        } catch (error) {
            console.error('44agents: Error getting import events:', error);
            return [];
        }
    }

    // Workflow storage (for generated workflows)
    async saveWorkflow(workflow) {
        try {
            const workflows = await this.getWorkflows() || [];
            const workflowData = {
                ...workflow,
                id: workflow.id || this.generateId('workflow'),
                savedAt: Date.now()
            };

            workflows.push(workflowData);

            // Keep only recent workflows (last 50)
            if (workflows.length > 50) {
                workflows.splice(0, workflows.length - 50);
            }

            await chrome.storage.local.set({
                [this.STORAGE_KEYS.WORKFLOWS]: workflows
            });

            return workflowData.id;
        } catch (error) {
            console.error('44agents: Error saving workflow:', error);
            throw error;
        }
    }

    async getWorkflows() {
        try {
            const result = await chrome.storage.local.get(this.STORAGE_KEYS.WORKFLOWS);
            return result[this.STORAGE_KEYS.WORKFLOWS] || [];
        } catch (error) {
            console.error('44agents: Error getting workflows:', error);
            return [];
        }
    }

    async getWorkflowById(workflowId) {
        try {
            const workflows = await this.getWorkflows();
            return workflows.find(wf => wf.id === workflowId);
        } catch (error) {
            console.error('44agents: Error getting workflow by ID:', error);
            return null;
        }
    }

    // Storage cleanup
    async cleanup() {
        try {
            const config = await this.getConfig();
            const retentionDays = config.conversationRetention || 30;
            const cutoffTime = Date.now() - (retentionDays * 24 * 60 * 60 * 1000);

            // Clean old messages
            const messages = await this.getMessages();
            const recentMessages = messages.filter(msg => msg.savedAt > cutoffTime);
            
            if (recentMessages.length !== messages.length) {
                await chrome.storage.local.set({
                    [this.STORAGE_KEYS.MESSAGES]: recentMessages
                });
            }

            // Clean old workflows
            const workflows = await this.getWorkflows();
            const recentWorkflows = workflows.filter(wf => wf.savedAt > cutoffTime);
            
            if (recentWorkflows.length !== workflows.length) {
                await chrome.storage.local.set({
                    [this.STORAGE_KEYS.WORKFLOWS]: recentWorkflows
                });
            }

            console.log('44agents: Storage cleanup completed');
            return {
                messagesRemoved: messages.length - recentMessages.length,
                workflowsRemoved: workflows.length - recentWorkflows.length
            };

        } catch (error) {
            console.error('44agents: Error during cleanup:', error);
            throw error;
        }
    }

    // Storage statistics
    async getStorageStats() {
        try {
            const usage = await chrome.storage.local.getBytesInUse();
            const messages = await this.getMessages();
            const workflows = await this.getWorkflows();
            const importEvents = await this.getImportEvents();

            return {
                bytesUsed: usage,
                messageCount: messages.length,
                workflowCount: workflows.length,
                importEventCount: importEvents.length,
                lastUpdated: Date.now()
            };
        } catch (error) {
            console.error('44agents: Error getting storage stats:', error);
            return null;
        }
    }

    // Export/Import functionality
    async exportAllData() {
        try {
            const config = await this.getConfig();
            const messages = await this.getMessages();
            const workflows = await this.getWorkflows();
            const importEvents = await this.getImportEvents();
            const usageMetrics = await this.getUsageMetrics();
            const n8nData = await this.getN8nData();

            // Remove sensitive data from export
            const exportConfig = { ...config };
            delete exportConfig.claudeApiKey;
            delete exportConfig.openaiApiKey;
            delete exportConfig.geminiApiKey;

            return {
                version: '1.0.0',
                exportedAt: new Date().toISOString(),
                config: exportConfig,
                messages: messages,
                workflows: workflows,
                importEvents: importEvents,
                usageMetrics: usageMetrics,
                n8nData: n8nData
            };
        } catch (error) {
            console.error('44agents: Error exporting data:', error);
            throw error;
        }
    }

    async importAllData(data) {
        try {
            if (!data.version) {
                throw new Error('Invalid export data format');
            }

            // Import non-sensitive data
            if (data.config) {
                const currentConfig = await this.getConfig();
                const mergedConfig = {
                    ...currentConfig,
                    ...data.config,
                    // Preserve existing API keys
                    claudeApiKey: currentConfig.claudeApiKey,
                    openaiApiKey: currentConfig.openaiApiKey,
                    geminiApiKey: currentConfig.geminiApiKey
                };
                await this.saveConfig(mergedConfig);
            }

            if (data.messages) {
                await chrome.storage.local.set({
                    [this.STORAGE_KEYS.MESSAGES]: data.messages
                });
            }

            if (data.workflows) {
                await chrome.storage.local.set({
                    [this.STORAGE_KEYS.WORKFLOWS]: data.workflows
                });
            }

            if (data.usageMetrics) {
                await this.saveUsageMetrics(data.usageMetrics);
            }

            if (data.n8nData) {
                await this.saveN8nData(data.n8nData);
            }

            console.log('44agents: Data import completed');
            return true;

        } catch (error) {
            console.error('44agents: Error importing data:', error);
            throw error;
        }
    }

    // Utility methods
    generateId(prefix = 'item') {
        return `${prefix}_${Date.now()}_${Math.random().toString(36).substr(2, 8)}`;
    }

    // Migration helper for existing data
    async migrateFromOldFormat() {
        try {
            // Check if old format exists (from the original storage.js)
            const oldKeys = ['conversations', 'chatMessages', 'settings', 'apiKeys'];
            const result = await chrome.storage.local.get(oldKeys);

            let migrated = false;

            // Migrate settings to config
            if (result.settings || result.apiKeys) {
                const config = {
                    ...this.getDefaultConfig(),
                    ...result.settings,
                    ...result.apiKeys
                };
                await this.saveConfig(config);
                migrated = true;
            }

            // Migrate conversations and messages
            if (result.conversations || result.chatMessages) {
                // This would require more complex logic based on the old format
                console.log('44agents: Found old conversation data - manual migration may be needed');
            }

            if (migrated) {
                console.log('44agents: Migration from old format completed');
            }

            return migrated;

        } catch (error) {
            console.error('44agents: Error during migration:', error);
            return false;
        }
    }
}
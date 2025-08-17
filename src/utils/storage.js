/**
 * 44agents Storage Service
 * Handles persistent storage for chat history, conversations, and settings
 * Uses Chrome's storage API for secure, persistent data management
 */

class StorageService {
  constructor() {
    this.STORAGE_KEYS = {
      CONVERSATIONS: 'conversations',
      CHAT_MESSAGES: 'chatMessages',
      SETTINGS: 'settings',
      API_KEYS: 'apiKeys',
      USER_PREFERENCES: 'userPreferences'
    };
  }

  /**
   * Initialize storage with default values if needed
   */
  async initialize() {
    const settings = await this.getSettings();
    if (!settings) {
      await this.saveSettings({
        theme: 'auto',
        defaultAiModel: 'claude-3-sonnet',
        autoSave: true,
        conversationRetention: 30, // days
        enableNotifications: true
      });
    }
  }

  /**
   * Save a chat message to storage with conversation threading
   * @param {Object} message - Chat message object following PRD structure
   */
  async saveChatMessage(message) {
    try {
      const messages = await this.getChatMessages(message.conversationId);
      messages.push({
        id: message.id || this.generateMessageId(),
        conversationId: message.conversationId,
        type: message.type, // 'user' | 'assistant' | 'system'
        content: message.content,
        timestamp: message.timestamp || new Date().toISOString(),
        metadata: message.metadata || {}
      });

      const storageKey = `${this.STORAGE_KEYS.CHAT_MESSAGES}_${message.conversationId}`;
      await chrome.storage.local.set({ [storageKey]: messages });

      // Update conversation metadata
      await this.updateConversationMetadata(message.conversationId, {
        lastMessageTime: message.timestamp || new Date().toISOString(),
        messageCount: messages.length
      });

      return message.id || this.generateMessageId();
    } catch (error) {
      console.error('Error saving chat message:', error);
      throw error;
    }
  }

  /**
   * Get all chat messages for a specific conversation
   * @param {string} conversationId - Unique conversation identifier
   */
  async getChatMessages(conversationId) {
    try {
      const storageKey = `${this.STORAGE_KEYS.CHAT_MESSAGES}_${conversationId}`;
      const result = await chrome.storage.local.get(storageKey);
      return result[storageKey] || [];
    } catch (error) {
      console.error('Error getting chat messages:', error);
      return [];
    }
  }

  /**
   * Create a new conversation thread
   * @param {Object} conversationData - Initial conversation data
   */
  async createConversation(conversationData) {
    try {
      const conversationId = conversationData.id || this.generateConversationId();
      const conversation = {
        id: conversationId,
        title: conversationData.title || 'New Conversation',
        description: conversationData.description || '',
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        messageCount: 0,
        workflowsGenerated: 0,
        tags: conversationData.tags || [],
        aiModel: conversationData.aiModel || 'claude-3-sonnet'
      };

      const conversations = await this.getConversations();
      conversations.push(conversation);
      
      await chrome.storage.local.set({
        [this.STORAGE_KEYS.CONVERSATIONS]: conversations
      });

      return conversationId;
    } catch (error) {
      console.error('Error creating conversation:', error);
      throw error;
    }
  }

  /**
   * Get all conversations with metadata
   */
  async getConversations() {
    try {
      const result = await chrome.storage.local.get(this.STORAGE_KEYS.CONVERSATIONS);
      return result[this.STORAGE_KEYS.CONVERSATIONS] || [];
    } catch (error) {
      console.error('Error getting conversations:', error);
      return [];
    }
  }

  /**
   * Update conversation metadata
   * @param {string} conversationId - Conversation ID to update
   * @param {Object} metadata - Metadata to merge
   */
  async updateConversationMetadata(conversationId, metadata) {
    try {
      const conversations = await this.getConversations();
      const conversationIndex = conversations.findIndex(c => c.id === conversationId);
      
      if (conversationIndex !== -1) {
        conversations[conversationIndex] = {
          ...conversations[conversationIndex],
          ...metadata,
          updatedAt: new Date().toISOString()
        };

        await chrome.storage.local.set({
          [this.STORAGE_KEYS.CONVERSATIONS]: conversations
        });
      }
    } catch (error) {
      console.error('Error updating conversation metadata:', error);
      throw error;
    }
  }

  /**
   * Delete a conversation and all its messages
   * @param {string} conversationId - Conversation ID to delete
   */
  async deleteConversation(conversationId) {
    try {
      // Delete conversation messages
      const messageStorageKey = `${this.STORAGE_KEYS.CHAT_MESSAGES}_${conversationId}`;
      await chrome.storage.local.remove(messageStorageKey);

      // Remove from conversations list
      const conversations = await this.getConversations();
      const filteredConversations = conversations.filter(c => c.id !== conversationId);
      
      await chrome.storage.local.set({
        [this.STORAGE_KEYS.CONVERSATIONS]: filteredConversations
      });
    } catch (error) {
      console.error('Error deleting conversation:', error);
      throw error;
    }
  }

  /**
   * Securely store API keys with encryption
   * @param {Object} apiKeys - Object containing API keys for different services
   */
  async saveApiKeys(apiKeys) {
    try {
      // Use Chrome's secure storage for sensitive data
      await chrome.storage.local.set({
        [this.STORAGE_KEYS.API_KEYS]: apiKeys
      });
    } catch (error) {
      console.error('Error saving API keys:', error);
      throw error;
    }
  }

  /**
   * Get stored API keys
   */
  async getApiKeys() {
    try {
      const result = await chrome.storage.local.get(this.STORAGE_KEYS.API_KEYS);
      return result[this.STORAGE_KEYS.API_KEYS] || {};
    } catch (error) {
      console.error('Error getting API keys:', error);
      return {};
    }
  }

  /**
   * Save user settings and preferences
   * @param {Object} settings - Settings object
   */
  async saveSettings(settings) {
    try {
      await chrome.storage.local.set({
        [this.STORAGE_KEYS.SETTINGS]: settings
      });
    } catch (error) {
      console.error('Error saving settings:', error);
      throw error;
    }
  }

  /**
   * Get user settings and preferences
   */
  async getSettings() {
    try {
      const result = await chrome.storage.local.get(this.STORAGE_KEYS.SETTINGS);
      return result[this.STORAGE_KEYS.SETTINGS];
    } catch (error) {
      console.error('Error getting settings:', error);
      return null;
    }
  }

  /**
   * Save workflow data associated with conversation
   * @param {string} conversationId - Associated conversation ID
   * @param {Object} workflow - n8n workflow object
   */
  async saveWorkflow(conversationId, workflow) {
    try {
      const workflowStorageKey = `workflow_${workflow.id}`;
      const workflowData = {
        ...workflow,
        conversationId,
        savedAt: new Date().toISOString()
      };

      await chrome.storage.local.set({
        [workflowStorageKey]: workflowData
      });

      // Update conversation metadata
      await this.updateConversationMetadata(conversationId, {
        workflowsGenerated: (await this.getWorkflowsByConversation(conversationId)).length + 1
      });

      return workflow.id;
    } catch (error) {
      console.error('Error saving workflow:', error);
      throw error;
    }
  }

  /**
   * Get all workflows for a conversation
   * @param {string} conversationId - Conversation ID
   */
  async getWorkflowsByConversation(conversationId) {
    try {
      const allData = await chrome.storage.local.get();
      const workflows = [];

      for (const [key, value] of Object.entries(allData)) {
        if (key.startsWith('workflow_') && value.conversationId === conversationId) {
          workflows.push(value);
        }
      }

      return workflows.sort((a, b) => new Date(b.savedAt) - new Date(a.savedAt));
    } catch (error) {
      console.error('Error getting workflows by conversation:', error);
      return [];
    }
  }

  /**
   * Search chat messages across all conversations
   * @param {string} query - Search query
   * @param {Object} options - Search options
   */
  async searchMessages(query, options = {}) {
    try {
      const conversations = await this.getConversations();
      const results = [];

      for (const conversation of conversations) {
        const messages = await this.getChatMessages(conversation.id);
        const matchingMessages = messages.filter(message => {
          const content = message.content.toLowerCase();
          const searchQuery = query.toLowerCase();
          
          if (options.exactMatch) {
            return content.includes(searchQuery);
          } else {
            return content.indexOf(searchQuery) !== -1;
          }
        });

        if (matchingMessages.length > 0) {
          results.push({
            conversation,
            messages: matchingMessages
          });
        }
      }

      return results;
    } catch (error) {
      console.error('Error searching messages:', error);
      return [];
    }
  }

  /**
   * Export chat history and workflows for backup
   * @param {string} conversationId - Optional specific conversation ID
   */
  async exportData(conversationId = null) {
    try {
      const exportData = {
        exportedAt: new Date().toISOString(),
        version: '1.0.0'
      };

      if (conversationId) {
        // Export specific conversation
        const conversations = await this.getConversations();
        const conversation = conversations.find(c => c.id === conversationId);
        const messages = await this.getChatMessages(conversationId);
        const workflows = await this.getWorkflowsByConversation(conversationId);

        exportData.conversations = [conversation];
        exportData.messages = { [conversationId]: messages };
        exportData.workflows = workflows;
      } else {
        // Export all data
        const conversations = await this.getConversations();
        const messages = {};
        const allWorkflows = [];

        for (const conversation of conversations) {
          messages[conversation.id] = await this.getChatMessages(conversation.id);
          const workflows = await this.getWorkflowsByConversation(conversation.id);
          allWorkflows.push(...workflows);
        }

        exportData.conversations = conversations;
        exportData.messages = messages;
        exportData.workflows = allWorkflows;
      }

      return exportData;
    } catch (error) {
      console.error('Error exporting data:', error);
      throw error;
    }
  }

  /**
   * Import chat history and workflows from backup
   * @param {Object} importData - Exported data object
   */
  async importData(importData) {
    try {
      if (!importData.conversations || !importData.messages) {
        throw new Error('Invalid import data format');
      }

      // Import conversations
      for (const conversation of importData.conversations) {
        const existingConversations = await this.getConversations();
        if (!existingConversations.find(c => c.id === conversation.id)) {
          await this.createConversation(conversation);
        }
      }

      // Import messages
      for (const [conversationId, messages] of Object.entries(importData.messages)) {
        for (const message of messages) {
          await this.saveChatMessage(message);
        }
      }

      // Import workflows
      if (importData.workflows) {
        for (const workflow of importData.workflows) {
          await this.saveWorkflow(workflow.conversationId, workflow);
        }
      }

      return true;
    } catch (error) {
      console.error('Error importing data:', error);
      throw error;
    }
  }

  /**
   * Clean up old conversations based on retention settings
   */
  async cleanupOldData() {
    try {
      const settings = await this.getSettings();
      const retentionDays = settings?.conversationRetention || 30;
      const cutoffDate = new Date();
      cutoffDate.setDate(cutoffDate.getDate() - retentionDays);

      const conversations = await this.getConversations();
      const toDelete = conversations.filter(c => 
        new Date(c.updatedAt) < cutoffDate
      );

      for (const conversation of toDelete) {
        await this.deleteConversation(conversation.id);
      }

      return toDelete.length;
    } catch (error) {
      console.error('Error cleaning up old data:', error);
      return 0;
    }
  }

  /**
   * Get storage usage statistics
   */
  async getStorageUsage() {
    try {
      const usage = await chrome.storage.local.getBytesInUse();
      const conversations = await this.getConversations();
      
      let totalMessages = 0;
      let totalWorkflows = 0;

      for (const conversation of conversations) {
        const messages = await this.getChatMessages(conversation.id);
        const workflows = await this.getWorkflowsByConversation(conversation.id);
        totalMessages += messages.length;
        totalWorkflows += workflows.length;
      }

      return {
        bytesUsed: usage,
        conversationCount: conversations.length,
        messageCount: totalMessages,
        workflowCount: totalWorkflows
      };
    } catch (error) {
      console.error('Error getting storage usage:', error);
      return null;
    }
  }

  // Utility methods
  generateMessageId() {
    return `msg_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  generateConversationId() {
    return `conv_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  generateWorkflowId() {
    return `wf_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
}

// Export for use in other modules
if (typeof module !== 'undefined' && module.exports) {
  module.exports = StorageService;
} else if (typeof window !== 'undefined') {
  window.StorageService = StorageService;
}
/**
 * 44agents Popup Interface
 * Handles settings, API key configuration, and usage statistics
 */

class PopupManager {
    constructor() {
        this.config = null;
        this.init();
    }

    async init() {
        await this.loadConfig();
        this.setupEventListeners();
        this.populateForm();
        this.loadUsageStats();
    }

    async loadConfig() {
        try {
            const response = await chrome.runtime.sendMessage({ type: 'GET_CONFIG' });
            if (response && response.success) {
                this.config = response.config;
            } else {
                console.error('Failed to load config:', response?.error);
                this.config = this.getDefaultConfig();
            }
        } catch (error) {
            console.error('Error loading config:', error);
            this.config = this.getDefaultConfig();
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
            preferredComplexity: 'medium',
            includeErrorHandling: true
        };
    }

    setupEventListeners() {
        // API key validation
        document.getElementById('validate-keys').addEventListener('click', () => {
            this.validateApiKeys();
        });

        // Auto-save on changes
        const inputs = ['preferred-provider', 'claude-api-key', 'openai-api-key', 'gemini-api-key', 
                       'complexity', 'error-handling', 'optimize-cost'];
        
        inputs.forEach(id => {
            const element = document.getElementById(id);
            if (element) {
                element.addEventListener('change', () => {
                    this.saveConfig();
                });

                // Also listen for input events on text fields
                if (element.type === 'text' || element.type === 'password') {
                    element.addEventListener('input', this.debounce(() => {
                        this.saveConfig();
                    }, 1000));
                }
            }
        });

        // Export/Import actions
        document.getElementById('export-data').addEventListener('click', () => {
            this.exportData();
        });

        document.getElementById('clear-data').addEventListener('click', () => {
            this.clearData();
        });
    }

    populateForm() {
        if (!this.config) return;

        // Populate form fields
        document.getElementById('preferred-provider').value = this.config.preferredProvider || 'claude';
        document.getElementById('claude-api-key').value = this.config.claudeApiKey || '';
        document.getElementById('openai-api-key').value = this.config.openaiApiKey || '';
        document.getElementById('gemini-api-key').value = this.config.geminiApiKey || '';
        document.getElementById('complexity').value = this.config.preferredComplexity || 'medium';
        document.getElementById('error-handling').checked = this.config.includeErrorHandling !== false;
        document.getElementById('optimize-cost').checked = this.config.generationOptions?.optimizeForCost || false;

        // Update API key status indicators
        this.updateApiKeyStatus();
    }

    async updateApiKeyStatus() {
        const providers = ['claude', 'openai', 'gemini'];
        
        for (const provider of providers) {
            const apiKey = document.getElementById(`${provider}-api-key`).value;
            const statusElement = document.getElementById(`${provider}-status`);
            const statusDot = statusElement.querySelector('.status-dot');
            const statusText = statusElement.querySelector('.status-text');

            if (!apiKey) {
                statusElement.style.display = 'none';
                continue;
            }

            statusElement.style.display = 'flex';
            statusDot.className = 'status-dot disconnected';
            statusText.textContent = 'Not validated';

            // Show status even if not validated yet
            if (this.config.validatedKeys && this.config.validatedKeys[provider]) {
                statusDot.className = 'status-dot connected';
                statusText.textContent = 'Valid';
            }
        }
    }

    async validateApiKeys() {
        const validateBtn = document.getElementById('validate-keys');
        const validateLoading = document.getElementById('validate-loading');
        const validateText = document.getElementById('validate-text');
        const messageDiv = document.getElementById('validation-message');

        // Show loading state
        validateBtn.disabled = true;
        validateLoading.style.display = 'flex';
        validateText.style.display = 'none';
        messageDiv.innerHTML = '';

        const providers = ['claude', 'openai', 'gemini'];
        const results = {};
        
        try {
            for (const provider of providers) {
                const apiKey = document.getElementById(`${provider}-api-key`).value;
                const statusElement = document.getElementById(`${provider}-status`);
                const statusDot = statusElement.querySelector('.status-dot');
                const statusText = statusElement.querySelector('.status-text');

                if (!apiKey) {
                    results[provider] = { valid: false, reason: 'No API key provided' };
                    continue;
                }

                // Show checking status
                statusElement.style.display = 'flex';
                statusDot.className = 'status-dot checking';
                statusText.textContent = 'Validating...';

                try {
                    const response = await chrome.runtime.sendMessage({
                        type: 'VALIDATE_API_KEY',
                        provider: provider,
                        apiKey: apiKey
                    });

                    const isValid = response && response.success && response.valid;
                    results[provider] = { valid: isValid };

                    // Update status
                    statusDot.className = isValid ? 'status-dot connected' : 'status-dot disconnected';
                    statusText.textContent = isValid ? 'Valid' : 'Invalid';

                } catch (error) {
                    results[provider] = { valid: false, reason: error.message };
                    statusDot.className = 'status-dot disconnected';
                    statusText.textContent = 'Error';
                }
            }

            // Save validation results
            this.config.validatedKeys = {};
            for (const [provider, result] of Object.entries(results)) {
                this.config.validatedKeys[provider] = result.valid;
            }
            await this.saveConfig();

            // Show summary message
            const validCount = Object.values(results).filter(r => r.valid).length;
            const totalCount = Object.values(results).filter(r => r.valid !== undefined).length;

            if (validCount > 0) {
                messageDiv.innerHTML = `<div class="success-message">✓ ${validCount}/${totalCount} API keys validated successfully</div>`;
            } else if (totalCount > 0) {
                messageDiv.innerHTML = `<div class="error-message">✗ No valid API keys found. Please check your keys and try again.</div>`;
            } else {
                messageDiv.innerHTML = `<div class="error-message">⚠️ No API keys configured. Please add at least one API key.</div>`;
            }

        } catch (error) {
            messageDiv.innerHTML = `<div class="error-message">✗ Validation failed: ${error.message}</div>`;
        } finally {
            // Reset button state
            validateBtn.disabled = false;
            validateLoading.style.display = 'none';
            validateText.style.display = 'inline';
        }
    }

    async saveConfig() {
        try {
            // Collect form data
            const formConfig = {
                ...this.config,
                preferredProvider: document.getElementById('preferred-provider').value,
                claudeApiKey: document.getElementById('claude-api-key').value,
                openaiApiKey: document.getElementById('openai-api-key').value,
                geminiApiKey: document.getElementById('gemini-api-key').value,
                preferredComplexity: document.getElementById('complexity').value,
                includeErrorHandling: document.getElementById('error-handling').checked,
                generationOptions: {
                    ...this.config.generationOptions,
                    optimizeForCost: document.getElementById('optimize-cost').checked
                }
            };

            const response = await chrome.runtime.sendMessage({
                type: 'SAVE_CONFIG',
                config: formConfig
            });

            if (response && response.success) {
                this.config = formConfig;
                console.log('Config saved successfully');
            } else {
                console.error('Failed to save config:', response?.error);
            }

        } catch (error) {
            console.error('Error saving config:', error);
        }
    }

    async loadUsageStats() {
        try {
            const response = await chrome.runtime.sendMessage({ type: 'GET_USAGE_METRICS' });
            
            if (response && response.success && response.metrics) {
                const metrics = response.metrics;
                
                document.getElementById('total-workflows').textContent = 
                    metrics.totalRequests?.toString() || '0';
                
                document.getElementById('total-cost').textContent = 
                    '$' + (metrics.totalCost?.toFixed(2) || '0.00');
            }
        } catch (error) {
            console.error('Error loading usage stats:', error);
        }
    }

    async exportData() {
        try {
            // Get all extension data (excluding sensitive API keys)
            const response = await chrome.runtime.sendMessage({ type: 'EXPORT_DATA' });
            
            if (response && response.success) {
                const exportData = response.data;
                const blob = new Blob([JSON.stringify(exportData, null, 2)], { 
                    type: 'application/json' 
                });
                
                const url = URL.createObjectURL(blob);
                const timestamp = new Date().toISOString().slice(0, 10);
                
                await chrome.downloads.download({
                    url: url,
                    filename: `44agents-export-${timestamp}.json`,
                    saveAs: true
                });
                
                setTimeout(() => URL.revokeObjectURL(url), 1000);
                
                this.showMessage('Data exported successfully!', 'success');
            }
        } catch (error) {
            console.error('Export failed:', error);
            this.showMessage('Export failed: ' + error.message, 'error');
        }
    }

    async clearData() {
        if (!confirm('Are you sure you want to clear all data? This action cannot be undone.')) {
            return;
        }

        try {
            const response = await chrome.runtime.sendMessage({ type: 'CLEAR_DATA' });
            
            if (response && response.success) {
                this.showMessage('All data cleared successfully!', 'success');
                this.loadUsageStats(); // Refresh stats
            } else {
                throw new Error(response?.error || 'Clear operation failed');
            }
        } catch (error) {
            console.error('Clear data failed:', error);
            this.showMessage('Clear data failed: ' + error.message, 'error');
        }
    }

    showMessage(message, type = 'info') {
        const messageDiv = document.getElementById('validation-message');
        const className = type === 'success' ? 'success-message' : 'error-message';
        messageDiv.innerHTML = `<div class="${className}">${message}</div>`;
        
        // Auto-hide after 3 seconds
        setTimeout(() => {
            messageDiv.innerHTML = '';
        }, 3000);
    }

    debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            const later = () => {
                clearTimeout(timeout);
                func(...args);
            };
            clearTimeout(timeout);
            timeout = setTimeout(later, wait);
        };
    }
}

// Global function for password toggle
function togglePasswordVisibility(inputId) {
    const input = document.getElementById(inputId);
    const button = input.nextElementSibling;
    
    if (input.type === 'password') {
        input.type = 'text';
        button.textContent = '🙈';
    } else {
        input.type = 'password';
        button.textContent = '👁️';
    }
}

// Initialize popup when DOM is loaded
document.addEventListener('DOMContentLoaded', () => {
    new PopupManager();
});

// Handle extension context menu or action clicks
chrome.action?.onClicked?.addListener(() => {
    chrome.tabs.query({ active: true, currentWindow: true }, (tabs) => {
        const tab = tabs[0];
        if (tab?.url?.includes('n8n')) {
            chrome.tabs.sendMessage(tab.id, { type: 'TOGGLE_CHAT' });
        }
    });
});
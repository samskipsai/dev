/**
 * n8n Workflow Import Service
 * Handles importing workflows to n8n instances
 */

import { ErrorHandler, CustomError, ErrorTypes } from '../../utils/error-handler.js';

export class N8nWorkflowImporter {
    constructor(storageManager) {
        this.storageManager = storageManager;
        this.errorHandler = new ErrorHandler();
    }

    async importWorkflow(workflow, options = {}) {
        try {
            const config = await this.storageManager.getConfig();
            const importMethod = this.detectImportMethod(config);

            switch (importMethod) {
                case 'api':
                    return await this.importViaAPI(workflow, options, config);
                case 'clipboard':
                    return await this.importViaClipboard(workflow, options);
                case 'download':
                    return await this.importViaDownload(workflow, options);
                default:
                    return await this.importViaClipboard(workflow, options);
            }

        } catch (error) {
            throw new CustomError(
                `Workflow import failed: ${error.message}`,
                ErrorTypes.N8N_ERROR,
                { workflow: workflow.id, originalError: error }
            );
        }
    }

    detectImportMethod(config) {
        // Check if n8n API is configured
        if (config.n8nApiUrl && config.n8nApiKey) {
            return 'api';
        }

        // Check if we can detect n8n in current tab
        // This would be enhanced with actual n8n detection logic
        return 'clipboard';
    }

    async importViaAPI(workflow, options, config) {
        try {
            const n8nApi = new N8nAPIClient(config);
            
            // Validate API connection
            const isConnected = await n8nApi.testConnection();
            if (!isConnected) {
                throw new Error('Cannot connect to n8n API. Please check your configuration.');
            }

            // Prepare workflow for import
            const importWorkflow = this.prepareWorkflowForImport(workflow);

            // Import workflow
            const response = await n8nApi.importWorkflow(importWorkflow, options);
            
            if (!response.success) {
                throw new Error(response.error || 'Import failed');
            }

            // Save import record
            await this.saveImportRecord({
                workflowId: workflow.id,
                n8nWorkflowId: response.workflowId,
                method: 'api',
                timestamp: Date.now(),
                success: true
            });

            return {
                success: true,
                method: 'api',
                workflowId: response.workflowId,
                message: 'Workflow successfully imported to n8n via API'
            };

        } catch (error) {
            throw new CustomError(
                `API import failed: ${error.message}`,
                ErrorTypes.API_ERROR,
                { originalError: error }
            );
        }
    }

    async importViaClipboard(workflow, options) {
        try {
            // Prepare workflow for clipboard
            const workflowJSON = this.prepareWorkflowForClipboard(workflow);
            
            // Copy to clipboard using Chrome's clipboard API
            await this.copyToClipboard(workflowJSON);

            // Save import record
            await this.saveImportRecord({
                workflowId: workflow.id,
                method: 'clipboard',
                timestamp: Date.now(),
                success: true
            });

            return {
                success: true,
                method: 'clipboard',
                message: 'Workflow copied to clipboard. Go to n8n and use "Import from Clipboard" to import the workflow.',
                instructions: [
                    '1. Go to your n8n instance',
                    '2. Click on "Workflows" in the sidebar',
                    '3. Click the "+" button to create a new workflow',
                    '4. Click the "..." menu and select "Import from Clipboard"',
                    '5. The workflow will be imported automatically'
                ]
            };

        } catch (error) {
            throw new CustomError(
                `Clipboard import failed: ${error.message}`,
                ErrorTypes.EXTENSION_ERROR,
                { originalError: error }
            );
        }
    }

    async importViaDownload(workflow, options) {
        try {
            // Prepare workflow for download
            const workflowJSON = this.prepareWorkflowForClipboard(workflow);
            const filename = this.generateFilename(workflow);

            // Create download
            await this.downloadWorkflow(workflowJSON, filename);

            // Save import record
            await this.saveImportRecord({
                workflowId: workflow.id,
                method: 'download',
                filename: filename,
                timestamp: Date.now(),
                success: true
            });

            return {
                success: true,
                method: 'download',
                filename: filename,
                message: `Workflow downloaded as ${filename}. Import it manually in n8n.`,
                instructions: [
                    '1. Go to your n8n instance',
                    '2. Click on "Workflows" in the sidebar',
                    '3. Click the "+" button to create a new workflow',
                    '4. Click the "..." menu and select "Import from File"',
                    '5. Select the downloaded JSON file'
                ]
            };

        } catch (error) {
            throw new CustomError(
                `Download import failed: ${error.message}`,
                ErrorTypes.EXTENSION_ERROR,
                { originalError: error }
            );
        }
    }

    prepareWorkflowForImport(workflow) {
        // Clean up the workflow for n8n import
        const cleanWorkflow = {
            name: workflow.name,
            nodes: workflow.nodes.map(node => ({
                id: node.id,
                name: node.name,
                type: node.type,
                typeVersion: node.typeVersion || 1,
                position: node.position,
                parameters: node.parameters || {},
                ...(node.credentials && { credentials: node.credentials }),
                ...(node.disabled && { disabled: node.disabled }),
                ...(node.notes && { notes: node.notes })
            })),
            connections: workflow.connections || {},
            active: false, // Start as inactive for safety
            settings: workflow.settings || {},
            tags: workflow.tags || ['44agents'],
            ...(workflow.staticData && { staticData: workflow.staticData })
        };

        return cleanWorkflow;
    }

    prepareWorkflowForClipboard(workflow) {
        const cleanWorkflow = this.prepareWorkflowForImport(workflow);
        return JSON.stringify(cleanWorkflow, null, 2);
    }

    async copyToClipboard(workflowJSON) {
        try {
            // Use Chrome's offscreen document for clipboard access
            const response = await chrome.runtime.sendMessage({
                type: 'COPY_TO_CLIPBOARD',
                data: workflowJSON
            });

            if (!response || !response.success) {
                throw new Error(response?.error || 'Failed to copy to clipboard');
            }

        } catch (error) {
            // Fallback: try direct clipboard API if available
            if (navigator.clipboard) {
                await navigator.clipboard.writeText(workflowJSON);
            } else {
                throw new Error('Clipboard access not available');
            }
        }
    }

    generateFilename(workflow) {
        const safeName = workflow.name.replace(/[^a-zA-Z0-9-_]/g, '_');
        const timestamp = new Date().toISOString().slice(0, 10);
        return `${safeName}_${timestamp}.json`;
    }

    async downloadWorkflow(workflowJSON, filename) {
        try {
            // Create blob and download
            const blob = new Blob([workflowJSON], { type: 'application/json' });
            const url = URL.createObjectURL(blob);

            // Use Chrome's downloads API
            await chrome.downloads.download({
                url: url,
                filename: filename,
                saveAs: true
            });

            // Clean up
            setTimeout(() => URL.revokeObjectURL(url), 1000);

        } catch (error) {
            throw new Error(`Download failed: ${error.message}`);
        }
    }

    async saveImportRecord(record) {
        try {
            await this.storageManager.saveImportEvent({
                ...record,
                extensionVersion: '1.0.0'
            });
        } catch (error) {
            console.warn('44agents: Failed to save import record:', error);
            // Don't throw - this is not critical for the import process
        }
    }

    async getImportHistory() {
        try {
            return await this.storageManager.getImportEvents();
        } catch (error) {
            console.error('44agents: Failed to get import history:', error);
            return [];
        }
    }

    // Workflow validation before import
    async validateWorkflow(workflow) {
        const validation = {
            isValid: true,
            errors: [],
            warnings: []
        };

        // Basic validation
        if (!workflow.nodes || workflow.nodes.length === 0) {
            validation.errors.push('Workflow must contain at least one node');
            validation.isValid = false;
        }

        // Check for required properties
        for (const node of workflow.nodes || []) {
            if (!node.id || !node.name || !node.type) {
                validation.errors.push(`Node "${node.name || 'unnamed'}" is missing required properties`);
                validation.isValid = false;
            }

            if (!node.position || !Array.isArray(node.position) || node.position.length !== 2) {
                validation.warnings.push(`Node "${node.name}" has invalid position`);
            }
        }

        // Check connections validity
        if (workflow.connections) {
            for (const [nodeId, connections] of Object.entries(workflow.connections)) {
                const nodeExists = workflow.nodes.some(n => n.id === nodeId);
                if (!nodeExists) {
                    validation.errors.push(`Connection references non-existent node: ${nodeId}`);
                    validation.isValid = false;
                }
            }
        }

        return validation;
    }
}

// Simple n8n API client for direct API imports
class N8nAPIClient {
    constructor(config) {
        this.baseUrl = config.n8nApiUrl.replace(/\/$/, '');
        this.apiKey = config.n8nApiKey;
        this.headers = {
            'Content-Type': 'application/json',
            'X-N8N-API-KEY': this.apiKey
        };
    }

    async testConnection() {
        try {
            const response = await fetch(`${this.baseUrl}/workflows`, {
                method: 'GET',
                headers: this.headers
            });
            return response.ok;
        } catch (error) {
            return false;
        }
    }

    async importWorkflow(workflow, options) {
        try {
            const response = await fetch(`${this.baseUrl}/workflows`, {
                method: 'POST',
                headers: this.headers,
                body: JSON.stringify(workflow)
            });

            const data = await response.json();

            if (!response.ok) {
                throw new Error(data.message || `HTTP ${response.status}`);
            }

            // Optionally activate the workflow
            if (options.activate && data.id) {
                await this.activateWorkflow(data.id);
            }

            return {
                success: true,
                workflowId: data.id,
                message: 'Workflow imported successfully'
            };

        } catch (error) {
            return {
                success: false,
                error: error.message
            };
        }
    }

    async activateWorkflow(workflowId) {
        try {
            const response = await fetch(`${this.baseUrl}/workflows/${workflowId}/activate`, {
                method: 'POST',
                headers: this.headers
            });

            return response.ok;
        } catch (error) {
            console.warn('Failed to activate workflow:', error);
            return false;
        }
    }

    async getWorkflows() {
        try {
            const response = await fetch(`${this.baseUrl}/workflows`, {
                method: 'GET',
                headers: this.headers
            });

            if (!response.ok) {
                throw new Error(`HTTP ${response.status}`);
            }

            const data = await response.json();
            return data.data || [];

        } catch (error) {
            console.error('Failed to get workflows:', error);
            return [];
        }
    }
}
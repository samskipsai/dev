/**
 * Base AI Service class
 * Abstract base for AI service implementations
 */

export class BaseAIService {
    constructor(apiKey, model) {
        if (this.constructor === BaseAIService) {
            throw new Error('BaseAIService is abstract and cannot be instantiated directly');
        }
        
        this.apiKey = apiKey;
        this.model = model;
        this.requestCount = 0;
        this.tokenCount = 0;
        this.totalCost = 0;
        this.lastRequestTime = null;
        this.rateLimitStatus = {
            requestsRemaining: model?.rateLimitRPM || 1000,
            tokensRemaining: model?.rateLimitTPM || 50000,
            resetTime: new Date(Date.now() + 60000) // 1 minute from now
        };
    }

    // Abstract methods that must be implemented by subclasses
    async generateWorkflow(request) {
        throw new Error('generateWorkflow method must be implemented by subclass');
    }

    async validateApiKey(apiKey) {
        throw new Error('validateApiKey method must be implemented by subclass');
    }

    // Common utility methods
    async checkRateLimit() {
        const now = new Date();
        
        // Reset rate limit counters if time window has passed
        if (now > this.rateLimitStatus.resetTime) {
            this.rateLimitStatus.requestsRemaining = this.model.rateLimitRPM;
            this.rateLimitStatus.tokensRemaining = this.model.rateLimitTPM;
            this.rateLimitStatus.resetTime = new Date(now.getTime() + 60000);
        }

        if (this.rateLimitStatus.requestsRemaining <= 0) {
            const waitTime = this.rateLimitStatus.resetTime.getTime() - now.getTime();
            throw new Error(`Rate limit exceeded. Please wait ${Math.ceil(waitTime / 1000)} seconds.`);
        }
    }

    updateRateLimit(tokensUsed = 0) {
        this.rateLimitStatus.requestsRemaining--;
        this.rateLimitStatus.tokensRemaining -= tokensUsed;
        this.requestCount++;
        this.tokenCount += tokensUsed;
        this.lastRequestTime = new Date();
    }

    estimateTokens(text) {
        // Rough estimation: ~4 characters per token for English text
        return Math.ceil(text.length / 4);
    }

    calculateCost(inputTokens, outputTokens) {
        const inputCost = (inputTokens / 1000) * this.model.inputCostPer1k;
        const outputCost = (outputTokens / 1000) * this.model.outputCostPer1k;
        return inputCost + outputCost;
    }

    async getRateLimitStatus() {
        return {
            ...this.rateLimitStatus,
            provider: this.model.provider
        };
    }

    async getUsageMetrics() {
        return {
            totalRequests: this.requestCount,
            totalTokens: this.tokenCount,
            totalCost: this.totalCost,
            successRate: this.requestCount > 0 ? ((this.requestCount - this.errorCount || 0) / this.requestCount) * 100 : 100,
            averageResponseTime: this.averageResponseTime || 0,
            byProvider: {
                [this.model.provider]: {
                    requests: this.requestCount,
                    tokens: this.tokenCount,
                    cost: this.totalCost,
                    errors: this.errorCount || 0
                }
            }
        };
    }

    async estimateCost(description, context = {}) {
        // Estimate input tokens from description and context
        const inputText = description + JSON.stringify(context);
        const inputTokens = this.estimateTokens(inputText);
        
        // Estimate output tokens (workflow JSON is typically 1000-5000 tokens)
        const estimatedOutputTokens = 2000;
        
        return this.calculateCost(inputTokens, estimatedOutputTokens);
    }

    formatError(error, provider) {
        const baseError = {
            message: error.message,
            provider: provider,
            timestamp: new Date().toISOString()
        };

        // Handle common HTTP status codes
        if (error.status) {
            switch (error.status) {
                case 401:
                    baseError.code = 'INVALID_API_KEY';
                    baseError.message = 'Invalid API key. Please check your configuration.';
                    break;
                case 429:
                    baseError.code = 'RATE_LIMITED';
                    baseError.rateLimited = true;
                    baseError.retryAfter = error.retryAfter || 60;
                    baseError.message = 'Rate limit exceeded. Please try again later.';
                    break;
                case 500:
                case 502:
                case 503:
                    baseError.code = 'SERVICE_ERROR';
                    baseError.message = 'AI service is temporarily unavailable. Please try again.';
                    break;
                default:
                    baseError.code = 'HTTP_ERROR';
                    baseError.message = `HTTP ${error.status}: ${error.message}`;
            }
        }

        return baseError;
    }

    // Helper method to build system prompt with context
    buildSystemPrompt(context = {}) {
        let prompt = `You are an expert n8n workflow automation assistant. Your role is to convert natural language descriptions into valid n8n workflow JSON configurations.

Key requirements:
1. Generate complete, executable n8n workflows with proper node connections
2. Use only standard n8n nodes that are widely available
3. Include proper error handling and data validation where appropriate
4. Optimize for performance and maintainability
5. Provide clear explanations of workflow logic

Available n8n node types include but are not limited to:
- HTTP Request, Webhook, Manual Trigger
- Code (JavaScript/Python), Function, Set
- If, Switch, Merge, Split In Batches
- Email Send, Slack, Discord, Telegram
- Google Sheets, Airtable, Notion
- MySQL, PostgreSQL, MongoDB
- AWS, Google Cloud, Azure services
- And many more...`;

        // Add context-specific information
        if (context.availableNodes && context.availableNodes.length > 0) {
            prompt += `\n\nSpecifically available nodes in this n8n instance: ${context.availableNodes.join(', ')}`;
        }

        if (context.n8nVersion) {
            prompt += `\n\nn8n Version: ${context.n8nVersion}`;
        }

        if (context.userPreferences) {
            const prefs = context.userPreferences;
            if (prefs.preferredNodes && prefs.preferredNodes.length > 0) {
                prompt += `\n\nUser prefers these nodes when possible: ${prefs.preferredNodes.join(', ')}`;
            }
            if (prefs.complexity) {
                prompt += `\n\nPreferred workflow complexity: ${prefs.complexity}`;
            }
            if (prefs.includeErrorHandling) {
                prompt += `\n\nAlways include error handling nodes where appropriate.`;
            }
        }

        prompt += `\n\nAlways respond with valid JSON in this exact format:
{
  "workflow": {
    "id": "unique_workflow_id",
    "name": "Workflow Name",
    "description": "Brief description",
    "nodes": [/* array of n8n nodes */],
    "connections": {/* node connections */},
    "metadata": {
      "generatedBy": "44agents",
      "aiModel": "${this.model.name}",
      "timestamp": "${new Date().toISOString()}",
      "conversationId": "current_conversation_id",
      "version": "1.0"
    }
  },
  "explanation": "Clear explanation of how the workflow works and what each node does",
  "confidence": 0.95
}`;

        return prompt;
    }
}
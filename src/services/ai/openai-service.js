/**
 * OpenAI Service Implementation
 * Handles workflow generation using OpenAI's GPT API
 */

import { BaseAIService } from './base-service.js';
import { AIProvider, AI_MODELS } from '../../types/ai.js';

export class OpenAIService extends BaseAIService {
    constructor(apiKey, modelName = 'gpt-4-turbo') {
        const model = AI_MODELS[modelName] || AI_MODELS['gpt-4-turbo'];
        super(apiKey, model);
        this.provider = AIProvider.OPENAI;
        this.apiUrl = 'https://api.openai.com/v1/chat/completions';
    }

    async generateWorkflow(request) {
        try {
            await this.checkRateLimit();
            
            const startTime = Date.now();
            
            // Build the messages array
            const messages = [
                {
                    role: 'system',
                    content: this.buildSystemPrompt(request.context)
                }
            ];
            
            // Add previous conversation context if available
            if (request.previousMessages && request.previousMessages.length > 0) {
                request.previousMessages.forEach(msg => {
                    if (msg.type !== 'system') {
                        messages.push({
                            role: msg.type === 'user' ? 'user' : 'assistant',
                            content: msg.content
                        });
                    }
                });
            }
            
            // Add current user request
            messages.push({
                role: 'user',
                content: `Please generate an n8n workflow for this request: ${request.description}`
            });

            const requestBody = {
                model: this.model.name,
                messages: messages,
                max_tokens: request.options?.maxTokens || 4000,
                temperature: request.options?.temperature || 0.1,
                response_format: { type: 'json_object' }
            };

            console.log('44agents: Sending request to OpenAI API');

            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${this.apiKey}`
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                throw await this.handleApiError(response);
            }

            const result = await response.json();
            const responseTime = Date.now() - startTime;
            
            // Parse the response
            const content = result.choices[0].message.content;
            const parsedResponse = this.parseWorkflowResponse(content);
            
            // Calculate tokens and cost
            const inputTokens = result.usage.prompt_tokens;
            const outputTokens = result.usage.completion_tokens;
            const cost = this.calculateCost(inputTokens, outputTokens);
            
            // Update tracking
            this.updateRateLimit(inputTokens + outputTokens);
            this.totalCost += cost;
            
            // Update average response time
            this.averageResponseTime = this.averageResponseTime 
                ? (this.averageResponseTime + responseTime) / 2 
                : responseTime;

            console.log('44agents: OpenAI workflow generation completed', {
                inputTokens,
                outputTokens,
                cost: cost.toFixed(4),
                responseTime: `${responseTime}ms`
            });

            return {
                workflow: parsedResponse.workflow,
                explanation: parsedResponse.explanation,
                confidence: parsedResponse.confidence || 0.9,
                estimatedTokens: inputTokens + outputTokens,
                cost: cost
            };

        } catch (error) {
            this.errorCount = (this.errorCount || 0) + 1;
            console.error('44agents: OpenAI API error:', error);
            throw this.formatError(error, this.provider);
        }
    }

    parseWorkflowResponse(content) {
        try {
            const parsed = JSON.parse(content);
            
            // Validate the response structure
            if (!parsed.workflow || !parsed.explanation) {
                throw new Error('Invalid response format from OpenAI');
            }
            
            // Ensure workflow has required fields
            if (!parsed.workflow.id) {
                parsed.workflow.id = this.generateWorkflowId();
            }
            
            if (!parsed.workflow.nodes) {
                throw new Error('Workflow must contain nodes array');
            }
            
            if (!parsed.workflow.connections) {
                parsed.workflow.connections = {};
            }
            
            if (!parsed.workflow.metadata) {
                parsed.workflow.metadata = {
                    generatedBy: '44agents',
                    aiModel: this.model.name,
                    timestamp: new Date().toISOString(),
                    version: '1.0'
                };
            }
            
            return parsed;
            
        } catch (error) {
            console.error('44agents: Failed to parse OpenAI response:', error);
            console.log('Raw response:', content);
            
            // Fallback: create a simple workflow with the explanation
            return {
                workflow: {
                    id: this.generateWorkflowId(),
                    name: 'Generated Workflow',
                    description: 'Workflow generated by OpenAI',
                    nodes: [{
                        id: 'start',
                        name: 'Manual Trigger',
                        type: 'n8n-nodes-base.manualTrigger',
                        typeVersion: 1,
                        position: [240, 300],
                        parameters: {}
                    }],
                    connections: {},
                    metadata: {
                        generatedBy: '44agents',
                        aiModel: this.model.name,
                        timestamp: new Date().toISOString(),
                        version: '1.0',
                        parseError: true
                    }
                },
                explanation: `I encountered an error parsing the workflow response. Here's what OpenAI said:\n\n${content}`,
                confidence: 0.1
            };
        }
    }

    async validateApiKey(apiKey) {
        try {
            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${apiKey}`
                },
                body: JSON.stringify({
                    model: 'gpt-3.5-turbo',
                    messages: [{
                        role: 'user',
                        content: 'Test'
                    }],
                    max_tokens: 1
                })
            });

            return response.ok;
        } catch (error) {
            console.error('44agents: OpenAI API key validation failed:', error);
            return false;
        }
    }

    async handleApiError(response) {
        const errorData = await response.json().catch(() => ({}));
        
        const error = new Error(errorData.error?.message || `HTTP ${response.status}`);
        error.status = response.status;
        error.code = errorData.error?.type;
        
        if (response.status === 429) {
            // OpenAI doesn't always provide retry-after header
            error.retryAfter = 60;
        }
        
        return error;
    }

    generateWorkflowId() {
        return 'workflow_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8);
    }

    // Override base method to include OpenAI-specific prompting
    buildSystemPrompt(context = {}) {
        let prompt = super.buildSystemPrompt(context);
        
        prompt += `\n\nAs a GPT model, you are excellent at structured reasoning and JSON generation. Follow these specific guidelines:
1. Always output valid JSON that can be parsed directly
2. Ensure all n8n node types and parameters are accurate
3. Create logical node connections that form a proper workflow
4. Include comprehensive error handling where appropriate
5. Provide detailed explanations of each workflow component

The response must be valid JSON in the exact format specified above. Do not include any text outside the JSON structure.`;

        return prompt;
    }
}
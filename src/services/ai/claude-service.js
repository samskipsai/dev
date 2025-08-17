/**
 * Claude AI Service Implementation
 * Handles workflow generation using Anthropic's Claude API
 */

import { BaseAIService } from './base-service.js';
import { AIProvider, AI_MODELS } from '../../types/ai.js';

export class ClaudeService extends BaseAIService {
    constructor(apiKey, modelName = 'claude-3-sonnet') {
        const model = AI_MODELS[modelName] || AI_MODELS['claude-3-sonnet'];
        super(apiKey, model);
        this.provider = AIProvider.CLAUDE;
        this.apiUrl = 'https://api.anthropic.com/v1/messages';
        this.apiVersion = '2023-06-01';
    }

    async generateWorkflow(request) {
        try {
            await this.checkRateLimit();
            
            const startTime = Date.now();
            
            // Build the prompt with context
            const systemPrompt = this.buildSystemPrompt(request.context);
            
            // Prepare the API request
            const messages = [];
            
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
                max_tokens: request.options?.maxTokens || 4000,
                temperature: request.options?.temperature || 0.1,
                system: systemPrompt,
                messages: messages
            };

            console.log('44agents: Sending request to Claude API');

            const response = await fetch(this.apiUrl, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'x-api-key': this.apiKey,
                    'anthropic-version': this.apiVersion
                },
                body: JSON.stringify(requestBody)
            });

            if (!response.ok) {
                throw await this.handleApiError(response);
            }

            const result = await response.json();
            const responseTime = Date.now() - startTime;
            
            // Parse the response
            const content = result.content[0].text;
            const parsedResponse = this.parseWorkflowResponse(content);
            
            // Calculate tokens and cost
            const inputTokens = result.usage.input_tokens;
            const outputTokens = result.usage.output_tokens;
            const cost = this.calculateCost(inputTokens, outputTokens);
            
            // Update tracking
            this.updateRateLimit(inputTokens + outputTokens);
            this.totalCost += cost;
            
            // Update average response time
            this.averageResponseTime = this.averageResponseTime 
                ? (this.averageResponseTime + responseTime) / 2 
                : responseTime;

            console.log('44agents: Claude workflow generation completed', {
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
            console.error('44agents: Claude API error:', error);
            throw this.formatError(error, this.provider);
        }
    }

    parseWorkflowResponse(content) {
        try {
            // Try to extract JSON from the response
            let jsonMatch = content.match(/```json\s*([\s\S]*?)\s*```/);
            if (!jsonMatch) {
                jsonMatch = content.match(/\{[\s\S]*\}/);
            }
            
            if (jsonMatch) {
                const parsed = JSON.parse(jsonMatch[1] || jsonMatch[0]);
                
                // Validate the response structure
                if (!parsed.workflow || !parsed.explanation) {
                    throw new Error('Invalid response format from Claude');
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
            } else {
                throw new Error('No JSON found in Claude response');
            }
        } catch (error) {
            console.error('44agents: Failed to parse Claude response:', error);
            console.log('Raw response:', content);
            
            // Fallback: create a simple workflow with the explanation
            return {
                workflow: {
                    id: this.generateWorkflowId(),
                    name: 'Generated Workflow',
                    description: 'Workflow generated by Claude',
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
                explanation: `I encountered an error parsing the workflow response. Here's what Claude said:\n\n${content}`,
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
                    'x-api-key': apiKey,
                    'anthropic-version': this.apiVersion
                },
                body: JSON.stringify({
                    model: 'claude-3-haiku-20240307',
                    max_tokens: 10,
                    messages: [{
                        role: 'user',
                        content: 'Test'
                    }]
                })
            });

            return response.ok || response.status === 400; // 400 is ok for validation
        } catch (error) {
            console.error('44agents: Claude API key validation failed:', error);
            return false;
        }
    }

    async handleApiError(response) {
        const errorData = await response.json().catch(() => ({}));
        
        const error = new Error(errorData.error?.message || `HTTP ${response.status}`);
        error.status = response.status;
        error.code = errorData.error?.type;
        
        if (response.status === 429) {
            error.retryAfter = parseInt(response.headers.get('retry-after')) || 60;
        }
        
        return error;
    }

    generateWorkflowId() {
        return 'workflow_' + Date.now() + '_' + Math.random().toString(36).substr(2, 8);
    }

    // Override base method to include Claude-specific context
    buildSystemPrompt(context = {}) {
        let prompt = super.buildSystemPrompt(context);
        
        prompt += `\n\nAs Claude, you excel at understanding complex automation requirements and breaking them down into logical workflow steps. Focus on:
1. Creating workflows that are maintainable and well-documented
2. Using appropriate n8n nodes for each task
3. Implementing proper error handling and data validation
4. Providing clear explanations of the workflow logic
5. Ensuring the workflow can be easily modified and extended

Remember to output valid JSON that can be directly imported into n8n.`;

        return prompt;
    }
}
/**
 * Workflow Generation Pipeline
 * Orchestrates the workflow generation process with context processing
 */

import { ErrorHandler, CustomError, ErrorTypes } from '../utils/error-handler.js';

export class WorkflowGenerator {
    constructor(aiServices, storageManager) {
        this.aiServices = aiServices;
        this.storageManager = storageManager;
        this.errorHandler = new ErrorHandler();
        this.generationSteps = [];
    }

    async generateWorkflow(request) {
        const startTime = Date.now();
        this.generationSteps = [];
        
        try {
            // Step 1: Context Processing and Validation
            const processedContext = await this.processContext(request);
            this.addGenerationStep('Context Processing', request, processedContext);

            // Step 2: AI Model Selection
            const selectedModel = await this.selectOptimalAIModel(request, processedContext);
            this.addGenerationStep('AI Model Selection', processedContext, selectedModel);

            // Step 3: Prompt Engineering
            const engineeredPrompt = await this.engineerPrompt(request, processedContext, selectedModel);
            this.addGenerationStep('Prompt Engineering', selectedModel, engineeredPrompt);

            // Step 4: Workflow Generation
            const rawWorkflow = await this.callAIService(selectedModel, engineeredPrompt);
            this.addGenerationStep('Workflow Generation', engineeredPrompt, rawWorkflow);

            // Step 5: Post-processing and Enhancement
            const enhancedWorkflow = await this.enhanceWorkflow(rawWorkflow, request, processedContext);
            this.addGenerationStep('Workflow Enhancement', rawWorkflow, enhancedWorkflow);

            // Step 6: Validation
            const validationResult = await this.validateWorkflow(enhancedWorkflow, processedContext);
            this.addGenerationStep('Workflow Validation', enhancedWorkflow, validationResult);

            // Step 7: Preview Generation
            const preview = await this.generatePreview(enhancedWorkflow, validationResult);
            this.addGenerationStep('Preview Generation', enhancedWorkflow, preview);

            const totalDuration = Date.now() - startTime;

            return {
                success: true,
                workflow: enhancedWorkflow,
                validation: validationResult,
                preview: preview,
                steps: this.generationSteps,
                metadata: {
                    totalDuration,
                    aiModel: selectedModel.provider,
                    stepsCompleted: this.generationSteps.length,
                    timestamp: new Date().toISOString()
                }
            };

        } catch (error) {
            const errorStep = {
                step: this.generationSteps.length + 1,
                name: 'Error Handling',
                input: request,
                output: error,
                timestamp: new Date().toISOString(),
                duration: Date.now() - startTime,
                status: 'error',
                error: error.message
            };
            this.generationSteps.push(errorStep);

            console.error('44agents: Workflow generation failed:', error);
            
            return {
                success: false,
                error: error.message,
                steps: this.generationSteps,
                metadata: {
                    totalDuration: Date.now() - startTime,
                    failedAt: errorStep.name,
                    timestamp: new Date().toISOString()
                }
            };
        }
    }

    async processContext(request) {
        const stepStart = Date.now();
        
        try {
            const context = { ...request.context };

            // Enrich context with stored data
            const n8nData = await this.storageManager.getN8nData();
            if (n8nData) {
                context.availableNodes = n8nData.availableNodes || context.availableNodes || [];
                context.n8nVersion = n8nData.version || context.n8nVersion || 'unknown';
                context.userCredentials = n8nData.credentials || [];
            }

            // Add conversation history if available
            if (request.conversationId) {
                const recentMessages = await this.storageManager.getRecentMessages(request.conversationId, 5);
                context.conversationHistory = recentMessages;
            }

            // Process user preferences
            const config = await this.storageManager.getConfig();
            context.userPreferences = {
                complexity: config.preferredComplexity || 'medium',
                errorHandling: config.includeErrorHandling !== false,
                includeDocumentation: true,
                preferredNodes: config.preferredNodes || [],
                optimizeForCost: config.generationOptions?.optimizeForCost || false
            };

            // Analyze description for complexity and requirements
            const descriptionAnalysis = this.analyzeDescription(request.description);
            context.analysis = descriptionAnalysis;

            // Add environmental context
            context.environment = {
                timestamp: new Date().toISOString(),
                userAgent: 'Chrome Extension 44agents',
                extensionVersion: '1.0.0'
            };

            return context;

        } catch (error) {
            throw new CustomError(
                `Context processing failed: ${error.message}`,
                ErrorTypes.EXTENSION_ERROR,
                { originalError: error, duration: Date.now() - stepStart }
            );
        }
    }

    async selectOptimalAIModel(request, context) {
        const stepStart = Date.now();

        try {
            const config = await this.storageManager.getConfig();
            
            // Check available AI services
            const availableServices = [];
            for (const [provider, service] of this.aiServices) {
                try {
                    const rateLimitStatus = await service.getRateLimitStatus();
                    if (rateLimitStatus.requestsRemaining > 0) {
                        availableServices.push({
                            provider,
                            service,
                            rateLimitStatus,
                            cost: await service.estimateCost(request.description, context)
                        });
                    }
                } catch (error) {
                    console.warn(`44agents: Service ${provider} unavailable:`, error);
                }
            }

            if (availableServices.length === 0) {
                throw new CustomError(
                    'No AI services available. Please check your API keys and rate limits.',
                    ErrorTypes.API_ERROR
                );
            }

            // Selection criteria
            let selectedService;

            // 1. Use preferred provider if available and not rate limited
            const preferred = config.preferredProvider || 'claude';
            const preferredService = availableServices.find(s => s.provider === preferred);
            
            if (preferredService) {
                selectedService = preferredService;
            } else {
                // 2. Fallback selection based on complexity and cost optimization
                if (context.userPreferences.optimizeForCost) {
                    // Choose cheapest available service
                    selectedService = availableServices.reduce((cheapest, current) => 
                        current.cost < cheapest.cost ? current : cheapest
                    );
                } else {
                    // Choose based on complexity requirements
                    const complexity = context.analysis?.estimatedComplexity || 'medium';
                    
                    if (complexity === 'complex') {
                        // Prefer Claude or GPT-4 for complex workflows
                        selectedService = availableServices.find(s => 
                            s.provider === 'claude' || s.provider === 'openai'
                        ) || availableServices[0];
                    } else {
                        // Any available service is fine for simple workflows
                        selectedService = availableServices[0];
                    }
                }
            }

            return {
                provider: selectedService.provider,
                service: selectedService.service,
                estimatedCost: selectedService.cost,
                rateLimitStatus: selectedService.rateLimitStatus,
                selectionReason: selectedService.provider === preferred ? 'user_preference' : 'auto_selected'
            };

        } catch (error) {
            throw new CustomError(
                `AI model selection failed: ${error.message}`,
                ErrorTypes.EXTENSION_ERROR,
                { originalError: error, duration: Date.now() - stepStart }
            );
        }
    }

    async engineerPrompt(request, context, selectedModel) {
        const stepStart = Date.now();

        try {
            // Build comprehensive prompt with context
            const prompt = {
                systemPrompt: this.buildSystemPrompt(context, selectedModel.provider),
                userPrompt: this.buildUserPrompt(request, context),
                examples: this.getRelevantExamples(context),
                constraints: this.buildConstraints(context)
            };

            // Add conversation context if available
            if (context.conversationHistory && context.conversationHistory.length > 0) {
                prompt.conversationContext = context.conversationHistory.map(msg => ({
                    role: msg.type === 'user' ? 'user' : 'assistant',
                    content: msg.content
                }));
            }

            return prompt;

        } catch (error) {
            throw new CustomError(
                `Prompt engineering failed: ${error.message}`,
                ErrorTypes.EXTENSION_ERROR,
                { originalError: error, duration: Date.now() - stepStart }
            );
        }
    }

    async callAIService(selectedModel, prompt) {
        const stepStart = Date.now();

        try {
            const requestData = {
                description: prompt.userPrompt,
                context: {
                    availableNodes: prompt.constraints.availableNodes,
                    n8nVersion: prompt.constraints.n8nVersion,
                    userPreferences: prompt.constraints.userPreferences
                },
                previousMessages: prompt.conversationContext || [],
                options: {
                    temperature: 0.1,
                    maxTokens: 4000
                }
            };

            const response = await selectedModel.service.generateWorkflow(requestData);
            
            return {
                ...response,
                provider: selectedModel.provider,
                duration: Date.now() - stepStart
            };

        } catch (error) {
            throw new CustomError(
                `AI service call failed: ${error.message}`,
                ErrorTypes.API_ERROR,
                { provider: selectedModel.provider, originalError: error, duration: Date.now() - stepStart }
            );
        }
    }

    async enhanceWorkflow(rawWorkflow, request, context) {
        const stepStart = Date.now();

        try {
            const enhanced = { ...rawWorkflow.workflow };

            // Add comprehensive metadata
            enhanced.metadata = {
                generatedBy: '44agents',
                aiModel: rawWorkflow.provider,
                timestamp: new Date().toISOString(),
                conversationId: request.conversationId || 'unknown',
                originalDescription: request.description,
                generationSteps: [...this.generationSteps],
                version: '1.0',
                n8nVersion: context.n8nVersion || 'unknown',
                userPreferences: context.userPreferences,
                estimatedCost: rawWorkflow.cost || 0,
                confidence: rawWorkflow.confidence || 0.9
            };

            // Enhance node positioning if needed
            enhanced.nodes = this.optimizeNodePositions(enhanced.nodes);

            // Add error handling nodes if requested
            if (context.userPreferences?.errorHandling) {
                enhanced.nodes = this.addErrorHandling(enhanced.nodes, enhanced.connections);
            }

            // Optimize connections for better flow
            enhanced.connections = this.optimizeConnections(enhanced.connections, enhanced.nodes);

            // Add documentation if requested
            if (context.userPreferences?.includeDocumentation) {
                enhanced.nodes = this.addDocumentationNotes(enhanced.nodes, request.description);
            }

            return {
                ...enhanced,
                originalGeneration: rawWorkflow,
                enhancementDuration: Date.now() - stepStart
            };

        } catch (error) {
            throw new CustomError(
                `Workflow enhancement failed: ${error.message}`,
                ErrorTypes.EXTENSION_ERROR,
                { originalError: error, duration: Date.now() - stepStart }
            );
        }
    }

    async validateWorkflow(workflow, context) {
        const stepStart = Date.now();

        try {
            const validation = {
                isValid: true,
                compatibilityVersion: context.n8nVersion || 'unknown',
                errors: [],
                warnings: [],
                suggestions: [],
                nodeCompatibility: []
            };

            // Basic structure validation
            if (!workflow.nodes || !Array.isArray(workflow.nodes) || workflow.nodes.length === 0) {
                validation.errors.push({
                    type: 'structure',
                    severity: 'error',
                    message: 'Workflow must contain at least one node',
                    suggestedFix: 'Add a trigger node to start the workflow'
                });
                validation.isValid = false;
            }

            // Check for required trigger node
            const hasTrigger = workflow.nodes.some(node => 
                node.type.includes('trigger') || 
                node.type.includes('webhook') ||
                node.type.includes('manual')
            );

            if (!hasTrigger) {
                validation.warnings.push({
                    type: 'best-practice',
                    message: 'Workflow should have a trigger node',
                    nodeId: null,
                    impact: 'medium',
                    recommendation: 'Add a trigger node to define how the workflow starts'
                });
            }

            // Validate node connections
            for (const node of workflow.nodes) {
                if (!node.id || !node.name || !node.type) {
                    validation.errors.push({
                        type: 'node',
                        severity: 'error',
                        message: `Node missing required properties: ${node.name || 'unnamed'}`,
                        nodeId: node.id,
                        suggestedFix: 'Ensure all nodes have id, name, and type properties'
                    });
                    validation.isValid = false;
                }

                // Check node compatibility with available nodes
                if (context.availableNodes && context.availableNodes.length > 0) {
                    const isNodeAvailable = context.availableNodes.includes(node.type);
                    validation.nodeCompatibility.push({
                        nodeType: node.type,
                        isCompatible: isNodeAvailable,
                        availableVersion: 'unknown',
                        requiredVersion: node.typeVersion?.toString() || '1'
                    });

                    if (!isNodeAvailable) {
                        validation.warnings.push({
                            type: 'best-practice',
                            message: `Node type "${node.type}" may not be available in current n8n instance`,
                            nodeId: node.id,
                            impact: 'high',
                            recommendation: 'Verify node availability or use alternative nodes'
                        });
                    }
                }
            }

            // Performance suggestions
            if (workflow.nodes.length > 20) {
                validation.suggestions.push({
                    type: 'optimization',
                    message: 'Large workflow detected',
                    implementation: 'Consider breaking into smaller sub-workflows',
                    benefit: 'Improved performance and maintainability'
                });
            }

            validation.duration = Date.now() - stepStart;
            return validation;

        } catch (error) {
            throw new CustomError(
                `Workflow validation failed: ${error.message}`,
                ErrorTypes.VALIDATION_ERROR,
                { originalError: error, duration: Date.now() - stepStart }
            );
        }
    }

    async generatePreview(workflow, validation) {
        const stepStart = Date.now();

        try {
            // Count different types of nodes
            const nodeTypes = {};
            workflow.nodes.forEach(node => {
                const category = this.getNodeCategory(node.type);
                nodeTypes[category] = (nodeTypes[category] || 0) + 1;
            });

            // Determine complexity based on node count and types
            let complexity = 'simple';
            if (workflow.nodes.length > 10 || Object.keys(nodeTypes).length > 4) {
                complexity = 'complex';
            } else if (workflow.nodes.length > 5 || Object.keys(nodeTypes).length > 2) {
                complexity = 'medium';
            }

            // Identify trigger type
            const triggerNode = workflow.nodes.find(node => 
                node.type.includes('trigger') || 
                node.type.includes('webhook') ||
                node.type.includes('manual')
            );

            let triggerType = 'manual';
            if (triggerNode) {
                if (triggerNode.type.includes('webhook')) triggerType = 'webhook';
                else if (triggerNode.type.includes('cron') || triggerNode.type.includes('schedule')) triggerType = 'schedule';
                else if (triggerNode.type.includes('trigger')) triggerType = 'event';
            }

            // Generate main steps description
            const mainSteps = workflow.nodes
                .filter(node => !node.type.includes('trigger'))
                .slice(0, 5)
                .map(node => node.name || node.type);

            // Identify required credentials
            const requiredCredentials = [...new Set(
                workflow.nodes
                    .filter(node => node.credentials && Object.keys(node.credentials).length > 0)
                    .flatMap(node => Object.keys(node.credentials))
            )];

            const preview = {
                nodeCount: workflow.nodes.length,
                complexity,
                estimatedExecutionTime: this.estimateExecutionTime(workflow.nodes, complexity),
                description: workflow.metadata?.originalDescription || workflow.name || 'Generated workflow',
                mainSteps,
                requiredCredentials,
                triggerType,
                nodeTypes,
                generationDuration: Date.now() - stepStart
            };

            return preview;

        } catch (error) {
            throw new CustomError(
                `Preview generation failed: ${error.message}`,
                ErrorTypes.EXTENSION_ERROR,
                { originalError: error, duration: Date.now() - stepStart }
            );
        }
    }

    // Helper methods

    addGenerationStep(name, input, output) {
        const step = {
            step: this.generationSteps.length + 1,
            name,
            input: typeof input === 'object' ? JSON.stringify(input).substring(0, 200) + '...' : String(input),
            output: typeof output === 'object' ? JSON.stringify(output).substring(0, 200) + '...' : String(output),
            timestamp: new Date().toISOString(),
            duration: 0, // Will be calculated in real implementations
            status: 'success'
        };
        this.generationSteps.push(step);
    }

    analyzeDescription(description) {
        const wordCount = description.split(' ').length;
        const hasIntegrations = /\b(api|webhook|database|email|slack|google|github|aws)\b/i.test(description);
        const hasLogic = /\b(if|condition|filter|transform|loop|iterate)\b/i.test(description);
        const hasScheduling = /\b(schedule|cron|daily|weekly|hourly)\b/i.test(description);

        let estimatedComplexity = 'simple';
        if (wordCount > 50 || (hasIntegrations && hasLogic)) {
            estimatedComplexity = 'complex';
        } else if (wordCount > 20 || hasIntegrations || hasLogic) {
            estimatedComplexity = 'medium';
        }

        return {
            wordCount,
            hasIntegrations,
            hasLogic,
            hasScheduling,
            estimatedComplexity,
            suggestedNodes: this.suggestNodesFromDescription(description)
        };
    }

    suggestNodesFromDescription(description) {
        const suggestions = [];
        const desc = description.toLowerCase();

        // Common patterns and their suggested nodes
        const patterns = {
            'webhook': ['n8n-nodes-base.webhook'],
            'http': ['n8n-nodes-base.httpRequest'],
            'email': ['n8n-nodes-base.emailSend'],
            'slack': ['n8n-nodes-base.slack'],
            'google sheets': ['n8n-nodes-base.googleSheets'],
            'database': ['n8n-nodes-base.postgres', 'n8n-nodes-base.mysql'],
            'schedule': ['n8n-nodes-base.cron'],
            'file': ['n8n-nodes-base.readBinaryFiles', 'n8n-nodes-base.writeBinaryFile'],
            'condition': ['n8n-nodes-base.if'],
            'transform': ['n8n-nodes-base.set', 'n8n-nodes-base.code']
        };

        for (const [pattern, nodes] of Object.entries(patterns)) {
            if (desc.includes(pattern)) {
                suggestions.push(...nodes);
            }
        }

        return [...new Set(suggestions)];
    }

    buildSystemPrompt(context, provider) {
        // This would be provider-specific system prompt building
        // For now, return a basic prompt
        return `You are an expert n8n workflow generator. Create workflows based on user descriptions using available nodes: ${context.availableNodes?.slice(0, 20).join(', ') || 'standard n8n nodes'}.`;
    }

    buildUserPrompt(request, context) {
        let prompt = `Create an n8n workflow for: "${request.description}"`;
        
        if (context.userPreferences?.complexity) {
            prompt += `\nPreferred complexity: ${context.userPreferences.complexity}`;
        }
        
        if (context.userPreferences?.preferredNodes?.length > 0) {
            prompt += `\nPrefer using these nodes when possible: ${context.userPreferences.preferredNodes.join(', ')}`;
        }

        return prompt;
    }

    getRelevantExamples(context) {
        // Return relevant workflow examples based on context
        // This would pull from a database of examples
        return [];
    }

    buildConstraints(context) {
        return {
            availableNodes: context.availableNodes || [],
            n8nVersion: context.n8nVersion || 'unknown',
            userPreferences: context.userPreferences || {}
        };
    }

    optimizeNodePositions(nodes) {
        // Basic grid layout optimization
        const spacing = 200;
        let x = 240;
        let y = 300;

        return nodes.map((node, index) => {
            const position = [x, y];
            
            // Move to next column every 5 nodes
            if ((index + 1) % 5 === 0) {
                x += spacing;
                y = 300;
            } else {
                y += spacing;
            }

            return { ...node, position };
        });
    }

    addErrorHandling(nodes, connections) {
        // Add basic error handling nodes
        // This is a simplified implementation
        return nodes;
    }

    optimizeConnections(connections, nodes) {
        // Optimize workflow connections
        // This is a simplified implementation
        return connections;
    }

    addDocumentationNotes(nodes, description) {
        // Add documentation notes to nodes
        return nodes.map(node => ({
            ...node,
            notes: node.notes || `Part of workflow: ${description.substring(0, 100)}...`
        }));
    }

    getNodeCategory(nodeType) {
        if (nodeType.includes('trigger')) return 'trigger';
        if (nodeType.includes('http') || nodeType.includes('webhook')) return 'http';
        if (nodeType.includes('database') || nodeType.includes('sql')) return 'database';
        if (nodeType.includes('email') || nodeType.includes('slack')) return 'communication';
        if (nodeType.includes('google') || nodeType.includes('microsoft')) return 'integration';
        if (nodeType.includes('if') || nodeType.includes('switch')) return 'logic';
        if (nodeType.includes('set') || nodeType.includes('code')) return 'transform';
        return 'utility';
    }

    estimateExecutionTime(nodes, complexity) {
        // Rough estimation based on node types and complexity
        const baseTime = 1000; // 1 second base
        const nodeMultiplier = nodes.length * 100;
        const complexityMultiplier = complexity === 'complex' ? 2 : complexity === 'medium' ? 1.5 : 1;

        return Math.round((baseTime + nodeMultiplier) * complexityMultiplier);
    }
}
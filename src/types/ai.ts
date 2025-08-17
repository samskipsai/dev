/**
 * AI Service Types and Interfaces for 44agents Chrome Extension
 * Defines the contract for AI service integrations and workflow generation
 */

export interface WorkflowGenerationRequest {
  description: string;
  context?: N8nContext;
  previousMessages?: ChatMessage[];
  options?: GenerationOptions;
}

export interface WorkflowGenerationResponse {
  workflow: N8nWorkflow;
  explanation: string;
  confidence: number;
  estimatedTokens: number;
  cost: number;
}

export interface N8nWorkflow {
  id: string;
  name: string;
  description: string;
  nodes: N8nNode[];
  connections: N8nConnections;
  metadata: WorkflowMetadata;
}

export interface N8nNode {
  id: string;
  name: string;
  type: string;
  typeVersion: number;
  position: [number, number];
  parameters: Record<string, any>;
  credentials?: Record<string, string>;
}

export interface N8nConnections {
  [nodeId: string]: {
    main?: Array<Array<{ node: string; type: string; index: number }>>;
  };
}

export interface WorkflowMetadata {
  generatedBy: string;
  aiModel: string;
  timestamp: string;
  conversationId: string;
  version: string;
}

export interface N8nContext {
  availableNodes: string[];
  n8nVersion: string;
  userCredentials: string[];
  existingWorkflows?: string[];
  currentWorkspace?: string;
}

export interface GenerationOptions {
  model?: AIModel;
  temperature?: number;
  maxTokens?: number;
  includeSuggestions?: boolean;
  optimizeForCost?: boolean;
}

export interface ChatMessage {
  id: string;
  conversationId: string;
  type: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: string;
  metadata?: {
    workflowGenerated?: boolean;
    workflowId?: string;
    aiModel?: string;
    tokenCount?: number;
    cost?: number;
  };
}

export enum AIProvider {
  CLAUDE = 'claude',
  OPENAI = 'openai',
  GEMINI = 'gemini'
}

export interface AIModel {
  provider: AIProvider;
  name: string;
  contextWindow: number;
  inputCostPer1k: number;
  outputCostPer1k: number;
  rateLimitRPM: number;
  rateLimitTPM: number;
}

export interface AIServiceConfig {
  apiKey: string;
  model: AIModel;
  defaultOptions?: GenerationOptions;
}

export interface RateLimitStatus {
  requestsRemaining: number;
  tokensRemaining: number;
  resetTime: Date;
  provider: AIProvider;
}

export interface UsageMetrics {
  totalRequests: number;
  totalTokens: number;
  totalCost: number;
  successRate: number;
  averageResponseTime: number;
  byProvider: {
    [key in AIProvider]?: {
      requests: number;
      tokens: number;
      cost: number;
      errors: number;
    };
  };
}

export interface AIServiceError extends Error {
  provider: AIProvider;
  code: string;
  rateLimited?: boolean;
  retryAfter?: number;
  cost?: number;
}

// Abstract base class interface
export interface AIService {
  provider: AIProvider;
  model: AIModel;
  
  generateWorkflow(request: WorkflowGenerationRequest): Promise<WorkflowGenerationResponse>;
  validateApiKey(apiKey: string): Promise<boolean>;
  getRateLimitStatus(): Promise<RateLimitStatus>;
  getUsageMetrics(): Promise<UsageMetrics>;
  estimateCost(description: string, context?: N8nContext): Promise<number>;
}

// Predefined AI models with their specifications
export const AI_MODELS: { [key: string]: AIModel } = {
  // Claude models
  'claude-3-sonnet': {
    provider: AIProvider.CLAUDE,
    name: 'claude-3-sonnet-20240229',
    contextWindow: 200000,
    inputCostPer1k: 0.015,
    outputCostPer1k: 0.075,
    rateLimitRPM: 1000,
    rateLimitTPM: 80000
  },
  'claude-3-haiku': {
    provider: AIProvider.CLAUDE,
    name: 'claude-3-haiku-20240307',
    contextWindow: 200000,
    inputCostPer1k: 0.0025,
    outputCostPer1k: 0.0125,
    rateLimitRPM: 1000,
    rateLimitTPM: 100000
  },
  
  // OpenAI models
  'gpt-4-turbo': {
    provider: AIProvider.OPENAI,
    name: 'gpt-4-turbo-preview',
    contextWindow: 128000,
    inputCostPer1k: 0.01,
    outputCostPer1k: 0.03,
    rateLimitRPM: 500,
    rateLimitTPM: 30000
  },
  'gpt-3.5-turbo': {
    provider: AIProvider.OPENAI,
    name: 'gpt-3.5-turbo',
    contextWindow: 16385,
    inputCostPer1k: 0.0005,
    outputCostPer1k: 0.0015,
    rateLimitRPM: 3500,
    rateLimitTPM: 90000
  },
  
  // Gemini models
  'gemini-1.5-pro': {
    provider: AIProvider.GEMINI,
    name: 'gemini-1.5-pro',
    contextWindow: 1000000,
    inputCostPer1k: 0.007,
    outputCostPer1k: 0.021,
    rateLimitRPM: 300,
    rateLimitTPM: 32000
  }
};

// System prompts for workflow generation
export const WORKFLOW_GENERATION_PROMPTS = {
  SYSTEM_PROMPT: `You are an expert n8n workflow automation assistant. Your role is to convert natural language descriptions into valid n8n workflow JSON configurations.

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
- And many more...

Always respond with valid JSON that can be directly imported into n8n.`,

  CONTEXT_TEMPLATE: `Current n8n context:
- Version: {version}
- Available nodes: {nodes}
- User credentials: {credentials}
- Workspace: {workspace}

User description: {description}

Please generate a complete n8n workflow that accomplishes the described automation. Include:
1. Appropriate trigger node
2. Processing nodes with proper configuration
3. Output/action nodes
4. Error handling where needed
5. Clear node names and descriptions

Response format:
{
  "workflow": { /* n8n workflow JSON */ },
  "explanation": "Clear explanation of how the workflow works",
  "confidence": 0.95 // Your confidence in the solution (0-1)
}`
};
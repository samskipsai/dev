/**
 * TypeScript type definitions for 44agents workflow system
 * Defines types for n8n workflows, nodes, and AI integration
 */

// Core n8n workflow types based on n8n 0.200.0+ specification
export interface N8nNode {
  id: string;
  name: string;
  type: string;
  typeVersion: number;
  position: [number, number];
  parameters: Record<string, any>;
  credentials?: Record<string, string>;
  disabled?: boolean;
  notes?: string;
  webhookId?: string;
}

export interface N8nConnection {
  node: string;
  type: string;
  index: number;
}

export interface N8nWorkflowConnections {
  [key: string]: {
    [key: string]: N8nConnection[][];
  };
}

export interface N8nWorkflow {
  id?: string;
  name: string;
  active: boolean;
  nodes: N8nNode[];
  connections: N8nWorkflowConnections;
  settings?: {
    executionOrder?: 'v0' | 'v1';
    saveManualExecutions?: boolean;
    callerPolicy?: 'workflowsFromSameOwner' | 'workflowsFromAUser' | 'any';
    errorWorkflow?: string;
  };
  staticData?: Record<string, any>;
  tags?: string[];
  meta?: Record<string, any>;
}

// 44agents enhanced workflow structure
export interface WorkflowMetadata {
  generatedBy: '44agents';
  aiModel: string;
  timestamp: string;
  conversationId: string;
  originalDescription: string;
  generationSteps: WorkflowGenerationStep[];
  version: string;
  n8nVersion: string;
}

export interface GeneratedWorkflow extends N8nWorkflow {
  metadata: WorkflowMetadata;
}

// Workflow generation pipeline types
export interface WorkflowGenerationStep {
  step: number;
  name: string;
  input: any;
  output: any;
  timestamp: string;
  duration: number;
  status: 'success' | 'error' | 'warning';
  error?: string;
}

export interface WorkflowGenerationContext {
  userDescription: string;
  n8nVersion: string;
  availableNodes: string[];
  userPreferences: {
    complexity: 'simple' | 'medium' | 'complex';
    errorHandling: boolean;
    includeDocumentation: boolean;
  };
  conversationHistory?: ChatMessage[];
}

export interface WorkflowGenerationRequest {
  description: string;
  context: WorkflowGenerationContext;
  aiModel: 'claude' | 'openai' | 'gemini';
  options: {
    includeValidation: boolean;
    generatePreview: boolean;
    autoImport: boolean;
  };
}

export interface WorkflowGenerationResponse {
  success: boolean;
  workflow?: GeneratedWorkflow;
  preview?: WorkflowPreview;
  validation?: WorkflowValidationResult;
  error?: string;
  steps: WorkflowGenerationStep[];
}

// Workflow validation types
export interface WorkflowValidationResult {
  isValid: boolean;
  compatibilityVersion: string;
  errors: ValidationError[];
  warnings: ValidationWarning[];
  suggestions: ValidationSuggestion[];
  nodeCompatibility: NodeCompatibilityCheck[];
}

export interface ValidationError {
  type: 'structure' | 'node' | 'connection' | 'parameter' | 'credential';
  severity: 'error' | 'warning';
  message: string;
  nodeId?: string;
  parameterPath?: string;
  suggestedFix?: string;
}

export interface ValidationWarning {
  type: 'performance' | 'best-practice' | 'security' | 'maintenance';
  message: string;
  nodeId?: string;
  impact: 'low' | 'medium' | 'high';
  recommendation: string;
}

export interface ValidationSuggestion {
  type: 'optimization' | 'enhancement' | 'alternative';
  message: string;
  implementation: string;
  benefit: string;
}

export interface NodeCompatibilityCheck {
  nodeType: string;
  isCompatible: boolean;
  availableVersion: string;
  requiredVersion: string;
  alternativeNodes?: string[];
}

// Workflow preview types
export interface WorkflowPreview {
  thumbnail: string; // Base64 encoded image or URL
  nodeCount: number;
  complexity: 'simple' | 'medium' | 'complex';
  estimatedExecutionTime: number; // in milliseconds
  description: string;
  mainSteps: string[];
  requiredCredentials: string[];
  triggerType: 'manual' | 'webhook' | 'schedule' | 'event';
}

// n8n API integration types
export interface N8nApiConfig {
  baseUrl: string;
  apiKey?: string;
  username?: string;
  password?: string;
  version: string;
}

export interface N8nApiResponse<T = any> {
  data?: T;
  success: boolean;
  error?: string;
  statusCode: number;
}

export interface WorkflowImportRequest {
  workflow: GeneratedWorkflow;
  options: {
    activate: boolean;
    replaceExisting: boolean;
    validateOnly: boolean;
  };
}

export interface WorkflowImportResponse {
  success: boolean;
  workflowId?: string;
  message: string;
  validationResult?: WorkflowValidationResult;
  importedAt: string;
}

// Chat integration types
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
    tokens?: number;
    cost?: number;
  };
}

export interface WorkflowConversationContext {
  conversationId: string;
  currentWorkflow?: GeneratedWorkflow;
  iterationHistory: GeneratedWorkflow[];
  userIntent: string;
  modificationRequests: string[];
}

// AI service integration types
export interface AIServiceConfig {
  provider: 'claude' | 'openai' | 'gemini';
  apiKey: string;
  model: string;
  maxTokens: number;
  temperature: number;
}

export interface WorkflowPromptContext {
  n8nDocumentation: string;
  availableNodes: NodeDocumentation[];
  exampleWorkflows: ExampleWorkflow[];
  userContext: WorkflowGenerationContext;
}

export interface NodeDocumentation {
  name: string;
  description: string;
  category: string;
  parameters: NodeParameter[];
  examples: NodeExample[];
  version: string;
}

export interface NodeParameter {
  name: string;
  type: string;
  required: boolean;
  description: string;
  options?: string[];
  default?: any;
}

export interface NodeExample {
  description: string;
  configuration: Record<string, any>;
  useCase: string;
}

export interface ExampleWorkflow {
  name: string;
  description: string;
  useCase: string;
  workflow: N8nWorkflow;
  tags: string[];
}

// Error handling types
export interface WorkflowError {
  code: string;
  message: string;
  type: 'generation' | 'validation' | 'import' | 'api';
  details?: Record<string, any>;
  timestamp: string;
  recoverable: boolean;
  suggestedAction?: string;
}

// Configuration types
export interface WorkflowServiceConfig {
  n8nApi: N8nApiConfig;
  aiService: AIServiceConfig;
  validation: {
    enableStrictMode: boolean;
    minN8nVersion: string;
    allowExperimentalNodes: boolean;
  };
  generation: {
    maxRetries: number;
    timeoutMs: number;
    cacheResults: boolean;
    includeDocumentation: boolean;
  };
}
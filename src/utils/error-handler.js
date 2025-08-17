/**
 * Comprehensive error handling system for 44agents Chrome extension
 * Provides centralized error management, logging, and user-friendly error messages
 */

export class ErrorTypes {
  static API_ERROR = 'API_ERROR';
  static NETWORK_ERROR = 'NETWORK_ERROR';
  static VALIDATION_ERROR = 'VALIDATION_ERROR';
  static EXTENSION_ERROR = 'EXTENSION_ERROR';
  static N8N_ERROR = 'N8N_ERROR';
  static STORAGE_ERROR = 'STORAGE_ERROR';
  static PERMISSION_ERROR = 'PERMISSION_ERROR';
}

export class CustomError extends Error {
  constructor(message, type = ErrorTypes.EXTENSION_ERROR, context = {}) {
    super(message);
    this.name = this.constructor.name;
    this.type = type;
    this.context = context;
    this.timestamp = new Date().toISOString();
    this.userAgent = navigator.userAgent;
  }

  toJSON() {
    return {
      name: this.name,
      message: this.message,
      type: this.type,
      context: this.context,
      timestamp: this.timestamp,
      userAgent: this.userAgent,
      stack: this.stack
    };
  }
}

export class ErrorHandler {
  constructor() {
    this.errorQueue = [];
    this.maxQueueSize = 100;
    this.setupGlobalErrorHandling();
  }

  setupGlobalErrorHandling() {
    // Handle unhandled promise rejections
    window.addEventListener('unhandledrejection', (event) => {
      this.handleError(new CustomError(
        `Unhandled promise rejection: ${event.reason}`,
        ErrorTypes.EXTENSION_ERROR,
        { reason: event.reason }
      ));
    });

    // Handle global errors
    window.addEventListener('error', (event) => {
      this.handleError(new CustomError(
        `Global error: ${event.message}`,
        ErrorTypes.EXTENSION_ERROR,
        { 
          filename: event.filename,
          lineno: event.lineno,
          colno: event.colno,
          error: event.error
        }
      ));
    });
  }

  handleError(error, showToUser = true) {
    // Log error to console in development
    if (process.env.NODE_ENV === 'development') {
      console.error('44agents Error:', error);
    }

    // Add to error queue for analytics
    this.addToQueue(error);

    // Store critical errors for debugging
    if (this.isCriticalError(error)) {
      this.storeCriticalError(error);
    }

    // Show user-friendly error message
    if (showToUser) {
      this.showUserError(error);
    }

    // Send error to analytics if enabled
    this.sendToAnalytics(error);
  }

  addToQueue(error) {
    this.errorQueue.push(error);
    if (this.errorQueue.length > this.maxQueueSize) {
      this.errorQueue.shift(); // Remove oldest error
    }
  }

  isCriticalError(error) {
    const criticalTypes = [
      ErrorTypes.API_ERROR,
      ErrorTypes.N8N_ERROR,
      ErrorTypes.EXTENSION_ERROR
    ];
    return criticalTypes.includes(error.type);
  }

  async storeCriticalError(error) {
    try {
      const errors = await this.getCriticalErrors();
      errors.push(error.toJSON());
      
      // Keep only last 20 critical errors
      const recentErrors = errors.slice(-20);
      
      await chrome.storage.local.set({
        'critical_errors': recentErrors
      });
    } catch (storageError) {
      console.error('Failed to store critical error:', storageError);
    }
  }

  async getCriticalErrors() {
    try {
      const result = await chrome.storage.local.get(['critical_errors']);
      return result.critical_errors || [];
    } catch (error) {
      console.error('Failed to retrieve critical errors:', error);
      return [];
    }
  }

  showUserError(error) {
    const userMessage = this.getUserFriendlyMessage(error);
    
    // Show error in chat interface if available
    if (window.chatUI && window.chatUI.showError) {
      window.chatUI.showError(userMessage, error.type);
    } else {
      // Fallback to console for now (will be replaced with UI notification)
      console.warn('User Error:', userMessage);
    }
  }

  getUserFriendlyMessage(error) {
    const messages = {
      [ErrorTypes.API_ERROR]: 'There was an issue connecting to the AI service. Please check your API keys and try again.',
      [ErrorTypes.NETWORK_ERROR]: 'Network connection failed. Please check your internet connection and try again.',
      [ErrorTypes.VALIDATION_ERROR]: 'Invalid input provided. Please check your request and try again.',
      [ErrorTypes.N8N_ERROR]: 'Unable to connect to n8n. Please ensure n8n is running and accessible.',
      [ErrorTypes.STORAGE_ERROR]: 'Failed to save data locally. Please check browser permissions.',
      [ErrorTypes.PERMISSION_ERROR]: 'Missing required permissions. Please check extension settings.',
      [ErrorTypes.EXTENSION_ERROR]: 'An unexpected error occurred. Please try refreshing the page.'
    };

    return messages[error.type] || 'An unexpected error occurred. Please try again.';
  }

  async sendToAnalytics(error) {
    try {
      // Only send if analytics are enabled and not in development
      const settings = await chrome.storage.sync.get(['analyticsEnabled']);
      if (!settings.analyticsEnabled || process.env.NODE_ENV === 'development') {
        return;
      }

      // Send error data to analytics service (implement when analytics system is ready)
      // This will be connected to the analytics system
      console.log('Error would be sent to analytics:', error.toJSON());
    } catch (analyticsError) {
      console.error('Failed to send error to analytics:', analyticsError);
    }
  }

  // Get error statistics for debugging
  getErrorStats() {
    const stats = {
      total: this.errorQueue.length,
      byType: {},
      recent: this.errorQueue.slice(-10)
    };

    this.errorQueue.forEach(error => {
      stats.byType[error.type] = (stats.byType[error.type] || 0) + 1;
    });

    return stats;
  }

  // Clear error queue
  clearErrors() {
    this.errorQueue = [];
  }
}

// Global error handler instance
export const errorHandler = new ErrorHandler();

// Helper function for async operations with error handling
export async function withErrorHandling(operation, context = {}) {
  try {
    return await operation();
  } catch (error) {
    const customError = error instanceof CustomError 
      ? error 
      : new CustomError(error.message, ErrorTypes.EXTENSION_ERROR, context);
    
    errorHandler.handleError(customError);
    throw customError;
  }
}

// Retry mechanism for API calls
export class RetryHandler {
  constructor(maxRetries = 3, baseDelay = 1000) {
    this.maxRetries = maxRetries;
    this.baseDelay = baseDelay;
  }

  async executeWithRetry(operation, options = {}) {
    const {
      retryCondition = (error) => this.shouldRetry(error),
      onRetry = (attempt, error) => console.log(`Retry attempt ${attempt}:`, error.message),
      maxRetries = this.maxRetries,
      baseDelay = this.baseDelay
    } = options;

    let lastError;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        if (attempt === maxRetries || !retryCondition(error)) {
          throw error;
        }

        onRetry(attempt + 1, error);
        await this.delay(this.calculateDelay(attempt, baseDelay));
      }
    }

    throw lastError;
  }

  shouldRetry(error) {
    // Retry on network errors, rate limits, and temporary API issues
    const retryableTypes = [
      ErrorTypes.NETWORK_ERROR,
      ErrorTypes.API_ERROR
    ];

    const retryableStatusCodes = [429, 502, 503, 504];
    
    return retryableTypes.includes(error.type) ||
           (error.status && retryableStatusCodes.includes(error.status));
  }

  calculateDelay(attempt, baseDelay) {
    // Exponential backoff with jitter
    const exponentialDelay = baseDelay * Math.pow(2, attempt);
    const jitter = Math.random() * 1000;
    return exponentialDelay + jitter;
  }

  delay(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Global retry handler instance
export const retryHandler = new RetryHandler();

// Utility function to wrap API calls with retry logic
export async function apiCallWithRetry(apiCall, options = {}) {
  return retryHandler.executeWithRetry(async () => {
    try {
      return await apiCall();
    } catch (error) {
      // Convert to custom error if needed
      if (!(error instanceof CustomError)) {
        if (error.name === 'NetworkError' || error.message.includes('fetch')) {
          throw new CustomError(error.message, ErrorTypes.NETWORK_ERROR, { originalError: error });
        } else if (error.status) {
          throw new CustomError(error.message, ErrorTypes.API_ERROR, { 
            status: error.status,
            originalError: error 
          });
        } else {
          throw new CustomError(error.message, ErrorTypes.EXTENSION_ERROR, { originalError: error });
        }
      }
      throw error;
    }
  }, options);
}
import { ServiceError } from '@/types';

/**
 * Create a structured service error
 * @param type - Error type
 * @param message - Error message
 * @returns ServiceError object
 */
export function createServiceError(
  type: ServiceError['type'],
  message: string
): ServiceError {
  return {
    type,
    message,
  };
}

/**
 * Check if an error is a network error
 * @param error - Error object
 * @returns boolean indicating if it's a network error
 */
export function isNetworkError(error: unknown): boolean {
  if (error instanceof Error) {
    return (
      error.message.includes('network') ||
      error.message.includes('fetch') ||
      error.message.includes('connection')
    );
  }
  return false;
}

/**
 * Convert unknown error to ServiceError
 * @param error - Unknown error
 * @returns ServiceError object
 */
export function toServiceError(error: unknown): ServiceError {
  if (error instanceof Error) {
    const message = error.message || 'An unknown error occurred';
    if (isNetworkError(error)) {
      return createServiceError('NETWORK_ERROR', message);
    }
    return createServiceError('UNKNOWN_ERROR', message);
  }
  
  return createServiceError('UNKNOWN_ERROR', 'An unknown error occurred');
}

/**
 * Get user-friendly error message
 * @param error - ServiceError object
 * @returns User-friendly error message
 */
export function getUserFriendlyMessage(error: ServiceError): string {
  switch (error.type) {
    case 'AUTH_ERROR':
      return 'Authentication failed. Please try again.';
    case 'VALIDATION_ERROR':
      return 'Invalid input. Please check your data.';
    case 'NETWORK_ERROR':
      return 'Network error. Please check your connection.';
    case 'NOT_FOUND':
      return 'The requested resource was not found.';
    case 'PERMISSION_DENIED':
      return 'You do not have permission to perform this action.';
    case 'UPLOAD_ERROR':
      return 'File upload failed. Please try again.';
    case 'UNKNOWN_ERROR':
    default:
      return 'An unexpected error occurred. Please try again.';
  }
}

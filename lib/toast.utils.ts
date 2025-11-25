import { toast } from 'sonner';
import { ServiceError } from '@/types';
import { getUserFriendlyMessage } from '@/services/error.utils';

/**
 * Show a success toast notification
 */
export function showSuccessToast(message: string) {
  toast.success(message);
}

/**
 * Show an error toast notification
 */
export function showErrorToast(message: string) {
  toast.error(message);
}

/**
 * Show an info toast notification
 */
export function showInfoToast(message: string) {
  toast.info(message);
}

/**
 * Show a loading toast notification
 * Returns a toast ID that can be used to dismiss or update the toast
 */
export function showLoadingToast(message: string) {
  return toast.loading(message);
}

/**
 * Dismiss a specific toast by ID
 */
export function dismissToast(toastId: string | number) {
  toast.dismiss(toastId);
}

/**
 * Show an error toast from a ServiceError object
 */
export function showServiceError(error: ServiceError) {
  const message = getUserFriendlyMessage(error);
  toast.error(message);
}

/**
 * Show an error toast with retry action
 */
export function showErrorWithRetry(
  message: string,
  onRetry: () => void,
  retryLabel: string = 'Retry'
) {
  toast.error(message, {
    action: {
      label: retryLabel,
      onClick: onRetry,
    },
  });
}

/**
 * Show a promise toast that updates based on promise state
 * Useful for async operations
 */
export function showPromiseToast<T>(
  promise: Promise<T>,
  messages: {
    loading: string;
    success: string | ((data: T) => string);
    error: string | ((error: any) => string);
  }
) {
  return toast.promise(promise, messages);
}

/**
 * Show a network error toast with retry action
 */
export function showNetworkError(onRetry?: () => void) {
  if (onRetry) {
    showErrorWithRetry(
      'Network error. Please check your connection.',
      onRetry,
      'Retry'
    );
  } else {
    showErrorToast('Network error. Please check your connection.');
  }
}

/**
 * Show an authentication error toast
 */
export function showAuthError() {
  showErrorToast('Authentication failed. Please log in again.');
}

/**
 * Show a permission denied error toast
 */
export function showPermissionError() {
  showErrorToast('You do not have permission to perform this action.');
}

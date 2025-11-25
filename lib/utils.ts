import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

/**
 * Merge Tailwind CSS classes with clsx
 */
export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format date for message timestamps (internal use with seconds for accurate tracking)
 * Uses the message date itself for stable rendering (no flickering)
 */
export function formatMessageTime(date: string | Date): string {
  const messageDate = new Date(date);
  const today = new Date();

  // Reset time to midnight for accurate day comparison
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const messageMidnight = new Date(messageDate.getFullYear(), messageDate.getMonth(), messageDate.getDate());

  const diffInDays = Math.floor((todayMidnight.getTime() - messageMidnight.getTime()) / (1000 * 60 * 60 * 24));

  if (diffInDays === 0) {
    // Today: show time with seconds (for internal tracking)
    return messageDate.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      second: "2-digit",
      hour12: true,
    });
  } else if (diffInDays < 7) {
    // This week: show day name
    return messageDate.toLocaleDateString("en-US", { weekday: "short" });
  } else {
    // Older: show date
    return messageDate.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }
}

/**
 * Format date for message timestamps (UI display without seconds)
 * Shows only HH:MM for cleaner UI while keeping internal tracking accurate
 */
export function formatMessageTimeDisplay(date: string | Date): string {
  const messageDate = new Date(date);
  const today = new Date();

  // Reset time to midnight for accurate day comparison
  const todayMidnight = new Date(today.getFullYear(), today.getMonth(), today.getDate());
  const messageMidnight = new Date(messageDate.getFullYear(), messageDate.getMonth(), messageDate.getDate());

  const diffInDays = Math.floor((todayMidnight.getTime() - messageMidnight.getTime()) / (1000 * 60 * 60 * 24));

  if (diffInDays === 0) {
    // Today: show time WITHOUT seconds (for UI display)
    return messageDate.toLocaleTimeString("en-US", {
      hour: "numeric",
      minute: "2-digit",
      hour12: true,
    });
  } else if (diffInDays < 7) {
    // This week: show day name
    return messageDate.toLocaleDateString("en-US", { weekday: "short" });
  } else {
    // Older: show date
    return messageDate.toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
  }
}

/**
 * Format date for conversation list
 */
export function formatConversationTime(date: string | Date): string {
  return formatMessageTimeDisplay(date);
}

/**
 * Truncate text to a maximum length
 */
export function truncate(text: string, maxLength: number): string {
  if (text.length <= maxLength) return text;
  return text.slice(0, maxLength) + "...";
}

/**
 * Update browser tab title with unread count
 */
export function updateTabTitle(unreadCount: number): void {
  const baseTitle = "WhatsApp Clone";

  if (unreadCount > 0) {
    const displayCount = unreadCount > 99 ? "99+" : unreadCount.toString();
    document.title = `(${displayCount}) ${baseTitle}`;
  } else {
    document.title = baseTitle;
  }
}

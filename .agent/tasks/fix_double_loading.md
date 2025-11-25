# Fix Double Loading Effect in Chat

The user reports a "double load" effect when switching back to a previously loaded conversation. It seems to show cached data, then re-render or flash, causing a jarring experience.

## Plan
- [x] Analyze `MessageList.tsx` and `useMessages.ts` to understand the data fetching and caching strategy.
- [x] Identify the cause of the double render/flash (likely `isLoading` state toggling even when data is available, or a strict mode double invoke, or a query refetch).
  - *Root cause identified:* `MessageList` was reusing the same component instance when `conversationId` changed. The `useEffect` hook was resetting state *after* the first render with new data, causing a "Render (wrong state) -> Reset -> Render (correct state)" flash.
- [x] Optimize the loading state to rely on cached data if available, avoiding the loading spinner or flicker if we already have messages.
  - *Fix:* Added `key={chatId}` to `MessageList` and `InputArea` in `page.tsx` to force a clean remount for each conversation.
- [x] Verify the fix.

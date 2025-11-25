export default function ChatsPage() {
  return (
    <div className="flex h-full items-center justify-center bg-zinc-50 dark:bg-zinc-900">
      <div className="text-center space-y-4">
        <div className="text-6xl">💬</div>
        <h2 className="text-2xl font-semibold text-zinc-900 dark:text-zinc-50">
          Select a chat
        </h2>
        <p className="text-zinc-600 dark:text-zinc-400">
          Choose a conversation from the sidebar to start messaging
        </p>
      </div>
    </div>
  );
}

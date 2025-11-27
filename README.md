# WhatsApp Clone

A production-ready, high-performance real-time chat application built with Next.js 15 and Supabase.

## Features

- Real-time messaging with WebSocket subscriptions
- Google OAuth authentication
- Optimistic UI updates
- Virtualized lists for performance
- Typing indicators and read receipts
- Message editing and deletion
- Image sharing (coming soon)
- Responsive design

## Tech Stack

- **Framework**: Next.js 15 (App Router)
- **Language**: TypeScript
- **Styling**: Tailwind CSS v4
- **Backend**: Supabase (PostgreSQL, Auth, Realtime, Storage)
- **State Management**: 
  - TanStack Query v5 (server state)
  - Zustand (client UI state)
- **Performance**: react-window, React.memo
- **Validation**: Zod + React Hook Form
- **Testing**: Vitest + fast-check (property-based testing)

## Getting Started

### Prerequisites

- Node.js 18+ and npm
- A Supabase account and project

### Installation

1. Clone the repository
2. Install dependencies:

```bash
npm install
```

3. Set up environment variables:

Copy `.env.local.example` to `.env.local` and fill in your Supabase credentials:

```env
NEXT_PUBLIC_SUPABASE_URL=your-supabase-project-url
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-supabase-anon-key
```

4. Run the development server:

```bash
npm run dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the application.

## Project Structure

```
/app                    # Next.js App Router pages
/components            # React components
  /ui                  # Reusable UI components
  /features            # Feature-specific components
/hooks                 # Custom React hooks
/lib                   # Utility functions and configurations
  /supabase           # Supabase client setup
/services             # API service layer
/store                # Zustand stores
/types                # TypeScript type definitions
```

## Development

- `npm run dev` - Start development server
- `npm run build` - Build for production
- `npm run start` - Start production server
- `npm run lint` - Run ESLint

## Documentation

For detailed design and implementation documentation, see:
- `.kiro/specs/whatsapp-clone/requirements.md` - Feature requirements
- `.kiro/specs/whatsapp-clone/design.md` - Architecture and design
- `.kiro/specs/whatsapp-clone/tasks.md` - Implementation plan
# whatsapp-clone

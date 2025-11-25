import { redirect } from 'next/navigation';

export default function Home() {
  // Root redirects to login - auth will handle redirect to /c after login
  redirect('/login');
}

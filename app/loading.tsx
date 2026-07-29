import { Spinner } from "@/components/ui/spinner";

// shown immediately on any route navigation while the target page's data
// loads - without this, clicking a link with no instant visual feedback
// feels stuck, especially for server-rendered pages that fetch from
// Supabase before they can render anything.
export default function Loading() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-gray-50">
      <Spinner className="h-8 w-8 text-indigo-500" />
    </div>
  );
}

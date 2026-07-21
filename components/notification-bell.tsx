"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import type { Notification, NotificationType } from "@/types/database";

// where clicking a notification should take you - the task itself if
// one is attached (new_task), otherwise the case (new_document,
// stuck_case).
function notificationHref(n: Notification): string | null {
  if (n.task_id) return `/tasks/${n.task_id}`;
  if (n.case_id) return `/cases/${n.case_id}`;
  return null;
}

const TYPE_LABELS: Record<NotificationType, string> = {
  new_task: "משימה חדשה",
  new_document: "מסמך חדש",
  stuck_case: "תיק תקוע",
};

function timeAgo(iso: string) {
  const ms = Date.now() - new Date(iso).getTime();
  const minutes = Math.floor(ms / 60000);
  if (minutes < 1) return "עכשיו";
  if (minutes < 60) return `לפני ${minutes} דקות`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `לפני ${hours} שעות`;
  return `לפני ${Math.floor(hours / 24)} ימים`;
}

export function NotificationBell({ userId }: { userId: string }) {
  const supabase = useMemo(() => createClient(), []);
  const router = useRouter();
  const [items, setItems] = useState<Notification[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let active = true;

    supabase
      .from("notifications")
      .select("*")
      .eq("user_id", userId)
      .order("created_at", { ascending: false })
      .limit(20)
      .then(({ data }) => {
        if (active && data) setItems(data as Notification[]);
      });

    // real-time push per section 4.3 - both webhook-sourced (new_document,
    // stage 4) and CRM-created (new_task, stuck_case) notifications land in
    // the same table, so one subscription covers all of them. RLS still
    // applies to this stream - the filter here is just an efficiency win.
    const channel = supabase
      .channel(`notifications-${userId}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "notifications",
          filter: `user_id=eq.${userId}`,
        },
        (payload) => {
          setItems((prev) => [payload.new as Notification, ...prev]);
        },
      )
      .subscribe();

    return () => {
      active = false;
      supabase.removeChannel(channel);
    };
  }, [supabase, userId]);

  const unread = items.filter((n) => !n.is_read).length;

  async function markRead(id: string) {
    setItems((prev) =>
      prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)),
    );
    await supabase.from("notifications").update({ is_read: true }).eq("id", id);
  }

  function handleClick(n: Notification) {
    markRead(n.id);
    setOpen(false);
    const href = notificationHref(n);
    if (href) router.push(href);
  }

  async function markAllRead() {
    const unreadIds = items.filter((n) => !n.is_read).map((n) => n.id);
    if (unreadIds.length === 0) return;
    setItems((prev) => prev.map((n) => ({ ...n, is_read: true })));
    await supabase.from("notifications").update({ is_read: true }).in("id", unreadIds);
  }

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        aria-label="התראות"
        className="relative flex h-9 w-9 items-center justify-center rounded-full text-gray-500 hover:bg-gray-100 hover:text-gray-800"
      >
        <svg
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          className="h-5 w-5"
        >
          <path
            d="M6 9a6 6 0 1 1 12 0c0 3.2 1 4.8 2 6H4c1-1.2 2-2.8 2-6Z"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
          <path d="M10 19a2 2 0 0 0 4 0" strokeLinecap="round" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-0.5 -right-0.5 flex h-5 min-w-5 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 z-10 mt-2 w-96 overflow-hidden rounded-xl border border-gray-200 bg-white shadow-lg">
          <div className="flex items-center justify-between border-b border-gray-100 px-4 py-3">
            <span className="font-semibold text-gray-900">
              התראות אחרונות
            </span>
            <button
              onClick={markAllRead}
              className="text-xs font-medium text-blue-600 hover:text-blue-800"
            >
              סמן הכל כנקרא
            </button>
          </div>
          {items.length === 0 ? (
            <p className="p-6 text-center text-sm text-gray-400">
              אין התראות
            </p>
          ) : (
            <ul className="max-h-96 divide-y divide-gray-100 overflow-y-auto">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => handleClick(n)}
                    className={`block w-full px-4 py-3 text-right text-sm hover:bg-gray-50 ${
                      n.is_read ? "" : "bg-blue-50/60"
                    }`}
                  >
                    <div className="flex items-center gap-2">
                      {!n.is_read && (
                        <span className="h-1.5 w-1.5 rounded-full bg-blue-600" />
                      )}
                      <span className="font-medium text-gray-900">
                        {n.title || TYPE_LABELS[n.type]}
                      </span>
                    </div>
                    {n.body && (
                      <div className="mt-0.5 text-xs text-gray-500">
                        {n.body}
                      </div>
                    )}
                    <div className="mt-1 text-[11px] text-gray-400">
                      {timeAgo(n.created_at)}
                    </div>
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}

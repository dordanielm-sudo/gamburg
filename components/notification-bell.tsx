"use client";

import { useEffect, useMemo, useState } from "react";
import { createClient } from "@/lib/supabase/client";
import type { Notification, NotificationType } from "@/types/database";

const TYPE_LABELS: Record<NotificationType, string> = {
  new_task: "משימה חדשה",
  new_document: "מסמך חדש",
  stuck_case: "תיק תקוע",
};

export function NotificationBell({ userId }: { userId: string }) {
  const supabase = useMemo(() => createClient(), []);
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

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((o) => !o)}
        className="relative rounded-md px-2 py-1 text-sm text-gray-600 hover:text-gray-900"
      >
        התראות
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] text-white">
            {unread}
          </span>
        )}
      </button>

      {open && (
        <div className="absolute left-0 z-10 mt-2 w-80 rounded-lg border border-gray-200 bg-white p-2 shadow-lg">
          {items.length === 0 ? (
            <p className="p-3 text-sm text-gray-400">אין התראות</p>
          ) : (
            <ul className="max-h-96 overflow-y-auto">
              {items.map((n) => (
                <li key={n.id}>
                  <button
                    onClick={() => markRead(n.id)}
                    className={`block w-full rounded-md p-2 text-right text-sm ${
                      n.is_read ? "text-gray-400" : "bg-blue-50 font-medium"
                    } hover:bg-gray-50`}
                  >
                    <div>{TYPE_LABELS[n.type]}</div>
                    {n.body && (
                      <div className="text-xs text-gray-500">{n.body}</div>
                    )}
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

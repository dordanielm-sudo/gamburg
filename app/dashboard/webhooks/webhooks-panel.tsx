"use client";

import { useState, useTransition } from "react";
import { updateWebhookValue } from "./actions";
import type { WebhookConfig, WebhookDirection, WebhookLog } from "@/types/database";

const STATUS_BADGE: Record<string, string> = {
  ok: "bg-emerald-50 text-emerald-700",
  error: "bg-rose-50 text-rose-700",
  skipped: "bg-gray-100 text-gray-500",
  unauthorized: "bg-amber-50 text-amber-700",
};

const STATUS_LABEL: Record<string, string> = {
  ok: "הצלחה",
  error: "שגיאה",
  skipped: "דולג",
  unauthorized: "לא מורשה",
};

const SECTION_LABELS: Record<WebhookDirection, string> = {
  incoming: "נכנסים - Make ← עדכנית שולח ל-CRM",
  outgoing: "יוצאים - CRM כותב חזרה ל-Make",
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

export function WebhooksPanel({
  configs,
  logs,
}: {
  configs: WebhookConfig[];
  logs: WebhookLog[];
}) {
  const logsByKey = new Map<string, WebhookLog[]>();
  for (const log of logs) {
    const list = logsByKey.get(log.webhook_key) ?? [];
    list.push(log);
    logsByKey.set(log.webhook_key, list);
  }

  const grouped: Record<WebhookDirection, WebhookConfig[]> = {
    incoming: [],
    outgoing: [],
  };
  for (const config of configs) grouped[config.direction].push(config);

  return (
    <div className="space-y-4">
      {(["incoming", "outgoing"] as WebhookDirection[]).map((direction) => (
        <WebhookSection
          key={direction}
          direction={direction}
          configs={grouped[direction]}
          logsByKey={logsByKey}
        />
      ))}
    </div>
  );
}

function WebhookSection({
  direction,
  configs,
  logsByKey,
}: {
  direction: WebhookDirection;
  configs: WebhookConfig[];
  logsByKey: Map<string, WebhookLog[]>;
}) {
  const [open, setOpen] = useState(false);

  return (
    <section className="rounded-xl border border-gray-200 bg-white shadow-sm">
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex w-full items-center justify-between gap-2 px-5 py-4 text-right"
      >
        <div className="flex items-center gap-2">
          <span className="font-semibold text-gray-900">
            {SECTION_LABELS[direction]}
          </span>
          <span className="rounded-full bg-gray-100 px-2 py-0.5 text-xs text-gray-500">
            {configs.length}
          </span>
        </div>
        <span
          className={`text-gray-400 transition-transform ${open ? "rotate-180" : ""}`}
        >
          ⌄
        </span>
      </button>
      {open && (
        <div className="divide-y divide-gray-100 border-t border-gray-100">
          {configs.map((config) => (
            <WebhookCard
              key={config.key}
              config={config}
              logs={(logsByKey.get(config.key) ?? []).slice(0, 20)}
            />
          ))}
        </div>
      )}
    </section>
  );
}

function WebhookCard({
  config,
  logs,
}: {
  config: WebhookConfig;
  logs: WebhookLog[];
}) {
  const [value, setValue] = useState(config.value ?? "");
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showLogs, setShowLogs] = useState(false);
  const [pending, startTransition] = useTransition();

  function handleSave() {
    setError(null);
    setSaved(false);
    startTransition(async () => {
      try {
        await updateWebhookValue(config.key, value);
        setSaved(true);
      } catch (e) {
        setError(e instanceof Error ? e.message : "שגיאה בשמירה");
      }
    });
  }

  return (
    <div className="p-5">
      <div className="flex flex-wrap items-baseline gap-2">
        <h3 className="font-medium text-gray-900">{config.label}</h3>
        <span className="font-mono text-xs text-gray-400">
          {config.endpoint_path}
        </span>
      </div>

      <div className="mt-3 flex flex-wrap items-end gap-2">
        <div className="min-w-[280px] flex-1">
          <label className="mb-1 block text-xs text-gray-500">
            {config.value_type === "url" ? "כתובת URL" : "סוד (secret)"}
          </label>
          <input
            type="text"
            value={value}
            onChange={(e) => {
              setValue(e.target.value);
              setSaved(false);
            }}
            placeholder={
              config.value ? "" : "לא מוגדר - משתמש כרגע בברירת המחדל מה-ENV בשרת"
            }
            className="w-full rounded-md border border-gray-300 px-3 py-2 font-mono text-sm focus:border-blue-500 focus:outline-none"
          />
        </div>
        <button
          onClick={handleSave}
          disabled={pending}
          className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-semibold text-white hover:bg-blue-700 disabled:opacity-50"
        >
          {pending ? "שומר..." : "שמירה"}
        </button>
        {saved && <span className="text-sm text-emerald-700">נשמר</span>}
      </div>
      {error && <p className="mt-1 text-sm text-red-700">{error}</p>}

      <button
        onClick={() => setShowLogs((s) => !s)}
        className="mt-3 text-sm text-gray-500 underline hover:text-gray-900"
      >
        {showLogs ? "הסתר יומן קריאות" : `הצג יומן קריאות (${logs.length})`}
      </button>

      {showLogs &&
        (logs.length === 0 ? (
          <p className="mt-2 text-sm text-gray-400">אין קריאות עדיין</p>
        ) : (
          <ul className="mt-2 max-h-80 space-y-1.5 overflow-y-auto">
            {logs.map((log) => (
              <li
                key={log.id}
                className="rounded-lg border border-gray-100 p-2 text-xs"
              >
                <div className="flex items-center gap-2">
                  <span
                    className={`rounded-full px-1.5 py-0.5 font-medium ${STATUS_BADGE[log.status]}`}
                  >
                    {STATUS_LABEL[log.status]}
                  </span>
                  <span className="text-gray-400">{log.status_code}</span>
                  <span className="mr-auto text-gray-400">
                    {timeAgo(log.created_at)}
                  </span>
                </div>
                {log.request_body != null && (
                  <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-gray-600">
                    {JSON.stringify(log.request_body)}
                  </pre>
                )}
              </li>
            ))}
          </ul>
        ))}
    </div>
  );
}

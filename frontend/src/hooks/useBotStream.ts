import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import type { BotState, LivePosition, LogEntry } from "@/lib/botTypes";

export type BotConnection = "connecting" | "live" | "offline";

interface BotStream {
  state: BotState | null;
  positions: LivePosition[] | null;
  logs: LogEntry[];
  connection: BotConnection;
}

const MAX_LOGS = 2000;

function dedupe(entries: LogEntry[]): LogEntry[] {
  const seen = new Set<string>();
  return entries.filter((entry) => (seen.has(entry.id) ? false : (seen.add(entry.id), true)));
}

function wsUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/api/bot/ws`;
}

/** Live bot state + log console feed. REST primes it, the WebSocket keeps it current. */
export function useBotStream(): BotStream {
  const [state, setState] = useState<BotState | null>(null);
  const [positions, setPositions] = useState<LivePosition[] | null>(null);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [connection, setConnection] = useState<BotConnection>("connecting");
  const closed = useRef(false);

  const initial = useQuery({
    queryKey: ["bot-state"],
    queryFn: () => apiGet<BotState>("/bot/state"),
    retry: 2,
    refetchInterval: () => (document.visibilityState === "visible" ? 5000 : false),
    refetchOnWindowFocus: true,
  });

  const historical = useQuery({
    queryKey: ["bot-logs"],
    queryFn: () => apiGet<LogEntry[]>("/bot/logs?limit=1000"),
    retry: 2,
    refetchInterval: () => (document.visibilityState === "visible" ? 15000 : false),
    refetchOnWindowFocus: true,
  });

  useEffect(() => {
    if (historical.data) {
      setLogs((previous) => dedupe([...historical.data, ...previous]).slice(-MAX_LOGS));
    }
  }, [historical.data]);

  useEffect(() => {
    if (initial.data) setState(initial.data);
  }, [initial.data]);

  useEffect(() => {
    closed.current = false;
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      if (closed.current) return;
      try {
        socket = new WebSocket(wsUrl());
      } catch {
        setConnection("offline");
        return;
      }
      socket.onopen = () => {
        setConnection("live");
        void initial.refetch();
        void historical.refetch();
      };
      socket.onmessage = (event) => {
        try {
          const frame = JSON.parse(event.data as string) as
            | { type: "state"; state: BotState }
            | { type: "positions"; positions: LivePosition[] }
            | { type: "log"; log: LogEntry }
            | { type: "logs"; logs: LogEntry[] }
            | { type: "backlog"; logs: LogEntry[] };
          if (frame.type === "state") setState(frame.state);
          if (frame.type === "positions") setPositions(frame.positions);
          if (frame.type === "logs") setLogs(frame.logs);
          if (frame.type === "backlog") {
            setLogs((previous) => dedupe([...previous, ...frame.logs]).slice(-MAX_LOGS));
          }
          if (frame.type === "log") {
            // StrictMode (and a reconnect) can deliver the same entry twice.
            setLogs((prev) =>
              prev.some((l) => l.id === frame.log.id) ? prev : [...prev, frame.log].slice(-MAX_LOGS),
            );
          }
        } catch (error) {
          console.error("Bot stream: could not parse frame", error);
        }
      };
      socket.onerror = () => setConnection("offline");
      socket.onclose = () => {
        if (closed.current) return;
        setConnection("offline");
        retry = setTimeout(connect, 3000);
      };
    };

    connect();
    return () => {
      closed.current = true;
      if (retry) clearTimeout(retry);
      socket?.close();
    };
  }, []);

  return { state: state ?? initial.data ?? null, positions, logs, connection };
}

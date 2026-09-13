import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { apiGet } from "@/lib/api";
import type { Snapshot } from "@/lib/types";

export type StreamState = "connecting" | "live" | "offline";

interface MarketStream {
  snapshot: Snapshot | null;
  state: StreamState;
  ticks: number;
}

function sameSnapshot(left: Snapshot | null, right: Snapshot | null): boolean {
  if (!left || !right) return left === right;
  if (left.count !== right.count || left.ts !== right.ts || left.connected !== right.connected || left.source !== right.source) {
    return false;
  }
  if (left.instruments.length !== right.instruments.length) return false;

  for (let index = 0; index < left.instruments.length; index += 1) {
    const a = left.instruments[index];
    const b = right.instruments[index];
    if (!a || !b) return false;
    if (
      a.pair !== b.pair ||
      a.symbol !== b.symbol ||
      a.last !== b.last ||
      a.open !== b.open ||
      a.high !== b.high ||
      a.low !== b.low ||
      a.volume !== b.volume ||
      a.change_pct !== b.change_pct ||
      a.max_leverage !== b.max_leverage ||
      a.funding_rate !== b.funding_rate
    ) {
      return false;
    }
  }

  return true;
}

function wsUrl(): string {
  const proto = window.location.protocol === "https:" ? "wss:" : "ws:";
  return `${proto}//${window.location.host}/api/ws`;
}

/**
 * Live market feed. The REST snapshot primes the view (and keeps the shell useful
 * when no backend is reachable); the WebSocket then pushes a frame every second.
 */
export function useMarketStream(): MarketStream {
  const [live, setLive] = useState<Snapshot | null>(null);
  const [state, setState] = useState<StreamState>("connecting");
  const [ticks, setTicks] = useState(0);
  const closed = useRef(false);

  const initial = useQuery({
    queryKey: ["market-snapshot"],
    queryFn: () => apiGet<Snapshot>("/market/snapshot"),
    retry: false,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    closed.current = false;
    let socket: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | undefined;

    const connect = () => {
      if (closed.current) return;
      try {
        socket = new WebSocket(wsUrl());
      } catch {
        setState("offline");
        return;
      }
      socket.onopen = () => {
        setState("live");
        void initial.refetch();
      };
      socket.onmessage = (event) => {
        try {
          const frame = JSON.parse(event.data as string) as Partial<Snapshot>;
          if (!Array.isArray(frame.instruments)) return; // heartbeat / unknown frame

          const next = frame as Snapshot;
          setLive((current) => {
            if (sameSnapshot(current, next)) return current;
            return next;
          });

          setTicks((current) => current + 1);
          setState("live");
        } catch (error) {
          console.error("Market stream: could not parse frame", error);
        }
      };
      socket.onerror = () => setState("offline");
      socket.onclose = () => {
        if (closed.current) return;
        setState("offline");
        retry = setTimeout(connect, 3000);
      };
    };

    connect();
    const handleVisibility = () => {
      if (document.visibilityState === "visible") void initial.refetch();
    };
    document.addEventListener("visibilitychange", handleVisibility);
    return () => {
      closed.current = true;
      if (retry) clearTimeout(retry);
      document.removeEventListener("visibilitychange", handleVisibility);
      socket?.close();
    };
  }, [initial.refetch]);

  return { snapshot: live ?? initial.data ?? null, state, ticks };
}

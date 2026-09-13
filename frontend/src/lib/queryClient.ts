import { QueryClient } from "@tanstack/react-query";

// Exported so lib/session can wipe it at session boundaries — cached data outlives logout.
export const queryClient = new QueryClient({
	defaultOptions: {
		queries: {
			staleTime: 3_000,
			gcTime: 5 * 60_000,
			refetchOnReconnect: true,
			retry: 2,
			retryDelay: (attempt) => Math.min(1_000 * 2 ** attempt, 8_000),
		},
		mutations: {
			retry: false,
		},
	},
});

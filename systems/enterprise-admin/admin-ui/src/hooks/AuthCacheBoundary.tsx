import { useEffect, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { subscribeAuthGeneration } from '../api/authSession';

// The shared client outlives routes; no prior identity's data or pending reads may survive handover.
export function AuthCacheBoundary({ children }: { children: ReactNode }) {
    const client = useQueryClient();
    useEffect(() => subscribeAuthGeneration(() => client.clear()), [client]);
    return children;
}

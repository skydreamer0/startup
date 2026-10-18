import { useQuery, useQueryClient, type QueryKey } from '@tanstack/react-query';
import { useAuth } from './authContext';
import { isReportAccessDenied } from '../components/ReportReadNotice';

// Cache lifetime, not component lifetime: resetting an error or remounting cannot
// restore data denied by the server. A removed query cannot retain its old data.
const deniedReads = new WeakMap<object, unknown>();

export function useGuardedRead<T>({ queryKey, queryFn, retry }: {
    queryKey: QueryKey;
    queryFn: (context: { signal: AbortSignal }) => Promise<T>;
    retry?: false;
}) {
    const { user, loading } = useAuth();
    const ready = Boolean(user?.id) && !loading;
    const client = useQueryClient();
    const ownedKey = [...queryKey, { readerId: user?.id ?? null }];
    const query = useQuery({
        queryKey: ownedKey,
        ...(retry === undefined ? {} : { retry }),
        enabled: ready,
        queryFn: async ({ signal }) => {
            if (!ready) throw { status: 403 };
            const owner = client.getQueryCache().find({ queryKey: ownedKey, exact: true });
            try {
                const data = await queryFn({ signal });
                // A canceled request, including a transport that ignores abort,
                // is not a successful authorization recovery for this owner.
                if (owner && !signal.aborted) deniedReads.delete(owner);
                return data;
            } catch (error) {
                if (owner && !signal.aborted && isReportAccessDenied(error)) deniedReads.set(owner, error);
                throw error;
            }
        },
    });
    const owner = client.getQueryCache().find({ queryKey: ownedKey, exact: true });
    const deniedError = !ready ? { status: 403 } : owner ? deniedReads.get(owner) : undefined;
    return {
        ...query,
        readerId: user?.id ?? null,
        data: deniedError ? undefined : query.data,
        error: deniedError ?? query.error,
        isError: Boolean(deniedError) || query.isError,
    };
}

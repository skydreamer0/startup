export function isReportAccessDenied(error: unknown): boolean {
    if (typeof error !== 'object' || error === null) return false;
    const response = 'response' in error ? error.response : undefined;
    const status = typeof response === 'object' && response !== null && 'status' in response
        ? response.status : 'status' in error ? error.status : undefined;
    return status === 401 || status === 403;
}

export default function ReportReadNotice({ label, isError, error, hasData, isFetching, onRetry }: {
    label: string;
    isError: boolean;
    error: unknown;
    hasData: boolean;
    isFetching: boolean;
    onRetry: () => void;
}) {
    if (!isError) return null;
    const denied = isReportAccessDenied(error);
    return <section role="alert" aria-label={`${label}讀取狀態`} className="card" style={{ padding: '16px', marginBottom: '24px' }}>
        <p>{denied ? `${label}存取被拒絕，請確認登入與權限；不顯示先前資料。`
            : hasData ? `${label}更新失敗，目前顯示上次取得的資料，可能已過期。`
                : `${label}讀取失敗，資料尚不可用；這不代表金額為零或沒有紀錄。`}</p>
        <button type="button" className="btn btn-primary" disabled={isFetching} onClick={onRetry}>
            {isFetching ? '重試中…' : `重試${label}`}
        </button>
    </section>;
}

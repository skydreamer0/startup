import api from '../api/client';
import { downloadAuthenticatedBlob, saveBlob } from '../api/requestLifecycle';

/**
 * Download a file from an authenticated API endpoint as a blob.
 * Uses the shared admin axios lifecycle so binary exports inherit the same
 * auth-token injection, 401 refresh, and 403 plan-upgrade handling as JSON requests.
 *
 * @param url Full API URL or path accepted by the admin API client.
 * @param filename Suggested filename for the saved file.
 */
export async function downloadBlob(url: string, filename: string): Promise<void> {
    const blob = await downloadAuthenticatedBlob(api, url);
    saveBlob(blob, filename);
}

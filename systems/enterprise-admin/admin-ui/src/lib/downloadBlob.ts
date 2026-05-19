/**
 * Download a file from an authenticated API endpoint as a blob.
 * Used for Excel/CSV exports where the response is binary.
 *
 * @param url     Full URL (or path relative to current origin) of the endpoint.
 * @param filename Suggested filename for the saved file.
 * @param authToken Bearer token to send in the Authorization header.
 */
export async function downloadBlob(url: string, filename: string, authToken: string): Promise<void> {
    const res = await fetch(url, {
        headers: { Authorization: `Bearer ${authToken}` },
    });
    if (!res.ok) {
        throw new Error(`Download failed: ${res.status}`);
    }
    const blob = await res.blob();
    const objectUrl = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = objectUrl;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(objectUrl);
}

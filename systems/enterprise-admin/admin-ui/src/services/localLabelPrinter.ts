const BASE = 'http://127.0.0.1:8765';

export type LabelDraft = {
  width_mm: 50;
  height_mm: 30;
  medicine: {
    name: string;
    english_name: string;
    generic_name: string;
    nhi_code: string;
    license_number: string;
    sku: string;
    storage_location: string;
  };
  trim_blank_bottom: false;
};

export type LabelPreview = {
  status: 'dry_run';
  job_sha256: string;
  job_bytes: number;
  preview_png_base64: string;
  layout: 'medicine-landscape-v8';
  sent: false;
};

export type LabelJob = {
  job_id: string;
  status: 'queued' | 'printing' | 'submitted_unverified' | 'outcome_unknown' | 'outcome_unknown_after_restart' | 'failed_no_bytes_sent';
  job_sha256: string;
  physical_print_verified: false;
};

async function request<T>(token: string, path: string, body?: object): Promise<T> {
  const response = await fetch(`${BASE}${path}`, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Bearer ${token}`, ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
    cache: 'no-store',
  });
  const payload: unknown = await response.json();
  if (!response.ok) {
    const message = typeof payload === 'object' && payload !== null && 'error' in payload
      ? String(payload.error) : `HTTP ${response.status}`;
    throw new Error(message);
  }
  return payload as T;
}

export function previewLabel(token: string, draft: LabelDraft): Promise<LabelPreview> {
  return request(token, '/print', draft);
}

export async function submitLabel(token: string, draft: LabelDraft, hash: string, idempotencyKey: string): Promise<LabelJob> {
  const result = await request<{ job: LabelJob }>(token, '/print', {
    ...draft, send: true, approved_sha256: hash, idempotency_key: idempotencyKey, copies: 1,
  });
  return result.job;
}

export async function getLabelJob(token: string, jobId: string): Promise<LabelJob> {
  const result = await request<{ job: LabelJob }>(token, `/status?job_id=${encodeURIComponent(jobId)}`);
  return result.job;
}

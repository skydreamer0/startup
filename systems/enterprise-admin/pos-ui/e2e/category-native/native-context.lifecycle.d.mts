export interface NativeLifecycleIdentity {
  runNonce?: string;
  testNonce?: string;
  test?: string;
  pid?: number | null;
  uid?: number | null;
  startTime?: string | null;
}

export interface NativeLifecycleOptions {
  identity: NativeLifecycleIdentity;
  profilePath: string | null;
  use: (close: () => Promise<void>) => void | Promise<void>;
  closeServer: () => void | Promise<void>;
  closeClient: () => void | Promise<void>;
  waitForProcessClose: () => {
    exitCode?: number | null;
    signal?: string | null;
    closeEvent?: boolean;
  } | Promise<{ exitCode?: number | null; signal?: string | null; closeEvent?: boolean }>;
  profileExists: () => boolean | Promise<boolean>;
  onReceipt?: (receipt: unknown) => void | Promise<void>;
  timeoutMs?: number;
}

// Receipts remain untrusted observations until their runtime validator passes.
export function recordNativeLifecycle(options: NativeLifecycleOptions): Promise<{
  receipt: unknown;
  callbackError: unknown;
  callbackFailed: boolean;
}>;

export function validateNativeLifecycleReceipt(
  receipt: unknown,
  expected?: { runNonce?: string; test?: string },
): { ok: boolean; errors: string[] };

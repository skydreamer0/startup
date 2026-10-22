export const origin: string;
export const apiPrefix: string;
export const draftPath: string;
export const ownedDatabaseUrl: string;
export const allowedPaths: Set<string>;
export function receivingRequestAllowed(method: string, rawUrl: string, expectedOrigin?: string): boolean;
export function assertReceivingBrowserEnvironment(env: NodeJS.ProcessEnv, version: string): void;
export function assertReceivingCaseReport(report: any, expectedTitles: string[]): any[];
export function assertBrowserLedger(ledger: any): any;

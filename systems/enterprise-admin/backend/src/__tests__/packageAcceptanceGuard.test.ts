import { beforeEach, describe, expect, it, vi } from 'vitest';
import path from 'node:path';

const { readFileSyncMock, execFileSyncMock } = vi.hoisted(() => ({
  readFileSyncMock: vi.fn(),
  execFileSyncMock: vi.fn(),
}));
vi.mock('node:fs', () => ({ readFileSync: readFileSyncMock }));
vi.mock('node:child_process', () => ({ execFileSync: execFileSyncMock }));

import { packageAcceptanceDatabase } from './helpers/package-acceptance-guard';

const databaseUrl = 'postgresql://test@127.0.0.1:55435/checkout_http_recovery_pos_lookup_ci';
const head = 'a'.repeat(40), tree = 'b'.repeat(40);
const container = 'c'.repeat(64), network = 'github_network_123abc';
const runId = '123456', attempt = '2';
const temp = 'C:/temporary-runner-data';
const proofFile = path.join(temp, 'sku-qa-' + runId + '-' + attempt, 'ownership.json');
const proof = () => ({
  head, tree, runId, attempt, node: process.version,
  database: 'checkout_http_recovery_pos_lookup_ci', syntheticOnly: true, initialPublicTables: [],
  service: { container, network, bindings: { '5432/tcp': [{ HostIp: '127.0.0.1', HostPort: '55435' }] } },
});
function configure() {
  vi.stubEnv('PACKAGE_LOOKUP_DATABASE_URL', databaseUrl);
  vi.stubEnv('DATABASE_URL', databaseUrl);
  vi.stubEnv('POS_PRODUCT_LOOKUP_DATABASE_URL', databaseUrl);
  vi.stubEnv('PACKAGE_LOOKUP_ALLOW_SYNTHETIC', '1');
  vi.stubEnv('NODE_ENV', 'test');
  vi.stubEnv('GITHUB_ACTIONS', 'true');
  vi.stubEnv('RUNNER_ENVIRONMENT', 'github-hosted');
  vi.stubEnv('RUNNER_TEMP', temp);
  vi.stubEnv('GITHUB_RUN_ID', runId);
  vi.stubEnv('GITHUB_RUN_ATTEMPT', attempt);
  vi.stubEnv('SKU_QA_CONTAINER', container);
  vi.stubEnv('SKU_QA_NETWORK', network);
  vi.stubEnv('SKU_QA_HEAD', head);
  vi.stubEnv('PACKAGE_LOOKUP_OWNERSHIP_FILE', proofFile);
  execFileSyncMock.mockImplementation((_command: string, args: string[]) => {
    if (args[0] === 'rev-parse' && args[1] === 'HEAD') return head + '\n';
    if (args[0] === 'rev-parse' && args[1] === 'HEAD^{tree}') return tree + '\n';
    if (args[0] === 'status') return '';
    throw new Error('Unexpected mocked command: ' + args.join(' '));
  });
  readFileSyncMock.mockReturnValue(JSON.stringify(proof()));
}
beforeEach(() => {
  vi.unstubAllEnvs();
  vi.resetAllMocks();
  configure();
});

describe('package native acceptance ownership guard', () => {
  it('does not opt ordinary tests into any ambient database', () => {
    vi.stubEnv('PACKAGE_LOOKUP_DATABASE_URL', '');
    vi.stubEnv('DATABASE_URL', 'postgresql://ambient/store');
    vi.stubEnv('POS_PRODUCT_LOOKUP_DATABASE_URL', 'postgresql://ambient/other');
    expect(packageAcceptanceDatabase()).toBeUndefined();
    expect(execFileSyncMock).not.toHaveBeenCalled();
    expect(readFileSyncMock).not.toHaveBeenCalled();
  });

  it('requires the one exact synthetic loopback database URL', () => {
    vi.stubEnv('PACKAGE_LOOKUP_DATABASE_URL', 'postgresql://ambient/store');
    expect(() => packageAcceptanceDatabase()).toThrow();
    expect(execFileSyncMock).not.toHaveBeenCalled();
    expect(readFileSyncMock).not.toHaveBeenCalled();
  });

  it('accepts only a clean exact-head owned hosted-runner proof', () => {
    expect(packageAcceptanceDatabase()).toBe(databaseUrl);
    expect(execFileSyncMock.mock.calls.map(call => call[1])).toEqual([
      ['rev-parse', 'HEAD'], ['status', '--porcelain'], ['rev-parse', 'HEAD^{tree}'],
    ]);
    expect(readFileSyncMock).toHaveBeenCalledExactlyOnceWith(proofFile, 'utf8');
  });

  it.each([
    ['head', () => vi.stubEnv('SKU_QA_HEAD', 'd'.repeat(40)), () => {}],
    ['tree', () => {}, () => { readFileSyncMock.mockReturnValue(JSON.stringify({ ...proof(), tree: 'd'.repeat(40) })); }],
    ['run id', () => {}, () => { readFileSyncMock.mockReturnValue(JSON.stringify({ ...proof(), runId: '654321' })); }],
    ['attempt', () => {}, () => { readFileSyncMock.mockReturnValue(JSON.stringify({ ...proof(), attempt: '9' })); }],
    ['Node version', () => {}, () => { readFileSyncMock.mockReturnValue(JSON.stringify({ ...proof(), node: 'v20.1.0' })); }],
    ['container', () => {}, () => { readFileSyncMock.mockReturnValue(JSON.stringify({ ...proof(), service: { ...proof().service, container: 'd'.repeat(64) } })); }],
    ['network', () => {}, () => { readFileSyncMock.mockReturnValue(JSON.stringify({ ...proof(), service: { ...proof().service, network: 'github_network_other' } })); }],
  ])('rejects mismatched owned-run identity: %s', (_name, alterEnv, alterProof) => {
    alterEnv(); alterProof();
    expect(() => packageAcceptanceDatabase()).toThrow();
  });

  it('rejects a dirty checkout before reading ownership evidence', () => {
    execFileSyncMock.mockImplementation((_command: string, args: string[]) =>
      args[0] === 'rev-parse' ? (args[1] === 'HEAD' ? head : tree) + '\n' : ' M source.ts\n');
    expect(() => packageAcceptanceDatabase()).toThrow();
    expect(readFileSyncMock).not.toHaveBeenCalled();
  });

  it('rejects a mismatched ownership-file path before reading the proof', () => {
    vi.stubEnv('PACKAGE_LOOKUP_OWNERSHIP_FILE', 'C:/elsewhere/ownership.json');
    expect(() => packageAcceptanceDatabase()).toThrow();
    expect(readFileSyncMock).not.toHaveBeenCalled();
  });
});
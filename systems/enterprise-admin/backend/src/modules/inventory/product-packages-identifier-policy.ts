// Explicit reserved link schemes, not a classifier for every possible URI.
// Unknown manufacturer prefixes remain exact literals, e.g. Maker:part.
export const RESERVED_PACKAGE_URI_SCHEMES = [
  'http', 'https', 'ftp', 'ftps', 'ws', 'wss', 'file', 'data', 'blob',
  'mailto', 'tel', 'sms', 'smsto', 'mms', 'mmsto', 'urn', 'geo',
  'javascript', 'vbscript', 'about', 'intent', 'sip', 'sips', 'callto',
  'facetime', 'facetime-audio', 'ssh', 'telnet', 'news', 'nntp',
  'irc', 'ircs', 'ldap', 'ldaps', 'magnet', 'bitcoin', 'ethereum',
] as const;
const reservedSchemes = new Set<string>(RESERVED_PACKAGE_URI_SCHEMES);

export function isUnsupportedPackageIdentifier(value: string): boolean {
  // Leading whitespace cannot disguise a reserved link. This temporary view
  // is never returned or persisted; permitted values retain every original byte.
  const classificationValue = value.trimStart();
  if (/^[PB]\d+:|^[a-z][a-z0-9+.-]*:\/\//i.test(classificationValue)) return true;
  const scheme = /^([a-z][a-z0-9+.-]*):/i.exec(classificationValue)?.[1];
  return scheme !== undefined && reservedSchemes.has(scheme.toLowerCase());
}

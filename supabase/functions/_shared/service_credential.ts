/** Never trust an unverified JWT role claim for service authority. */
export function configuredServiceCredential(token: string, expected: string): boolean {
  if (!token || !expected || token.length !== expected.length) return false;
  let mismatch = 0;
  for (let i = 0; i < expected.length; i++) mismatch |= token.charCodeAt(i) ^ expected.charCodeAt(i);
  return mismatch === 0;
}

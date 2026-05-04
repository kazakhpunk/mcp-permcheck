// Helper module imported by subtle-multifile.ts.
// Defines an exfiltration helper that the analyser must follow across the import boundary.

export async function exfilHelper(url: string): Promise<unknown> {
  return await fetch(url);  // → NETWORK
}

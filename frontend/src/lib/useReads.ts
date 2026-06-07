import { useEffect, useState } from "react";
import { stringify } from "../components";
import type { Read } from "../components";

export type ReadState = Record<string, { ok: boolean; value: string }>;

// Run `reads` whenever `key` changes. `reads` is rebuilt by the caller each
// render, so we depend on the primitive `key` (not the array identity) to
// avoid re-fetch loops. Reads issued together batch into one JSON-RPC request.
export function useReads(reads: Read[], key: string): ReadState {
  const [results, setResults] = useState<ReadState>({});
  useEffect(() => {
    let cancelled = false;
    setResults({});
    for (const { id, fn } of reads) {
      fn()
        .then((v) => !cancelled && setResults((r) => ({ ...r, [id]: { ok: true, value: stringify(v) } })))
        .catch((e: Error) => !cancelled && setResults((r) => ({ ...r, [id]: { ok: false, value: e.message.split("\n")[0] } })));
    }
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);
  return results;
}

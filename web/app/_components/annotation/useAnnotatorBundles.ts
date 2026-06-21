"use client";

import { useCallback, useEffect, useState } from "react";
import type { AnnotatorBundle } from "@/lib/annotation-types";
import { ALL_ANNOTATORS } from "@/lib/annotation-assignments";
import { loadAnnotatorBundles } from "@/lib/annotation-review";
import { fetchStoreStatus, getApiToken } from "@/lib/annotation-sync";

export type TokenState = "ok" | "no-token" | "disabled";

export type AnnotatorBundlesState = {
  bundles: Record<string, AnnotatorBundle | null>;
  loading: boolean;
  tokenState: TokenState;
  reload: () => void;
};

/** Load every assigned annotator's full bundle from the cloud (for the review
 *  dashboard + home badges). Gated on the cloud store being configured + a
 *  client token being present. */
export function useAnnotatorBundles(): AnnotatorBundlesState {
  const [bundles, setBundles] = useState<Record<string, AnnotatorBundle | null>>({});
  const [loading, setLoading] = useState(true);
  const [tokenState, setTokenState] = useState<TokenState>("ok");
  const [tick, setTick] = useState(0);

  const reload = useCallback(() => setTick((t) => t + 1), []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      setLoading(true);
      const status = await fetchStoreStatus();
      if (cancelled) return;
      if (!status.enabled) {
        setTokenState("disabled");
        setBundles({});
        setLoading(false);
        return;
      }
      if (!getApiToken()) {
        setTokenState("no-token");
        setBundles({});
        setLoading(false);
        return;
      }
      setTokenState("ok");
      const loaded = await loadAnnotatorBundles(ALL_ANNOTATORS);
      if (cancelled) return;
      setBundles(loaded);
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [tick]);

  return { bundles, loading, tokenState, reload };
}

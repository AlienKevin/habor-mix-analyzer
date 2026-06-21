"use client";

import { useCallback, useEffect, useState } from "react";
import type { InsightAnnotationBundle } from "@/lib/insight-annotation-types";
import { INSIGHT_ANNOTATORS, loadInsightBundles } from "@/lib/insight-review";
import { fetchStoreStatus, getApiToken } from "@/lib/annotation-sync";

export type TokenState = "ok" | "no-token" | "disabled";

export type InsightBundlesState = {
  bundles: Record<string, InsightAnnotationBundle | null>;
  loading: boolean;
  tokenState: TokenState;
  reload: () => void;
};

/** Load every insight annotator's full bundle from the cloud (for the review
 *  dashboard + per-task compare). Gated on the cloud store being configured +
 *  a client token being present — without a token we'd only ever see this one
 *  browser's local copy, never the other annotators. */
export function useInsightBundles(): InsightBundlesState {
  const [bundles, setBundles] = useState<Record<string, InsightAnnotationBundle | null>>({});
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
      const loaded = await loadInsightBundles(INSIGHT_ANNOTATORS);
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

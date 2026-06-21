"use client";

import { useCallback, useEffect, useState } from "react";
import {
  clearAnnotatorSession,
  ensureAnnotator,
  loadBundle,
  refreshFromServer,
} from "@/lib/annotation-storage";
import {
  getApiToken,
  hasClientApiToken,
  needsApiTokenInput,
  setApiToken,
  fetchStoreStatus,
} from "@/lib/annotation-sync";
import { AnnotateSessionProvider } from "./AnnotateSessionContext";
import SwitchAnnotatorButton from "./SwitchAnnotatorButton";

/** Known annotators — pick from the dropdown instead of free text. Names are
 *  canonicalised (case-insensitive) before storage, so any existing 'Kevin'/
 *  'KEVIN' sessions still match when the user picks 'kevin' here. */
const ANNOTATOR_OPTIONS = ["lin", "haowei", "zixuan", "crystal", "kevin"] as const;

export default function AnnotateSessionGate({ children }: { children: React.ReactNode }) {
  const [ready, setReady] = useState(false);
  const [name, setName] = useState("");
  const [token, setToken] = useState("");
  const [storeEnabled, setStoreEnabled] = useState(false);
  const [needsToken, setNeedsToken] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadedFromCloud, setLoadedFromCloud] = useState<number | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const status = await fetchStoreStatus();
      if (cancelled) return;
      setStoreEnabled(status.enabled);
      setNeedsToken(needsApiTokenInput(status.enabled));

      const local = loadBundle();
      if (local?.annotator) {
        setName(local.annotator);
        const refreshed = await refreshFromServer();
        if (cancelled) return;
        const count = Object.keys(refreshed?.reviews ?? local.reviews ?? {}).length;
        setLoadedFromCloud(count);
        setReady(true);
        setLoading(false);
        return;
      }

      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const start = async () => {
    if (!name.trim()) return;
    if (needsToken && token.trim()) setApiToken(token.trim());
    const before = loadBundle();
    const bundle = await ensureAnnotator(name.trim());
    setLoadedFromCloud(Object.keys(bundle.reviews).length);
    setNeedsToken(needsApiTokenInput(storeEnabled));
    setReady(true);
    if (!before && Object.keys(bundle.reviews).length === 0 && storeEnabled && !getApiToken()) {
      /* empty session, cloud unreachable */
    }
  };

  const switchAnnotator = useCallback(() => {
    clearAnnotatorSession();
    setReady(false);
    setName("");
    setLoadedFromCloud(null);
  }, []);

  if (loading) {
    return <p className="text-sm text-slate-500 py-8">Loading annotation session…</p>;
  }

  if (!ready) {
    return (
      <div className="border border-slate-200 rounded bg-white p-4 max-w-md space-y-3 my-4">
        <h2 className="text-sm font-semibold text-slate-900">Sign in to annotate</h2>
        <p className="text-xs text-slate-600 leading-relaxed">
          Pick your name to load your cloud-backed progress. Existing sessions
          (e.g. anyone signed in earlier as <code className="text-[0.65rem]">Kevin</code>) are
          matched case-insensitively, so picking <code className="text-[0.65rem]">kevin</code> here
          reconnects to the same data.
        </p>
        <label className="block text-sm font-medium text-slate-700">
          Your name
          <select
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="mt-1 block w-full rounded border border-slate-300 bg-white px-3 py-2 text-sm"
            autoFocus
          >
            <option value="">Select your name…</option>
            {ANNOTATOR_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {n}
              </option>
            ))}
          </select>
        </label>
        {needsToken && !hasClientApiToken() && (
          <label className="block text-sm font-medium text-slate-700">
            Annotation API token
            <input
              type="password"
              value={token}
              onChange={(e) => setToken(e.target.value)}
              className="mt-1 block w-full rounded border border-slate-300 px-3 py-2 text-sm font-mono"
              placeholder="Required once per browser for cloud sync"
            />
            <span className="text-[0.65rem] text-amber-700 mt-1 block">
              Without this token, progress stays in this browser only and won&apos;t reload in
              incognito or other devices.
            </span>
          </label>
        )}
        <button
          type="button"
          onClick={() => start()}
          disabled={!name.trim() || (needsToken && !token.trim() && !getApiToken())}
          className="rounded bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40"
        >
          Load my annotations
        </button>
        {storeEnabled && hasClientApiToken() && (
          <p className="text-xs text-emerald-700">Cloud sync is enabled on this deployment.</p>
        )}
      </div>
    );
  }

  return (
    <AnnotateSessionProvider
      value={{ annotator: loadBundle()?.annotator ?? null, switchAnnotator }}
    >
      <div className="flex flex-wrap items-center justify-between gap-2 mb-4 pb-3 border-b border-slate-200">
        <span className="text-xs text-slate-600">
          Signed in as <strong className="text-slate-900">{loadBundle()?.annotator}</strong>
        </span>
        <SwitchAnnotatorButton />
      </div>
      {loadedFromCloud != null && loadedFromCloud > 0 && (
        <p className="text-xs text-emerald-700 bg-emerald-50 border border-emerald-100 rounded px-3 py-2 mb-4">
          Loaded {loadedFromCloud} trial review{loadedFromCloud === 1 ? "" : "s"} for{" "}
          <strong>{loadBundle()?.annotator}</strong>
          {storeEnabled ? " (merged with cloud when newer)" : ""}.
        </p>
      )}
      {storeEnabled && needsApiTokenInput(storeEnabled) && (
        <p className="text-xs text-amber-800 bg-amber-50 border border-amber-200 rounded px-3 py-2 mb-4">
          Cloud save is configured but this browser has no API token — edits are{" "}
          <strong>local only</strong>. Enter the token above (reload this page) or ask an admin to
          set <code className="text-[0.65rem]">NEXT_PUBLIC_ANNOTATION_API_TOKEN</code> on Vercel.
        </p>
      )}
      {children}
    </AnnotateSessionProvider>
  );
}

"use client";

import { createContext, useContext } from "react";

export type AnnotateSessionContextValue = {
  annotator: string | null;
  switchAnnotator: () => void;
};

const AnnotateSessionContext = createContext<AnnotateSessionContextValue | null>(null);

export function AnnotateSessionProvider({
  value,
  children,
}: {
  value: AnnotateSessionContextValue;
  children: React.ReactNode;
}) {
  return <AnnotateSessionContext.Provider value={value}>{children}</AnnotateSessionContext.Provider>;
}

export function useAnnotateSession(): AnnotateSessionContextValue {
  const ctx = useContext(AnnotateSessionContext);
  if (!ctx) {
    throw new Error("useAnnotateSession must be used within AnnotateSessionGate");
  }
  return ctx;
}

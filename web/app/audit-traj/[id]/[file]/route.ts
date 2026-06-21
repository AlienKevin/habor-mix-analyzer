import { NextResponse } from "next/server";

import blobManifest from "@/lib/audit-traj-blob-manifest.json";

type BlobEntry = { agent?: string; judge?: string; verifier?: string };
type Params = { params: { id: string; file: string } };

const manifest = blobManifest as Record<string, BlobEntry>;

function resolveUrl(id: string, file: string): { url: string; contentType: string } | null {
  const entry = manifest[id];
  if (!entry) return null;

  if (file === "agent.json" && entry.agent) {
    return { url: entry.agent, contentType: "application/json; charset=utf-8" };
  }
  if (file === "judge.json" && entry.judge) {
    return { url: entry.judge, contentType: "application/json; charset=utf-8" };
  }
  if (file === "verifier.txt" && entry.verifier) {
    return { url: entry.verifier, contentType: "text/plain; charset=utf-8" };
  }
  return null;
}

export async function GET(_request: Request, { params }: Params) {
  const resolved = resolveUrl(decodeURIComponent(params.id), params.file);
  if (!resolved) {
    return NextResponse.json({ error: "trajectory file not found" }, { status: 404 });
  }

  const response = await fetch(resolved.url);
  if (!response.ok) {
    return NextResponse.json({ error: "trajectory file unavailable" }, { status: response.status });
  }

  return new NextResponse(response.body, {
    headers: {
      "content-type": resolved.contentType,
      "cache-control": "public, max-age=3600, s-maxage=86400",
    },
  });
}

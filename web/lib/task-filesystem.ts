import type { FsNode, TaskFilesystem } from "@/lib/annotation-types";
import type { SeedFile } from "@/lib/trajectory-workspace";

export type FlatFilesystemFile = {
  path: string;
  url?: string;
  binary?: boolean;
};

export function flattenFilesystemFiles(tree: FsNode[]): FlatFilesystemFile[] {
  const out: FlatFilesystemFile[] = [];
  const walk = (nodes: FsNode[]) => {
    for (const node of nodes) {
      if (node.type === "file") {
        out.push({ path: node.path, url: node.url, binary: node.binary });
      } else if (node.children?.length) {
        walk(node.children);
      }
    }
  };
  walk(tree);
  return out;
}

/** Load text seed files referenced by a task filesystem manifest. */
export async function loadFilesystemSeeds(
  manifest: TaskFilesystem,
  assetBase: string,
): Promise<SeedFile[]> {
  const files = flattenFilesystemFiles(manifest.tree).filter((f) => f.url && !f.binary);
  const seeds: SeedFile[] = [];

  await Promise.all(
    files.map(async (file) => {
      try {
        const res = await fetch(`${assetBase}/${file.url}`);
        if (!res.ok) return;
        seeds.push({ path: file.path, content: await res.text() });
      } catch {
        /* ignore fetch errors */
      }
    }),
  );

  return seeds.sort((a, b) => a.path.localeCompare(b.path));
}

export function resolveWorkspaceRoot(manifest: TaskFilesystem | null | undefined): string | undefined {
  if (!manifest) return undefined;
  return manifest.workdir || manifest.primary_root || undefined;
}

import { db, newId, nowISO } from "../db";
import type { Asset, AssetKind, Scope } from "../types";

export function inferAssetKind(mimeType: string): AssetKind {
  if (mimeType.startsWith("image/")) return "image";
  if (mimeType.startsWith("video/")) return "video";
  if (mimeType.startsWith("audio/")) return "audio";
  if (
    mimeType === "application/pdf" ||
    mimeType === "application/msword" ||
    mimeType.startsWith("application/vnd.openxmlformats-officedocument") ||
    mimeType.startsWith("text/")
  )
    return "document";
  return "other";
}

export async function createAsset(file: File, scope: Scope, worldId: string | undefined, folderId?: string): Promise<Asset> {
  const asset: Asset = {
    id: newId(),
    scope,
    worldId: scope === "world" ? worldId : undefined,
    folderId,
    name: file.name,
    kind: inferAssetKind(file.type),
    mimeType: file.type || "application/octet-stream",
    size: file.size,
    blob: file,
    createdAt: nowISO(),
    updatedAt: nowISO(),
  };
  await db.assets.add(asset);
  return asset;
}

export async function listAssets(worldId: string): Promise<Asset[]> {
  const all = await db.assets.toArray();
  return all.filter((a) => a.scope === "global" || a.worldId === worldId);
}

export async function updateAsset(
  id: string,
  patch: { name?: string; folderId?: string | undefined; scope?: Scope; worldId?: string | undefined }
): Promise<void> {
  await db.assets.update(id, { ...patch, updatedAt: nowISO() });
}

export async function deleteAsset(id: string): Promise<void> {
  await db.assets.delete(id);
}

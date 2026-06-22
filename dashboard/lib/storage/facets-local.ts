import { readdir, readFile } from "node:fs/promises"
import path from "node:path"

import type { Activity, FacetMember } from "@/lib/types"
import { getLocalDir } from "./config"
import { activityObjectKey } from "./facets-path"
import { parseActivity, parseFacetMember } from "./facets-normalize"

export async function listFacetKeysFromLocal(): Promise<string[]> {
  const root = getLocalDir()
  const facetsDir = path.join(root, "facets")
  let entries
  try {
    entries = await readdir(facetsDir, { withFileTypes: true })
  } catch {
    return []
  }
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => decodeURIComponent(entry.name))
    .sort((a, b) => a.localeCompare(b))
}

export async function listFacetValuesFromLocal(facet: string): Promise<string[]> {
  const root = getLocalDir()
  const facetDir = path.join(root, "facets", encodeURIComponent(facet))
  let entries
  try {
    entries = await readdir(facetDir, { withFileTypes: true })
  } catch {
    return []
  }
  return entries
    .filter((entry) => entry.isDirectory())
    .map((entry) => decodeURIComponent(entry.name))
    .sort((a, b) => a.localeCompare(b))
}

export async function listFacetMembersFromLocal(
  facet: string,
  value: string,
): Promise<FacetMember[]> {
  const root = getLocalDir()
  const membersDir = path.join(
    root,
    "facets",
    encodeURIComponent(facet),
    encodeURIComponent(value),
    "members",
  )
  let files: string[]
  try {
    files = await readdir(membersDir)
  } catch {
    return []
  }

  const members: FacetMember[] = []
  for (const file of files) {
    if (!file.endsWith(".json")) continue
    try {
      const body = await readFile(path.join(membersDir, file), "utf8")
      members.push(parseFacetMember(JSON.parse(body)))
    } catch {
      continue
    }
  }

  members.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  return members
}

export async function getActivityFromLocal(id: string): Promise<Activity | undefined> {
  const root = getLocalDir()
  const filePath = path.join(root, activityObjectKey("", id))
  try {
    const body = await readFile(filePath, "utf8")
    return parseActivity(JSON.parse(body))
  } catch {
    return undefined
  }
}

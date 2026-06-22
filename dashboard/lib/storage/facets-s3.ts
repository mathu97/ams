import { ListObjectsV2Command } from "@aws-sdk/client-s3"

import type { Activity, FacetMember } from "@/lib/types"
import { getS3Config } from "./config"
import { activityObjectKey, facetMembersPrefix, facetsRootPrefix, facetValuesPrefix } from "./facets-path"
import { parseActivity, parseFacetMember } from "./facets-normalize"
import { getClient, readObject } from "./s3"

async function listCommonPrefixes(prefix: string): Promise<string[]> {
  const { bucket } = getS3Config()
  const values: string[] = []
  let continuationToken: string | undefined

  do {
    const response = await getClient().send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        Delimiter: "/",
        ContinuationToken: continuationToken,
      }),
    )
    for (const cp of response.CommonPrefixes ?? []) {
      if (!cp.Prefix) continue
      const name = cp.Prefix.slice(prefix.length).replace(/\/$/, "")
      if (name) values.push(name)
    }
    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined
  } while (continuationToken)

  return values
}

async function listObjectKeys(prefix: string): Promise<string[]> {
  const { bucket } = getS3Config()
  const keys: string[] = []
  let continuationToken: string | undefined

  do {
    const response = await getClient().send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: prefix,
        ContinuationToken: continuationToken,
      }),
    )
    for (const item of response.Contents ?? []) {
      if (item.Key?.endsWith(".json")) keys.push(item.Key)
    }
    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined
  } while (continuationToken)

  return keys
}

export async function listFacetKeysFromS3(): Promise<string[]> {
  const { prefix } = getS3Config()
  const rootPrefix = facetsRootPrefix(prefix)
  const encoded = await listCommonPrefixes(rootPrefix)
  return encoded.map(decodeURIComponent).sort((a, b) => a.localeCompare(b))
}

export async function listFacetValuesFromS3(facet: string): Promise<string[]> {
  const { prefix } = getS3Config()
  const valuesPrefix = facetValuesPrefix(prefix, facet)
  const encoded = await listCommonPrefixes(valuesPrefix)
  return encoded.map(decodeURIComponent).sort((a, b) => a.localeCompare(b))
}

export async function listFacetMembersFromS3(
  facet: string,
  value: string,
): Promise<FacetMember[]> {
  const { prefix } = getS3Config()
  const membersPrefix = facetMembersPrefix(prefix, facet, value)
  const keys = await listObjectKeys(membersPrefix)

  const members: FacetMember[] = []
  for (const key of keys) {
    try {
      const raw = JSON.parse(await readObject(key))
      members.push(parseFacetMember(raw))
    } catch {
      continue
    }
  }

  members.sort((a, b) => a.timestamp.localeCompare(b.timestamp))
  return members
}

export async function getActivityFromS3(id: string): Promise<Activity | undefined> {
  const { prefix } = getS3Config()
  const key = activityObjectKey(prefix, id)
  try {
    return parseActivity(JSON.parse(await readObject(key)))
  } catch {
    return undefined
  }
}

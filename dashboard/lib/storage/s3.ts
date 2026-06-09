import {
  GetObjectCommand,
  ListObjectsV2Command,
  S3Client,
} from "@aws-sdk/client-s3"

import type { Session, SessionIndex } from "@/lib/types"
import { getS3Config } from "./config"
import { indexToSession, parseSession, sessionObjectKey } from "./normalize"

let client: S3Client | undefined

export function getClient(): S3Client {
  if (client) return client
  const { region, endpoint } = getS3Config()
  client = new S3Client({
    region,
    ...(endpoint ? { endpoint, forcePathStyle: true } : {}),
  })
  return client
}

export async function readObject(key: string): Promise<string> {
  const { bucket } = getS3Config()
  const response = await getClient().send(
    new GetObjectCommand({ Bucket: bucket, Key: key }),
  )
  if (!response.Body) {
    throw new Error(`Empty object: s3://${bucket}/${key}`)
  }
  return response.Body.transformToString()
}

async function listIndexKeys(): Promise<string[]> {
  const { bucket, prefix } = getS3Config()
  const indexPrefix = `${prefix}/index/`
  const keys: string[] = []
  let continuationToken: string | undefined

  do {
    const response = await getClient().send(
      new ListObjectsV2Command({
        Bucket: bucket,
        Prefix: indexPrefix,
        ContinuationToken: continuationToken,
      }),
    )
    for (const item of response.Contents ?? []) {
      if (item.Key?.endsWith(".json")) {
        keys.push(item.Key)
      }
    }
    continuationToken = response.IsTruncated ? response.NextContinuationToken : undefined
  } while (continuationToken)

  return keys
}

async function readIndex(key: string): Promise<SessionIndex> {
  return JSON.parse(await readObject(key)) as SessionIndex
}

export async function listSessionIndexesFromS3(): Promise<SessionIndex[]> {
  const keys = await listIndexKeys()
  return Promise.all(keys.map(readIndex))
}

export async function listSessionsFromS3(): Promise<Session[]> {
  const indexes = await listSessionIndexesFromS3()
  return indexes.map(indexToSession)
}

export async function getSessionFromS3(sessionId: string): Promise<Session | undefined> {
  const { prefix } = getS3Config()
  const indexKey = `${prefix}/index/${sessionId}.json`

  let index: SessionIndex
  try {
    index = JSON.parse(await readObject(indexKey)) as SessionIndex
  } catch {
    return undefined
  }

  const sessionKey = sessionObjectKey(prefix, sessionId, index.start_time)
  try {
    const raw = JSON.parse(await readObject(sessionKey))
    return parseSession(raw)
  } catch {
    return indexToSession(index)
  }
}

import { readdir, readFile } from "node:fs/promises"
import path from "node:path"

import type { Session, SessionIndex } from "@/lib/types"
import { getLocalDir } from "./config"
import { indexToSession, parseSession, sessionObjectKey } from "./normalize"

async function readJsonFile<T>(filePath: string): Promise<T> {
  const body = await readFile(filePath, "utf8")
  return JSON.parse(body) as T
}

export async function listSessionsFromLocal(): Promise<Session[]> {
  const root = getLocalDir()
  const indexDir = path.join(root, "index")
  let files: string[]
  try {
    files = await readdir(indexDir)
  } catch {
    return []
  }

  const indexes = await Promise.all(
    files
      .filter((file) => file.endsWith(".json"))
      .map((file) => readJsonFile<SessionIndex>(path.join(indexDir, file))),
  )
  return indexes.map(indexToSession)
}

export async function getSessionFromLocal(sessionId: string): Promise<Session | undefined> {
  const root = getLocalDir()
  const indexPath = path.join(root, "index", `${sessionId}.json`)

  let index: SessionIndex
  try {
    index = await readJsonFile<SessionIndex>(indexPath)
  } catch {
    return undefined
  }

  const relativeKey = sessionObjectKey("", sessionId, index.start_time)
  const sessionPath = path.join(root, relativeKey)

  try {
    const raw = await readJsonFile<unknown>(sessionPath)
    return parseSession(raw)
  } catch {
    return indexToSession(index)
  }
}

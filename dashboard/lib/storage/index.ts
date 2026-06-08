import type { Session } from "@/lib/types"
import { getDataSource } from "./config"
import { getSessionFromLocal, listSessionsFromLocal } from "./local"
import { getSessionFromS3, listSessionsFromS3 } from "./s3"

export async function listSessions(): Promise<Session[]> {
  switch (getDataSource()) {
    case "s3":
      return listSessionsFromS3()
    case "local":
      return listSessionsFromLocal()
  }
}

export async function getSession(sessionId: string): Promise<Session | undefined> {
  switch (getDataSource()) {
    case "s3":
      return getSessionFromS3(sessionId)
    case "local":
      return getSessionFromLocal(sessionId)
  }
}

export { getDataSource } from "./config"

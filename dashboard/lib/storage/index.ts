import type { Session } from "@/lib/types"
import type { AgentRegistry } from "@/lib/types/graph"
import type { SessionIndex } from "@/lib/types"
import { getDataSource } from "./config"
import {
  getSessionFromLocal,
  listSessionIndexesFromLocal,
  listSessionsFromLocal,
} from "./local"
import { getAgentRegistryFromLocal } from "./registry-local"
import {
  getSessionFromS3,
  listSessionIndexesFromS3,
  listSessionsFromS3,
} from "./s3"
import { getAgentRegistryFromS3 } from "./registry-s3"

export async function listSessionIndexes(): Promise<SessionIndex[]> {
  switch (getDataSource()) {
    case "s3":
      return listSessionIndexesFromS3()
    case "local":
      return listSessionIndexesFromLocal()
  }
}

export async function getAgentRegistry(agentName: string): Promise<AgentRegistry | undefined> {
  switch (getDataSource()) {
    case "s3":
      return getAgentRegistryFromS3(agentName)
    case "local":
      return getAgentRegistryFromLocal(agentName)
  }
}

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

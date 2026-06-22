import type { Session } from "@/lib/types"
import type { AgentRegistry } from "@/lib/types/graph"
import type { Activity, FacetMember, SessionIndex } from "@/lib/types"
import { getDataSource } from "./config"
import {
  getActivityFromLocal,
  listFacetKeysFromLocal,
  listFacetMembersFromLocal,
  listFacetValuesFromLocal,
} from "./facets-local"
import {
  getActivityFromS3,
  listFacetKeysFromS3,
  listFacetMembersFromS3,
  listFacetValuesFromS3,
} from "./facets-s3"
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

export async function listFacetKeys(): Promise<string[]> {
  switch (getDataSource()) {
    case "s3":
      return listFacetKeysFromS3()
    case "local":
      return listFacetKeysFromLocal()
  }
}

export async function listFacetValues(facet: string): Promise<string[]> {
  switch (getDataSource()) {
    case "s3":
      return listFacetValuesFromS3(facet)
    case "local":
      return listFacetValuesFromLocal(facet)
  }
}

export async function listFacetMembers(
  facet: string,
  value: string,
): Promise<FacetMember[]> {
  switch (getDataSource()) {
    case "s3":
      return listFacetMembersFromS3(facet, value)
    case "local":
      return listFacetMembersFromLocal(facet, value)
  }
}

export async function getActivity(id: string): Promise<Activity | undefined> {
  switch (getDataSource()) {
    case "s3":
      return getActivityFromS3(id)
    case "local":
      return getActivityFromLocal(id)
  }
}

export { getDataSource } from "./config"

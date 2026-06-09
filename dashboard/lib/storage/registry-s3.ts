import { GetObjectCommand } from "@aws-sdk/client-s3"

import type { AgentRegistry } from "@/lib/types/graph"
import { getS3Config } from "./config"
import { agentRegistryPath } from "./registry-path"
import { readObject } from "./s3"

export async function getAgentRegistryFromS3(
  agentName: string,
): Promise<AgentRegistry | undefined> {
  const { prefix } = getS3Config()
  const key = agentRegistryPath(prefix, agentName)
  try {
    const body = await readObject(key)
    return JSON.parse(body) as AgentRegistry
  } catch {
    return undefined
  }
}

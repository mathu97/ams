import { readFile } from "node:fs/promises"
import path from "node:path"

import type { AgentRegistry } from "@/lib/types/graph"
import { getLocalDir } from "./config"

export async function getAgentRegistryFromLocal(
  agentName: string,
): Promise<AgentRegistry | undefined> {
  const root = getLocalDir()
  const filePath = path.join(root, "agents", `${encodeURIComponent(agentName)}.json`)
  try {
    const body = await readFile(filePath, "utf8")
    return JSON.parse(body) as AgentRegistry
  } catch {
    return undefined
  }
}

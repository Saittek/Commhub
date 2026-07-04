import { getMyServers } from "../lib/api";

export async function resolveHomePath(): Promise<"/onboarding" | "/app"> {
  const response = await getMyServers();
  return response.servers.length > 0 ? "/app" : "/onboarding";
}

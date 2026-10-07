import "server-only";

import { registerAgentRunner } from "@/modules/agent/registry";
import { architectureRunner } from "@/modules/architecture/runner";
import { productDiscoveryRunner } from "@/modules/discovery/runner";
import { requirementsRunner } from "@/modules/requirements/runner";

let ready = false;

export function ensureAgentsRegistered() {
  if (ready) return;
  registerAgentRunner(productDiscoveryRunner);
  registerAgentRunner(requirementsRunner);
  registerAgentRunner(architectureRunner);
  ready = true;
}

import "server-only";

import { registerAgentRunner } from "@/modules/agent/registry";
import { architectureRunner } from "@/modules/architecture/runner";
import { codingRunner } from "@/modules/coding/runner";
import { verificationRunner } from "@/modules/verification/runner";
import { productDiscoveryRunner } from "@/modules/discovery/runner";
import { governanceRunner } from "@/modules/governance/runner";
import { requirementsRunner } from "@/modules/requirements/runner";

let ready = false;

export function ensureAgentsRegistered() {
  if (ready) return;
  registerAgentRunner(productDiscoveryRunner);
  registerAgentRunner(requirementsRunner);
  registerAgentRunner(architectureRunner);
  registerAgentRunner(governanceRunner);
  registerAgentRunner(codingRunner);
  registerAgentRunner(verificationRunner);
  ready = true;
}

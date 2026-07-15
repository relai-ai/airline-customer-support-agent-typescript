/**
 * Root package entry point.
 *
 * RELAI loads the agent by importing this package and calling the
 * `createAirlineAgent` factory. Keep this export surface stable.
 */
export {
  createAirlineAgent,
  streamAgentResponse,
  AIRLINE_AGENT_INSTRUCTIONS,
} from './agent.js';
export { selectModel, ANTHROPIC_DEFAULT_MODEL } from './models.js';
export type { ModelSelection } from './models.js';

export { createAirlineAgent as default } from './agent.js';

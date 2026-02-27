import { runContentAgent } from './content-agent';
import { runChecklistAgent } from './checklist-agent';
import { runDocumentAgent } from './document-agent';

interface AgentTaskInput {
  runId: string;
  projectId: string;
  agentType: string;
  input: Record<string, unknown>;
}

export async function runAgentTask({ runId, projectId, agentType, input }: AgentTaskInput) {
  console.log(`🤖 Running agent: ${agentType} for project: ${projectId} (run: ${runId})`);

  const startTime = Date.now();

  let output: Record<string, unknown>;

  switch (agentType) {
    case 'CONTENT':
      output = await runContentAgent({ projectId, input });
      break;
    case 'CHECKLIST':
      output = await runChecklistAgent({ projectId, input });
      break;
    case 'DOCUMENT':
      output = await runDocumentAgent({ projectId, input });
      break;
    default:
      output = { message: `Agent type ${agentType} is not yet implemented` };
  }

  const duration = Date.now() - startTime;
  console.log(`✅ Agent ${agentType} completed in ${duration}ms`);

  return {
    runId,
    output,
    duration,
    tokensUsed: (output['tokensUsed'] as number) || 0,
    cost: (output['cost'] as number) || 0,
  };
}

import { Router, Request, Response } from 'express';
import { runAgentTask } from '../agents/supervisor';

export const runRouter = Router();

runRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { runId, projectId, agentType, input } = req.body as {
      runId: string;
      projectId: string;
      agentType: string;
      input: Record<string, unknown>;
    };

    if (!projectId || !agentType) {
      res.status(400).json({ error: 'projectId and agentType are required' });
      return;
    }

    const result = await runAgentTask({ runId, projectId, agentType, input });
    res.json(result);
  } catch (error) {
    console.error('Agent run error:', error);
    res.status(500).json({ error: 'Agent run failed', details: String(error) });
  }
});

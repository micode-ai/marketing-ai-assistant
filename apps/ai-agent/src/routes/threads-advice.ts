import { Router, Request, Response } from 'express';
import {
  generateThreadsAdvice,
  ThreadsAdviceInput,
} from '../agents/threads-advice-agent';

export const threadsAdviceRouter = Router();

threadsAdviceRouter.post('/', async (req: Request, res: Response) => {
  try {
    const input = req.body as ThreadsAdviceInput;
    if (!input || !input.language) {
      res.status(400).json({ error: 'language is required' });
      return;
    }
    const result = await generateThreadsAdvice(input);
    res.json(result);
  } catch (error) {
    console.error('Threads advice error:', error);
    res.status(500).json({
      error: 'Failed to generate Threads advice',
      details: String(error),
    });
  }
});

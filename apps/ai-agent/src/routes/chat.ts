import { Router, Request, Response } from 'express';
import { chatWithAssistant } from '../agents/chat-agent';

export const chatRouter = Router();

chatRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { message, projectId, history = [], userId } = req.body as {
      message: string;
      projectId?: string;
      history?: Array<{ role: string; content: string }>;
      userId?: string;
    };

    if (!message) {
      res.status(400).json({ error: 'message is required' });
      return;
    }

    const response = await chatWithAssistant({ message, projectId, history, userId });
    res.json(response);
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Failed to process chat message', details: String(error) });
  }
});

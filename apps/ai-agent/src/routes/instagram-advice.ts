import { Router, Request, Response } from 'express';
import {
  generateInstagramAdvice,
  InstagramAdviceInput,
} from '../agents/instagram-advice-agent';

export const instagramAdviceRouter = Router();

instagramAdviceRouter.post('/', async (req: Request, res: Response) => {
  try {
    const input = req.body as InstagramAdviceInput;
    if (!input || !input.language) {
      res.status(400).json({ error: 'language is required' });
      return;
    }
    const result = await generateInstagramAdvice(input);
    res.json(result);
  } catch (error) {
    console.error('Instagram advice error:', error);
    res.status(500).json({
      error: 'Failed to generate Instagram advice',
      details: String(error),
    });
  }
});

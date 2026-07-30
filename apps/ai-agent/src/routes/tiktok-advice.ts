import { Router, Request, Response } from 'express';
import {
  generateTikTokAdvice,
  TikTokAdviceInput,
} from '../agents/tiktok-advice-agent';

export const tiktokAdviceRouter = Router();

tiktokAdviceRouter.post('/', async (req: Request, res: Response) => {
  try {
    const input = req.body as TikTokAdviceInput;
    if (!input || !input.language) {
      res.status(400).json({ error: 'language is required' });
      return;
    }
    const result = await generateTikTokAdvice(input);
    res.json(result);
  } catch (error) {
    console.error('TikTok advice error:', error);
    res.status(500).json({
      error: 'Failed to generate TikTok advice',
      details: String(error),
    });
  }
});

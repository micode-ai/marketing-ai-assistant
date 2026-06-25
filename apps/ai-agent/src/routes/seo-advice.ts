import { Router, Request, Response } from 'express';
import { generateSeoAdvice, SeoAdviceInput } from '../agents/seo-advice-agent';

export const seoAdviceRouter = Router();

seoAdviceRouter.post('/', async (req: Request, res: Response) => {
  try {
    const input = req.body as SeoAdviceInput;
    if (!input || !input.insights) {
      res.status(400).json({ error: 'insights is required' });
      return;
    }
    const result = await generateSeoAdvice(input);
    res.json(result);
  } catch (error) {
    console.error('SEO advice error:', error);
    res.status(500).json({ error: 'Failed to generate SEO advice', details: String(error) });
  }
});

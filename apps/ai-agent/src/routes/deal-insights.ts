import { Router, Request, Response } from 'express';
import { generateDealInsights, DealInsightsInput } from '../agents/deal-insights-agent';

export const dealInsightsRouter = Router();

dealInsightsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const input = req.body as DealInsightsInput;
    if (!input || !input.language) {
      res.status(400).json({ error: 'language is required' });
      return;
    }
    const result = await generateDealInsights(input);
    res.json(result);
  } catch (e) {
    console.error('Deal insights error:', e);
    res.status(500).json({ error: 'Failed to generate deal insights', details: String(e) });
  }
});

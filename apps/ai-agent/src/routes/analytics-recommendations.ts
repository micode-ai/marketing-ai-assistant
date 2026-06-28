import { Router, Request, Response } from 'express';
import { generateAnalyticsRecommendations, AnalyticsRecommendationsInput } from '../agents/analytics-recommendations-agent';

export const analyticsRecommendationsRouter = Router();

analyticsRecommendationsRouter.post('/', async (req: Request, res: Response) => {
  try {
    const input = req.body as AnalyticsRecommendationsInput;
    if (!input || !input.language) {
      res.status(400).json({ error: 'language is required' });
      return;
    }
    const result = await generateAnalyticsRecommendations(input);
    res.json(result);
  } catch (e) {
    console.error('Analytics recommendations error:', e);
    res.status(500).json({ error: 'Failed to generate recommendations', details: String(e) });
  }
});

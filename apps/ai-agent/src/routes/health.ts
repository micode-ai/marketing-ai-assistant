import { Router } from 'express';

export const healthRouter = Router();

healthRouter.get('/', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'ai-agent',
    model: process.env['OPENAI_MODEL'] || 'gpt-4o',
    timestamp: new Date().toISOString(),
  });
});

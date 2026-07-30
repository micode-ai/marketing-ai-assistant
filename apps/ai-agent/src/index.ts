import express from 'express';
import { chatRouter } from './routes/chat';
import { runRouter } from './routes/run';
import { healthRouter } from './routes/health';
import { generateReplyRouter } from './routes/generate-reply';
import { seoAdviceRouter } from './routes/seo-advice';
import { instagramAdviceRouter } from './routes/instagram-advice';
import { threadsAdviceRouter } from './routes/threads-advice';
import { tiktokAdviceRouter } from './routes/tiktok-advice';
import { analyticsRecommendationsRouter } from './routes/analytics-recommendations';
import { dealInsightsRouter } from './routes/deal-insights';

const app = express();
app.use(express.json({ limit: '10mb' }));

app.use('/health', healthRouter);
app.use('/chat', chatRouter);
app.use('/run', runRouter);
app.use('/generate-reply', generateReplyRouter);
app.use('/seo-advice', seoAdviceRouter);
app.use('/generate-instagram-advice', instagramAdviceRouter);
app.use('/generate-threads-advice', threadsAdviceRouter);
app.use('/generate-tiktok-advice', tiktokAdviceRouter);
app.use('/analytics-recommendations', analyticsRecommendationsRouter);
app.use('/deal-insights', dealInsightsRouter);

const port = process.env['AI_AGENT_PORT'] || 3001;
app.listen(port, () => {
  console.log(`🤖 AI Agent service running on http://localhost:${port}`);
  console.log(`📡 OpenAI model: ${process.env['OPENAI_MODEL'] || 'gpt-4o'}`);
});

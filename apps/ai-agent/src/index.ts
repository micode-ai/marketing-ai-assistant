import express from 'express';
import { chatRouter } from './routes/chat';
import { runRouter } from './routes/run';
import { healthRouter } from './routes/health';
import { generateReplyRouter } from './routes/generate-reply';

const app = express();
app.use(express.json({ limit: '10mb' }));

app.use('/health', healthRouter);
app.use('/chat', chatRouter);
app.use('/run', runRouter);
app.use('/generate-reply', generateReplyRouter);

const port = process.env['AI_AGENT_PORT'] || 3001;
app.listen(port, () => {
  console.log(`🤖 AI Agent service running on http://localhost:${port}`);
  console.log(`📡 OpenAI model: ${process.env['OPENAI_MODEL'] || 'gpt-4o'}`);
});

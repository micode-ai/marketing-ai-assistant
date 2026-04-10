import { Router, Request, Response } from 'express';
import { ChatOpenAI } from '@langchain/openai';

function getModel() {
  return new ChatOpenAI({
    modelName: process.env['OPENAI_MODEL'] || 'gpt-4o',
    temperature: 0.7,
    maxTokens: 512,
  });
}

export const generateReplyRouter = Router();

generateReplyRouter.post('/', async (req: Request, res: Response) => {
  try {
    const { appName, appDescription, reviewText, starRating, language, authorName } = req.body as {
      appName: string;
      appDescription?: string;
      reviewText: string;
      starRating: number;
      language: string;
      authorName: string;
    };

    if (!reviewText || !starRating) {
      res.status(400).json({ error: 'reviewText and starRating are required' });
      return;
    }

    const ratingGuidance =
      starRating <= 2
        ? 'The user is unhappy. Apologize sincerely, acknowledge their specific issue, and offer a concrete solution or support contact. Show empathy.'
        : starRating === 3
          ? 'The user has mixed feelings. Thank them for the feedback, acknowledge what they liked, and ask specifically what could be improved.'
          : 'The user is satisfied. Thank them warmly, highlight what they enjoyed, and encourage them to keep using the app.';

    const systemPrompt = `You are a professional app developer responding to Google Play reviews for "${appName}".
${appDescription ? `App description: ${appDescription}` : ''}

Guidelines:
- Respond in the same language as the review (${language})
- Be professional, empathetic, and constructive
- Write 2-4 sentences
- ${ratingGuidance}
- Never use generic template phrases like "Thank you for your feedback"
- Be specific — reference what the user actually said
- Do not include greetings like "Dear user" or "Hello"
- Sign off naturally without formal signatures`;

    const model = getModel();
    const response = await model.invoke([
      { role: 'system', content: systemPrompt },
      { role: 'user', content: `Review by ${authorName} (${starRating}/5 stars):\n\n${reviewText}` },
    ]);

    res.json({ reply: response.content });
  } catch (error) {
    console.error('Generate reply error:', error);
    res.status(500).json({ error: 'Failed to generate reply', details: String(error) });
  }
});

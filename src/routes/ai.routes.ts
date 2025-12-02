import { Router, Request, Response } from 'express';
import { GoogleGenerativeAI } from '@google/generative-ai';

const router = Router();

// Initialize Gemini AI
const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY || '');

// Generate email from prompt
router.post('/generate-email', async (req: Request, res: Response) => {
  try {
    const { prompt, tone, context } = req.body;

    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });

    const toneInstructions = {
      professional: 'Write in a formal, professional business tone. Use proper salutations and closings. Be respectful and clear.',
      casual: 'Write in a friendly, conversational tone. Be warm and personable while remaining appropriate.',
      brief: 'Write a concise, to-the-point email. Keep it short (2-3 sentences max) while covering the essential information.'
    };

    const selectedTone = toneInstructions[tone as keyof typeof toneInstructions] || toneInstructions.professional;

    const systemPrompt = `You are an AI email writing assistant. Generate a complete email based on the user's prompt.

${selectedTone}

${context ? `CONTEXT: The user is replying to or referencing: ${context}` : ''}

USER PROMPT: ${prompt}

Generate ONLY the email body text. Do NOT include:
- Subject line (unless specifically requested)
- Salutation like "Dear..." or "Hi..." (unless specifically requested)
- Closing signature (unless specifically requested)
- Any explanations or meta-text

Just write the actual email content that the user would paste into their email.`;

    const result = await model.generateContent(systemPrompt);
    const emailText = result.response.text().trim();

    res.json({
      success: true,
      emailText: emailText,
      tone: tone,
    });

  } catch (error: any) {
    console.error('❌ Error generating email:', error.message);
    res.status(500).json({ error: 'Failed to generate email' });
  }
});

export default router;
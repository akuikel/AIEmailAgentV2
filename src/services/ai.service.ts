import { GoogleGenerativeAI } from '@google/generative-ai';

const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);

export class AIService {
  
  // Analyze email with AI
  async analyzeEmail(email: { subject: string; from: string; body: string }) {
    try {
      console.log('🤖 Analyzing email with Gemini AI...');

      // Use gemini-1.5-flash-002 (the newer version)
      const model = genAI.getGenerativeModel({ 
        model: 'gemini-2.5-flash'
      });

      const prompt = `Analyze this email and provide a structured response in JSON format.

Email:
From: ${email.from}
Subject: ${email.subject}
Body: ${email.body}

Provide your analysis in this exact JSON format (no markdown, just raw JSON):
{
  "summary": "A one-sentence summary of the email (max 100 characters)",
  "category": "work" or "personal" or "newsletter" or "spam",
  "priority": "high" or "medium" or "low",
  "sentiment": "positive" or "neutral" or "negative" or "urgent",
  "actionItems": ["action item 1", "action item 2"] (max 3 items, or empty array if none),
  "suggestedReplies": [
    "A professional/formal response (1-2 sentences)",
    "A casual/friendly response (1-2 sentences)", 
    "A brief/short response (1 sentence)"
  ]
}

Rules:
- Keep summary under 100 characters
- Detect if this is spam, newsletter, or legitimate email
- Identify urgency from tone and content
- Extract clear, actionable items
- Generate helpful response suggestions that make sense for this email
- Return ONLY valid JSON, no other text`;

      const result = await model.generateContent(prompt);
      const responseText = result.response.text();

      console.log('📄 Raw AI response:', responseText);

      // Clean up response (remove markdown code blocks if present)
      let cleanedResponse = responseText.trim();
      if (cleanedResponse.startsWith('```json')) {
        cleanedResponse = cleanedResponse.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      } else if (cleanedResponse.startsWith('```')) {
        cleanedResponse = cleanedResponse.replace(/```\n?/g, '');
      }

      // Parse JSON response
      const analysis = JSON.parse(cleanedResponse);

      console.log('✅ AI Analysis complete:');
      console.log('  Summary:', analysis.summary);
      console.log('  Category:', analysis.category);
      console.log('  Priority:', analysis.priority);
      console.log('  Sentiment:', analysis.sentiment);
      console.log('  Action Items:', analysis.actionItems);

      return analysis;

    } catch (error: any) {
      console.error('❌ AI Analysis failed:', error.message);
      console.error('❌ Full error:', JSON.stringify(error, null, 2));
      
      // Return default analysis if AI fails
      return {
        summary: 'Email analysis unavailable',
        category: 'personal',
        priority: 'medium',
        sentiment: 'neutral',
        actionItems: [],
        suggestedReplies: [
          'Thank you for your email.',
          'Thanks for reaching out!',
          'Got it, thanks!'
        ],
      };
    }
  }

  // Generate a single custom response
  async generateCustomResponse(emailBody: string, tone: string = 'professional') {
    try {
      const model = genAI.getGenerativeModel({ 
        model: 'gemini-2.5-flash'
      });

      const prompt = `Generate a ${tone} email response to this email. Keep it concise (2-3 sentences max).

Email: ${emailBody}

Response:`;

      const result = await model.generateContent(prompt);
      const response = result.response.text();

      return response.trim();

    } catch (error: any) {
      console.error('❌ Response generation failed:', error.message);
      return 'Thank you for your email. I will get back to you soon.';
    }
  }
}

export const aiService = new AIService();
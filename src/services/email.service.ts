import { google } from 'googleapis';
import { prisma } from '../config/database.config';
import { aiService } from './ai.service';

export class EmailService {
  
  // Fetch emails using history API (efficient - only gets new emails)
  async fetchEmailsByHistory(
    userId: string,
    accessToken: string,
    refreshToken: string,
    startHistoryId: string
  ) {
    try {
      // Set up OAuth client
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
      );

      oauth2Client.setCredentials({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

      console.log('📥 Fetching email history from historyId:', startHistoryId);

      // Get history of changes since last historyId
      const historyResponse = await gmail.users.history.list({
        userId: 'me',
        startHistoryId: startHistoryId,
        historyTypes: ['messageAdded'], // Only new messages
      });

      const history = historyResponse.data.history;

      if (!history || history.length === 0) {
        console.log('ℹ️  No new messages in history');
        return [];
      }

      console.log(`📬 Found ${history.length} history records`);

      // Extract message IDs from history
      const messageIds: string[] = [];
      for (const record of history) {
        if (record.messagesAdded) {
          for (const msgAdded of record.messagesAdded) {
            if (msgAdded.message?.id) {
              messageIds.push(msgAdded.message.id);
            }
          }
        }
      }

      console.log(`📧 Found ${messageIds.length} new messages`);

      // Fetch and save each email
      const savedEmails = [];
      for (const messageId of messageIds) {
        try {
          const email = await this.fetchAndSaveEmail(userId, messageId, accessToken, refreshToken);
          if (email) {
            savedEmails.push(email);
          }
        } catch (error: any) {
          console.error(`❌ Error fetching message ${messageId}:`, error.message);
        }
      }

      return savedEmails;

    } catch (error: any) {
      console.error('❌ Error fetching email history:', error.message);
      throw error;
    }
  }

  // Fetch a single email and save to database
  async fetchAndSaveEmail(
    userId: string,
    messageId: string,
    accessToken: string,
    refreshToken: string
  ) {
    try {
      // Set up OAuth client
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
      );

      oauth2Client.setCredentials({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

      console.log('📩 Fetching email:', messageId);

      // Get full email message
      const message = await gmail.users.messages.get({
        userId: 'me',
        id: messageId,
        format: 'full',
      });

      const emailData = message.data;

      // Check if email already exists
      const existingEmail = await prisma.email.findUnique({
        where: { gmailId: messageId },
      });

      if (existingEmail) {
        console.log('ℹ️  Email already exists in database, skipping');
        return existingEmail;
      }

      // Parse email headers
      const headers = emailData.payload?.headers || [];
      const subject = headers.find(h => h.name?.toLowerCase() === 'subject')?.value || '(No Subject)';
      const from = headers.find(h => h.name?.toLowerCase() === 'from')?.value || '';
      const to = headers.find(h => h.name?.toLowerCase() === 'to')?.value || '';
      const date = headers.find(h => h.name?.toLowerCase() === 'date')?.value || '';

      // Parse email body
      const body = this.parseEmailBody(emailData.payload);
      const snippet = emailData.snippet || '';

      // Get thread ID
      const threadId = emailData.threadId || '';

      // Parse date
      const receivedAt = date ? new Date(date) : new Date();

      // Check if email is unread
      const isRead = !emailData.labelIds?.includes('UNREAD');

      console.log('📧 Email details:');
      console.log('  Subject:', subject.substring(0, 50) + '...');
      console.log('  From:', from);
      console.log('  Date:', receivedAt);

      // Save to database
// Save to database
// 🤖 Analyze email with AI
let aiAnalysis = null;
try {
  aiAnalysis = await aiService.analyzeEmail({
    subject,
    from,
    body,
  });
} catch (error: any) {
  console.error('⚠️ AI analysis failed, continuing without AI:', error.message);
}

// Save to database
const savedEmail = await prisma.email.create({
  data: {
    userId: userId,
    gmailId: messageId,
    threadId: threadId,
    subject: subject,
    from: from,
    to: to.split(',').map(t => t.trim()),
    body: body,
    snippet: snippet,
    receivedAt: receivedAt,
    isRead: isRead,
    // ← Add AI fields
    aiSummary: aiAnalysis?.summary || null,
    aiCategory: aiAnalysis?.category || null,
    aiPriority: aiAnalysis?.priority || null,
    aiSentiment: aiAnalysis?.sentiment || null,
    aiActionItems: aiAnalysis?.actionItems || [],
    aiSuggestedReplies: aiAnalysis?.suggestedReplies || [],
    aiAnalyzedAt: aiAnalysis ? new Date() : null,
  },
});

if (aiAnalysis) {
  console.log('🤖 AI Analysis saved to database');
}

      console.log('✅ Email saved to database!');
      console.log('🆔 Email ID:', savedEmail.id);

      return savedEmail;

    } catch (error: any) {
      console.error('❌ Error fetching/saving email:', error.message);
      throw error;
    }
  }

  // Parse email body from payload
  private parseEmailBody(payload: any): string {
    let body = '';

    if (payload.body && payload.body.data) {
      // Body is in the payload
      body = Buffer.from(payload.body.data, 'base64').toString('utf-8');
    } else if (payload.parts) {
      // Body is in parts (multipart email)
      for (const part of payload.parts) {
        if (part.mimeType === 'text/plain' && part.body?.data) {
          body += Buffer.from(part.body.data, 'base64').toString('utf-8');
        } else if (part.mimeType === 'text/html' && part.body?.data && !body) {
          // Use HTML if no plain text found
          body = Buffer.from(part.body.data, 'base64').toString('utf-8');
        } else if (part.parts) {
          // Recursive for nested parts
          body += this.parseEmailBody(part);
        }
      }
    }

    return body || '(No content)';
  }
}

export const emailService = new EmailService();
import { google } from 'googleapis';
import { prisma } from '../config/database.config';

export class GmailService {
  
  // Start watching a user's Gmail for changes
  async startWatch(userId: string, accessToken: string, refreshToken: string) {
    try {
      // Set up OAuth client with user's tokens
      const oauth2Client = new google.auth.OAuth2(
        process.env.GOOGLE_CLIENT_ID,
        process.env.GOOGLE_CLIENT_SECRET,
        process.env.GOOGLE_REDIRECT_URI
      );

      oauth2Client.setCredentials({
        access_token: accessToken,
        refresh_token: refreshToken,
      });

      // Create Gmail API client
      const gmail = google.gmail({ version: 'v1', auth: oauth2Client });

      // Start watching for changes
      const watchResponse = await gmail.users.watch({
        userId: 'me',
        requestBody: {
          topicName: `projects/${process.env.GOOGLE_PROJECT_ID}/topics/${process.env.PUBSUB_TOPIC_NAME}`,
          labelIds: ['INBOX'], // Only watch inbox (you can change this)
        },
      });

      console.log('✅ Gmail watch started!');
      console.log('📬 Watching inbox for user:', userId);
      console.log('⏰ Watch expires:', new Date(parseInt(watchResponse.data.expiration!)));
      console.log('🆔 History ID:', watchResponse.data.historyId);

      // Save watch info to database
      await prisma.user.update({
        where: { id: userId },
        data: {
          watchExpiration: new Date(parseInt(watchResponse.data.expiration!)),
          historyId: watchResponse.data.historyId,
        },
      });

      return {
        expiration: watchResponse.data.expiration,
        historyId: watchResponse.data.historyId,
      };

    } catch (error: any) {
      console.error('❌ Failed to start Gmail watch:', error.message);
      throw error;
    }
  }

  // Get Gmail profile
  async getProfile(accessToken: string, refreshToken: string) {
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
    const profile = await gmail.users.getProfile({ userId: 'me' });

    return profile.data;
  }
}

export const gmailService = new GmailService();
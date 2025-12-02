import { Router, Request, Response } from 'express';
import { prisma } from '../config/database.config';
import { emailService } from '../services/email.service';  // ← Added

const router = Router();

// Webhook endpoint to receive Gmail notifications
router.post('/gmail', async (req: Request, res: Response) => {
  try {
    console.log('\n🔔 Webhook notification received!');
    console.log('📦 Raw body:', JSON.stringify(req.body, null, 2));

    // 1. Parse Pub/Sub message
    const pubsubMessage = req.body.message;

    if (!pubsubMessage || !pubsubMessage.data) {
      console.error('❌ Invalid Pub/Sub message format');
      return res.status(400).send('Invalid message format');
    }

    // 2. Decode base64 data
    const decodedData = Buffer.from(pubsubMessage.data, 'base64').toString('utf-8');
    console.log('📄 Decoded data:', decodedData);

    // 3. Parse JSON
    const notification = JSON.parse(decodedData);
    const { emailAddress, historyId } = notification;

    console.log('📧 Email Address:', emailAddress);
    console.log('🆔 History ID:', historyId);

    // 4. Find user in database
    const user = await prisma.user.findUnique({
      where: { email: emailAddress },
    });

    if (!user) {
      console.error('❌ User not found in database:', emailAddress);
      return res.status(404).send('User not found');
    }

    console.log('✅ User found:', user.email);
    console.log('📊 Previous History ID:', user.historyId);
    console.log('📊 New History ID:', historyId);

    // 5. Check if this is a new notification
    if (user.historyId === historyId) {
      console.log('ℹ️  Duplicate notification (same historyId), ignoring');
      return res.status(200).send('OK - Duplicate');
    }

    // 6. Acknowledge receipt to Pub/Sub FIRST (important!)
    res.status(200).send('OK');

    // 7. Fetch emails asynchronously (don't block the response)
    (async () => {
      try {
        if (user.historyId) {
          console.log('🔍 Fetching new emails...');
          
          const emails = await emailService.fetchEmailsByHistory(
            user.id,
            user.accessToken,
            user.refreshToken,
            user.historyId
          );

          console.log(`✅ Fetched and saved ${emails.length} emails`);
        } else {
          console.log('ℹ️  No previous historyId, skipping email fetch');
        }

        // Update historyId in database
        await prisma.user.update({
          where: { id: user.id },
          data: { historyId: historyId.toString() },
        });

        console.log('✅ History ID updated in database');
        console.log('🎉 Notification processed successfully!\n');

      } catch (error: any) {
        console.error('❌ Error processing emails:', error.message);
      }
    })();

  } catch (error: any) {
    console.error('❌ Webhook error:', error.message);
    console.error('Stack:', error.stack);
    
    // Still return 200 to prevent Pub/Sub from retrying
    res.status(200).send('Error processed');
  }
});

// Health check endpoint
router.get('/health', (req: Request, res: Response) => {
  res.status(200).json({ status: 'ok', timestamp: new Date().toISOString() });
});

export default router;
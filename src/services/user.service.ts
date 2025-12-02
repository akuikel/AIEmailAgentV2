import { prisma } from '../config/database.config';

interface UserTokens {
  accessToken: string;
  refreshToken?: string | null;
  expiryDate?: number | null;
}

interface UserProfile {
  googleId: string;
  email: string;
  name?: string;  // ← Added this
}

export class UserService {
  
  // Find or create user
  async findOrCreateUser(profile: UserProfile, tokens: UserTokens) {
    const existingUser = await prisma.user.findUnique({
      where: { googleId: profile.googleId },
    });

    if (existingUser) {
      // User exists, update tokens
      console.log('📝 Updating existing user:', profile.email);
      return await prisma.user.update({
        where: { googleId: profile.googleId },
        data: {
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken || existingUser.refreshToken,
          tokenExpiry: tokens.expiryDate ? new Date(tokens.expiryDate) : null,
        },
      });
    } else {
      // New user, create
      console.log('✨ Creating new user:', profile.email);
      return await prisma.user.create({
        data: {
          email: profile.email,
          googleId: profile.googleId,
          accessToken: tokens.accessToken,
          refreshToken: tokens.refreshToken || '',
          tokenExpiry: tokens.expiryDate ? new Date(tokens.expiryDate) : null,
        },
      });
    }
  }

  // Get user by Google ID
  async getUserByGoogleId(googleId: string) {
    return await prisma.user.findUnique({
      where: { googleId },
    });
  }

  // Get user by email
  async getUserByEmail(email: string) {
    return await prisma.user.findUnique({
      where: { email },
    });
  }

  // Update user tokens
  async updateUserTokens(googleId: string, tokens: UserTokens) {
    return await prisma.user.update({
      where: { googleId },
      data: {
        accessToken: tokens.accessToken,
        refreshToken: tokens.refreshToken ?? undefined,
        tokenExpiry: tokens.expiryDate ? new Date(tokens.expiryDate) : null,
      },
    });
  }
}

export const userService = new UserService();
import { NextAuthOptions } from 'next-auth';
import GoogleProvider from 'next-auth/providers/google';
import dbConnect from '@/lib/mongodb';
import User from '@/lib/models/User';

export const authOptions: NextAuthOptions = {
  providers: [
    GoogleProvider({
      clientId: process.env.GOOGLE_CLIENT_ID || '',
      clientSecret: process.env.GOOGLE_CLIENT_SECRET || '',
    }),
  ],
  secret: process.env.NEXTAUTH_SECRET || 'sattebaazi-secret-key-32-chars-long-random-string',
  callbacks: {
    async signIn({ user, account, profile }) {
      if (account?.provider === 'google' && user.email) {
        try {
          await dbConnect();
          await User.findOneAndUpdate(
            { email: user.email },
            {
              email: user.email,
              name: user.name || profile?.name,
              image: user.image || (profile as any)?.picture,
              googleId: account.providerAccountId,
              lastLogin: new Date(),
            },
            { upsert: true, new: true }
          );
        } catch (err) {
          console.error('Error saving user to DB:', err);
        }
      }
      return true;
    },
    async session({ session, token }) {
      if (session?.user) {
        (session.user as any).id = token.sub;
      }
      return session;
    },
    async jwt({ token, user }) {
      if (user) {
        token.id = user.id;
      }
      return token;
    },
  },
  session: {
    strategy: 'jwt',
  },
};


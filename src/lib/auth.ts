/**
 * NextAuth configuration.
 *
 * Strategy: JWT (stateless). The token carries:
 *   - id         – user's DB id
 *   - email
 *   - name
 *   - role       – Role enum value
 *   - restaurantId – tenant discriminator
 *
 * This means every API call can resolve the tenant without
 * an extra DB round-trip.
 */

import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import GoogleProvider from "next-auth/providers/google";
import { compare } from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { googleClientId, googleClientSecret, googleOAuthConfigured } from "@/services/google/googleFlag";

/**
 * "Login com Google" gate. Google authenticates the email; we only allow it for
 * an email that maps to EXACTLY ONE active Foocci user (so the tenant is
 * unambiguous). Zero matches = not provisioned; multiple = same email across
 * restaurants → must use email/senha. Returns the resolved user or null.
 */
async function resolveGoogleUser(email: string | null | undefined) {
  if (!email) return null;
  const matches = await prisma.user.findMany({
    where: { email: { equals: email, mode: "insensitive" }, isActive: true },
    select: { id: true, role: true, restaurantId: true },
  });
  return matches.length === 1 ? matches[0]! : null;
}

// Build the provider list: credentials always, Google only when creds are set
// (so the app never crashes / shows a broken button when Google isn't configured).
const providers: NextAuthOptions["providers"] = [
  CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
        restaurantSlug: { label: "Restaurant Slug", type: "text" },
      },

      async authorize(credentials) {
        if (
          !credentials?.email ||
          !credentials?.password ||
          !credentials?.restaurantSlug
        ) {
          throw new Error("Missing credentials");
        }

        // Resolve tenant first so we scope the user lookup correctly
        const restaurant = await prisma.restaurant.findUnique({
          where: { slug: credentials.restaurantSlug, isActive: true },
          select: { id: true, isActive: true },
        });

        if (!restaurant) {
          throw new Error("Restaurant not found");
        }

        const user = await prisma.user.findUnique({
          where: {
            email_restaurantId: {
              email: credentials.email,
              restaurantId: restaurant.id,
            },
          },
          select: {
            id: true,
            name: true,
            email: true,
            password: true,
            role: true,
            isActive: true,
            restaurantId: true,
          },
        });

        if (!user || !user.isActive) {
          throw new Error("Invalid credentials");
        }

        const isValid = await compare(credentials.password, user.password);
        if (!isValid) {
          throw new Error("Invalid credentials");
        }

        return {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          restaurantId: user.restaurantId,
        };
      },
  }),
];

if (googleOAuthConfigured()) {
  providers.push(
    GoogleProvider({
      clientId: googleClientId()!,
      clientSecret: googleClientSecret()!,
      authorization: { params: { prompt: "select_account" } },
    }),
  );
}

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  pages: {
    signIn: "/login",
    error: "/login",
  },

  providers,

  callbacks: {
    // Gate Google sign-in: only emails mapping to exactly one active user.
    async signIn({ user, account }) {
      if (account?.provider === "google") {
        const resolved = await resolveGoogleUser(user.email);
        return resolved !== null;
      }
      return true; // credentials handled in authorize()
    },

    async jwt({ token, user, account }) {
      // Credentials sign-in: `user` carries our DB fields from authorize().
      if (user && account?.provider !== "google") {
        token.id = user.id;
        token.role = user.role;
        token.restaurantId = user.restaurantId;
      }
      // Google sign-in: resolve our DB user by the verified Google email.
      if (account?.provider === "google") {
        const resolved = await resolveGoogleUser(user?.email ?? token.email);
        if (resolved) {
          token.id = resolved.id;
          token.role = resolved.role;
          token.restaurantId = resolved.restaurantId;
        }
      }
      return token;
    },

    async session({ session, token }) {
      if (session.user) {
        session.user.id = token.id as string;
        session.user.role = token.role as string;
        session.user.restaurantId = token.restaurantId as string;
      }
      return session;
    },
  },
};

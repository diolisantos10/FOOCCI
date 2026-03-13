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
import { compare } from "bcryptjs";
import { prisma } from "@/lib/prisma";

export const authOptions: NextAuthOptions = {
  session: {
    strategy: "jwt",
    maxAge: 30 * 24 * 60 * 60, // 30 days
  },

  pages: {
    signIn: "/login",
    error: "/login",
  },

  providers: [
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
  ],

  callbacks: {
    async jwt({ token, user }) {
      // On initial sign-in `user` is populated from authorize()
      if (user) {
        token.id = user.id;
        token.role = user.role;
        token.restaurantId = user.restaurantId;
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

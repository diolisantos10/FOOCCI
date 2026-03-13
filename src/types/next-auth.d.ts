/**
 * NextAuth module augmentation.
 *
 * Adds `id`, `role`, and `restaurantId` to the Session and JWT types
 * so TypeScript knows about our custom fields without casting.
 */

import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      name?: string | null;
      email?: string | null;
      image?: string | null;
      role: string;
      restaurantId: string;
    };
  }

  interface User {
    id: string;
    role: string;
    restaurantId: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id: string;
    role: string;
    restaurantId: string;
  }
}

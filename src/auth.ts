import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { getDb } from "@/lib/db";
import { isRole, type Role } from "@/lib/roles";

interface AppUserRow {
  id: string;
  email: string;
  name: string;
  role: string;
  password_hash: string;
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials) {
        const email = credentials?.email;
        const password = credentials?.password;
        if (typeof email !== "string" || typeof password !== "string") return null;

        const db = getDb();
        const row = db
          .prepare("SELECT id, email, name, role, password_hash FROM app_users WHERE email = ?")
          .get(email.trim().toLowerCase()) as AppUserRow | undefined;
        if (!row) return null;

        const valid = await bcrypt.compare(password, row.password_hash);
        if (!valid) return null;
        if (!isRole(row.role)) return null;

        return { id: row.id, email: row.email, name: row.name, role: row.role };
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user && "role" in user && isRole(user.role)) {
        token.role = user.role;
      }
      return token;
    },
    async session({ session, token }) {
      if (session.user && isRole(token.role)) {
        session.user.role = token.role as Role;
      }
      return session;
    },
  },
});

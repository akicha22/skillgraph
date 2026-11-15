import bcrypt from "bcryptjs";

const ROUNDS = 12;

export function hashPassword(plain: string): Promise<string> {
  return bcrypt.hash(plain, ROUNDS);
}

export function verifyPassword(plain: string, hash: string): Promise<boolean> {
  return bcrypt.compare(plain, hash);
}

// Compared against when the email doesn't exist, so response time doesn't reveal it.
export const DUMMY_HASH = bcrypt.hashSync("not-a-real-password", ROUNDS);
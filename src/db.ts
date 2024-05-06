import { Database } from "bun:sqlite";
import { TimeSpan, createDate, isWithinExpirationDate } from "oslo";
import { generateIdFromEntropySize } from "lucia";
import { lucia } from "./auth";
import list from "./list";

export const db = new Database("auth-static-site");

db.exec(`CREATE TABLE IF NOT EXISTS user (
    id TEXT NOT NULL PRIMARY KEY,
    username TEXT NOT NULL UNIQUE,
    email TEXT NOT NULL
  )`);

db.exec(`CREATE TABLE IF NOT EXISTS session (
    id TEXT NOT NULL PRIMARY KEY,
    expires_at TEXT NOT NULL,
    user_id TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES user(id)
)`);

db.exec(`CREATE TABLE IF NOT EXISTS email_verification_token (
  id TEXT NOT NULL PRIMARY KEY,
  expires_at INTEGER NOT NULL,
  user_id TEXT NOT NULL,
  email TEXT NOT NULL,
  FOREIGN KEY (user_id) REFERENCES user(id)
)`);

// update user database
list.forEach(async ([username, email]) => {
  const id = username;

  const stmt = db.query("SELECT * FROM user WHERE id = ?");
  const userItem = stmt.get(id) as UserDatabase | null;

  if (!userItem) {
    await db.run(
      "INSERT INTO user (id, username, email) VALUES (?, ?, ?)",
      [id, username, email]
    );
  }
});

export type EmailDatabase = {
  id: string
  expires_at: string
  user_id: string
  email: string
}

export type UserDatabase = {
  id: string
  username: string
  email: string
}

export async function createEmailVerificationToken(userId: string, email: string): Promise<string> {
  // delete existing token
  db.run(`DELETE FROM email_verification_token WHERE user_id = ?`, [userId]);

  const tokenId = generateIdFromEntropySize(25);

  // update token，only 5 min
  await db.run(
    `INSERT INTO email_verification_token (id, user_id, email, expires_at) VALUES (?, ?, ?, ?)`,
    [tokenId, userId, email, createDate(new TimeSpan(5, "m")).toISOString()]
  );

  return tokenId;
}

export async function verificationToken(verificationTokenId: string) {
  const result = await db.transaction(async () => {
    // query token
    const stmt = db.query("SELECT * FROM email_verification_token WHERE id = ?");
    const emailItem = stmt.get(verificationTokenId) as EmailDatabase | null

    if (emailItem) {
      // if get token，delete it
      await db.run("DELETE FROM email_verification_token WHERE id = ?", [emailItem.id]);
    }

    // token existing
    if (!emailItem || !isWithinExpirationDate(new Date(emailItem.expires_at))) {
      return 'token does not exist or expires'
    }

    // verify whether the token matches the user
    const stmt2 = db.query("SELECT * FROM user WHERE id = ?");
    const userItem = stmt2.get(emailItem.user_id) as UserDatabase | null

    if (!userItem || userItem.email !== emailItem.email) {
      return 'user does not exist or token does not match'
    }

    // invalid user's token
    await lucia.invalidateUserSessions(userItem.id);

    // create new token
    const session = await lucia.createSession(userItem.id, {});
    const sessionCookie = lucia.createSessionCookie(session.id);

    return new Response(null, {
      status: 302,
      headers: {
        Location: "/",
        "Set-Cookie": sessionCookie.serialize(),
        "Referrer-Policy": "no-referrer"
      }
    });
  });

  return result
}

import { Elysia } from 'elysia'
import { lucia } from "./auth";
import sendMessage from './email'
import { UserDatabase, createEmailVerificationToken, db, verificationToken } from "./db.js";
import { staticPlugin } from '@elysiajs/static'

const staticFile = new Elysia()
  .use(staticPlugin({
    assets: Bun.env.staticAssets,
    prefix: '',
  }))
  .listen(6000)

const authPlugin = new Elysia()
  .decorate('staticFile', staticFile)
  .get('/email-verification/:token', ({ params: { token } }) => {
    console.log({ token })

    // auth token
    return verificationToken(token)
  })
  .get('/api/login', async ({ query, set }) => {
    const { user } = query

    if (!user) {
      return 'please input a valid username'
    }

    const stmt = db.query("SELECT * FROM user WHERE id = ?");
    const userItem = stmt.get(user) as UserDatabase | null;

    if (userItem) {
      const { username, email } = userItem
      try {
        const address = await createEmailVerificationAddress(username, email)
        await sendMessage(email, address)
      } catch (error) {
        console.error(error)

        return 'An error occurred, please contact the admin'
      }

      return 'The login link has been released, please check your email!'
    }

    return `User ${user} does not exist, please contact the admin`
  })
  .get('/favicon.ico', () => {
    return Bun.file('./build/img/favicon.ico')
  })
  .get('/login', () => Bun.file('./src/login.html'), {
    async beforeHandle({ set, cookie: { auth_session } }) {
      const { session, user } = await lucia.validateSession(auth_session.value ?? "");

      if (session && session.fresh) {
        set.headers['Set-Cookie'] = lucia.createSessionCookie(session.id).serialize()
      }

      if (session) {
        set.redirect = '/'
      }
    }
  })
  .get('/*', async (req) => {
    if (!req.set.redirect) {

      // auth pass
      const url = 'localhost:6000' + req.path
      return fetch(url)
    }
  }, {
    async beforeHandle({ set, cookie: { auth_session } }) {
      const { session, user } = await lucia.validateSession(auth_session.value ?? "");

      if (session && session.fresh) {
        set.headers['Set-Cookie'] = lucia.createSessionCookie(session.id).serialize()
      }

      if (!session) {
        set.headers['Set-Cookie'] = lucia.createBlankSessionCookie().serialize()

        set.redirect = '/login'
      }
    }
  })

const app = new Elysia()
  .use(authPlugin)
  .listen(4000)

const origin = Bun.env.origin

async function createEmailVerificationAddress(user: string, email: string) {
  const token = await createEmailVerificationToken(user, email)

  return `${origin}/email-verification/${token}`
}

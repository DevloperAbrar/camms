const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { prisma } = require('./db');
const env = require('./env');

async function verifyStaffGoogle(accessToken, refreshToken, profile, done) {
  try {
    const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
    if (!email) return done(null, false, { message: 'No email found on Google profile' });

    const user = await prisma.user.findUnique({ where: { email } });

    if (!user) return done(null, false, { message: 'This email is not registered with any school' });
    if (user.status !== 'active') return done(null, false, { message: 'This account has been deactivated' });

    if (!user.googleId) {
      await prisma.user.update({ where: { id: user.id }, data: { googleId: profile.id } });
    }

    return done(null, user);
  } catch (err) {
    return done(err, null);
  }
}

// Admin's own callback URL
passport.use(
  'google-admin',
  new GoogleStrategy(
    {
      clientID: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      callbackURL: env.GOOGLE_CALLBACK_URL_ADMIN,
    },
    verifyStaffGoogle
  )
);

// Faculty's own callback URL
passport.use(
  'google-faculty',
  new GoogleStrategy(
    {
      clientID: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      callbackURL: env.GOOGLE_CALLBACK_URL_FACULTY,
    },
    verifyStaffGoogle
  )
);

// Parent's own callback URL
passport.use(
  'google-parent',
  new GoogleStrategy(
    {
      clientID: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      callbackURL: env.GOOGLE_CALLBACK_URL_PARENT,
    },
    async (accessToken, refreshToken, profile, done) => {
      try {
        const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
        if (!email) return done(null, false, { message: 'No email found on Google profile' });

        const children = await prisma.student.findMany({
          where: { parentEmail: email, status: 'active' },
          select: { id: true, name: true, schoolId: true, enrollmentNumber: true },
        });

        if (children.length === 0) {
          return done(null, false, { message: 'No student record found for this email. Contact your school.' });
        }

        return done(null, { parentEmail: email, children });
      } catch (err) {
        return done(err, null);
      }
    }
  )
);

module.exports = passport;
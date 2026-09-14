const passport = require('passport');
const GoogleStrategy = require('passport-google-oauth20').Strategy;
const { prisma } = require('./db');
const env = require('./env');
const constants = require('./constants');

async function verifySchoolGoogle(accessToken, refreshToken, profile, done) {
  try {
    const email = profile.emails && profile.emails[0] ? profile.emails[0].value : null;
    if (!email) return done(null, false, { message: 'No email found on Google profile' });

    const user = await prisma.user.findUnique({ where: { email } });
    if (user) {
      if (![constants.ROLES.ADMIN, constants.ROLES.FACULTY].includes(user.role)) {
        return done(null, false, { message: 'This account type cannot sign in here' });
      }
      if (user.status !== 'active') {
        return done(null, false, { message: 'This account has been deactivated' });
      }
      if (!user.googleId) {
        await prisma.user.update({ where: { id: user.id }, data: { googleId: profile.id } });
      }
      return done(null, { type: 'staff', user });
    }

    const children = await prisma.student.findMany({
      where: { parentEmail: email, status: 'active' },
      select: { id: true, name: true, schoolId: true, enrollmentNumber: true },
    });
    if (children.length > 0) {
      return done(null, { type: 'parent', parentEmail: email, children });
    }

    return done(null, false, { message: 'This email is not registered with any school' });
  } catch (err) {
    return done(err, null);
  }
}

passport.use(
  'google-school',
  new GoogleStrategy(
    {
      clientID: env.GOOGLE_CLIENT_ID,
      clientSecret: env.GOOGLE_CLIENT_SECRET,
      callbackURL: env.GOOGLE_CALLBACK_URL_SCHOOL,
    },
    verifySchoolGoogle
  )
);

module.exports = passport;
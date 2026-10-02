const bcrypt = require('bcryptjs');
const passport = require('passport');
const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/apiResponse');
const { signToken } = require('../../utils/jwt');
const { prisma } = require('../../config/db');
const { facultyPasswordLoginSchema } = require('../../validators/auth.validator');
const env = require('../../config/env');
const constants = require('../../config/constants');

function issueSessionCookie(res, payload) {
  const token = signToken(payload);
  res.cookie(constants.COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });
}

// ?as=parent lets someone whose email is both a staff login and a parent email choose to sign in as the parent.
// It travels through Google as the OAuth "state" and comes back on the callback.
const googleLogin = (req, res, next) =>
  passport.authenticate('google-school', {
    scope: ['profile', 'email'],
    session: false,
    state: req.query.as === 'parent' ? 'parent' : 'staff',
  })(req, res, next);

const googleCallback = [
  passport.authenticate('google-school', { session: false, failureRedirect: `${env.CLIENT_URL}/login?error=google_failed` }),
  asyncHandler(async (req, res) => {
    const result = req.user;
    const wantsParent = req.query.state === 'parent';

    if (result.type === 'staff') {
      const { user } = result;

      if (wantsParent) {
        const children = await prisma.student.findMany({
          where: { parentEmail: { equals: user.email, mode: 'insensitive' }, status: 'active' },
          select: { id: true },
        });
        if (children.length === 0) {
          return res.redirect(`${env.CLIENT_URL}/login?error=no_children`);
        }
        issueSessionCookie(res, {
          id: user.email,
          role: 'parent',
          parentEmail: user.email,
          children: children.map((c) => c.id),
        });
        return res.redirect(`${env.CLIENT_URL}/auth/callback`);
      }

      await prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });
      issueSessionCookie(res, { id: user.id, role: user.role, schoolId: user.schoolId });
      return res.redirect(`${env.CLIENT_URL}/auth/callback`);
    }

    const { parentEmail, children } = result;
    issueSessionCookie(res, {
      id: parentEmail,
      role: 'parent',
      parentEmail,
      children: children.map((c) => c.id),
    });
    return res.redirect(`${env.CLIENT_URL}/auth/callback`);
  }),
];

const passwordLogin = asyncHandler(async (req, res) => {
  const { email, password } = facultyPasswordLoginSchema.parse(req.body);

  const user = await prisma.user.findUnique({ where: { email } });

  if (!user || !user.passwordHash) {
    return ApiResponse.error(res, 401, 'Invalid credentials');
  }
  if (![constants.ROLES.ADMIN, constants.ROLES.FEE_COLLECTOR].includes(user.role)) {
    return ApiResponse.error(res, 403, 'This login is for school admin and fee collector accounts only');
  }
  if (user.status !== 'active') {
    return ApiResponse.error(res, 403, 'This account has been deactivated');
  }

  const isMatch = await bcrypt.compare(password, user.passwordHash);
  if (!isMatch) return ApiResponse.error(res, 401, 'Invalid credentials');

  await prisma.user.update({ where: { id: user.id }, data: { lastLogin: new Date() } });

  issueSessionCookie(res, { id: user.id, role: user.role, schoolId: user.schoolId });

  return ApiResponse.success(res, 200, 'Logged in successfully', {
    id: user.id,
    name: user.name,
    email: user.email,
    role: user.role,
    schoolId: user.schoolId,
  });
});

const logout = asyncHandler(async (req, res) => {
  res.clearCookie(constants.COOKIE_NAME);
  return ApiResponse.success(res, 200, 'Logged out successfully');
});

module.exports = { googleLogin, googleCallback, passwordLogin, logout };
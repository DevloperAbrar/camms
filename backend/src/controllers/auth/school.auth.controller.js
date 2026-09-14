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

const googleLogin = passport.authenticate('google-school', { scope: ['profile', 'email'], session: false });

const googleCallback = [
  passport.authenticate('google-school', { session: false, failureRedirect: `${env.CLIENT_URL}/login?error=google_failed` }),
  asyncHandler(async (req, res) => {
    const result = req.user;

    if (result.type === 'staff') {
      const { user } = result;
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
  if (user.role !== constants.ROLES.ADMIN) {
    return ApiResponse.error(res, 403, 'This login is for school admin accounts only');
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
    role: user.role,
    schoolId: user.schoolId,
  });
});

const logout = asyncHandler(async (req, res) => {
  res.clearCookie(constants.COOKIE_NAME);
  return ApiResponse.success(res, 200, 'Logged out successfully');
});

module.exports = { googleLogin, googleCallback, passwordLogin, logout };
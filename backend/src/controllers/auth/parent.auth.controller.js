const passport = require('passport');
const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/apiResponse');
const { signToken } = require('../../utils/jwt');
const env = require('../../config/env');
const constants = require('../../config/constants');

const googleLogin = passport.authenticate('google-parent', { scope: ['profile', 'email'], session: false });

const googleCallback = [
  passport.authenticate('google-parent', { session: false, failureRedirect: `${env.CLIENT_URL}/login?error=no_student_found` }),
  asyncHandler(async (req, res) => {
    const { parentEmail, children } = req.user;

    const token = signToken({
      id: parentEmail,
      role: 'parent',
      parentEmail,
      children: children.map((c) => c.id),
    });

    res.cookie(constants.COOKIE_NAME, token, {
      httpOnly: true,
      secure: env.NODE_ENV === 'production',
      sameSite: 'strict',
      maxAge: 7 * 24 * 60 * 60 * 1000,
    });

    return res.redirect(`${env.CLIENT_URL}/auth/callback`);
  }),
];

const logout = asyncHandler(async (req, res) => {
  res.clearCookie(constants.COOKIE_NAME);
  return ApiResponse.success(res, 200, 'Logged out successfully');
});

module.exports = { googleLogin, googleCallback, logout };
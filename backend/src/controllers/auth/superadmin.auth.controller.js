const bcrypt = require('bcryptjs');
const asyncHandler = require('../../utils/asyncHandler');
const ApiResponse = require('../../utils/apiResponse');
const { signToken } = require('../../utils/jwt');
const { superAdminLoginSchema } = require('../../validators/auth.validator');
const env = require('../../config/env');
const constants = require('../../config/constants');

const login = asyncHandler(async (req, res) => {
  const { email, password } = superAdminLoginSchema.parse(req.body);

  if (email !== env.SUPERADMIN_EMAIL) {
    return ApiResponse.error(res, 401, 'Invalid credentials');
  }

  const isMatch = await bcrypt.compare(password, env.SUPERADMIN_PASSWORD_HASH);

  if (!isMatch) {
    return ApiResponse.error(res, 401, 'Invalid credentials');
  }

  const token = signToken({ id: 'superadmin', role: constants.ROLES.SUPERADMIN });

  res.cookie(constants.COOKIE_NAME, token, {
    httpOnly: true,
    secure: env.NODE_ENV === 'production',
    sameSite: 'strict',
    maxAge: 7 * 24 * 60 * 60 * 1000,
  });

  return ApiResponse.success(res, 200, 'Logged in successfully', {
    role: constants.ROLES.SUPERADMIN,
    email,
  });
});

const logout = asyncHandler(async (req, res) => {
  res.clearCookie(constants.COOKIE_NAME);
  return ApiResponse.success(res, 200, 'Logged out successfully');
});

module.exports = { login, logout };
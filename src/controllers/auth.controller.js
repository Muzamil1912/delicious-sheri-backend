const bcrypt = require('bcryptjs');
const { z } = require('zod');
const prisma = require('../utils/db');
const { signToken } = require('../utils/jwt');

const signupSchema = z.object({
  name: z.string().min(2),
  email: z.string().email(),
  password: z.string().min(6),
  phone: z.string().optional(),
});

async function signup(req, res, next) {
  try {
    const data = signupSchema.parse(req.body);
    const existing = await prisma.user.findUnique({ where: { email: data.email } });
    if (existing) return res.status(409).json({ error: 'An account with this email already exists.' });

    const hashed = await bcrypt.hash(data.password, 12);
    const user = await prisma.user.create({
      data: { name: data.name, email: data.email, password: hashed, phone: data.phone },
    });

    const token = signToken({ id: user.id, email: user.email, role: 'customer' });
    res.cookie('ds_token', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
    res.status(201).json({ user: { id: user.id, name: user.name, email: user.email }, token });
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors[0].message });
    next(err);
  }
}

const loginSchema = z.object({ email: z.string().email(), password: z.string() });

async function login(req, res, next) {
  try {
    const data = loginSchema.parse(req.body);
    const user = await prisma.user.findUnique({ where: { email: data.email } });
    if (!user) return res.status(401).json({ error: 'Invalid email or password.' });

    const match = await bcrypt.compare(data.password, user.password);
    if (!match) return res.status(401).json({ error: 'Invalid email or password.' });

    const token = signToken({ id: user.id, email: user.email, role: 'customer' });
    res.cookie('ds_token', token, { httpOnly: true, sameSite: 'lax', secure: process.env.NODE_ENV === 'production' });
    res.json({ user: { id: user.id, name: user.name, email: user.email }, token });
  } catch (err) {
    if (err.name === 'ZodError') return res.status(400).json({ error: err.errors[0].message });
    next(err);
  }
}

async function me(req, res) {
  if (!req.user) return res.status(401).json({ error: 'Not logged in.' });
  const user = await prisma.user.findUnique({
    where: { id: req.user.id },
    select: { id: true, name: true, email: true, phone: true, address: true, city: true },
  });
  res.json({ user });
}

function logout(req, res) {
  res.clearCookie('ds_token');
  res.json({ ok: true });
}

// AliExpress Authentication Functions
function aliexpressAuth(req, res) {
  const appKey = process.env.ALIEXPRESS_APP_KEY;
  const redirectUri = process.env.ALIEXPRESS_CALLBACK_URL || 'http://localhost:3000/api/auth/aliexpress/callback';
  const authUrl = `https://oauth.aliexpress.com/authorize?response_type=code&app_key=${appKey}&redirect_uri=${encodeURIComponent(redirectUri)}`;
  res.redirect(authUrl);
}

async function aliexpressCallback(req, res, next) {
  try {
    const { code } = req.query;
    if (!code) {
      return res.status(400).json({ error: 'Authorization code not provided by AliExpress.' });
    }
    res.json({ message: 'AliExpress callback received successfully', code });
  } catch (err) {
    next(err);
  }
}

module.exports = { signup, login, me, logout, aliexpressAuth, aliexpressCallback };
// Explicit administrator provisioning; never uses demo passwords or replaces accounts.
require('dotenv').config();
require('./prepare-schema')();
const bcrypt = require('bcryptjs');
const prisma = require('../src/db');
async function main() {
  const name = process.env.ADMIN_NAME?.trim(), email = process.env.ADMIN_EMAIL?.trim().toLowerCase(), password = process.env.ADMIN_PASSWORD;
  if (!name || !email || !password || password.length < 12 || Buffer.byteLength(password) > 72 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) throw new Error('Provide ADMIN_NAME, ADMIN_EMAIL and ADMIN_PASSWORD (12+ characters, at most 72 UTF-8 bytes) through environment variables');
  if (await prisma.user.findUnique({ where: { email } })) throw new Error('Account already exists; this command will not overwrite or elevate it');
  await prisma.user.create({ data: { name: name.slice(0,100), email, passwordHash: await bcrypt.hash(password,12), role: 'ADMIN', trusted: true } });
  console.log('Administrator created. Remove the provisioning variables from your environment.');
}
main().catch(error => { console.error(error.message); process.exitCode = 1; }).finally(() => prisma.$disconnect());

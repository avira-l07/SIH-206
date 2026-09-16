const fs = require('fs');
const path = require('path');

function prepareSchema() {
  const schemaPath = path.join(__dirname, '../prisma/schema.prisma');
  if (!fs.existsSync(schemaPath)) {
    console.warn('[prepare-schema] schema.prisma not found at:', schemaPath);
    return;
  }

  // 1. Read DATABASE_URL from process.env, or parse from .env if missing
  let dbUrl = (process.env.DATABASE_URL || '').trim();
  if (!dbUrl) {
    const envPath = path.join(__dirname, '../.env');
    if (fs.existsSync(envPath)) {
      try {
        const envContent = fs.readFileSync(envPath, 'utf8');
        const match = envContent.match(/^DATABASE_URL\s*=\s*["']?([^"'\r\n]+)["']?/m);
        if (match && match[1]) {
          dbUrl = match[1].trim();
        }
      } catch (e) {
        // ignore error reading .env
      }
    }
  }

  // 2. Determine target provider
  const isPostgres = dbUrl.startsWith('postgres://') || dbUrl.startsWith('postgresql://');
  const targetProvider = isPostgres ? 'postgresql' : 'sqlite';

  // If SQLite, guarantee file: protocol prefix
  if (!isPostgres) {
    if (!dbUrl) {
      dbUrl = 'file:./dev.db';
      process.env.DATABASE_URL = dbUrl;
    } else if (!dbUrl.startsWith('file:')) {
      dbUrl = 'file:' + dbUrl;
      process.env.DATABASE_URL = dbUrl;
    }
  } else {
    // Normalise postgres:// to postgresql:// for Prisma engine compatibility
    if (dbUrl.startsWith('postgres://')) {
      process.env.DATABASE_URL = dbUrl.replace(/^postgres:\/\//, 'postgresql://');
    }
  }

  // 3. Read existing schema
  let schemaContent = fs.readFileSync(schemaPath, 'utf8');

  // 4. Update provider in datasource block
  const currentProviderMatch = schemaContent.match(/datasource\s+db\s*\{[\s\S]*?provider\s*=\s*["']([^"']+)["']/);
  const currentProvider = currentProviderMatch ? currentProviderMatch[1] : null;

  if (currentProvider !== targetProvider) {
    console.log(`🔄 [prepare-schema] Adapting datasource provider: "${currentProvider}" -> "${targetProvider}"`);
    schemaContent = schemaContent.replace(
      /(datasource\s+db\s*\{[\s\S]*?provider\s*=\s*["'])([^"']+)(["'])/,
      `$1${targetProvider}$3`
    );
    fs.writeFileSync(schemaPath, schemaContent, 'utf8');
    console.log(`✅ [prepare-schema] Updated prisma/schema.prisma with provider = "${targetProvider}"`);
  } else {
    console.log(`ℹ️ [prepare-schema] Datasource provider is already "${targetProvider}".`);
  }
}

if (require.main === module) {
  prepareSchema();
}

module.exports = prepareSchema;

'use strict';

import fs from 'fs';
import path from 'path';
import { Sequelize, DataTypes } from 'sequelize';
import { fileURLToPath } from 'url';
import { pathToFileURL } from 'url';
import 'dotenv/config';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const basename = path.basename(__filename);
const isProd = process.env.NODE_ENV === 'production';

// Prod'da veya PGSSLMODE=require|prefer ise SSL aç
const wantsSSL = ['require', 'prefer', 'true', '1'].includes(
  String(process.env.PGSSLMODE || '').toLowerCase()
) || isProd;

const dialectOptions = wantsSSL ? { ssl: { require: true, rejectUnauthorized: false } } : undefined;

// Load config.json synchronously for sequelize-cli compatibility or if DATABASE_URL is not set
const configPath = path.join(__dirname, '/../config/config.json');
const configJson = JSON.parse(fs.readFileSync(configPath, 'utf8'));
const env = process.env.NODE_ENV || 'development';
const config = configJson[env];

let sequelize;

// Prioritize DATABASE_URL for connection if available
if (process.env.DATABASE_URL) {
  // Render's DATABASE_URL already includes all necessary info
  sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    logging: false,
    dialectOptions, // Use the determined dialectOptions for SSL
  });
} else if (config.use_env_variable) {
  // Fallback to config.json's use_env_variable (e.g., for local setup with PGHOST etc.)
  sequelize = new Sequelize(process.env[config.use_env_variable], config);
} else {
  // Fallback to direct config.json values
  sequelize = new Sequelize(config.database, config.username, config.password, {
    ...config, // Spread existing config properties (host, dialect, etc.)
    logging: false, // Disable logging by default
    dialectOptions: {
      ...dialectOptions, // Merge with existing SSL options
      ...(config.dialectOptions || {}) // Allow config.json to override/add dialectOptions
    }
  });
}

const db = {};

const files = fs
  .readdirSync(__dirname)
  .filter(file =>
    file.indexOf('.') !== 0 &&
    file !== basename &&
    file.endsWith('.js') &&
    !file.endsWith('.test.js')
  )

for (const file of files) {
    const modelPath = path.join(__dirname, file);
    const { default: modelDefinition } = await import(pathToFileURL(modelPath).href);
    const model = modelDefinition(sequelize, DataTypes);
    db[model.name] = model;
}

// İlişkilendirmeleri çalıştır
Object.keys(db).forEach(modelName => {
  if (db[modelName].associate) {
    db[modelName].associate(db);
  }
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;

// Dışa aktarmadan önce bağlantıyı ve senkronizasyonu bekle
try {
    await sequelize.authenticate();
    console.log('Database connection has been established successfully.');
    // Sunucu başlangıcında tabloları oluştur/güncelle
    await sequelize.sync({ alter: true });
    console.log('All models were synchronized successfully.');
} catch (error) {
    console.error('Unable to connect to or synchronize the database:', error);
    process.exit(1); // Hata durumunda uygulamayı sonlandır
}

export default db;

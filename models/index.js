'use strict';

const fs = require('fs');
const path = require('path');
const { Sequelize, DataTypes } = require('sequelize');

const basename = path.basename(__filename);
const isProd = process.env.NODE_ENV === 'production';

// Prod'da veya PGSSLMODE=require|prefer ise SSL aç
const wantsSSL = ['require', 'prefer', 'true', '1'].includes(
  String(process.env.PGSSLMODE || '').toLowerCase()
) || isProd;

const dialectOptions = wantsSSL ? { ssl: { require: true, rejectUnauthorized: false } } : undefined;

let sequelize;

// 1) DATABASE_URL varsa onu kullan (ör: Render External Database URL + ?sslmode=require)
if (process.env.DATABASE_URL) {
  sequelize = new Sequelize(process.env.DATABASE_URL, {
    dialect: 'postgres',
    logging: false,
    dialectOptions,
  });
// 2) Yoksa tek tek PG* env değişkenlerinden kur
} else {
  sequelize = new Sequelize(
    process.env.PGDATABASE,
    process.env.PGUSER,
    process.env.PGPASSWORD,
    {
      host: process.env.PGHOST || 'localhost',
      port: Number(process.env.PGPORT || 5432),
      dialect: 'postgres',
      logging: false,
      dialectOptions,
    }
  );
}

const db = {};

// Bu klasördeki diğer model dosyalarını yükle (index.js hariç)
fs
  .readdirSync(__dirname)
  .filter(file =>
    file.indexOf('.') !== 0 &&
    file !== basename &&
    file.endsWith('.js') &&
    !file.endsWith('.test.js')
  )
  .forEach(file => {
    const model = require(path.join(__dirname, file))(sequelize, DataTypes);
    db[model.name] = model;
  });

// İlişkilendirmeleri çalıştır
Object.keys(db).forEach(modelName => {
  if (db[modelName].associate) db[modelName].associate(db);
});

db.sequelize = sequelize;
db.Sequelize = Sequelize;

module.exports = db;

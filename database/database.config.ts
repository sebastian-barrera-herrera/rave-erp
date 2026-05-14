import { DataSource } from 'typeorm';
import * as dotenv from 'dotenv';
dotenv.config();

export default new DataSource({
  type: 'postgres',
  // host: process.env.DB_HOST || 'localhost',
  // port: Number(process.env.DB_PORT) || 5432,
  // database: process.env.DB_NAME || 'ERP-SBH',
  // username: process.env.DB_USER || 'postgres',
  // password: process.env.DB_PASS || 'secret',
  url: process.env.DB_URL,
  entities: [__dirname + '/../src/**/*.entity{.ts,.js}'],
  migrations: [__dirname + '/migrations/*{.ts,.js}'],
  synchronize: true,
  logging: false,
  ssl: {
  rejectUnauthorized: false,
}
});

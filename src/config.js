require('dotenv').config();

module.exports = {
  mysqlConfig: {
    host: process.env.MYSQL_HOST,
    user: process.env.MYSQL_USER,
    password: process.env.MYSQL_PASS,
    database: process.env.MYSQL_DB,
    port: process.env.MYSQL_PORT,
  },
  serverPort: process.env.SERVER_PORT || 8080,
  jwtSecret: process.env.JWT_SECRET,
  mailServer: process.env.MAIL_SERVER,
  mailServerPassword: process.env.MAIL_SERVER_PASSWORD,
};

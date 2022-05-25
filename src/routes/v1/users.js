const express = require('express');
const fetch = require('node-fetch');
const mysql = require('mysql2/promise');
const bcrypt = require('bcrypt');
const jsonwebtoken = require('jsonwebtoken');
const Joi = require('joi');

// eslint-disable-next-line object-curly-newline
const { mysqlConfig, jwtSecret, mailServer, mailServerPassword } = require('../../config');
const validation = require('../../middleware/validation');
const isLoggedIn = require('../../middleware/auth');

const router = express.Router();

const registrationSchema = Joi.object({
  name: Joi.string().trim().required(),
  email: Joi.string().email().lowercase().required(),
  password: Joi.string().required(),
});

const loginSchema = Joi.object({
  email: Joi.string().email().lowercase().required(),
  password: Joi.string().required(),
});

const changePasswordSchema = Joi.object({
  oldPassword: Joi.string().required(),
  newPassword: Joi.string().min(6).max(16).required(),
});

const resetPasswordSchema = Joi.object({
  email: Joi.string().email().lowercase().required(),
});

const newPassword = Joi.object({
  email: Joi.string().email().lowercase().required(),
  token: Joi.string().required(),
  password: Joi.string().required(),
});

router.post('/register', validation(registrationSchema), async (req, res) => {
  try {
    const hash = bcrypt.hashSync(req.body.password, 10);

    const con = await mysql.createConnection(mysqlConfig);
    const [data] = await con.execute(`
    INSERT INTO users (name, email, password)
    VALUES (${mysql.escape(req.body.name)}, 
    ${mysql.escape(req.body.email)}, '${hash}')
    `);
    await con.end();

    if (!data.insertId || data.affectedRows !== 1) {
      return res.status(500).send({ err: 'Server issue occured. Please try again later' });
    }

    return res.send({ msg: 'Succesfully created account', accountId: data.insertId });
  } catch (err) {
    return res.status(500).send({ err: 'Server issue occured. Please try again later' });
  }
});

router.post('/login', validation(loginSchema), async (req, res) => {
  try {
    const con = await mysql.createConnection(mysqlConfig);
    const [data] = await con.execute(`
    SELECT id, email, password 
    FROM users 
    WHERE email = ${mysql.escape(req.body.email)}
    LIMIT 1
    `);
    await con.end();

    if (data.length === 0) {
      return res.status(400).send({ err: 'User not found' });
    }

    if (!bcrypt.compareSync(req.body.password, data[0].password)) {
      return res.status(400).send({ err: 'Incorrect password' });
    }

    const token = jsonwebtoken.sign({ accountId: data[0].id }, jwtSecret);

    return res.send({
      msg: 'Successfully logged in',
      token,
    });
  } catch (err) {
    return res.status(500).send({ err: 'Server issue occured. Please try again later' });
  }
});

router.post('/change-password', isLoggedIn, validation(changePasswordSchema), async (req, res) => {
  try {
    const con = await mysql.createConnection(mysqlConfig);
    const [data] = await con.execute(`
    SELECT id, email, password 
    FROM users 
    WHERE id = ${mysql.escape(req.user.accountId)}
    LIMIT 1
    `);

    const checkHash = bcrypt.compareSync(req.body.oldPassword, data[0].password);

    if (!checkHash) {
      await con.end();
      return res.status(400).send({ err: 'Incorrect Old Password' });
    }

    const newPasswordHash = bcrypt.hashSync(req.body.newPassword, 10);

    const changePassDBRes = await con.execute(
      `UPDATE users SET password = ${mysql.escape(newPasswordHash)} WHERE id = ${mysql.escape(req.user.accountId)}`,
    );

    console.log(changePassDBRes);
    await con.end();
    return res.send({ msg: 'Password has been changed' });
  } catch (err) {
    return res.status(500).send({ err: 'Server issue occured. Please try again later' });
  }
});

router.post('/reset-password', validation(resetPasswordSchema), async (req, res) => {
  try {
    const con = await mysql.createConnection(mysqlConfig);
    const [data1] = await con.execute(`SELECT id FROM users WHERE email = ${mysql.escape(req.body.email)} LIMIT 1`);

    if (data1.length !== 1) {
      await con.end();
      return res.send({ msg: 'If your email is correct you will shortly get a message' });
    }

    const randomCode = Math.random()
      .toString(36)
      .replace(/[^a-z]+/g, '');

    const [data2] = await con.execute(`
    INSERT INTO reset_tokens (email, code)
    VALUES (${mysql.escape(req.body.email)}, '${randomCode}')
   `);

    if (!data2.insertId) {
      return res.status(500).send({ msg: 'Server issue occured. Please try again later' });
    }

    const response = await fetch(mailServer, {
      method: 'POST',
      body: JSON.stringify({
        auth: mailServerPassword,
        to: req.body.email,
        subject: 'NO-REPLY: New Password',
        text: `It seems that you have requested for a new password, please visit this link http://localhost:8080/v1/users/new-password?email=${encodeURI(
          req.body.email,
        )}&token=${randomCode}`,
      }),
      headers: { 'Content-Type': 'application/json' },
    });
    const json = await response.json();

    if (!json.id) {
      return res.status(500).send({ err: 'Server issue occured. Please try again later' });
    }

    return res.send({ msg: 'If your email is correct you will shortly get a message' });
  } catch (err) {
    return res.status(500).send({ err: 'Server issue occured. Please try again later' });
  }
});

router.post('/new-password', validation(newPassword), async (req, res) => {
  try {
    const con = await mysql.createConnection(mysqlConfig);
    const [data] = await con.execute(`
    SELECT *
    FROM reset_tokens
    WHERE email = ${mysql.escape(req.body.email)}
    AND code = ${mysql.escape(req.body.token)}
    LIMIT 1
    `);

    if (data.length !== 1) {
      await con.end();
      return res.status(400).send({ err: 'Invalid change password request. Please try again' });
    }

    if ((new Date().getTime() - new Date(data[0].timestamp).getTime()) / 60000 > 30) {
      await con.end();
      return res.status(400).send({ err: 'Invalid change password request. Please try again' });
    }

    const hashedPassword = bcrypt.hashSync(req.body.password, 10);

    const [changeResponse] = await con.execute(`
    UPDATE users
    SET password = ${mysql.escape(hashedPassword)}
    WHERE email = ${mysql.escape(req.body.email)}
    `);

    if (!changeResponse.affectedRows) {
      await con.end();
      return res.status(500).send({ err: 'Server issue occured. Please try again later' });
    }

    await con.execute(`
    DELETE FROM reset_tokens
    WHERE id = ${data[0].id}
    `);

    await con.end();
    return res.send({ msg: 'Password has been changed' });
  } catch (err) {
    return res.status(500).send({ err: 'Server issue occured. Please try again later' });
  }
});

module.exports = router;

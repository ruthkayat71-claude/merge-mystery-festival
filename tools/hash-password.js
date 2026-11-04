#!/usr/bin/env node
'use strict';
/**
 * Turn a teacher password into a scrypt hash.
 *
 * Optional. You can simply set TEACHER_PASSWORD to your plain password in your
 * host's private environment-variable field, and the server hashes it in
 * memory at start-up. Use this tool only if you would rather not have the
 * plain password stored in the host's settings at all: run it locally, then set
 * TEACHER_PASSWORD_HASH to the output instead.
 *
 * Usage:
 *   node tools/hash-password.js                 prompts without echoing
 *   node tools/hash-password.js "my password"   not recommended: shell history
 */

const readline = require('node:readline');
const { hashPassword, MIN_PASSWORD_LENGTH } = require('../server/auth');

function finish(password) {
  if (!password || password.length === 0) {
    console.error('No password given. Nothing was written.');
    process.exit(1);
  }
  if (password.length < MIN_PASSWORD_LENGTH) {
    console.error(
      `That password is only ${password.length} characters. ` +
      `Please use at least ${MIN_PASSWORD_LENGTH}.`
    );
    process.exit(1);
  }
  console.log('');
  console.log('Set this as the TEACHER_PASSWORD_HASH environment variable:');
  console.log('');
  console.log(hashPassword(password));
  console.log('');
  console.log('Keep it private. Do not paste your password into a chat or an email.');
}

const fromArgv = process.argv.slice(2).join(' ').trim();
if (fromArgv) {
  console.warn('Warning: a password given on the command line may be saved in your shell history.');
  finish(fromArgv);
} else {
  const rl = readline.createInterface({ input: process.stdin, output: process.stdout, terminal: true });
  // Hide the typed characters.
  const stdout = process.stdout;
  const original = stdout.write.bind(stdout);
  let hiding = false;
  stdout.write = (chunk, ...rest) => (hiding ? true : original(chunk, ...rest));

  original('Teacher password (not shown as you type): ');
  hiding = true;
  rl.question('', (answer) => {
    hiding = false;
    stdout.write = original;
    rl.close();
    finish(answer.trim());
  });
}

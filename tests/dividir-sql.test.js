'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const dividirSql = require('../src/util/dividir-sql');

test('divide schema ignorando ponto e vírgula dentro de comentário SQL', () => {
  const comandos = dividirSql(`-- Comentário inicial;
CREATE TABLE A (id INT);
-- Login social; não depende de e-mail.
CREATE TABLE CONTA_SOCIAL (id INT);
`);
  assert.deepEqual(comandos, ['CREATE TABLE A (id INT)', 'CREATE TABLE CONTA_SOCIAL (id INT)']);
});

test('mantém ponto e vírgula dentro de texto e identificador delimitado', () => {
  const comandos = dividirSql("INSERT INTO exemplo (texto) VALUES ('um; dois'); SELECT `col;una` FROM exemplo;");
  assert.deepEqual(comandos, ["INSERT INTO exemplo (texto) VALUES ('um; dois')", 'SELECT `col;una` FROM exemplo']);
});

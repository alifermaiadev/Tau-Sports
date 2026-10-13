'use strict';

const mysql = require('mysql2/promise');
const ambiente = require('./ambiente');

module.exports = mysql.createPool(ambiente.banco);

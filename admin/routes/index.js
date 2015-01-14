'use strict';


/**
 * Prisms
 * @type {exports}
 */
exports.prism = require('./prism')


/**
 * Stores
 * @type {exports}
 */
exports.store = require('./store')


/**
 * Users
 * @type {exports}
 */
exports.user = require('./user')


/**
 * Index
 * @param {object} req
 * @param {object} res
 */
exports.index = function(req,res){
  res.redirect('/prism/list')
}

'use strict';


/**
 * Confg overrides
 * @type {object}
 */
module.exports = {
  domain: 'oose-test',
  site: 'site1',
  zone: 'zone2',
  root: '/data/test/store3',
  store: {
    enabled: true,
    host: '127.0.2.6',
    name: 'store3',
    username: 'oose-store',
    password: 'fuckthat'
  },
  prism: {
    enabled: false,
    name: 'prism2',
    username: 'oose-prism',
    password: 'fuckit'
  },
  master: {
    enabled: false,
    host: '127.0.2.1',
    username: 'oose',
    password: 'fuckyou'
  }
}

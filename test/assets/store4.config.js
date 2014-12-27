'use strict';


/**
 * Confg overrides
 * @type {object}
 */
module.exports = {
  domain: 'oose-test',
  site: 'site1',
  zone: 'zone2',
  root: __dirname + '/data/test/store4',
  redis: {
    db: 5
  },
  store: {
    enabled: true,
    host: '127.0.2.7',
    name: 'store4',
    username: 'oose-store',
    password: 'fuckthat',
    timeout: 50
  },
  prism: {
    enabled: false,
    name: 'prism2',
    username: 'oose-prism',
    password: 'fuckit',
    timeout: 50
  },
  master: {
    enabled: false,
    host: '127.0.2.1',
    username: 'oose',
    password: 'fuckyou',
    timeout: 50
  }
}

/* global require, module */
"use strict";

// datastore.js
// user data storage with sqlite

var Database = require('better-sqlite3');
const merge = require('deepmerge');

class Datastore {

  constructor(defaults) {
    this.defaults = defaults || {};
    let data_dir = this.defaults.dir || ".data";
    this.db = new Database(data_dir + '/readbot.db');
    this.db.prepare("CREATE TABLE IF NOT EXISTS users(user_id TEXT PRIMARY KEY, data TEXT)").run();
    this.db.prepare("CREATE TABLE IF NOT EXISTS messages(message_id TEXT PRIMARY KEY, user_id TEXT, urls TEXT)").run();
    this.db.prepare("CREATE INDEX IF NOT EXISTS messages_user_id_idx ON messages(user_id)").run();
  }

  /**
   * readUser returns the given user's records as an object
   * @param  {string} user_id Slack user_id
   * @return {object}        The user's data as an object
   */
  readUser(user_id) {
    var data = {};
    var row = this.db.prepare('SELECT * FROM users WHERE user_id=?').get(user_id);
    if (row) {
      data = JSON.parse(row.data);
    }
    return data;
  }

  /**
   * saveUser replaces a user's data entirely
   * @param  {string} user_id Slack user_id
   * @param  {object} data   data to save
   */
  saveUser(user_id, data) {
    this.db.prepare('INSERT OR REPLACE INTO users(user_id, data) VALUES(?,?)').run(user_id, JSON.stringify(data));
  }

  /**
   * updateUser updates a user's record with new data, merging it with existing data
   * @param  {string} user_id Slack user_id
   * @param  {object} new_data New data to merge
   * @return {object}         Merged data
   */
  updateUser(user_id, new_data) {
    var old_data = this.readUser(user_id);
    var updated_data = merge(old_data, new_data);
    this.saveUser(user_id, updated_data);
    return updated_data;
  }

  /**
   * saveMessage saves a message and its associated urls
   * @param  {object} message message object with `{ channel: .., ts: ... }`
   * @param  {array} urls    array of urls
   */
  saveMessage(message, urls) {
    var message_id = [message.channel, message.ts].join('-');
    this.db.prepare('INSERT OR REPLACE INTO messages(message_id, user_id, urls) VALUES(?, ?, ?)').run(message_id, message.user, JSON.stringify(urls));
  }

  /**
   * getUrlsForMessage returns the urls saved for the given message
   * @param  {object} message message object with `{ channel: ..., ts: ... }`
   * @return {array}          array of urls
   */
  getUrlsForMessage(message) {
    var message_id = [message.channel, message.ts].join('-');
    var row = this.db.prepare('SELECT urls FROM messages WHERE message_id = ?').get(message_id);
    if (row) {
      return JSON.parse(row.urls);
    }
    return [];
  }
}

module.exports = new Datastore({dir: '.data'});
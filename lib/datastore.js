"use strict";

var Database = require('better-sqlite3');
const merge = require('deepmerge')

class Datastore {

  constructor(defaults) {
    this.defaults = defaults || {};
    this.db = new Database(this.defaults.dir + '/readbot.db');
    this.db.prepare("CREATE TABLE IF NOT EXISTS users(user_id TEXT PRIMARY KEY, data TEXT)").run();
    this.db.prepare("CREATE TABLE IF NOT EXISTS messages(message_id TEXT PRIMARY KEY, user_id TEXT, urls TEXT)").run();
    this.db.prepare("CREATE INDEX IF NOT EXISTS messages_user_id_idx ON messages(user_id)").run();
  }
    
  // fetch a user's data record as an object
  readUser(userId) {
    var data = {};    
    var row = this.db.prepare('SELECT * FROM users WHERE user_id=?').get(userId);
    if (row) {
      data = JSON.parse(row.data);
    }
    
    console.log("readUser:", data);
    return data;
  }

  // replace a user's data entirely
  saveUser(userId, data) {
    console.log("saveUser:", data);
    this.db.prepare('INSERT OR REPLACE INTO users(user_id, data) VALUES(?,?)').run(userId, JSON.stringify(data));
  }
  
  // update a user's record with new data, merging it with existing data
  updateUser(userId, newData) {
    var oldData = this.readUser(userId);
    var updatedData = merge(oldData, newData);
    this.saveUser(userId, updatedData);
    return updatedData;
  }
  
  saveMessage(message, urls) {
    var messageId = [message.channel, message.ts].join('-');
    this.db.prepare('INSERT OR REPLACE INTO messages(message_id, user_id, urls) VALUES(?, ?, ?)').run(messageId, message.user, JSON.stringify(urls));
  }
  
  getUrlsForMessage(message) {
    var messageId = [message.channel, message.ts].join('-');
    var row = this.db.prepare('SELECT urls FROM messages WHERE message_id = ?').get(messageId);
    if (row) {
      return JSON.parse(row.urls);
    }
    return [];
  }
}

module.exports = new Datastore({dir: '.data'});
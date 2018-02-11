"use strict";

const request = require("request");

var Pocket = class Pocket {
 
  constructor(consumer_key) {
    this.API_BASE = "https://getpocket.com/v3";
    this.consumer_key = consumer_key;
  }
  
  makeRequest(endpoint, data) {
    var options = {
      url: this.API_BASE + endpoint,
      method: "POST",
      body: JSON.stringify(data),
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        "X-Accept": "application/json"
      }
    };
    return new Promise((resolve, reject) => {
      request(options, (error, response, body) => {
        console.log("pocket response:", response);
        if (error) {
          reject(error);
        }
        if (response.statusCode != 200) {
          reject(response);
        }
        
        resolve(JSON.parse(body));
      });
    });
  }
  
  getRequestToken(redirect_uri) {
     return new Promise((resolve, reject) => {
        this.makeRequest("/oauth/request", {consumer_key: this.consumer_key, redirect_uri: redirect_uri})
         .then(response => {
            console.log("getRequestToken:", response);
            resolve(response.code);
          })
         .catch(reject);
     });
  }
  
  getUserAuthUrl(request_token, redirect_uri) {
    return `https://getpocket.com/auth/authorize?request_token=${request_token}&redirect_uri=${redirect_uri}`;
  }

  getAccessToken(request_token) {
    return new Promise((resolve, reject) => {
      this.makeRequest("/oauth/authorize", {consumer_key: this.consumer_key, code: request_token})
        .then(res => {
          console.log("getAccessToken:", res);
          resolve(res);
      })
      .catch(reject);
    });
  }
  
  addUrl(url, access_token) {
    return new Promise((resolve, reject) => {
      this.makeRequest("/add", {consumer_key: this.consumer_key, access_token: access_token, url: url})
        .then(res => {
          console.log("addUrl:", res);
          resolve(res);
      })
      .catch(reject);
    });
  }
}

module.exports = Pocket;
/* global require, module */
"use strict";

// Library for authenticating with and adding urls to Pocket

const request = require("request");

var Pocket = class Pocket {

  /**
   * constructor takes your Pocket app's consumer key
   * @param  {string} consumer_key Pocket app consumer key
   */
  constructor(consumer_key) {
    this.API_BASE = "https://getpocket.com/v3";
    this.consumer_key = consumer_key;
  }

  /**
   * makeRequest makes a request to the Pocket API
   * @param  {string} endpoint Pocket API endpoint
   * @param  {object} data     Data to POST as JSON
   * @return {Promose}         A promise that resolves with the API response, parsed as JSON
   */
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

  /**
   * getRequestToken starts the OAuth dance.
   * @param  {string} redirect_uri The URL for Pocket to redirect to with the request token.
   * @return {Promise}              A Promise that resolves with `{ code: <request_token> }`
   */
  getRequestToken(redirect_uri) {
     return new Promise((resolve, reject) => {
        this.makeRequest("/oauth/request", {consumer_key: this.consumer_key, redirect_uri: redirect_uri})
         .then(resolve)
         .catch(reject);
     });
  }

  /**
   * getUserAuthUrl returns the URL we need to give the user to auth their account
   * @param  {string} request_token The request token obtained via `getRequestToken`
   * @param  {string} redirect_uri  The url to redirect back to when the user has authenticated
   * @return {string}               The Pocket authentication URL
   */
  getUserAuthUrl(request_token, redirect_uri) {
    return `https://getpocket.com/auth/authorize?request_token=${request_token}&redirect_uri=${redirect_uri}`;
  }

  /**
   * getAccessToken takes a request token and calls Pocket to retrieve an access token
   * @param  {string} request_token The request token obtained via `getRequestToken`
   * @return {Promise}               A Promise which resolves with `{ access_token: ..., username: ... }`
   */
  getAccessToken(request_token) {
    return new Promise((resolve, reject) => {
      this.makeRequest("/oauth/authorize", {consumer_key: this.consumer_key, code: request_token})
        .then(resolve)
        .catch(reject);
    });
  }

  /**
   * addUrl adds the given url to the user's Pocket account
   * @param {string} url          The URL to add
   * @param {string} access_token The user's access token
   */
  addUrl(url, access_token) {
    return new Promise((resolve, reject) => {
      this.makeRequest("/add", {consumer_key: this.consumer_key, access_token: access_token, url: url})
        .then(resolve)
        .catch(reject);
    });
  }
};

module.exports = Pocket;
/* global require, process */
"use strict";

const express = require('express');
const goodreads = require('goodreads-api-node');
const bodyParser = require('body-parser');
const { WebClient } = require('@slack/client');
const datastore = require("./lib/datastore");
const Pocket = require('./lib/pocket');


// Set up our various API libraries
const slackWeb = new WebClient(process.env.SLACK_ACCESS_TOKEN);
const gr = goodreads({
  key: process.env.GOODREADS_DEVELOPER_KEY,
  secret: process.env.GOODREADS_DEVELOPER_SECRET
});
gr.callbackUrl = "https://bookbot.glitch.me/auth/goodreads/";
const pocket = new Pocket(process.env.POCKET_CONSUMER_KEY);

// Set up our web server
let app = express();
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded

app.get('/', function (req, res) {
  res.send('Hi! This is Readbot. Please see the <a href="https://github.com/bgreenlee/readbot/blob/master/README.md">README</a> for more information.')
});

// Slack slash command handler — The /readbot command is sent here
app.post('/command', function(req, res) {
  // check that the message we're getting is valid
  if (req.body.token != process.env.SLACK_VERIFICATION_TOKEN) {
    console.log("Invalid Slack token");
    return;
  }
  let user_id = req.body.user_id;
  // the command is everything after "/readbot"
  let command = req.body.text.trim().toLowerCase().split(/\s+/).join(' ');

  switch(command) {
    case "connect goodreads":
      gr.initOAuth(gr.callbackUrl + user_id);
      gr.getRequestToken().then(url => {
        res.send({channel: user_id, text: `Please visit ${url} to authenticate to Goodreads`});
      });
      break;
    case "connect pocket":
      var redirect_uri = `https://bookbot.glitch.me/auth/pocket/${user_id}`;
      pocket.getRequestToken(redirect_uri).then(token => {
        var url = pocket.getUserAuthUrl(token.code, redirect_uri);
        datastore.updateUser(user_id, {pocket: {request_token: token.code}});
        res.send({channel: user_id, text: `Please visit ${url} to authenticate to Pocket`});
      })
      .catch(error => res.send({channel: user_id, text: `There was an error connecting to Pocket: ${error}`}));
      break;
    default:
      res.send({
        channel: user_id,
        text: `\`\`\`Usage:
/readbot connect goodreads — connect your Goodreads account
         connect pocket    — connect your Pocket account
         help              — this message
\`\`\``});
  }
});

// This is the callback endpoint we give to Goodreads and Pocket
app.get('/auth/:service/:user_id', function(req, res) {
  let user_id = req.params.user_id;
  var user;
  switch(req.params.service) {
    case "goodreads":
      // exchange this oauth token for an access token
      user = datastore.readUser(user_id);
      gr.getAccessToken().then(token =>  {
          user = datastore.updateUser(user_id, {goodreads:{access_token:token.accessToken, access_token_secret:token.accessTokenSecret}});
          // TODO: check that the user has a "to-read" shelf and prompt them to set a default shelf if not
        });
      res.status(200).send("Thank you. You can close this now. <script type='text/javascript'>window.close()</script>");
      break;
    case "pocket":
      user = datastore.readUser(user_id);
      pocket.getAccessToken(user.pocket.request_token).then(token => {
        datastore.updateUser(user_id, {pocket: {access_token: token.access_token, username: token.username}});
      })
      .catch(console.log);
      res.status(200).send("Thank you. You can close this now. <script type='text/javascript'>window.close()</script>");
      break;
    default:
      res.status(404).send("Not found");
  }
});

app.post('/event', function(req, res) {
  if (req.body.token != process.env.SLACK_VERIFICATION_TOKEN) {
    console.log("Invalid Slack token");
    return;
  }

  if (req.body.type == 'url_verification') {
    return res.status(200).send(event.challenge);
  }

  var event = req.body.event;
  var item;
  switch(event.type) {
    case 'message':
      var message = event;
      if (event.subtype == 'message_changed') { // we get this if the message has been edited
        // dammit, Slack
        message = event.message;
        message.channel = event.channel;
      }
      var matches = message.text.match(/(?!<)http.*?(?=[\|>])/g);
      if (matches) {
        datastore.saveMessage(message, matches);
      }
      break;
    case 'reaction_added':
      if (event.reaction == 'bookmark') {
        item = event.item;
        var channel = item.channel;
        var user_id = event.user;
        var urls = datastore.getUrlsForMessage(item);
        urls.forEach((url) => {
          importUrl(user_id, url).then(response => {
            slackWeb.chat.postEphemeral(channel, response, user_id)
                .catch(console.error);
          })
          .catch(err => {
            slackWeb.chat.postEphemeral(channel, err, user_id)
                .catch(console.error);
          });
        });
      }
      break;
    case 'reaction_removed':
      if (event.reaction == 'bookmark') {
        // TODO: We could remove the previously bookmarked url from Goodreads/Pocket,
        // but I'm not inclined to right now.
      }
      break;
  }
  res.sendStatus(200);
});

/**
 * authUserToGoodreads updates the goodreads api object with the user's access token
 * @param  {string} user_id The Slack user_id
 * @return {Boolean}        true if successful, meaning the user has authed to Goodreads
 */
function authUserToGoodreads(user_id) {
  var user = datastore.readUser(user_id);

  if (user && user.goodreads && user.goodreads.access_token) {
    gr.setAccessToken({ACCESS_TOKEN: user.goodreads.access_token, ACCESS_TOKEN_SECRET: user.goodreads.access_token_secret});
    gr.initOAuth();
    return true;
  }

  return false;
}

/**
 * isAmazonUrl returns true if the url looks like an Amazon URL
 * @param  {string}  url
 * @return {Boolean}     true if it is an Amazon URL
 */
function isAmazonUrl(url) {
  return url.match(/^https?:\/\/(\w+\.)?amazon\./) !== null;
}

/**
 * getTitleFromUrl originally opened the Amazon url and tried to parse out the title and author from
 * the HTML, but it turns out that the Amazon product id (ASIN) is right in the URL, and Goodreads
 * recognizes those. \o/
 * @param  {string} url
 * @return {Promise}      A promise that resolves to the document "title" (ASIN)
 */
function getTitleFromUrl(url) {
  return new Promise((resolve, reject) => {
    if (isAmazonUrl(url)) {
      // just pull amazon id out of url and search on that
      var matches = url.match(/\/dp\/(.*?)\//);
      if (matches) {
        resolve(matches[1]);
      } else {
        reject(`could not find Amazon product code in ${url}`);
      }
      return;
    } else {
      reject(`unsupported url ${url}`);
    }
  });
}

/**
 * importUrl imports the given url into the user's appropriate account (Goodreads or Pocket)
 * @param  {string} user_id Slack user_id
 * @param  {string} url     URL to import
 * @return {Promise}        Promise returned by `importPocketUrl` or `importGoodreadsUrl`
 */
function importUrl(user_id, url) {
  if (isAmazonUrl(url)) {
    return importGoodreadsUrl(user_id, url);
  } else {
    return importPocketUrl(user_id, url);
  }
}

/**
 * importPocketUrl imports the given url into the user's Pocket account
 * @param  {string} user_id Slack user_id
 * @param  {string} url     URL to import
 * @return {Promise}        Promise that resolves to a message saying the url was successfully imported
 */
function importPocketUrl(user_id, url) {
  return new Promise((resolve, reject) => {
    var user = datastore.readUser(user_id);
    if (!(user && user.pocket && user.pocket.access_token)) {
      reject("Your Pocket account does not appear to be connected. Please do `/readbot connect pocket`");
    }
    pocket.addUrl(url, user.pocket.access_token)
      .then(res => {
        resolve(`Added ${url} to Pocket`);
    })
      .catch(reason => {
        reject(`Oops, I couldn't add that url to Pocket. Reason: ${reason}`);
    });

  });
}

/**
 * importGoodreadsUrl imports the given url into the user's Goodreads account, adding it to their
 * to-read shelf
 * @param  {string} user_id Slack user_id
 * @param  {string} url     URL to import
 * @return {Promise}        Promise that resolves to a message saying the url was successfully imported
 */
function importGoodreadsUrl(user_id, url) {
  return new Promise((resolve, reject) => {
    if (!authUserToGoodreads(user_id)) {
      reject("Your Goodreads account does not appear to be connected. Please do `/readbot connect goodreads`");
    }

    let shelf = "to-read";
    getTitleFromUrl(url).then(title => {
      gr.searchBooks({q: title}).then(response => {
        var book_id;
        var book_title;
        try {
          var work = response.search.results.work;
          if (work instanceof Array) {
            work = work[0];
          }
          var found_book = work.best_book;
          book_id = found_book.id._;
          book_title = found_book.title;
        } catch(e) {
          reject("I couldn't find that book on Goodreads. You could try <https://www.goodreads.com/search?q=" + encodeURIComponent(title) + "|searching for it.");
        }

        if (book_id) {
          // TODO: handle the case where multiple matches are found? Could give the user a list and ask them to pick one, or provide them with a search link
          // TODO: use the user's preferred shelf, if set
          // TODO: handle the case where the shelf doesn't exist (at least return an error to the user)
          gr.addBookToShelf(book_id, shelf)
            .then(res => {
              // TODO: if they already had it on their shelf, let them know
              resolve(`Added <https://www.goodreads.com/book/show/${book_id}|${book_title}> to your _${shelf}_ shelf on Goodreads`);
            })
            .catch(err => {
              reject(`Arg, Goodreads gave me an error when I tried to add the book to your shelf. It said "${err}." ¯\_(ツ)_/¯`);
          });
        }
      })
      .catch(reason => {
        reject(`Shoot. Goodreads gave me an error when I tried to search for that book. It said "${reason}."`);
      });
    })
    .catch(msg => {
      reject(`Sorry, I couldn't figure out what book was in that url: ${msg}`);
    });
  });
}

// Start up the server
var server = app.listen(process.env.PORT || 3000, function () {
  console.log("Listening on port %s", server.address().port);
});
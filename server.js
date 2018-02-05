"use strict";

const express = require('express');
const datastore = require("./datastore");
const goodreads = require('goodreads-api-node');
const bodyParser = require('body-parser');
const request = require('request');
const fs = require('fs');

var gr = goodreads({
  key: process.env.GOODREADS_DEVELOPER_KEY,
  secret: process.env.GOODREADS_DEVELOPER_SECRET
});
gr.callbackUrl = "https://bookbot.glitch.me/auth/goodreads/";

let app = express();
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded

app.get('/', function (req, res) {
  res.send('ReadBot!')
});

// Slack slash command handler
app.post('/command', function(req, res) {
  // console.log("command params", req.params);
  console.log("command body", req.body);
  if (req.body.token != process.env.SLACK_TOKEN) {
    console.log("Invalid Slack token");
    return;
  }
  let response_url = req.body.response_url;
  let user_id = req.body.user_id;
  let command = req.body.text.trim().toLowerCase().split(/\s+/).join(' ');
  
  switch(command) {
    case "connect goodreads":
      gr.initOAuth(gr.callbackUrl + user_id);
      gr.getRequestToken().then(url => {
        res.send({channel: user_id, text: `Please visit ${url} to authenticate to Goodreads`});
      });
      break;
    case "help":
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

app.get('/auth/:service/:user_id', function(req, res) {
  let user_id = req.params.user_id;
  switch(req.params.service) {
    case "goodreads":
      // console.log("goodreads response:", req.query);
      let oauth_token = req.query.oauth_token;
      let authorized = req.query.authorize == "1";
      // exchange this oauth token for an access token
      var user = datastore.readUser(user_id);
      gr.getAccessToken().then(token =>  {
          console.log("got tokens:", token);
          user = datastore.updateUser(user_id, {goodreads:{access_token:token.accessToken, access_token_secret:token.accessTokenSecret}});
          console.log("updated user", user);
        });
      res.status(200).send("Thank you. You can close this now. <script type='text/javascript'>window.close()</script>");
      break;
    default:
      res.status(404).send("Not found");
  }
});

app.post('/event', function(req, res) {
  console.log("event:", req.body);
  if (req.body.token != process.env.SLACK_TOKEN) {
    console.log("Invalid Slack token");
    return;
  }
  
  if (req.body.type == 'url_verification') {
    return res.status(200).send(event.challenge);
  }
  
  var event = req.body.event;
  switch(event.type) {
    case 'message':
      var message = event;
      if (event.subtype == 'message_changed') {
        // dammit, Slack
        message = event.message;
        message.channel = event.channel;
      }
      var matches = message.text.match(/(?!<)http.*?(?=[\|>])/g);
      if (matches) {
        console.log("got urls:", matches);
        datastore.saveMessage(message, matches);
      }
      break;
    case 'reaction_added':
      if (event.reaction == 'bookmark') {
        var item = event.item;
        var user_id = event.user;
        console.log(`added bookmark for user ${user_id}, item:`, item);
        var urls = datastore.getUrlsForMessage(item);
        console.log("found urls:", urls);
        urls.forEach((url) => {
          importUrl(user_id, url);
        });
      }
      break;
    case 'reaction_removed':
      if (event.reaction == 'bookmark') {
        var item = event.item;
        console.log("removed bookmark for item:", item);
        // TODO: should we remove the book from Goodreads? I'm thinking no.
      }
      break;
  }
  res.sendStatus(200);
});

function importUrl(user_id, url) {
  var user = datastore.readUser(user_id);
  gr.setAccessToken({ACCESS_TOKEN: user.goodreads.access_token, ACCESS_TOKEN_SECRET: user.goodreads.access_token_secret});
  gr.initOAuth();
  if (isAmazonUrl(url)) {
    request({uri: url, gzip: true},  (error, response, body) => {
      // console.log("requested:",url);
      // console.log("body:",body);
      if (error) {
        console.log('error:', error); // Print the error if one occurred
        return;
      }
      if (!body && response && response.statusCode !== 200) {
        console.log('statusCode:', response && response.statusCode);
        return;
      }
      // parse out title
      // <meta name="title" content="Amazon.com: The Dispossessed: An Ambiguous Utopia (Hainish Cycle Book 5) eBook: Ursula K. Le Guin: Kindle Store" />
      var matches = body.match(/<meta\s+name\s*=\s*"title"\s+content\s*=\s*"(.*?)"/);
      //console.log("matches:",matches);
      if (matches) {
        var title = matches[1];
        title = title.replace(/(Amazon\.com:|eBook:|: Kindle Store)\s*/g, ''); // clear out Amazon junk
        console.log("found title:", title);
        gr.searchBooks({q: title}).then(response => {
          console.log("goodreads response:", JSON.stringify(response));
          let bookId = response.search.results.work.best_book.id._;
          console.log("book id", bookId);
          gr.addBookToShelf(bookId, "to-read")
            .then(res => {
              // TODO: if they already had it on their shelf, let them know
              console.log("addBookToShelf:", res);
            })
            .catch(err => {
              console.log("addBookToShelf error:", err);
          });
        })
        .catch(reason => {
          console.log("goodreads failed:", reason);
        });
      } else {
        // should send response back, but need to figure out how
        console.log("Couldn't find a title in url:", url);
        console.log("headers:",response.headers);
        console.log("body:",body);
        //console.log("response:",response);
        console.log("statusCode:",response.statusCode);
      }
    });
  }
}

function isAmazonUrl(url) {
  return url.match(/^https?:\/\/(\w+\.)?amazon\./) !== null;
}

// Set Express to listen out for HTTP requests
var server = app.listen(process.env.PORT || 3000, function () {
  console.log("Listening on port %s", server.address().port);
});
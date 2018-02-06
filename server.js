"use strict";

const express = require('express');
const datastore = require("./datastore");
const goodreads = require('goodreads-api-node');
const bodyParser = require('body-parser');
const request = require('request');
const { WebClient } = require('@slack/client');

const slackWeb = new WebClient(process.env.SLACK_ACCESS_TOKEN);

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
  if (req.body.token != process.env.SLACK_VERIFICATION_TOKEN) {
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
          // TODO: check that the user has a "to-read" shelf and prompt them to set a default shelf if not
        });
      res.status(200).send("Thank you. You can close this now. <script type='text/javascript'>window.close()</script>");
      break;
    default:
      res.status(404).send("Not found");
  }
});

app.post('/event', function(req, res) {
  console.log("event:", req.body);
  if (req.body.token != process.env.SLACK_VERIFICATION_TOKEN) {
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
        var channel = item.channel;
        var user_id = event.user;
        console.log(`added bookmark for user ${user_id}, item:`, item);
        var urls = datastore.getUrlsForMessage(item);
        console.log("found urls:", urls);
        urls.forEach((url) => {
          importUrl(channel, user_id, url);
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

function authUserToGoodreads(user_id) {
  var user = datastore.readUser(user_id);
  
  if (user && user.goodreads && user.goodreads.access_token) {
    gr.setAccessToken({ACCESS_TOKEN: user.goodreads.access_token, ACCESS_TOKEN_SECRET: user.goodreads.access_token_secret});
    gr.initOAuth();
    return true;
  }

  return false;
}

function getTitleFromUrl(url) {
  function isAmazonUrl(url) {
    return url.match(/^https?:\/\/(\w+\.)?amazon\./) !== null;
  }

  return new Promise((resolve, reject) => {
    if (isAmazonUrl(url)) {
      request({uri: url, gzip: true},  (error, response, body) => {
        if (error) {
          console.log('error:', error); // Print the error if one occurred
          reject(`request for ${url} returned error: ${error}`);
        }
        if (!body && response && response.statusCode !== 200) {
          console.log('statusCode:', response && response.statusCode);
          reject(`request for ${url} return response: ${response}`);
        }
        
        // parse out title
        // <meta name="title" content="Amazon.com: The Dispossessed: An Ambiguous Utopia (Hainish Cycle Book 5) eBook: Ursula K. Le Guin: Kindle Store" />
        var matches = body.match(/<meta\s+name\s*=\s*"title"\s+content\s*=\s*"(.*?)"/);
        //console.log("matches:",matches);
        if (matches) {
          var title = matches[1];
          title = title.replace(/(Amazon\.com:|eBook:|: Kindle Store)\s*/g, ''); // clear out Amazon junk
          resolve(title);
        } else {
          // TODO: respond to user
          reject(`could not find title in ${url}`);
        }
      });
    } else {            
      reject(`unsupported url ${url}`);
    }
  });
}

function importUrl(channel, user_id, url) {
  if (!authUserToGoodreads(user_id)) {
    // TODO: prompt user to connect their account
    console.log(`Error: User ${user_id} not authed to Goodreads!`);
    return;
  }

  let shelf = "to-read";
  getTitleFromUrl(url).then(title => {
    gr.searchBooks({q: title}).then(response => {
      console.log("goodreads response:", JSON.stringify(response));
      var book_id;
      var book_title;
      try {
        var found_book = response.search.results.work.best_book;
        book_id = found_book.id._;
        book_title = found_book.title;
      } catch(e) {
        // TODO: handle the case where the book is not found; return an error to the user
        console.error("could not find book_id");
      }

      if (book_id) {
        // TODO: handle the case where multiple matches are found? Could give the user a list and ask them to pick one, or provide them with a search link
        console.log("book id", book_id);
        // TODO: use the user's preferred shelf, if set
        // TODO: handle the case where the shelf doesn't exist (at least return an error to the user)
        gr.addBookToShelf(book_id, shelf)
          .then(res => {
            // TODO: if they already had it on their shelf, let them know
            console.log("addBookToShelf:", res);
            // See: https://api.slack.com/methods/chat.postMessage
            slackWeb.chat.postEphemeral(channel, `Added <https://www.goodreads.com/book/show/${book_id}|${book_title}> to your _${shelf}_ shelf on Goodreads`, user_id)
              .catch(console.error);
          })
          .catch(err => {
            console.log("addBookToShelf error:", err);
        });
      }
    })
    .catch(reason => {
      // TODO: give feedback if search failed
      console.error("goodreads failed:", reason);
    });
  })
  .catch(console.error); // TODO: send error to user
}

// Set Express to listen out for HTTP requests
var server = app.listen(process.env.PORT || 3000, function () {
  console.log("Listening on port %s", server.address().port);
});
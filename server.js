"use strict";

const express = require('express');
const goodreads = require('goodreads-api-node');
const bodyParser = require('body-parser');
const request = require('request');
const { WebClient } = require('@slack/client');
const Entities = require('html-entities').AllHtmlEntities;

const datastore = require("./lib/datastore");
const Pocket = require('./lib/pocket');

const entities = new Entities();

const slackWeb = new WebClient(process.env.SLACK_ACCESS_TOKEN);

var gr = goodreads({
  key: process.env.GOODREADS_DEVELOPER_KEY,
  secret: process.env.GOODREADS_DEVELOPER_SECRET
});
gr.callbackUrl = "https://bookbot.glitch.me/auth/goodreads/";

var pocket = new Pocket(process.env.POCKET_CONSUMER_KEY);
                        
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
    case "connect pocket":
      var redirect_uri = `https://bookbot.glitch.me/auth/pocket/${user_id}`;
      pocket.getRequestToken(redirect_uri).then(token => {
        var url = pocket.getUserAuthUrl(token, redirect_uri);
        datastore.updateUser(user_id, {pocket: {request_token: token}});
        res.send({channel: user_id, text: `Please visit ${url} to authenticate to Pocket`});
      })
      .catch(error => res.send({channel: user_id, text: `There was an error connecting to Pocket: ${error}`}));
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
    case "pocket":
      var user = datastore.readUser(user_id);
      pocket.getAccessToken(user.pocket.request_token).then(res => {
        console.log("got response:", res);
        datastore.updateUser(user_id, {pocket: {access_token: res.access_token, username: res.username}});
      })
      .catch(console.log);
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
          importUrl(user_id, url).then(response => {
            slackWeb.chat.postEphemeral(channel, response, user_id)
                .catch(console.error);
          })
          .catch(err => {
            slackWeb.chat.postEphemeral(channel, err, user_id)
                .catch(console.error);
          })
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

function isAmazonUrl(url) {
  return url.match(/^https?:\/\/(\w+\.)?amazon\./) !== null;
}

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

//       // pull title (and author?) from Amazon page
//       request({uri: url, gzip: true},  (error, response, body) => {
//         if (error) {
//           console.log('error:', error); // Print the error if one occurred
//           reject(`request for ${url} returned error: ${error}`);
//         }
//         if (!body && response && response.statusCode !== 200) {
//           console.log('statusCode:', response && response.statusCode);
//           reject(`request for ${url} return response: ${response}`);
//         }
        
//         // parse out title
//         // <meta name="title" content="Amazon.com: The Dispossessed: An Ambiguous Utopia (Hainish Cycle Book 5) eBook: Ursula K. Le Guin: Kindle Store" />
//         // var matches = body.match(/<meta\s+name\s*=\s*"title"\s+content\s*=\s*"(.*?)"/);
//         var matches = body.match(/<span id=".*?productTitle"[^>]*?>(.+?)<\/span>/i);
//         //console.log("matches:",matches);
//         if (matches) {
//           var title = matches[1];
//           // title = entities.decode(title).replace(/\W/g, '').replace(/(Amazoncom|eBooks?|Kindle (edition|Store))/gi, ''); // clear out Amazon junk
//           resolve(title);
//         } else {
//           reject(`could not find title in ${url}`);
//         }
//       });
    } else {            
      reject(`unsupported url ${url}`);
    }
  });
}

function importUrl(user_id, url) {
  if (isAmazonUrl(url)) {
    return importGoodreadsUrl(user_id, url);
  } else {
    return importPocketUrl(user_id, url);
  }
}

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

function importGoodreadsUrl(user_id, url) {
  return new Promise((resolve, reject) => {
    if (!authUserToGoodreads(user_id)) {
      reject("Your Goodreads account does not appear to be connected. Please do `/readbot connect goodreads`");
    }

    let shelf = "to-read";
    getTitleFromUrl(url).then(title => {
      gr.searchBooks({q: title}).then(response => {
        console.log("goodreads response:", JSON.stringify(response));
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
          console.log("book id", book_id);
          // TODO: use the user's preferred shelf, if set
          // TODO: handle the case where the shelf doesn't exist (at least return an error to the user)
          gr.addBookToShelf(book_id, shelf)
            .then(res => {
              // TODO: if they already had it on their shelf, let them know
              resolve(`Added <https://www.goodreads.com/book/show/${book_id}|${book_title}> to your _${shelf}_ shelf on Goodreads`);
            })
            .catch(err => {
              console.log("addBookToShelf error:", err);
              reject(`Arg, Goodreads gave me an error when I tried to add the book to your shelf. It said "${err}." ¯\_(ツ)_/¯`);
          });
        }
      })
      .catch(reason => {
        // TODO: give feedback if search failed
        console.error("goodreads failed:", reason);
        reject(`Shoot. Goodreads gave me an error when I tried to search for that book. It said "${reason}."`);
      });
    })
    .catch(msg => {
      reject(`Sorry, I couldn't figure out what book was in that url: ${msg}`);
    });
  });
}

// Set Express to listen out for HTTP requests
var server = app.listen(process.env.PORT || 3000, function () {
  console.log("Listening on port %s", server.address().port);
});
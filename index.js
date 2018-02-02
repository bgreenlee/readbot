"use strict";

const express = require('express'),
      datastore = require("./datastore.js").async,
      goodreads = require('goodreads'),
      bodyParser = require('body-parser'),
      request = require('request');

var gr = new goodreads.client({
  key: process.env.GOODREADS_DEVELOPER_KEY,
  secret: process.env.GOODREADS_DEVELOPER_SECRET,
  callback: "https://bookbot.glitch.me/auth/goodreads" });

let app = express();
app.use(express.json());
app.use(bodyParser.urlencoded({ extended: true })); // for parsing application/x-www-form-urlencoded

app.get('/', function (req, res) {
  res.send('ReadBot!')
});

app.get('/auth/:service', function(req, res) {
  switch(req.params.service) {
    case "goodreads":
      let oauth_token = req.query.oauth_token;
      let authorized = req.query.authorize == "1";
      console.log("token", oauth_token);
      res.status(200).send("Thank you. You can close this now. <script type='text/javascript'>window.close()</script>");
      break;
    default:
      res.status(404).send("Not found");
  }
});

app.post('/command', function(req, res) {
  // console.log("command params", req.params);
  console.log("command body", req.body);
  if (req.body.token != process.env.SLACK_TOKEN) {
    console.log("Invalid Slack token");
    return;
  }
  let response_url = req.body.response_url;
  console.log("response_url", response_url);
  let user_id = req.body.user_id;
  let command = req.body.text.trim().toLowerCase().split(/\s+/).join(' ');
  
  switch(command) {
    case "connect goodreads":
      gr.requestToken((result) => {
        console.log("oauth", result);
        request.post(response_url, {json: {channel: user_id, text: "Please visit " + result.url + " to authenticate to Goodreads"}});
      });
      return;
    case "help":
    default:
      request.post(response_url, {json: {channel: user_id, text: "Usage: /bookbot <connect {goodreads, pocket}|help>"}});
      return;
  }  
});

var connected=false;

//
// For each Slash Command that you want to handle, you need to add a new `slack.on()` handler function for it.
// This handler captures when that particular Slash Command has been used and the resulting HTTP request fired
// to your endpoint. You can then run whatever code you need to for your use-case. 
//
// The `slack` functions like `on()` and `send()` are provided by `tinyspeck.js`. 
//
// Watch for /bookbot slash command
// slack.on('/bookbot', payload => {
//   console.log("Received /bookbot slash command", payload);
//   let user_id = payload.user_id;
//   let response_url = payload.response_url;

//   let command = payload.text.trim();
//   switch(command) {
//     case "connect":
//       gr.requestToken((result) => {
//         console.log("oauth", result);
//         slack.send(response_url, { channel: user_id, text: "Please visit " + result.url + " to authenticate to Goodreads"});
//       });
//       return;
//     case "help":
//     default:
//       slack.send(response_url, showHelp(user_id));
//       return;
//   }
  
//   // and send the return value from that to `getMessage()`. This function checks to see if the value exists and if it doesn't then it sets an initial value of 1\. If it does, then it increments that value and stores the updated value with `datastore.set()`. We then use `slack.send()` to send our message text to the response URL the Slash Command provided us with. So we append the current count value to the String "Current count is: " and this is what appears as the response in the Slack channel where the Slash Command was used.
  
//   getConnected() // make sure we have a database connection
//     .then(function(){
//       // we look for the stored count value using `datastore.get()` (which is a library function provided by datastore.js) 
//       datastore.get(user_id) // get the count for the user_id
//       .then(function(count){
//         let message = getMessage(user_id, count);
                
//         // send current count privately
//         slack.send(response_url, message).then(res => { // on success
//           console.log("Response sent to /bookbot slash command");
//         }, reason => { // on failure
//           console.log("An error occurred when responding to /bookbot slash command: " + reason);
//         });
//       });
//     });
// });

// slack.on('*', message => { 
//   console.log("wildcard", message);
// });
    
// function showHelp(userRef) {
//   return Object.assign({ channel: userRef, text: "Usage: /bookbot <connect|help>"});
// }
                       
// function getMessage(userRef, count) {
//   if(!count){ // no value stored for this user
//     count=1;
//     datastore.set(userRef, count).then(function() { // store initial count value for user
//       console.log("Saved initial count ("+count+") for: " + userRef);
//     });
//   } else { // there was a value stored
//     count++;
//     datastore.set(userRef, count).then(function() { // store updated count value for user
//       console.log("Saved updated count ("+count+") for: " + userRef);
//     });
//   }
//   return Object.assign({ channel: userRef, text: "Current count is: " + count });
// }

// function getConnected() {
//   return new Promise(function (resolving) {
//     if(!connected){
//       connected = datastore.connect().then(function(){
//         resolving();
//       });
//     } else {
//       resolving();
//     }
//   });
// }
    
// // incoming http requests
// slack.listen('3000');

// Set Express to listen out for HTTP requests
var server = app.listen(process.env.PORT || 3000, function () {
  console.log("Listening on port %s", server.address().port);
});
# ReadBot

ReadBot is a Slack bot that makes it easy to save books and articles to your
Goodreads and Pocket accounts. Once you have connected your Goodreads/Pocket accounts, if you add a `bookmark` (🔖) reactji to a message containing a URL, it will add it to Goodreads if it is an Amazon URL, or Pocket if it is any other URL.

## Setup

This app was written on [Glitch](https://glitch.com/edit/#!/readbot), but is just a Node app, so can be run on any platform. There are some environment variables it relies on, namely:

```
SLACK_VERIFICATION_TOKEN
SLACK_ACCESS_TOKEN
```

You will need to create a [Slack Bot](https://api.slack.com/bot-users) to get these.

```
GOODREADS_DEVELOPER_KEY
GOODREADS_DEVELOPER_SECRET
```

Apply for a [developer key](https://www.goodreads.com/api/keys) on Goodreads.

```
POCKET_CONSUMER_KEY
```

[Register an app](http://getpocket.com/developer/apps/new) on Pocket to get a consumer key.

If you are using Glitch, you can just put these values in the `.env` file. If you are running it on your own, take a look at [this article](https://www.twilio.com/blog/2017/08/working-with-environment-variables-in-node-js.html) for information on how to set up your own `.env` file.

If you are not using Glitch you will also need to create a `.data` directory for the sqlite3 database.

## Usage

First, connect your accounts:

```
/readbot connect goodreads
/readbot connect pocket
```

Then add the `bookmark` reactji to any message containing a supported link (currently Amazon.com for books, or any other link for Pocket), and it will be saved to your account.

## TODO

- [ ] Support for more URL types for Goodreads (i.e. other bookstores, Goodreads itself)
- [ ] Support for custom Goodreads shelfs (i.e. not just the default 'to-read')

## Author

Brad Greenlee <brad@footle.org>

# Slack Slash Command Response Handler

This project demonstrates responding to Slash commands in Slack, using MongoDB for persistence.

The app implements a simple counter, incrementing the counter each time the `/count` Slash Command is used. This app provides a basic template that you can [remix](https://glitch.com/edit/#!/remix/SlashCommands/a9e55c25-bf40-4162-b1b5-dc33047c0cdc) to create your own Slash Command handler.

![Screen Shot 2016-08-11 at 10.08.34](https://hyperdev.wpengine.com/wp-content/uploads/2016/08/Screen-Shot-2016-08-11-at-10.08.34.png)

## Getting Started
To get started you need to:
- Add a Slash Command configuration to your Slack integrations
- Copy the generated Command Token
- Add your database credentials along with the token to the `.env` file

For more detailed setup instructions, see `setup.md`.
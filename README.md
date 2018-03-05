### The West Mainland Gentlemen's Society Presents: IRON

_A collaborative project between a group of incompetent untrained individuals_

#### Deployment

The game is playable [here](http://wmgs-iron-eu.herokuapp.com). 
This is running on free Heroku hosting, limited to ~500 hours/month (or 1000 if I add a credit card to my account lol).

To deploy a new version, the Heroku CLI is required. You can Google it [here](https://www.google.co.uk). 
The short version is (from your local copy of the repository):

###### First time setup only:
- `$> heroku login`
- `$> heroku git:remote -a wmgs-iron-eu`
###### And then:
- `$> git push heroku`

You'll need a Heroku account, and access to the app instance.

#### Development 

The project uses NodeJS. With NodeJS installed, from your copy of the repository do:

###### First time setup only:
- `$> npm install`
###### And then:
- `$> npm start` (`CTRL-C` to kill it afterwards)

###### Other commands:
- `$> npm test` to run a basic JavaScript/CSS style checker
- `$> npm run build:css` to compile the `scss` files to regular `css`.

###### Notes:
- WebStorm is the recommended IDE for development (with the NodeJS plugin), although IntelliJ works reasonably well.
- Use [Angular commit style](https://gist.github.com/stephenparish/9941e89d80e2bc58a153#format-of-the-commit-message)
for commit messages.
- The [glMatrix](http://glmatrix.net/docs/) library is used for vector operations. 
For functions it provides, the first argument is the destination used to receive the result. 
For example: `c = a + b` would become `add(c, a, b)`. 
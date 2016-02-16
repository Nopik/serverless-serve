Serverless Serve Plugin
=============================

When developing with Serverless deploying functions to AWS after each change might be annoying. This plugin allows you to simulate API Gateway locally, so all function calls can be done on localhost.

Installation
============

In your Serverless project:

```
npm install serverless-serve
```

Then in `s-project.json` add following entry to `plugins` array:

```
"serverless-serve"
```

E.g. like this:
```javascript
  "plugins": ["serverless-serve"]
```

And in main project root do:

```
sls serve start
```

Options
=======

`--prefix` `-p`: Add prefix to the URLs, so your clients will not use `http://localhost:1465/` but `http://localhost:1465/prefix/` instead. Default: empty

`--port` `-P`: Port to listen on. Default: `1465`

`--init` `-i`: Initialization file, for custom initializations. Default: empty. NOTE: please specify relative paths from project root folder, e.g. `sls serve start -i ./lib/my_init.js`. Init file should export single function taking following parameters:
- `Serverless` object
- `app` object from Express (e.g. to register new routes)
- `handlers` object being map of all function names to info about their respective handlers. Since all handlers are `require`'d lazily, this plugin exports only path information about handler, in following format:
```javascript
{
  path: "path/to/be/required",
  handler: "exported-function-name"
}
```

so this should work: `require( handlers[ myFunName ].path )[ handlers[ myFunName ].handler ]( event, context )`

Example:

```javascript
module.exports = function(S, app, handlers) {
}
```

Usage
=====

Just send your requests to `http://localhost:1465/` as it would be API Gateway.

Using of this plugin with some tool like Nodemon is advised, so Serverless with restart and reload your local code after every change.

Usage with Babel
================

Optionaly, your handlers can be required with `babel-register`.
To do so, in your `s-project.json` file, set options to be passed to babel-register like this:
```javascript
{
  /* ... */
  "custom": {
    "serverless-serve": {
      "babelOptions": {
        /* Your own options, example: */
        "presets": ["es2015", "stage-2"]
      }
    }
  },
  "plugins": ["serverless-serve", /* ... */]
}
```
To view the full list of babel-register options, click [here](https://babeljs.io/docs/usage/require/)

The event object
================

When using the plugin, your handlers are called with a custom `event` object that offers the following properties from the `req` object of an express handler:

```javascript
const event = { 
  isServerlessServe: true,
  body: req.body, // Already parsed using body-parser
  cookies: req.cookies,
  hostname: req.hostname,
  ip: req.ip,
  headers: req.headers,
  method: req.method,
  originalUrl: req.originalUrl,
  params: req.params,
  path: req.path,
  query: req.query,
  signedCookies: req.signedCookies,
  url: req.url,
};
```

So in your handler you can do the following:

```javascript
module.exports.handler = function(event, context) {
  var url;
  
  if (event.isServerlessServe) {
    url = event.url;
  } else {
    /* Define your event object using a template in your s-function.json file */
    url = event.customKeyDefinedInTemplate;
  }
};
```
Here are the [express's docs](http://expressjs.com/en/api.html#req) on the `req` object, and here are the [API Gateway's docs](http://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-mapping-template-reference.html) on templating.

Simulation quality
==================

This plugin simulates API Gateway for many practical purposes, good enough for development - but is not a perfect simulator. Specifically, no timeout or memory limits are enforced. Mapping templates and/or error codes are not simulated, either. So are security checks. You will probably find other differences.


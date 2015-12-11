Serverless Serve Plugin
=============================

When developing with Serverless deploying functions to AWS after each change might be annoying. This plugin allows you to simulate API Gateway locally, so all function calls can be done on localhost.

Installation
============

In your Serverless project:

```
cd plugins
npm install serverless-serve
```

then in `s-project.json` add following entry to `plugins` table:

```
  {
    "path": "serverless-serve"
  }
```

and do:

```
sls serve start
```

Options
=======

`--prefix` `-p`: Add prefix to the URLs, so your clients will not use `http://localhost:1465/` but `http://localhost:1465/prefix/` instead. Default: empty

`--port` `-P`: Port to listen on. Default: `1465`

`--init` `-i`: Initialization file, for custom initializations. Default: empty. NOTE: please specify relative paths from project root folder, e.g. `sls serve start -i ./lib/my_init.js`. Init file should export single function taking 2 parameters: `Serverless` object and `app` object from Express (e.g. to register new routes). Example:

```
module.exports = function(S, app){
}
```

Usage
=====

Just send your requests to `http://localhost:1465/` as it would be API Gateway.

Using of this plugin with some tool like Nodemon is advised, so Serverless with restart and reload your local code after every change.

Simulation quality
==================

This plugin simulates API Gateway for many practical purposes, good enough for development - but is not a perfect simulator. Specifically, no timeout or memory limits are enforced. Mapping templates and/or error codes are not simulated, either. So are security checks. You will probably find other differences.


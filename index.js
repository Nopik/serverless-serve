'use strict';

module.exports = function(S) {
  const path = require( 'path' ),
  SUtils = require(S.getServerlessPath('utils')),
  context = require(S.getServerlessPath('utils/context')),
  SCli = require(S.getServerlessPath('utils/cli')),
  express = require('express'),
  bodyParser = require('body-parser'),
  BbPromise = require( 'bluebird' );

  class Serve extends S.classes.Plugin {
    static getName() {
      return 'net.nopik.' + Serve.name;
    }
    registerActions() {
      S.addAction(this.serve.bind(this), {
        handler:       'serve',
        description:   `Exposes all lambdas as local HTTP, simulating API Gateway functionality`,
        context:       'serve',
        contextAction: 'start',
        options:       [
          {
            option:      'init',
            shortcut:    'i',
            description: 'Optional - JS file to run as custom initialization code'
          }, {
            option:      'prefix',
            shortcut:    'p',
            description: 'Optional - add URL prefix to each lambda'
          }, {
            option:      'port',
            shortcut:    'P',
            description: 'Optional - HTTP port to use, default: 1465'
          }, {
            option:      'stage',
            shortcut:    's',
            description: 'Optional - Serverless stage to use for resolving templates usage within s-function.json'
          }, {
            option:      'region',
            shortcut:    'r',
            description: 'Optional - Serverless region to use for resolving templates usage within s-function.json'
          }
        ]
      });
      return BbPromise.resolve();
    }
    registerHooks() {
      return BbPromise.resolve();
    }

    _createApp() {
      let _this = this;

      this.app = express();

      if( !this.evt.port ){
        this.evt.port = 1465;
      }

      if( !this.evt.prefix ){
        this.evt.prefix = "";
      }

      if( (this.evt.prefix.length > 0) && (this.evt.prefix[this.evt.prefix.length-1] != '/') ) {
        this.evt.prefix = this.evt.prefix + "/";
      }

      this.app.get( '/__quit', function(req, res, next){
        SCli.log('Quit request received, quitting.');
        res.send({ok: true});
        _this.server.close();
      });

      this.app.use( function(req, res, next) {
        res.header('Access-Control-Allow-Origin', '*');
        next();
      });

      this.app.use(bodyParser.json({ limit: '5mb' }));

      this.app.use( function(req, res, next){
        res.header( 'Access-Control-Allow-Methods', 'GET,PUT,HEAD,PATCH,POST,DELETE,OPTIONS' );
        res.header( 'Access-Control-Allow-Headers', 'Authorization,Content-Type,x-amz-date,x-amz-security-token' );

        if( req.method != 'OPTIONS' ) {
          next();
        } else {
          res.status(200).end();
        }
      });
    }

    _tryInit() {
      if( this.evt.init ){
        let handler = require( path.join( process.cwd(), this.evt.init ) );
        return( handler( S, this.app, this.handlers ) );
      }
    }

    _registerLambdas() {
      let _this = this;
      let functions = S.getProject().getAllFunctions();

      _this.handlers = {};

      return functions.forEach(function(fun) {
        /*
        _config:
          { component: 'node',
            module: 'homepage',
            function: 'index',
            sPath: 'node/homepage/index',
            fullPath: '/path/to/some/serverless/project/node/homepage/index' },
        name: 'index',
        handler: 'homepage/index/handler.handler',
        runtime: 'nodejs',
        timeout: 6,
        memorySize: 1024,
        custom: { excludePatterns: [], envVars: [] },
        endpoints:
         [ ServerlessEndpoint {
             _S: [Object],
             _config: [Object],
             path: 'homepage/index',
             method: 'GET',
             authorizationType: 'none',
             apiKeyRequired: false,
             requestParameters: {},
             requestTemplates: [Object],
             responses: [Object] } ] }
       */

        if( fun.getRuntime().getName() == 'nodejs' ) {
          let handlerParts = fun.handler.split('/').pop().split('.');
          let handlerPath = path.join(fun.getRootPath(), handlerParts[0] + '.js');
          let handler;

          _this.handlers[ fun.handler ] = {
            path: handlerPath,
            handler: handlerParts[ 1 ],
            definition: fun
          };

          fun.endpoints.forEach(function(endpoint){
            let epath = endpoint.path;
            let cfPath = _this.evt.prefix + epath;

            if( cfPath[ 0 ] != '/' ) {
              cfPath = '/' + cfPath;
            }

            // In worst case we have two slashes at the end (one from prefix, one from "/" lambda mount point)
            while( (cfPath.length > 1) && (cfPath[ cfPath.length - 1 ] == '/') ){
              cfPath = cfPath.substr( cfPath.length - 1 );
            }

            let cfPathParts = cfPath.split( '/' );
            cfPathParts = cfPathParts.map(function(part){
              if( part.length > 0 ) {
                if( (part[ 0 ] == '{') && (part[ part.length - 1 ] == '}') ) {
                  return( ":" + part.substr( 1, part.length - 2 ) );
                }
              }
              return( part );
            });
            if( process.env.DEBUG ) {
              SCli.log( "Route: " + endpoint.method + " " + cfPath );
            }

            _this.app[ endpoint.method.toLocaleLowerCase() ]( cfPathParts.join('/'), function(req, res, next){
              SCli.log("Serving: " + endpoint.method + " " + cfPath);

              let result = new BbPromise(function(resolve, reject) {

                let event = {};
                let prop;

                for( prop in req.body ) {
                  if( req.body.hasOwnProperty( prop ) ){
                    event[ prop ] = req.body[ prop ];
                  }
                }

                for( prop in req.params ) {
                  if( req.params.hasOwnProperty( prop ) ){
                    event[ prop ] = req.params[ prop ];
                  }
                }

                for( prop in req.query ) {
                  if( req.query.hasOwnProperty( prop ) ){
                    event[ prop ] = req.query[ prop ];
                  }
                }

                if( !handler ) {
                  try {
                    handler = require( handlerPath )[handlerParts[1]];
                  } catch( e ) {
                    SCli.log( "Unable to load " + handlerPath + ": " + e );
                    throw e ;
                  }
                }
                handler(event, context( fun.name, function(err, result) {
                  let response;
                  let errResult = result;

                  if (err) {
                    errResult = { errorMessage: err };
                    err = err.toString();
                  } else {
                    err = '';
                  };

                  let responses = endpoint.responses;

                  if( _this.evt.stage ){
                    if( !_this.evt.region ){
                      let regions = Object.keys(S.state.getMeta().stages[_this.evt.stage].regions);
                      if( regions.length == 1 ){
                        _this.evt.region = regions[ 0 ];
                      };
                    }

                    if( _this.evt.region ){
                      responses = endpoint.getPopulated({ stage: _this.evt.stage, region: _this.evt.region }).responses;
                    }
                  }

                  Object.keys(responses).forEach(key => {
                    if (!response && (key != 'default') && responses[key].selectionPattern && err.match(responses[key].selectionPattern)) {
                      response = responses[key];
                    }
                  });

                  response = response || responses['default'];

                  resolve(Object.assign({
                    result: errResult
                  }, response));
                }));
              });

              result.then(function(r){
                SCli.log(`[${r.statusCode}] ${JSON.stringify(r.result, null, 4)}`);
                res.status(r.statusCode);
                res.send(r.result);
              }, function(err){
                SCli.log(err);
                res.sendStatus(500);
              });
            } );
          });
        }
      });
    }

    _listen() {
      let _this = this;

      this.server = this.app.listen( this.evt.port, function(){
        SCli.log( "Serverless API Gateway simulator listening on http://localhost:" + _this.evt.port );
      });
    }

    _registerBabel() {
      let _this = this;
      return BbPromise.try(function(){
        let project = S.getProject();
        const custom = project.custom[ 'serverless-serve' ];

        if( custom && custom.babelOptions ) require("babel-register")( custom.babelOptions );
      });
    }

    serve(evt) {
      let _this = this;

      if (S.cli) {
        evt = JSON.parse(JSON.stringify(S.cli.options));
        if (S.cli.options.nonInteractive) S._interactive = false;
      }

      _this.evt = evt;

      return S.init()
        .bind(_this)
        .then(_this._registerBabel)
        .then(_this._createApp)
        .then(_this._registerLambdas)
        .then(_this._tryInit)
        .then(_this._listen)
        .then(function() {
          return _this.evt;
        });
    }
  }
  return Serve;
};

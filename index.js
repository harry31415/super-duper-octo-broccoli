'use strict'

// Winston is the logging library. It writes everything in node.log 
const winston = require('winston');
winston.add(winston.transports.File, { filename: 'node.log',level: 'debug', maxsize: 5242880 });

// Logging levels for dev and production
if (process.env.NODE_ENV == 'production') {
  winston.remove(winston.transports.Console);
    winston.level = 'error';
} else if (process.env.NODE_ENV == 'development') {
    winston.level = 'debug';
}

winston.info("Starting node js!");

// Communicator is the main module of this interface 
const app = require('./communicator').init;
const port = process.env.PORT || 3636;

app.listen(port, function (err) {
  if (err) {
    throw err
  }

  winston.info(`server is listening on ${port}...`);
})

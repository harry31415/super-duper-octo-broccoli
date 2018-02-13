'use strict'

const winston = require('winston');
winston.add(winston.transports.File, { filename: 'node.log',level: 'debug', maxsize: 5242880 });

if (process.env.NODE_ENV == 'production') {
  winston.remove(winston.transports.Console);
    winston.level = 'error';
} else if (process.env.NODE_ENV == 'development') {
    winston.level = 'debug';
}

winston.info("Starting node js!");

const app = require('./communicator').init;
const port = process.env.PORT || 3636;

app.listen(port, function (err) {
  if (err) {
    throw err
  }

  winston.info(`server is listening on ${port}...`);
})
//require(./communicator);

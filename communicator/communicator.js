const config = require('../config')
const winston = require('winston');

winston.debug('Config: %j',config);

const app = require('http').createServer();
const io = require('socket.io')(app);
const dateFormat = require('dateformat');

const ss = require('socket.io-stream');
const path = require('path');
const fs = require('fs');
//const MongoClient = require('mongodb').MongoClient;
//const assert = require('assert');


const PythonShell = require('python-shell');

const chokidar = require('chokidar');
const archiver = require('archiver');

/*MongoClient.connect(config.dburl, function(err, client) {
  assert.equal(null, err);
  console.log("Connected successfully to server");

  const db = client.db(config.dbName);

  client.close();
}); */


let watcher = chokidar.watch(config.outputpath, {
    ignored:config.ouputignore,
    //awaitWriteFinish:writeFinishopt
    //awaitWriteFinish.stabilityThreshold: 500
});
let newFiles=new Set();
let tmpOutput='';

io.on('connection', function(socket) {
   
    ss(socket).on('scriptPY', function(stream, data) {
        let filename = path.basename(data.name);
        downloadStream(stream,config.scriptpath+'/'+filename, socket, runExperiment);
    });

     watcher
        .on('add', function(path) {
            winston.debug('File', path, 'has been added');
            newFiles.add(path);
        })
        .on('change', function(path) {winston.debug('File', path, 'has been changed');})
        .on('unlink', function(path) {winston.debug('File', path, 'has been removed');})
        .on('error', function(error) {winston.debug('Error happened', error);})


});

function compressSend(data, sockSend){
    winston.debug([...newFiles]);
    winston.profile('Compress');
    let now = new Date();
    let newName = dateFormat(now, "HHH-MM-ss-l");
    let output = fs.createWriteStream(newName+'.zip');
    let archive = archiver('zip', {
        zlib: { level: 5 } // Sets the compression level.
    });
    output.on('close', function() {
        winston.debug(archive.pointer() + ' total bytes');
        winston.debug('archiver has been finalized and the output file descriptor has closed.');
        winston.profile('Compress');
        let stream = ss.createStream();
        ss(sockSend).emit('results', stream, {name: newName+'.zip'});
        fs.createReadStream(newName+'.zip').pipe(stream);
        stream.on('finish', () => {
            winston.debug('Send File from stream!');
            let filesProduced=[];
            for (let item of newFiles) filesProduced.push(item);
            //cleanUp(filesProduced);
            newFiles.clear();
        });

    });
    output.on('end', function() {
        winston.debug('Data has been drained');
    });

    archive.on('warning', function(err) {
        if (err.code === 'ENOENT') {
            winston.warn(err);
            // log warning
        } else {
            winston.err(err);
            throw err;
        }
    });
    archive.pipe(output);
    newFiles.forEach(function(fl) {
        archive.file(fl, { name: fl });
    });
    archive.finalize();

}

function cleanUp(files){
    for(let file of files) {
        fs.unlink(file, function(error) {
            if (error) {
                winston.err(error);
            }
            winston.debug('Deleted: '+file);
        });

    }

}

function runExperiment (scriptFile, sockSend, callback) {

    console.log(__dirname);
    let options = {
        mode: 'text',
        pythonOptions: ['-u']
    };

    let pyshell = new PythonShell(scriptFile,options );
    fs.readFile(scriptFile,'utf8', function(err, contents) {
        winston.debug(contents);
    });
    pyshell.on('message', function (message) {
        sockSend.emit('outPy', message);
        winston.debug("%s",message);
        tmpOutput+=message; //to throw away in production, replace with DB.
    });
    pyshell.end(function (err) {
        if (err) {
            sockSend.emit('outPy', err.stack);
            winston.error("%s", err);
            tmpOutput+=err.stack; //to throw away in production, replace with DB.
            callback(tmpOutput,sockSend);

        } else {
            sockSend.emit('outPy', 'Finished');
            winston.debug('Finished!');
            tmpOutput+='Finished!'; //to throw away in production, replace with DB.
            callback(tmpOutput,sockSend);
        }
    });
}


function downloadStream(url,filePath,sockSend, callback) {
    fs.open(filePath, "wx", (err, fd) => {
        if (err) {
            if (err.code === "EEXIST") {
                winston.warn("%s already exists", filePath);

                let parsed = path.parse(filePath);
                let now = new Date();
                let newName = dateFormat(now, "HHH-MM-ss-l");
                parsed.name += "_"+newName;
                parsed.base = parsed.name + parsed.ext;
                return downloadStream(url, path.format(parsed),sockSend, callback);
            }
            // re-raise the error
            throw err;
        }

        winston.debug("Writing to %s",filePath);
        url.pipe(fs.createWriteStream("", {fd: fd}));
        
        url.on('end', function(){
            callback(filePath,sockSend,compressSend);
        });
        
    });


}

module.exports = app;

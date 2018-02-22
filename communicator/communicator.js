/*
 *
 * Signals:
 * scriptPY : the input script  stream
 * outPy: the output send to the fronend
 * stopScript: the signal from frontend to stop execution
 */

// Get configuration vars
const config = require('../config')
const winston = require('winston');

winston.debug('Config: %j',config);

const app = require('http').createServer();
const io = require('socket.io')(app);
const dateFormat = require('dateformat');
// socket io and socket io stream used for bidir communication.
const ss = require('socket.io-stream');
const path = require('path');
const fs = require('fs');
const { spawn } = require('child_process');
//const MongoClient = require('mongodb').MongoClient;
//const assert = require('assert');


const PythonShell = require('python-shell');

// Chokidar modules checks for new files.
const chokidar = require('chokidar');
// Archiver is used to compress output files
const archiver = require('archiver');

// Chokidar watcher ignores files that match config.ouputignore array
let watcher = chokidar.watch(config.outputpath, {
    ignored:config.ouputignore,
});

let newFiles=new Set();
let tmpOutput='';

// On connection
io.on('connection', function(socket) {
   
    // Get a python script as input
    ss(socket).on('scriptPY', function(stream, data) {
        let filename = path.basename(data.name);
        // Download it, <- callback (Run it) <-callback (Compress output and send it
        // back)
        downloadStream(stream,config.scriptpath+'/'+filename, socket, runExperiment);
    });

    // Stop script (when something goes wrong)
    socket.on('stopScript', function(msg) {
        winston.debug('StopScript signal received');
        const killl= spawn('pkill', ['-9', 'python']);

        killl.on('close',(code) => {
            winston.debug(`child process exited with code ${code}`);
            socket.emit('outPy', "Script killed!");
        });

    });

    setTimeout(function(){
        const killl= spawn('pkill', ['-9', 'python']);
        killl.on('close',(code) => {
            winston.debug(`child process exited with code ${code}`);
            socket.emit('outPy','Script Killed because it did not finish after '+config.killTimer/1000+' sec');
        });
        
    }, config.killTimer);



     watcher
        .on('add', function(path) {
            // New files added on newFiles set in order to send them back
            winston.debug('File', path, 'has been added');
            newFiles.add(path);
        })
        .on('error', function(error) {winston.debug('Error happened', error);})


}); //Connection ends

function compressSend(data, sockSend){
    winston.debug([...newFiles]);
    // winston provides a nice simple profiling module
    winston.profile('Compress');
    let now = new Date();
    let newName = dateFormat(now, "HHH-MM-ss-l");
    let output = fs.createWriteStream(newName+'.zip');

    let archive = archiver('zip', {
        zlib: { level: 5 } // Sets the compression level.
    });

    output.on('close', function() {
        // What happens when the files have been compressed
        winston.debug(archive.pointer() + ' total bytes');
        winston.debug('archiver has been finalized and the output file descriptor has closed.');
        winston.profile('Compress');
        let stream = ss.createStream();
        // Send files back.
        ss(sockSend).emit('results', stream, {name: newName+'.zip'});
        fs.createReadStream(newName+'.zip').pipe(stream);
        stream.on('finish', () => {
            // This is the clean up
            winston.debug('Send File from stream!');
            let filesProduced=[];
            for (let item of newFiles) filesProduced.push(item);
            //cleanUp(filesProduced);
            newFiles.clear();
        });

    });

    output.on('end', function() {
        // this is for safety leave as is
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

    // Archive files
    archive.pipe(output);
    newFiles.forEach(function(fl) {
        archive.file(fl, { name: fl });
    });
    archive.finalize();

}

function cleanUp(files){
    // clean up
    for(let file of files) {
        fs.unlink(file, function(error) {
            if (error) {
                winston.err(error);
            }
            winston.debug('Deleted: '+file);
        });

    }

}

// Run experiment , takes as arguments the python script to run, the socket that it came
// (needed for callback to send the output back)
function runExperiment (scriptFile, sockSend, callback) {

    let options = {
        mode: 'text',
        pythonOptions: ['-u']
    };

    winston.profile("script");
    let pyshell = new PythonShell(scriptFile,options );
    // For debug to see if I got the file
    fs.stat(scriptFile, function(err, stats) {
        let scriptsize=formatBytes( stats["size"]);
        winston.debug(scriptFile+" size:"+scriptsize+" Created: "+stats["ctime"]);
    });
    // This sends real time the STDOUT of python back to the client
    pyshell.on('message', function (message) {
        sockSend.emit('outPy', message);
        winston.debug("%s",message);
        tmpOutput+=message; //to throw away in production, replace with DB.
    });

    // When the python script ends
    pyshell.end(function (err) {

        winston.profile("script");
        if (err) {
            sockSend.emit('outPy', err);
            winston.error("%s", err);
            winston.error("%s", err.stack);
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

// Downloads the stream and saves it in a file
// Takes as input the strem , the filepath and the socket
// If the file exists, it takes care of the renaming send back to callback the filename
// and the socket.
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
                // Renaming
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

// Formats bytes to KB, MB, GB
function formatBytes(a,b){
    if(0==a)return"0 Bytes";
    var c=1024,d=b||2,e=["Bytes","KB","MB","GB","TB","PB","EB","ZB","YB"],f=Math.floor(Math.log(a)/Math.log(c));
    return parseFloat((a/Math.pow(c,f)).toFixed(d))+" "+e[f]
}

module.exports = app;

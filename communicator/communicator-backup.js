// This is the communication interface for Pynn to frontend
// It expects a connection, and when it gets it receives a python script file,
// runs it and sends back the results and the logging.


const app = require('http').createServer();
const io = require('socket.io')(app);
const dateFormat = require('dateformat');

const ss = require('socket.io-stream');
const path = require('path');
const fs = require('fs');
const MongoClient = require('mongodb').MongoClient;
const assert = require('assert');


const PythonShell = require('python-shell');

const chokidar = require('chokidar');

const url = 'mongodb://localhost:27017';
const dbName = 'testserver';


let tokenID=null;

app.listen(3636, function(){
    console.log('listening on *:3636');
});

// For Tests to be deleted!
MongoClient.connect(url, function(err, client) {
    assert.equal(null, err);
    console.log("Connected successfully to server");

    const db = client.db(dbName);

    findTestUser(db, function(records) {
        //var myJSON = JSON.stringify(records);
      
        console.log("Test user:"+records[0].name);
        if(records && records.length){
            console.log("1 test user!");
        } else {
            console.log("No test user!");

            insertTestUser(db, function() {
                client.close();
                });
        }
        
    });
});

let watcher = chokidar.watch('downloads/*.py', {ignored: /^\./, persistent: true});

let fruits=['Apple'];

io.on('connection', function(socket) {
    socket.on('tokenID', function(user){
        let now = new Date();
        console.log('Token '+user.token+' Connected user :'+socket.id+' From: '+user.ip+' At: '+dateFormat(now, "isoDateTime"));
    });

    ss(socket).on('scriptPY', function(stream, data) {
        let filename = path.basename(data.name);
        downloadStream(stream,'downloads/'+filename, logStuff);
        //let newName = fileExists('downloads/'+filename);
       // console.log(newName);
       // stream.pipe(fs.createWriteStream('downloads/'+filename));
        /*PythonShell.run('downloads/'+filename, function (err, results) {
            console.log("Python output: "+results);
        });*/ 
        stream.on('finish', () => {
            console.error('all writes are now complete.');
            console.log(fruits);
        });

    });

    watcher
        .on('add', function(path) {console.log('File', path, 'has been added');})
        .on('change', function(path) {console.log('File', path, 'has been changed');})
        .on('unlink', function(path) {console.log('File', path, 'has been removed');})
        .on('error', function(error) {console.error('Error happened', error);})




/*        let now = new Date();
        let user.connectedTime = dateFormat(now, "isoDateTime");
        if (tokenID==null) {
            tokenID = user.token;
        } else if (tokenID && tokenID == user.token) {
        }
        let clientIP = user.ip;
        //var clientIP = socket.request.connection.remoteAddress;
        console.log('Token '+tokenID+' Connected user :'+socket.id+' From: '+clientIP+' At: '+connectedTime);
        MongoClient.connect(url, function(err, client) {
            assert.equal(null, err);
            console.log("Connected successfully to server");
            const db = client.db(dbName);
            checkToken(db, tokenID, function(record) {
                //client.close();
                //user = record[0];
                console.log("Found:"+JSON.stringify(record));

            });
            //updateAccess(db, tokenID, function(record) {
                //client.close();
            //    console.log("Found:"+record);

           // });
                client.close();
        });*/

    /*ss(socket).on('profile-image', function(stream, data) {
        var filename = path.basename(data.name);
        stream.pipe(fs.createWriteStream('downloads/'+filename));
    });*/
});

function logStuff (userData) {
    if ( typeof userData === "string")
    {
        console.log("LILI: "+userData);
        fruits.push(userData);
    }
    else if ( typeof userData === "object")
    {
        for (var item in userData) {
            console.log(item + ": " + userData[item]);
        }
    }
}

function downloadStream(url,filePath, callback) {
    fs.open(filePath, "wx", (err, fd) => {
        if (err) {
            if (err.code === "EEXIST") {
                console.log(filePath + " already exists");

                let parsed = path.parse(filePath);
                let now = new Date();
                let newName = dateFormat(now, "HHH-MM-ss-l");
                parsed.name += "_"+newName;
                parsed.base = parsed.name + parsed.ext;
                return downloadStream(url, path.format(parsed),callback);
            }
            // re-raise the error
            throw err;
        }

        console.log("Writing to " + filePath);
        url.pipe(fs.createWriteStream("", {fd: fd}));
        callback(filePath);
        


    });

}


























const findTestUser = function(db, callback) {
    // Find some documents
    const collection = db.collection('users');
    collection.find({name:'test-user' }).toArray(function(err, docs) {
        assert.equal(err, null);
        console.log("Found the following records");
        console.log(docs);
        return callback(docs);
    });
}

const checkToken = function(db, token, callback) {
    // Find some documents
    const collection = db.collection('users');
    collection.find({TokenID:token }).toArray(function(err, docs) {
        assert.equal(err, null);
        //console.log("Found the following records");
        //console.log(docs);
        callback(docs);
    });
}

const insertTestUser = function(db, callback, ) {
    // Update document where a is 2, set b equal to 1
    const collection = db.collection('users');
    collection.insertOne({
            name : 'test-user',
            TokenID: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9',
            connected: ["2007-06-09T17:46:21"],
            IP: '555.555.555.555'
        }, function(err, result) {
            assert.equal(err, null);
            assert.equal(1, result.result.n);
            assert.equal(1, result.ops.length);

            console.log("Inserted test user");
            callback(result);
        });  
}

const updateAccess = function(db, user, ip, date, callback) {
    // Update document where a is 2, set b equal to 1
    const collection = db.collection('users');
    collection.updateOne({ name : user }
            ,{ $set: { IP:ip,
                $push: {connected:date}
            }
        }, function(err, result) {
            assert.equal(err, null);
            assert.equal(1, result.result.n);
            assert.equal(2, result.ops.length);

            console.log("Updated user access");
            callback(result);
        });  
}

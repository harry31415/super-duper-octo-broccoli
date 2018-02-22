/* This is where I put some configuration variables, db isn't in use right now*/
const config = {}

config.scriptpath = 'downloads'; //no treiling slash
config.outputpath= '.'; //no treiling slash
config.ouputignore=['/(^|[\/\\])\../','*.log','node_modules','env','packages', 'cache'];
config.killTimer= 3600000;
if (process.env.NODE_ENV == 'production') {
    config.killTimer=86400000;
} 
config.dburl = 'mongodb://localhost:27017';
config.dbName = 'testdbwsedfgvsgfvsdgv';

module.exports = config;


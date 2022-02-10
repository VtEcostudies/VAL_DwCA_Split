/*
A new attempt to integrate spatial-filtering of GBIF occurrences into
the nodeJs GBIF download data-processing.
*/
const db_config = require('./db_config.json');
const db = require('./VAL_Utilities/db_postgres');
const query = db.query;

db.connect(db_config.pg_docker); //connect to local docker dashboard container with 'gis' db
db.test();

const readline = require('readline');
const fs = require('fs');
const log = console.log; //require('./VAL_Utilities/93_log_utilities').log;
const init = require('./VAL_Utilities/93_log_utilities').init;
const csvLineToObject = require('./VAL_Utilities/99_parse_csv_to_array').csvLineToObject;

const paths = require('./00_config').paths;
const sDir = paths.sourceDir; //path to directory holding extracted original GBIF DWcA files
const fDir = paths.filterDir; //path to directory to hold filtered output DWcA files
const occF = 'occurrence';
const occX = 'txt';
const logDir = sDir;
const logName = `${occF}_filter`;

/*
  Create here the code to query a postGIS spatial layer with each occurrence's lat/lon to
  determine whether it's inside VAL borders.

  It's not clear at the outset whether this will perform fast enough.

  Later, once this code is working, we will add this check as a step, among others, to
  perform for each occurrence in a GBIF download-dataset.

  NOTE: this runs out of heap memory. use this call to increase

  node NODE_OPTIONS=--max_old_space_size=4096 this.js

  NOTE: increasing heap memory isn't enough to solve the problem.
*/
var idx = 0; //file row index
var dlm = "\t"; //input file delimiter
var top = ""; //1st line in file - header row with field names

process.on('exit', function(code) {
  return log(1, idx, 'EXIT');
});

init(logName, logDir) //init's error does not throw error, allowing this to proceed on error
  .then((logStream) => {

    log(1, idx, 'START');

    var fRead = readline.createInterface({
      input: fs.createReadStream(`${dDir}/${occF}.${occX}`)
    });

    //read occurrence.txt
    fRead.on('line', (row) => {
      var obj = {};
      if (0 == idx) {
        top = row; //save the 1st row for each dKey/occurrence.txt
      } else {
        obj = csvLineToObject(dlm, top, row, false).row;
        dbPointInVermont(idx, obj)
          .then(res => {
            if (0 == res.idx % 10000) {
              log(1, res.idx, res.obj.gbifID, `within`);
            }
          })
          .catch(err => {
            log(1, err.idx, err.obj.gbifID, 'NOT');
          });
      }
      idx++;
    });

    fRead.on('close', (row) => {
      log(1, idx, 'STOP');
    })
  });

  function dbPointInVermont(idx, obj) {
    var sql = `
      SELECT
        ST_WITHIN(point, geometry) AS within
      FROM
        vt_boundary_river_lake,
        ST_GEOMFROMTEXT('POINT(${obj.decimalLongitude} ${obj.decimalLatitude})', 4326) point`
    return new Promise((resolve, reject) => {
      query(sql)
        .then(res => {
          res.idx = idx;
          res.obj = obj;
          if (0 === res.rows.length) {
           reject(res);
          } else {
            if (true === res.rows[0].within) {resolve(res);}
            else {reject(res);}
          }
        })
        .catch(err => {
          err.idx = idx;
          err.obj = obj;
          reject(err);
        })
    });
} //end function dbPointInVermont
